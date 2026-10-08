import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { lockTable, type LockTarget, type TransactionContext } from '../../../kernel/index.js';
import type { DocumentEffect, EffectDecider, EffectOutcome, ModuleApprovals } from '../../access/index.js';
import type { AuditInterface } from '../../audit/index.js';
import {
  accountingBook,
  area,
  city,
  groupingMember,
  siteVersion,
  state,
  storeVersion,
  taxRegistration,
  taxRegistrationVersion,
} from '../db/schema.js';
import { masterTables } from '../db/tables.js';
import {
  actionTypeOf,
  masterKinds,
  organisationApprovalRules,
  recordTypeOf,
  type Decision,
  type MasterKind,
} from '../domain/kinds.js';
import { structureChanged } from '../events.js';
import { inForceOn, refusal, today, type Reference } from './common.js';
import { operationName } from './prepare.js';

// What a decision does to a master version (structure-and-masters 2.2, 2.3; module-map 6.2 flow A;
// access-and-approvals 9.8b; S1-F02-T01): in the decision's transaction, the version taking effect from its start, or
// rejected, with its audit record and `organisation.structure-changed`.

/** The records a version names, which must be in force on its start when it is approved. */
async function referencesOf(
  context: TransactionContext,
  kind: MasterKind,
  recordId: string,
  versionId: string,
): Promise<Reference[]> {
  switch (kind) {
    case 'country':
    case 'legal_entity':
      return [];
    case 'state': {
      const [row] = await context.tx.select({ id: state.countryId }).from(state).where(eq(state.id, recordId));
      return row === undefined ? [] : [{ kind: 'country', id: row.id }];
    }
    case 'city': {
      const [row] = await context.tx.select({ id: city.stateId }).from(city).where(eq(city.id, recordId));
      return row === undefined ? [] : [{ kind: 'state', id: row.id }];
    }
    case 'area': {
      const [row] = await context.tx.select({ id: area.cityId }).from(area).where(eq(area.id, recordId));
      return row === undefined ? [] : [{ kind: 'city', id: row.id }];
    }
    case 'tax_registration': {
      const [row] = await context.tx
        .select({ legalEntityId: taxRegistration.legalEntityId, stateId: taxRegistrationVersion.stateId })
        .from(taxRegistrationVersion)
        .innerJoin(taxRegistration, eq(taxRegistration.id, taxRegistrationVersion.taxRegistrationId))
        .where(eq(taxRegistrationVersion.id, versionId));
      return row === undefined
        ? []
        : [
            { kind: 'legal_entity', id: row.legalEntityId },
            { kind: 'state', id: row.stateId },
          ];
    }
    case 'accounting_book': {
      const [row] = await context.tx
        .select({ id: accountingBook.legalEntityId })
        .from(accountingBook)
        .where(eq(accountingBook.id, recordId));
      return row === undefined ? [] : [{ kind: 'legal_entity', id: row.id }];
    }
    case 'site': {
      const [row] = await context.tx
        .select({ id: siteVersion.areaId })
        .from(siteVersion)
        .where(eq(siteVersion.id, versionId));
      return row === undefined ? [] : [{ kind: 'area', id: row.id }];
    }
    case 'store': {
      const [row] = await context.tx
        .select({ id: storeVersion.siteId })
        .from(storeVersion)
        .where(eq(storeVersion.id, versionId));
      return row === undefined ? [] : [{ kind: 'site', id: row.id }];
    }
    case 'grouping': {
      const rows = await context.tx
        .select({ id: groupingMember.storeId })
        .from(groupingMember)
        .where(eq(groupingMember.groupingVersionId, versionId));
      return rows.map((row) => ({ kind: 'store' as const, id: row.id }));
    }
  }
}

/** A version's master, its decision and its first day. */
interface VersionHead {
  readonly recordId: string;
  readonly decision: Decision;
  readonly start: string;
}

/**
 * What a decision does to a master version (module-map 6.2 flow A; access-and-approvals 9.8b): the effect `access`
 * runs in the decision's transaction, under the locks Decide took.
 */
export class StructureEffects {
  constructor(private readonly audit: AuditInterface) {}

  /** The master the version is of; fixed once written, so it is read before the locks. */
  private async versionOf(
    context: TransactionContext,
    kind: MasterKind,
    versionId: string,
  ): Promise<VersionHead | undefined> {
    const tables = masterTables[kind];
    const [row] = await context.tx
      .select({
        recordId: sql<string>`${tables.owner}`,
        decision: sql<Decision>`${tables.decision}`,
        start: sql<string>`lower(${tables.validDuring})::text`,
      })
      .from(tables.version)
      .where(eq(tables.versionId, versionId));
    return row;
  }

  /**
   * The rows a decision locks with the request at step 1 (code-house-rules 8.2): the master's identity row, so two
   * decisions on versions of one master never pass each other. Every version of the master changes only under it.
   */
  async targets(context: TransactionContext, kind: MasterKind, versionId: string): Promise<LockTarget[]> {
    const version = await this.versionOf(context, kind, versionId);
    return version === undefined
      ? []
      : [{ table: lockTable('organisation', kind), id: version.recordId, mode: 'exclusive' }];
  }

