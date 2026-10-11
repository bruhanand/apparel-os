import { uuidv7 } from '@apparel-os/domain';
import {
  devicePublicKeySchema,
  type DeviceProof,
  type DevicePublicKey,
  type DeviceState,
  type MissingItem,
} from '@apparel-os/schemas';
import { and, asc, count, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import {
  CommandDefect,
  lockTable,
  type CommandRefusal,
  type LockTarget,
  type TransactionContext,
} from '../../../kernel/index.js';
import type { AuditInterface, AuditScope } from '../../audit/index.js';
import { device, deviceChallenge, deviceVersion } from '../db/schema.js';
import { newChallenge, proofVerifies } from '../domain/device-proof.js';
import { deviceRevoked } from '../events.js';
import { readSetting } from '../queries/settings.js';
import { revokeSessions } from './sessions.js';

// Devices in `access` (access-and-approvals 2.4, 3.3; offline-counter 3.1 to 3.4; PRD-OFF-002, PRD-OFF-010,
// PRD-SEC-007, PRD-SEC-008; S1-F12-T01): register a device, Setting up; issue a one-time challenge; enrol it, binding
// its public key once, Active; check its proof at sign-in. The owning module (`pos`, for a billing device) has
// authorised the action and holds its own facts; access keeps the identity, the key, the state and the device access
// records (numbering-and-audit 5.1).

const DEVICE = lockTable('access', 'device');

/** Who acts on a device, for its access record and audit records (numbering-and-audit 4.1, 5.2). */
export interface DeviceActor {
  readonly userId: string;
  readonly networkAddress?: string;
  /** The place the device belongs to, so the device access record is read in that scope (5.2). */
  readonly scope?: AuditScope;
  /** The role assignment Authorise used, for the audit records of the sessions a device's end revokes (4.1). */
  readonly roleAssignmentId?: string;
}

/** The facts of the actor named, those it holds only: an access or audit record omits a fact not known. */
function known<const K extends 'networkAddress' | 'scope' | 'roleAssignmentId'>(
  by: DeviceActor,
  ...keys: readonly K[]
): Pick<DeviceActor, K> {
  const facts: Partial<Record<K, unknown>> = {};
  for (const key of keys) if (by[key] !== undefined) facts[key] = by[key];
  return facts as Pick<DeviceActor, K>;
}

export type DeviceOutcome<T> =
  { readonly kind: 'success'; readonly answer: T } | { readonly kind: 'refusal'; readonly refusal: CommandRefusal };

/** A device as access holds it: its code, label and state, and whether its key is bound. */
export interface DeviceRead {
  readonly deviceId: string;
  readonly code: string;
  readonly label: string;
  readonly state: DeviceState;
  readonly enrolled: boolean;
}

function refusal<T>(kind: CommandRefusal['kind'], code: string): DeviceOutcome<T> {
  return { kind: 'refusal', refusal: { kind, code, missing: [] } };
}

/** The device row as a lock target: enrolment locks it as its own record at step 1 (code-house-rules 8.2). */
export function deviceLockTarget(deviceId: string): LockTarget {
  return { table: DEVICE, id: deviceId, mode: 'exclusive' };
}

/**
 * The device row as a sign-in's lock target, in shared mode at step 1 (code-house-rules 8.2): a sign-in only relies on
 * the device, so two sign-ins on one device never wait for each other, while a revocation or retirement, which holds
 * the row exclusively, waits for them or they for it.
 */
export function deviceSignInLockTarget(deviceId: string): LockTarget {
  return { table: DEVICE, id: deviceId, mode: 'shared' };
}

/**
 * Register a device (access-and-approvals 2.4; offline-counter 3.2 step 1): a code unique in the Organisation without
 * regard to letter case, refused when taken (`access.device-code-taken`), and its label; Setting up. Writes the
 * `device-registered` access record (numbering-and-audit 5.1; PRD-SEC-007).
 */
export async function registerDevice(
  context: TransactionContext,
  audit: AuditInterface,
  by: DeviceActor,
  draft: { readonly code: string; readonly label: string },
): Promise<DeviceOutcome<{ readonly deviceId: string }>> {
  const code = draft.code.trim();
  const [taken] = await context.tx
    .select({ id: device.id })
    .from(device)
    .where(sql`lower(${device.code}) = lower(${code})`);
  if (taken !== undefined) return refusal('refused', 'access.device-code-taken');
  const deviceId = uuidv7();
  // The unique index decides two registrations of one code at once: the second is refused.
  const inserted = await context.tx.execute<{ id: string }>(sql`
    insert into access.device (id, code, label) values (${deviceId}, ${code}, ${draft.label.trim()})
    on conflict do nothing returning id`);
  if (inserted.rows.length === 0) return refusal('refused', 'access.device-code-taken');
  await context.tx
    .insert(deviceVersion)
    .values({ id: uuidv7(), deviceId, version: 1, state: 'Setting up', occurredAt: context.startedAt });
  await audit.recordAccess(context, {
    kind: 'device-registered',
    outcome: 'succeeded',
    userId: by.userId,
    deviceId,
    ...known(by, 'networkAddress', 'scope'),
  });
  return { kind: 'success', answer: { deviceId } };
}

/** What a challenge request comes to (offline-counter 3.3; access-and-approvals 3.1). */
export type ChallengeIssue =
  | { readonly kind: 'issued'; readonly challengeId: string; readonly challenge: string }
  | { readonly kind: 'slowed' }
  | { readonly kind: 'unavailable'; readonly missing: readonly MissingItem[] };

/**
 * Issue a one-time challenge for a device to sign (offline-counter 3.2, 3.3), on the sign-in path with no actor
 * (code-house-rules 6.3). It names no device: the signature binds the purpose, the Organisation and the device, and
 * the challenge is used once, by whichever proof uses it first.
 *
 * Bounded as sign-in is (access-and-approvals 3.1; S1-F12 review): the challenges issued to the source address in the
 * sign-in throttling window and not yet used count like failed sign-ins, and at the setting's limit the request is
 * slowed; a used challenge does not count, so a device that signs in is never slowed. No value of its own is chosen:
 * the window and the limit are the `access.sign-in-throttling` setting, and while it is not set a challenge is
 * unavailable, naming it, as sign-in is (code-house-rules 12.14). Challenges carry no lifetime (OPEN, RR-493).
 */
export async function issueChallenge(context: TransactionContext, networkAddress: string): Promise<ChallengeIssue> {
  const throttling = await readSetting(context, 'access.sign-in-throttling');
  if (throttling.kind === 'not-set') {
    return { kind: 'unavailable', missing: [{ kind: 'setting', setting: 'access.sign-in-throttling' }] };
  }
  const since = new Date(context.startedAt.getTime() - throttling.value.windowSeconds * 1000);
  const [held] = await context.tx
    .select({ unused: count() })
    .from(deviceChallenge)
    .where(
      and(
        sql`${deviceChallenge.networkAddress} = ${networkAddress}::inet`,
        isNull(deviceChallenge.usedAt),
        gte(deviceChallenge.issuedAt, since),
      ),
    );
  if ((held?.unused ?? 0) >= throttling.value.failureLimit) return { kind: 'slowed' };
  const challengeId = uuidv7();
  const challenge = newChallenge();
  await context.tx
    .insert(deviceChallenge)
    .values({ id: challengeId, challenge, issuedAt: context.startedAt, networkAddress });
  return { kind: 'issued', challengeId, challenge };
}

/**
 * Enrol a device (offline-counter 3.2 steps 2 and 3; PRD-OFF-010): the caller holds the device row through
 * deviceLockTarget at step 1. Refused for a device that does not exist, one Revoked or Ended (`access.device-ended`:
 * both are final), one already enrolled (`access.device-already-enrolled`: a device is enrolled once and its key never
 * changes), and a proof that does not
 * verify: a challenge unknown or used, or a signature not made with the key given over this purpose, Organisation,
 * device and challenge (`access.device-proof-refused`). Binds the key, marks the challenge used, makes the device
 * Active and writes the `device-enrolled` access record.
 */
export async function enrolDevice(
  context: TransactionContext,
  audit: AuditInterface,
  by: DeviceActor,
  deviceId: string,
  enrolment: { readonly publicKey: DevicePublicKey; readonly challengeId: string; readonly signature: string },
): Promise<DeviceOutcome<{ readonly deviceId: string }>> {
  const held = context.heldLock(DEVICE, deviceId);
  if (held?.mode !== 'exclusive') throw new CommandDefect('Enrolment holds the device row it enrols (8.2)');
  const found = (await devicesById(context, [deviceId])).get(deviceId);
  if (found === undefined) return refusal('not-found', 'access.device-not-found');
  // Revoked and Ended are final: such a device binds no key, enrolled or not (3.5).
  if (found.state === 'Revoked' || found.state === 'Ended') return refusal('refused', 'access.device-ended');
  if (found.state !== 'Setting up' || found.enrolled) return refusal('refused', 'access.device-already-enrolled');
  const used = await useChallenge(context, enrolment.challengeId, deviceId, 'enrolment', (challenge) =>
    proofVerifies(enrolment.publicKey, enrolment.signature, {
      purpose: 'enrol',
      organisationCode: context.organisationCode,
      deviceId,
      challenge,
    }),
  );
  if (!used) return refusal('refused', 'access.device-proof-refused');
  await context.tx
    .update(device)
    .set({ publicKey: { ...enrolment.publicKey }, enrolledAt: context.startedAt })
    .where(and(eq(device.id, deviceId), isNull(device.publicKey)));
  await context.tx.insert(deviceVersion).values({
    id: uuidv7(),
    deviceId,
    version: (await latestVersion(context, deviceId)) + 1,
    state: 'Active',
    occurredAt: context.startedAt,
  });
  await audit.recordAccess(context, {
    kind: 'device-enrolled',
    outcome: 'succeeded',
    userId: by.userId,
    deviceId,
    ...known(by, 'networkAddress', 'scope'),
  });
  return { kind: 'success', answer: { deviceId } };
}

/**
 * End a device's use (offline-counter 3.1, 3.5; access-and-approvals 2.4, 3.3; PRD-SEC-008, PRD-OFF-010, DEC-092;
 * S1-F12-T02): Revoked, reported lost, or Ended, retired; both are final, so a device Revoked or Ended already is
 * refused (`access.device-ended`). The caller holds the device row through deviceLockTarget at step 1, and every other
 * row it locks, its series at step 8 included, before this first write (code-house-rules 8.2). A device Setting up may
 * end too: one lost or retired before its enrolment. In the same transaction every session bound to the device, of
 * whichever user, is revoked through revokeSessions, so its next request is not signed in and its live-update stream
 * closes (3.3): an audit record per session with the state it had and, per user, one `session-revoked` access record
 * and one `access.session-revoked`. The device's own access record is `device-revoked` or `device-ended`; revocation
 * also publishes `access.device-revoked` for other consumers (offline-counter 3.5, 12.2). Answers the state the device
 * had and the sessions revoked.
 */
export async function endDevice(
  context: TransactionContext,
  audit: AuditInterface,
  by: DeviceActor,
  deviceId: string,
  state: 'Revoked' | 'Ended',
): Promise<
  DeviceOutcome<{ readonly deviceId: string; readonly previousState: DeviceState; readonly sessionIds: string[] }>
> {
  const held = context.heldLock(DEVICE, deviceId);
  if (held?.mode !== 'exclusive') throw new CommandDefect('Ending a device holds the device row (8.2)');
  const found = (await devicesById(context, [deviceId])).get(deviceId);
  if (found === undefined) return refusal('not-found', 'access.device-not-found');
  if (found.state === 'Revoked' || found.state === 'Ended') return refusal('refused', 'access.device-ended');
  await context.tx.insert(deviceVersion).values({
    id: uuidv7(),
    deviceId,
    version: (await latestVersion(context, deviceId)) + 1,
    state,
    occurredAt: context.startedAt,
  });
  const sessionIds =
    (await revokeSessions(
      context,
      audit,
      { actor: { kind: 'user', id: by.userId }, ...known(by, 'roleAssignmentId', 'networkAddress', 'scope') },
      { deviceId },
      state === 'Revoked' ? 'revoke-device' : 'retire-device',
    )) ?? [];
  await audit.recordAccess(context, {
    kind: state === 'Revoked' ? 'device-revoked' : 'device-ended',
    outcome: 'succeeded',
    userId: by.userId,
    deviceId,
    ...known(by, 'networkAddress', 'scope'),
  });
  if (state === 'Revoked') {
    await context.publish(deviceRevoked, {
      subject: { module: 'access', recordType: 'device', recordId: deviceId },
      ...(by.scope?.storeId === undefined ? {} : { scope: { storeId: by.scope.storeId } }),
      payload: { deviceId },
    });
  }
  return { kind: 'success', answer: { deviceId, previousState: found.state, sessionIds } };
}

/**
 * Check a device's proof at sign-in (offline-counter 3.3, 3.4; POL-02.18): the device exists, is Active with its key
 * bound, and signed this unused challenge for a sign-in in this Organisation; the challenge is then used. Answers
 * whether it holds; a device that is unknown, not Active, or whose key did not sign it, is no proof.
 *
 * The sign-in relies on the device, so the caller holds the device row through deviceSignInLockTarget, in shared mode at
 * step 1, before its first write and before this reads the device's state and key, and keeps it until it commits the
 * session it starts (code-house-rules 8.1, 8.2): a revocation or retirement, which holds the row exclusively, either
 * commits first, and the device is then no longer Active here, or waits until the session is committed and revokes it
 * with the others (PRD-SEC-008; S1-F12 review).
 */
export async function proveDeviceForSignIn(context: TransactionContext, proof: DeviceProof): Promise<boolean> {
  const [row] = await context.tx
    .select({ publicKey: device.publicKey })
    .from(device)
    .where(eq(device.id, proof.deviceId));
  // An unknown device has no row to hold; a known one must be held already.
  if (row === undefined) return false;
  if (context.heldLock(DEVICE, proof.deviceId) === undefined) {
    throw new CommandDefect('A device sign-in holds the device row before it reads it (8.2)');
  }
  if (row.publicKey === null) return false;
  const state = (await devicesById(context, [proof.deviceId])).get(proof.deviceId)?.state;
  if (state !== 'Active') return false;
  const publicKey = devicePublicKeySchema.safeParse(row.publicKey);
  if (!publicKey.success) throw new CommandDefect('A device holds a key its schema refuses');
  return useChallenge(context, proof.challengeId, proof.deviceId, 'sign-in', (challenge) =>
    proofVerifies(publicKey.data, proof.signature, {
      purpose: 'sign-in',
      organisationCode: context.organisationCode,
      deviceId: proof.deviceId,
      challenge,
    }),
  );
}

/**
 * Uses an unused challenge for a device once its signature verifies: the update takes it only while unused, so two
 * proofs on one challenge never both pass (offline-counter 3.3).
 */
async function useChallenge(
  context: TransactionContext,
  challengeId: string,
  deviceId: string,
  usedFor: 'enrolment' | 'sign-in',
  verifies: (challenge: string) => boolean,
): Promise<boolean> {
  const [challenge] = await context.tx
    .select({ challenge: deviceChallenge.challenge })
    .from(deviceChallenge)
    .where(and(eq(deviceChallenge.id, challengeId), isNull(deviceChallenge.usedAt)));
  if (challenge === undefined || !verifies(challenge.challenge)) return false;
  const taken = await context.tx
    .update(deviceChallenge)
    .set({ usedAt: context.startedAt, usedFor, deviceId })
    .where(and(eq(deviceChallenge.id, challengeId), isNull(deviceChallenge.usedAt)))
    .returning({ id: deviceChallenge.id });
  return taken.length === 1;
}

async function latestVersion(context: TransactionContext, deviceId: string): Promise<number> {
  const [row] = await context.tx
    .select({ version: deviceVersion.version })
    .from(deviceVersion)
    .where(eq(deviceVersion.deviceId, deviceId))
    .orderBy(desc(deviceVersion.version))
    .limit(1);
  return row?.version ?? 0;
}

/** The devices named, by identifier, each with its latest state; one that does not exist is left out. */
export async function devicesById(
  context: TransactionContext,
  deviceIds: readonly string[],
): Promise<ReadonlyMap<string, DeviceRead>> {
  if (deviceIds.length === 0) return new Map();
  const rows = await context.tx
    .select({ id: device.id, code: device.code, label: device.label, publicKey: device.publicKey })
    .from(device)
    .where(inArray(device.id, [...deviceIds]));
  const versions = await context.tx
    .select({ deviceId: deviceVersion.deviceId, state: deviceVersion.state })
    .from(deviceVersion)
    .where(inArray(deviceVersion.deviceId, [...deviceIds]))
    .orderBy(asc(deviceVersion.version));
  // The latest version is the state: ordered by version, the last one read for a device wins.
  const states = new Map<string, DeviceState>(versions.map((row) => [row.deviceId, row.state]));
  const read = new Map<string, DeviceRead>();
  for (const row of rows) {
    const state = states.get(row.id);
    if (state === undefined) throw new CommandDefect(`Device ${row.id} has no version`);
    read.set(row.id, { deviceId: row.id, code: row.code, label: row.label, state, enrolled: row.publicKey !== null });
  }
  return read;
}
