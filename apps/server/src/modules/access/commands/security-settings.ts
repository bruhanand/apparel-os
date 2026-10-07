import { uuidv7 } from '@apparel-os/domain';
import type { SecuritySettingVersionDraft } from '@apparel-os/schemas';
import { eq, sql } from 'drizzle-orm';
import { CommandDefect, lockTable, type LockTarget, type TransactionContext } from '../../../kernel/index.js';
import type { AuditInterface } from '../../audit/index.js';
import { setting, settingVersion, settingVersionChange } from '../db/schema.js';
import { SETTING_FORMATS, SETTING_SCHEMAS, type AccessSettingKey } from '../domain/sign-in-rules.js';
import { INSTANT_TEXT } from '../queries/security-settings.js';
import {
  instantsFrom,
  lockUnlessHeld,
  refusal,
  type Decider,
  type EffectOptions,
  type Prepared,
  type Preparer,
} from './access-changes.js';
import { requestApproval } from './request-approval.js';

// Changing an essential security setting after setup (access-and-approvals 3.3, 9.11; code-house-rules 7.3, 12.14;
// POL-02.06, POL-02.07, PRD-MOD-010; DEC-118, RR-334; S1-F01-T25): the sign-in throttling, the password rules and the
// office session limits. A change is a new version, Awaiting approval until a different authorised person decides it
// with a fresh code (Decide, 9.5). It takes effect at the moment of its decision, dated like a user version, or from
// the start of a later business day under the Organisation's timezone; never earlier. A required setting is never
// removed: no version ends without another following it, and a rejection changes nothing in force. Validation for live
// use by a person who did not enter the values (V-04, DM-6) stays with S1-F04.

const SETTING = lockTable('access', 'setting');
const SETTING_VERSION = lockTable('access', 'setting_version');

function auditActor(decider: Decider) {
  return {
    actor: decider.actor,
    ...(decider.roleAssignmentId === undefined ? {} : { roleAssignmentId: decider.roleAssignmentId }),
    ...(decider.approvalDecisionId === undefined ? {} : { approval: { decisionId: decider.approvalDecisionId } }),
    ...(decider.reason === undefined ? {} : { reason: decider.reason }),
  };
}

/** A stored value read through its setting's schema (code-house-rules 12.14); a value it refuses is a defect. */
function settingValue(key: string, value: unknown) {
  if (!isSettingKey(key)) throw new CommandDefect(`Setting ${key} is not an essential security setting`);
  const parsed = SETTING_SCHEMAS[key].safeParse(value);
  if (!parsed.success) throw new CommandDefect(`Setting ${key} holds a value its format's schema refuses`);
  return parsed.data;
}

function isSettingKey(key: string): key is AccessSettingKey {
  return Object.hasOwn(SETTING_SCHEMAS, key);
}

export class SecuritySettingsChanges {
  constructor(private readonly audit: AuditInterface) {}

