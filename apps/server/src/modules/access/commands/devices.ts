import { uuidv7 } from '@apparel-os/domain';
import { devicePublicKeySchema, type DeviceProof, type DevicePublicKey, type DeviceState } from '@apparel-os/schemas';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
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

// Devices in `access` (access-and-approvals 2.4, 3.3; offline-counter 3.1 to 3.4; PRD-OFF-002, PRD-OFF-010,
// PRD-SEC-007, PRD-SEC-008; S1-F12-T01): register a device, Setting up; issue a one-time challenge; enrol it, binding
// its public key once, Active; check its proof at sign-in. The owning module (`pos`, for a billing device) has
// authorised the action and holds its own facts; access keeps the identity, the key, the state and the device access
// records (numbering-and-audit 5.1).

const DEVICE = lockTable('access', 'device');

/** Who acts on a device, for its access record (numbering-and-audit 5.2). */
export interface DeviceActor {
  readonly userId: string;
  readonly networkAddress?: string;
  /** The place the device belongs to, so the device access record is read in that scope (5.2). */
  readonly scope?: AuditScope;
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
    ...(by.networkAddress === undefined ? {} : { networkAddress: by.networkAddress }),
    ...(by.scope === undefined ? {} : { scope: by.scope }),
  });
  return { kind: 'success', answer: { deviceId } };
}

/**
 * Issue a one-time challenge for a device to sign (offline-counter 3.2, 3.3), on the sign-in path with no actor
 * (code-house-rules 6.3). It names no device: the signature binds the purpose, the Organisation and the device, and
 * the challenge is used once, by whichever proof uses it first.
 */
export async function issueChallenge(
  context: TransactionContext,
): Promise<{ readonly challengeId: string; readonly challenge: string }> {
  const challengeId = uuidv7();
  const challenge = newChallenge();
  await context.tx.insert(deviceChallenge).values({ id: challengeId, challenge, issuedAt: context.startedAt });
  return { challengeId, challenge };
}

/**
 * Enrol a device (offline-counter 3.2 steps 2 and 3; PRD-OFF-010): the caller holds the device row through
 * deviceLockTarget at step 1. Refused for a device that does not exist, one already enrolled or not Setting up
 * (`access.device-already-enrolled`: a device is enrolled once and its key never changes), and a proof that does not
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
    ...(by.networkAddress === undefined ? {} : { networkAddress: by.networkAddress }),
    ...(by.scope === undefined ? {} : { scope: by.scope }),
  });
  return { kind: 'success', answer: { deviceId } };
}

/**
 * Check a device's proof at sign-in (offline-counter 3.3, 3.4; POL-02.18): the device exists, is Active with its key
 * bound, and signed this unused challenge for a sign-in in this Organisation; the challenge is then used. Answers
 * whether it holds; a device that is unknown, not Active, or whose key did not sign it, is no proof.
 */
export async function proveDeviceForSignIn(context: TransactionContext, proof: DeviceProof): Promise<boolean> {
  const [row] = await context.tx
    .select({ publicKey: device.publicKey })
    .from(device)
    .where(eq(device.id, proof.deviceId));
  if (row?.publicKey === undefined || row.publicKey === null) return false;
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