  /**
   * Makes an approved version take effect from its start (structure-and-masters 2.2; code-house-rules 7.3), rechecked
   * under the master's lock: still Awaiting approval; not starting on a past date, or refused, to be re-dated by
   * preparing it again from today or later, which supersedes it (GC2-7, DEC-105; access-and-approvals 9.6); no
   * approved version, a Scheduled one included, starting on its start; every record it names in force on its start.
   * The approved version in force or Scheduled at its start ends there; where an approved version starts after it, it
   * ends where that one starts, which keeps its own values (product owner, 8 Oct 2026). A record it names stays in
   * force once it is: an approved version ends only where the next one starts, and none is withdrawn yet, so no later
   * change opens a gap under it.
   */
  async approve(
    context: TransactionContext,
    decider: EffectDecider,
    kind: MasterKind,
    versionId: string,
  ): Promise<EffectOutcome> {
    const version = await this.versionOf(context, kind, versionId);
    if (version === undefined) return refusal('not-found', 'organisation.record-not-found');
    if (version.decision !== 'Awaiting approval') return refusal('conflict', 'kernel.stale-version');
    const date = await today(context);
    if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
    if (version.start < date) return refusal('refused', 'organisation.starts-in-past');
    const tables = masterTables[kind];
    const approved = and(eq(tables.owner, version.recordId), eq(tables.decision, 'Approved'));
    const [same] = await context.tx
      .select({ id: sql<string>`${tables.versionId}` })
      .from(tables.version)
      .where(and(approved, sql`lower(${tables.validDuring}) = ${version.start}::date`))
      .limit(1);
    if (same !== undefined) {
      return refusal('refused', 'organisation.version-overlaps', [
        { kind: 'version', recordType: recordTypeOf(kind), recordId: version.recordId, versionId: same.id },
      ]);
    }
    for (const reference of await referencesOf(context, kind, version.recordId, versionId)) {
      if (!(await inForceOn(context, reference.kind, reference.id, version.start))) {
        return refusal('refused', 'organisation.reference-not-in-force', [
          { kind: 'approval', recordType: recordTypeOf(reference.kind), recordId: reference.id },
        ]);
      }
    }
    const [next] = await context.tx
      .select({ start: sql<string>`lower(${tables.validDuring})::text` })
      .from(tables.version)
      .where(and(approved, gt(sql`lower(${tables.validDuring})`, sql`${version.start}::date`)))
      .orderBy(asc(sql`lower(${tables.validDuring})`))
      .limit(1);
    await context.tx.execute(
      sql`update ${tables.version} set valid_during = daterange(lower(valid_during), ${version.start}::date)
          where ${tables.owner} = ${version.recordId}::uuid and decision = 'Approved'
            and valid_during @> ${version.start}::date`,
    );
    await context.tx.execute(
      sql`update ${tables.version}
          set decision = 'Approved', valid_during = daterange(${version.start}::date, ${next?.start ?? null}::date)
          where id = ${versionId}::uuid`,
    );
    await this.recordDecision(context, decider, kind, version.recordId, versionId, 'Approved');
    await context.publish(structureChanged, {
      subject: { module: 'organisation', recordType: recordTypeOf(kind), recordId: version.recordId, versionId },
      payload: { recordType: recordTypeOf(kind), recordId: version.recordId, versionId },
    });
    return { kind: 'success', answer: { recordId: version.recordId } };
  }

  /** Records a version Rejected; it never takes effect (access-and-approvals 9.5). */
  async reject(
    context: TransactionContext,
    decider: EffectDecider,
    kind: MasterKind,
    versionId: string,
  ): Promise<EffectOutcome> {
    const version = await this.versionOf(context, kind, versionId);
    if (version === undefined) return refusal('not-found', 'organisation.record-not-found');
    if (version.decision !== 'Awaiting approval') return refusal('conflict', 'kernel.stale-version');
    const tables = masterTables[kind];
    await context.tx.execute(sql`update ${tables.version} set decision = 'Rejected' where id = ${versionId}::uuid`);
    await this.recordDecision(context, decider, kind, version.recordId, versionId, 'Rejected');
    return { kind: 'success', answer: { recordId: version.recordId } };
  }

  private async recordDecision(
    context: TransactionContext,
    decider: EffectDecider,
    kind: MasterKind,
    recordId: string,
    versionId: string,
    decision: 'Approved' | 'Rejected',
  ): Promise<void> {
    await this.audit.record(context, {
      actor: decider.actor,
      ...(decider.roleAssignmentId === undefined ? {} : { roleAssignmentId: decider.roleAssignmentId }),
      ...(decider.approvalDecisionId === undefined ? {} : { approval: { decisionId: decider.approvalDecisionId } }),
      ...(decider.reason === undefined ? {} : { reason: decider.reason }),
      record: { module: 'organisation', type: kind, id: recordId, versionId },
      operation:
        decision === 'Approved' ? `approve-${operationName(kind)}-version` : `reject-${operationName(kind)}-version`,
      changes: [{ kind: 'value', field: 'decision', before: 'Awaiting approval', after: decision }],
      source: { kind: 'screen' },
    });
  }
}

/**
 * The approval rules and decision effects `organisation` declares to `access` (access-and-approvals 8, 9.8b;
 * module-map section 3, rule 6), which the composition root hands to `access` at start.
 */
export function organisationApprovals(audit: AuditInterface): ModuleApprovals {
  const effects = new StructureEffects(audit);
  return {
    rules: organisationApprovalRules,
    effects: new Map<string, DocumentEffect>(
      masterKinds.map((kind) => [
        actionTypeOf(kind),
        {
          targets: (c, v) => effects.targets(c, kind, v),
          approve: (c, d, v) => effects.approve(c, d, kind, v),
          reject: (c, d, v) => effects.reject(c, d, kind, v),
        },
      ]),
    ),
  };
}