  /**
   * Prepares a new version of one essential security setting and requests its approval, in one transaction (9.1).
   * Refused while the Organisation's timezone is not set, and for a start date that is not later than today: a version
   * never starts in the past (code-house-rules 7.3). A request open on an earlier version of the same setting is
   * Superseded (9.6). The setting's row is written with its first version, for an Organisation set up without it.
   */
  async prepare(
    context: TransactionContext,
    preparer: Preparer,
    draft: SecuritySettingVersionDraft,
  ): Promise<Prepared<{ settingId: string; versionId: string; requestId: string }>> {
    const date = await context.businessDate();
    if (date.kind === 'not-set') {
      return refusal('unavailable', 'access.business-date-not-set', [
        { kind: 'setting', setting: 'configuration.timezone' },
      ]);
    }
    const startsOn = draft.takesEffect.kind === 'from-date' ? draft.takesEffect.date : null;
    if (startsOn !== null && startsOn <= date.date) return refusal('refused', 'access.starts-in-past');
    const value = SETTING_SCHEMAS[draft.setting].parse(draft.value);
    // A second first preparation waits here at the setting's unique key for the first, then finds its row: the
    // insert does nothing and the read below, a statement of its own, sees the row committed (code-house-rules 8.1).
    await context.tx
      .insert(setting)
      .values({ id: uuidv7(), settingKey: draft.setting })
      .onConflictDoNothing({ target: setting.settingKey });
    const settingId = (
      await context.tx.select({ id: setting.id }).from(setting).where(eq(setting.settingKey, draft.setting))
    )[0]?.id;
    if (settingId === undefined) throw new CommandDefect(`Setting ${draft.setting} has no row after it was written`);
    const versionId = uuidv7();
    // An at-decision version is written from the preparation's instant and started again at its decision (9.5).
    const start =
      startsOn === null ? context.startedAt.toISOString() : await this.startOfDay(context, startsOn, date.timezone);
    await context.tx.insert(settingVersion).values({
      id: versionId,
      settingId,
      valueFormat: SETTING_FORMATS[draft.setting],
      value,
      origin: draft.origin,
      validDuring: instantsFrom(start),
      decision: 'Awaiting approval',
      startsOn,
    });
    await context.tx
      .insert(settingVersionChange)
      .values({ id: uuidv7(), settingVersionId: versionId, changedByUserId: preparer.userId });
    await this.audit.record(context, {
      actor: { kind: 'user', id: preparer.userId },
      roleAssignmentId: preparer.roleAssignmentId,
      record: { module: 'access', type: 'setting', id: settingId, versionId },
      operation: 'prepare-setting-version',
      changes: [
        { kind: 'value', field: 'key', before: null, after: draft.setting },
        { kind: 'value', field: 'value', before: null, after: value },
        { kind: 'value', field: 'origin', before: null, after: draft.origin },
        { kind: 'value', field: 'startsOn', before: null, after: startsOn },
      ],
      source: { kind: 'screen' },
    });
    const requestId = await requestApproval(context, this.audit, {
      actionType: 'access.setting.change',
      document: { recordType: 'access.setting', recordId: settingId, versionId },
      preparer,
    });
    return { kind: 'success', answer: { settingId, versionId, requestId } };
  }

  /** The instant a business day starts under the Organisation's timezone (code-house-rules 9), as ISO text. */
  private async startOfDay(context: TransactionContext, day: string, timezone: string): Promise<string> {
    const result = await context.tx.execute<{ start: string }>(
      sql`select to_char((${day}::date::timestamp at time zone ${timezone}) at time zone 'UTC', ${sql.raw(INSTANT_TEXT)})
          as start`,
    );
    const start = result.rows[0]?.start;
    if (start === undefined) throw new CommandDefect('No start of the business day');
    return start;
  }

  /** The setting a version is of. */
  private async settingOf(context: TransactionContext, versionId: string): Promise<string | undefined> {
    const [row] = await context.tx
      .select({ settingId: settingVersion.settingId })
      .from(settingVersion)
      .where(eq(settingVersion.id, versionId));
    return row?.settingId;
  }

  /**
   * The rows a decision on a version locks at step 1 (code-house-rules 8.2): the setting, so two decisions on versions
   * of one setting never pass each other, and the version.
   */
  async versionTargets(context: TransactionContext, versionId: string): Promise<LockTarget[]> {
    // Read before the locks: safe, since a version's setting_id is fixed once written. No command updates it, and
    // once the version is decided the guard_version_change trigger (migrations 0005, 0006) refuses any change to it.
    const settingId = await this.settingOf(context, versionId);
    return [
      ...(settingId === undefined ? [] : [{ table: SETTING, id: settingId, mode: 'exclusive' as const }]),
      { table: SETTING_VERSION, id: versionId, mode: 'exclusive' },
    ];
  }

