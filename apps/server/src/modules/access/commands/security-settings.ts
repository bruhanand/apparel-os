import { uuidv7 } from '@apparel-os/domain';
import type { SecuritySettingKey, SecuritySettings, SecuritySettingVersionDraft } from '@apparel-os/schemas';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { CommandDefect, lockTable, type LockTarget, type TransactionContext } from '../../../kernel/index.js';
import type { AuditInterface } from '../../audit/index.js';
import { setting, settingVersion, settingVersionChange } from '../db/schema.js';
import { SETTING_FORMATS, SETTING_SCHEMAS } from '../domain/sign-in-rules.js';
import {
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

/** The essential security settings, in the order the form shows them (design-language 10.19). */
const KEYS: readonly SecuritySettingKey[] = [
  'access.sign-in-throttling',
  'access.password-rules',
  'access.office-session-limits',
];

function auditActor(decider: Decider) {
  return {
    actor: decider.actor,
    ...(decider.roleAssignmentId === undefined ? {} : { roleAssignmentId: decider.roleAssignmentId }),
    ...(decider.approvalDecisionId === undefined ? {} : { approval: { decisionId: decider.approvalDecisionId } }),
    ...(decider.reason === undefined ? {} : { reason: decider.reason }),
  };
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
    let settingId = (
      await context.tx.select({ id: setting.id }).from(setting).where(eq(setting.settingKey, draft.setting))
    )[0]?.id;
    if (settingId === undefined) {
      settingId = uuidv7();
      await context.tx.insert(setting).values({ id: settingId, settingKey: draft.setting });
    }
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
      validDuring: `[${start},)`,
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
      sql`select to_char((${day}::date::timestamp at time zone ${timezone}) at time zone 'UTC',
                         'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as start`,
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
    const [version] = await context.tx.select().from(settingVersion).where(eq(settingVersion.id, versionId));
    if (version === undefined) return refusal('not-found', 'access.setting-not-found');
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
      await context.tx.execute<{ id: string; value: Record<string, number> }>(
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
      .set({ decision: 'Approved', validDuring: `[${start},)` })
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
          before: before?.value ?? null,
          after: version.value as Record<string, number>,
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

  /** Every essential security setting with its versions, newest first, and the one in force now (10.19). */
  async list(context: TransactionContext): Promise<SecuritySettings> {
    const now = context.startedAt.toISOString();
    const rows = await context.tx
      .select({
        settingId: setting.id,
        key: setting.settingKey,
        id: settingVersion.id,
        value: settingVersion.value,
        valueFormat: settingVersion.valueFormat,
        origin: settingVersion.origin,
        decision: settingVersion.decision,
        startsOn: settingVersion.startsOn,
        validFrom: sql<string>`to_char(lower(${settingVersion.validDuring}) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
        validTo: sql<
          string | null
        >`to_char(upper(${settingVersion.validDuring}) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
        inForce: sql<boolean>`${settingVersion.decision} = 'Approved' and ${settingVersion.validDuring} @> ${now}::timestamptz`,
      })
      .from(settingVersion)
      .innerJoin(setting, eq(setting.id, settingVersion.settingId))
      .orderBy(asc(setting.settingKey), desc(settingVersion.recordedAt), desc(settingVersion.id));
    const settings = KEYS.map((key) => {
      const own = rows.filter((row) => row.key === key);
      return {
        setting: key,
        settingId: own[0]?.settingId ?? null,
        inForceVersionId: own.find((row) => row.inForce)?.id ?? null,
        versions: own.map((row) => {
          if (row.valueFormat !== SETTING_FORMATS[key]) {
            throw new CommandDefect(`Setting ${key} holds a value of a format this server does not read`);
          }
          const approved = row.decision === 'Approved';
          return {
            id: row.id,
            value: SETTING_SCHEMAS[key].parse(row.value),
            origin: row.origin,
            decision: row.decision,
            takesEffect: row.startsOn === null ? { kind: 'at-decision' } : { kind: 'from-date', date: row.startsOn },
            ...(approved ? { validFrom: row.validFrom } : {}),
            ...(approved && row.validTo !== null ? { validTo: row.validTo } : {}),
          };
        }),
      };
    });
    return { asOf: now, settings } as SecuritySettings;
  }
}