  /**
   * Makes an approved version take effect (code-house-rules 7.3; module-map 6.2 flow A; DEC-118): rechecks under its
   * locks that it is Awaiting approval; an at-decision version starts at the decision's recording time, a dated one at
   * the start of its day, refused once that has passed (`access.starts-in-past`); refused when an Approved version
   * starts at or after its start (`access.version-overlaps`); the Approved version in force at its start ends there,
   * so the setting is never left unset. Writes the audit record and the permission-change access record (9.11).
   */
  async approve(
    context: TransactionContext,
    decider: Decider,
    versionId: string,
    options: EffectOptions = {},
  ): Promise<Prepared<{ settingId: string }>> {
    await lockUnlessHeld(context, options, { document: await this.versionTargets(context, versionId) });
    const [found] = await context.tx
      .select({ version: settingVersion, key: setting.settingKey })
      .from(settingVersion)
      .innerJoin(setting, eq(setting.id, settingVersion.settingId))
      .where(eq(settingVersion.id, versionId));
    if (found === undefined) return refusal('not-found', 'access.setting-not-found');
    const { version, key } = found;
    if (version.decision !== 'Awaiting approval') return refusal('conflict', 'kernel.stale-version');
    const date = await context.businessDate();
    if (date.kind === 'not-set') {
      return refusal('unavailable', 'access.business-date-not-set', [
        { kind: 'setting', setting: 'configuration.timezone' },
      ]);
    }
    if (version.startsOn !== null && version.startsOn <= date.date) return refusal('refused', 'access.starts-in-past');
    const start =
      version.startsOn === null
        ? context.startedAt.toISOString()
        : await this.startOfDay(context, version.startsOn, date.timezone);
    const later = await context.tx.execute(
      sql`select id from access.setting_version where setting_id = ${version.settingId}::uuid and decision = 'Approved'
          and lower(valid_during) >= ${start}::timestamptz`,
    );
    if (later.rows.length > 0) return refusal('refused', 'access.version-overlaps');
    const [before] = (
      await context.tx.execute<{ id: string; value: unknown }>(
        sql`select id, value from access.setting_version where setting_id = ${version.settingId}::uuid
            and decision = 'Approved' and valid_during @> ${start}::timestamptz`,
      )
    ).rows;
    if (before !== undefined) {
      await context.tx.execute(
        sql`update access.setting_version set valid_during = tstzrange(lower(valid_during), ${start}::timestamptz)
            where id = ${before.id}::uuid`,
      );
    }
    await context.tx
      .update(settingVersion)
      .set({ decision: 'Approved', validDuring: instantsFrom(start) })
      .where(eq(settingVersion.id, versionId));
    const auditRecord = await this.audit.record(context, {
      ...auditActor(decider),
      record: { module: 'access', type: 'setting', id: version.settingId, versionId },
      operation: 'approve-setting-version',
      changes: [
        { kind: 'value', field: 'decision', before: 'Awaiting approval', after: 'Approved' },
        {
          kind: 'value',
          field: 'value',
          before: before === undefined ? null : settingValue(key, before.value),
          after: settingValue(key, version.value),
        },
        { kind: 'value', field: 'validFrom', before: null, after: start },
      ],
      source: { kind: 'screen' },
    });
    await this.audit.recordAccess(context, { kind: 'permission-changed', outcome: 'succeeded', auditRecord });
    return { kind: 'success', answer: { settingId: version.settingId } };
  }

  /** Records a version Rejected; it never takes effect, and the version in force stays (9.5). */
  async reject(
    context: TransactionContext,
    decider: Decider,
    versionId: string,
    options: EffectOptions = {},
  ): Promise<Prepared<{ settingId: string }>> {
    await lockUnlessHeld(context, options, { document: await this.versionTargets(context, versionId) });
    const [version] = await context.tx.select().from(settingVersion).where(eq(settingVersion.id, versionId));
    if (version === undefined) return refusal('not-found', 'access.setting-not-found');
    if (version.decision !== 'Awaiting approval') return refusal('conflict', 'kernel.stale-version');
    await context.tx.update(settingVersion).set({ decision: 'Rejected' }).where(eq(settingVersion.id, versionId));
    await this.audit.record(context, {
      ...auditActor(decider),
      record: { module: 'access', type: 'setting', id: version.settingId, versionId },
      operation: 'reject-setting-version',
      changes: [{ kind: 'value', field: 'decision', before: 'Awaiting approval', after: 'Rejected' }],
      source: { kind: 'screen' },
    });
    return { kind: 'success', answer: { settingId: version.settingId } };
  }
}
