import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { lockTable, type CommandRefusal, type LockTarget, type TransactionContext } from '../../../kernel/index.js';
import type { DocumentEffect, EffectDecider, EffectOutcome, ModuleApprovals } from '../../access/index.js';
import type { AuditInterface } from '../../audit/index.js';
import type { LocationInUse } from '../contracts/location-in-use.js';
import {
  accountingBook,
  area,
  businessUnitMapping,
  city,
  groupingMember,
  location,
  locationVersion,
  siteVersion,
  state,
  storeDefaultWarehouse,
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
import { mappingChanged, structureChanged } from '../events.js';
import { inForceOn, refusal, today, type Reference } from './common.js';
import { placeFactsOfRecord } from '../queries/scope.js';
import { operationName } from './prepare.js';
import { ancestorsOf, locationNesting, retirable, storeUnitRules, unitOf, unitOutOfStep } from './rules.js';

// What a decision does to a master version (structure-and-masters 2.2, 2.3; module-map 6.2 flow A;
// access-and-approvals 9.8b; S1-F02-T01, S1-F02-T02): in the decision's transaction, the version taking effect from its
// start, or rejected, with its audit record and `organisation.structure-changed`, or `organisation.mapping-changed` for
// a unit's mapping.

/** The mapping a unit version was prepared with, which is decided with it (structure-and-masters 3.4). */
async function mappingPreparedWith(context: TransactionContext, unitVersionId: string) {
  const [row] = await context.tx
    .select({
      id: businessUnitMapping.id,
      decision: businessUnitMapping.decision,
      legalEntityId: businessUnitMapping.legalEntityId,
      taxRegistrationId: businessUnitMapping.taxRegistrationId,
      accountingBookId: businessUnitMapping.accountingBookId,
    })
    .from(businessUnitMapping)
    .where(eq(businessUnitMapping.preparedWithVersionId, unitVersionId));
  return row;
}

const mappingReferences = (mapping: {
  legalEntityId: string;
  taxRegistrationId: string;
  accountingBookId: string;
}): Reference[] => [
  { kind: 'legal_entity', id: mapping.legalEntityId },
  { kind: 'tax_registration', id: mapping.taxRegistrationId },
  { kind: 'accounting_book', id: mapping.accountingBookId },
];

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
    case 'business_unit': {
      const unit = await unitOf(context, recordId);
      if (unit === undefined) return [];
      const mapping = await mappingPreparedWith(context, versionId);
      return [
        { kind: 'site', id: unit.siteId },
        ...(unit.storeId === null ? [] : [{ kind: 'store' as const, id: unit.storeId }]),
        ...(mapping === undefined ? [] : mappingReferences(mapping)),
      ];
    }
    case 'business_unit_mapping': {
      const [row] = await context.tx
        .select({
          legalEntityId: businessUnitMapping.legalEntityId,
          taxRegistrationId: businessUnitMapping.taxRegistrationId,
          accountingBookId: businessUnitMapping.accountingBookId,
        })
        .from(businessUnitMapping)
        .where(eq(businessUnitMapping.id, versionId));
      return row === undefined ? [] : [{ kind: 'business_unit', id: recordId }, ...mappingReferences(row)];
    }
    case 'location': {
      const [row] = await context.tx
        .select({ unitId: location.businessUnitId, parentId: locationVersion.parentLocationId })
        .from(locationVersion)
        .innerJoin(location, eq(location.id, locationVersion.locationId))
        .where(eq(locationVersion.id, versionId));
      return row === undefined
        ? []
        : [
            { kind: 'business_unit', id: row.unitId },
            ...(row.parentId === null ? [] : [{ kind: 'location' as const, id: row.parentId }]),
          ];
    }
    case 'store_default_warehouse': {
      const [row] = await context.tx
        .select({ unitId: storeDefaultWarehouse.warehouseUnitId })
        .from(storeDefaultWarehouse)
        .where(eq(storeDefaultWarehouse.id, versionId));
      return row === undefined
        ? []
        : [
            { kind: 'store', id: recordId },
            { kind: 'business_unit', id: row.unitId },
          ];
    }
  }
}

/** A version's master, its decision and its first day. */
interface VersionHead {
  readonly recordId: string;
  readonly decision: Decision;
  readonly start: string;
}

/** An approval that takes effect, or the refusal that stops it; nothing of a refused one stays written. */
type Effect =
  | { readonly kind: 'done'; readonly mappingVersionId?: string }
  | { readonly kind: 'refused'; readonly refusal: CommandRefusal };

/**
 * What a decision does to a master version (module-map 6.2 flow A; access-and-approvals 9.8b): the effect `access`
 * runs in the decision's transaction, under the locks Decide took.
 */
export class StructureEffects {
  constructor(
    private readonly audit: AuditInterface,
    /** The location-in-use contract `stock` implements, or undefined while none answers (3.5). */
    private readonly locationInUse: LocationInUse | undefined,
  ) {}

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
   * decisions on versions of one master never pass each other, every version of the master changing only under it. A
   * mapping's identity row is its unit's, and a default warehouse's its Store's. A Store's unit locks its Store's row
   * too, so two whole-store units of one Store are never approved at once (structure-and-masters 3.3).
   */
  async targets(context: TransactionContext, kind: MasterKind, versionId: string): Promise<LockTarget[]> {
    const version = await this.versionOf(context, kind, versionId);
    if (version === undefined) return [];
    const own: LockTarget = {
      table: lockTable('organisation', masterTables[kind].identityTable),
      id: version.recordId,
      mode: 'exclusive',
    };
    if (kind === 'business_unit') {
      const unit = await unitOf(context, version.recordId);
      if (unit?.storeId != null) {
        return [own, { table: lockTable('organisation', 'store'), id: unit.storeId, mode: 'exclusive' }];
      }
    }
    if (kind === 'location') {
      // The parent and every location it is nested under, shared (3.5): a decision nesting or retiring a location
      // waits for one on a location in its chain, so the nesting rules are read under the locks.
      const [row] = await context.tx
        .select({ parentId: locationVersion.parentLocationId })
        .from(locationVersion)
        .where(eq(locationVersion.id, versionId));
      const chain = row?.parentId == null ? [] : await ancestorsOf(context, row.parentId);
      return [
        own,
        ...chain.map((id): LockTarget => ({ table: lockTable('organisation', 'location'), id, mode: 'shared' })),
      ];
    }
    return [own];
  }

  /**
   * The other documents a decision decides with the version: a unit version's mapping prepared with it, so its decider
   * needs approve on the mapping too (structure-and-masters 3.4; product owner, 8 Oct 2026).
   */
  async decidesWith(context: TransactionContext, kind: MasterKind, versionId: string): Promise<readonly string[]> {
    if (kind !== 'business_unit') return [];
    const mapping = await mappingPreparedWith(context, versionId);
    return mapping?.decision === 'Awaiting approval' ? [actionTypeOf('business_unit_mapping')] : [];
  }

  /**
   * Makes an approved version take effect from its start (structure-and-masters 2.2; code-house-rules 7.3), rechecked
   * under the master's lock: still Awaiting approval; not starting on a past date, or refused, to be re-dated by
   * preparing it again from today or later, which supersedes it (GC2-7, DEC-105; access-and-approvals 9.6); no
   * approved version, a Scheduled one included, starting on its start; every record it names in force on its start;
   * and the kind's own rules (structure-and-masters 3.3 to 3.6). The approved version in force or Scheduled at its
   * start ends there; where an approved version starts after it, it ends where that one starts, which keeps its own
   * values (product owner, 8 Oct 2026). The rules that hang on the versions' final dates, the State rule of a mapping
   * (3.4; GC2-1), are checked once they have them, and a refusal then leaves nothing written.
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
    const overlap = await this.approvedOn(context, kind, version.recordId, version.start);
    if (overlap !== undefined) return { kind: 'refusal', refusal: overlap };
    for (const reference of await referencesOf(context, kind, version.recordId, versionId)) {
      if (!(await inForceOn(context, reference.kind, reference.id, version.start))) {
        return refusal('refused', 'organisation.reference-not-in-force', [
          { kind: 'approval', recordType: recordTypeOf(reference.kind), recordId: reference.id },
        ]);
      }
    }
    const broken = await this.kindRules(context, kind, version, versionId);
    if (broken !== undefined) return { kind: 'refusal', refusal: broken };
    await context.tx.execute(sql`savepoint organisation_effect`);
    const effect = await this.takeEffect(context, kind, version, versionId);
    if (effect.kind === 'refused') {
      await context.tx.execute(sql`rollback to savepoint organisation_effect`);
      return { kind: 'refusal', refusal: effect.refusal };
    }
    await context.tx.execute(sql`release savepoint organisation_effect`);
    await this.recordDecision(context, decider, kind, version.recordId, versionId, 'Approved');
    if (kind === 'business_unit_mapping') {
      await this.publishMapping(context, version.recordId, versionId);
    } else {
      await context.publish(structureChanged, {
        subject: { module: 'organisation', recordType: recordTypeOf(kind), recordId: version.recordId, versionId },
        payload: { recordType: recordTypeOf(kind), recordId: version.recordId, versionId },
      });
    }
    if (effect.mappingVersionId !== undefined) {
      await this.recordDecision(
        context,
        decider,
        'business_unit_mapping',
        version.recordId,
        effect.mappingVersionId,
        'Approved',
      );
      await this.publishMapping(context, version.recordId, effect.mappingVersionId);
    }
    return { kind: 'success', answer: { recordId: version.recordId } };
  }

  /** The refusal while another approved version of the record starts on the date (2.2). */
  private async approvedOn(
    context: TransactionContext,
    kind: MasterKind,
    recordId: string,
    start: string,
  ): Promise<CommandRefusal | undefined> {
    const tables = masterTables[kind];
    const [same] = await context.tx
      .select({ id: sql<string>`${tables.versionId}` })
      .from(tables.version)
      .where(
        and(
          eq(tables.owner, recordId),
          eq(tables.decision, 'Approved'),
          sql`lower(${tables.validDuring}) = ${start}::date`,
        ),
      )
      .limit(1);
    return same === undefined
      ? undefined
      : {
          kind: 'refused',
          code: 'organisation.version-overlaps',
          missing: [{ kind: 'version', recordType: recordTypeOf(kind), recordId, versionId: same.id }],
        };
  }

  /**
   * The kind's own rules under the locks (structure-and-masters 3.3, 3.5): a unit's first version keeps the Store
   * rules and comes with its mapping, so a unit is never in force without one (3.4); a location is retired only while
   * `stock` answers that none is recorded there.
   */
  private async kindRules(
    context: TransactionContext,
    kind: MasterKind,
    version: VersionHead,
    versionId: string,
  ): Promise<CommandRefusal | undefined> {
    if (kind === 'business_unit') {
      const unit = await unitOf(context, version.recordId);
      if (unit === undefined) return undefined;
      const tables = masterTables.business_unit;
      const [approved] = await context.tx
        .select({ id: sql<string>`${tables.versionId}` })
        .from(tables.version)
        .where(and(eq(tables.owner, version.recordId), eq(tables.decision, 'Approved')))
        .limit(1);
      const mapping = await mappingPreparedWith(context, versionId);
      if (approved !== undefined) {
        // Once a unit has an approved version its mapping changes only through the mapping action, and every later
        // version starts on a day a mapping is in force (product owner, 8 Oct 2026; domain-model invariant 8).
        if (mapping?.decision === 'Awaiting approval') {
          return {
            kind: 'refused',
            code: 'organisation.mapping-through-mapping-change',
            missing: [
              { kind: 'record', recordType: recordTypeOf('business_unit_mapping'), recordId: version.recordId },
            ],
          };
        }
        return (await inForceOn(context, 'business_unit_mapping', version.recordId, version.start))
          ? undefined
          : {
              kind: 'refused',
              code: 'organisation.unit-without-mapping',
              missing: [
                { kind: 'record', recordType: recordTypeOf('business_unit_mapping'), recordId: version.recordId },
              ],
            };
      }
      const rules = await storeUnitRules(context, unit, version.start);
      if (rules !== undefined) return rules;
      if (
        mapping === undefined &&
        !(await inForceOn(context, 'business_unit_mapping', version.recordId, version.start))
      ) {
        return {
          kind: 'refused',
          code: 'organisation.unit-without-mapping',
          missing: [{ kind: 'record', recordType: recordTypeOf('business_unit_mapping'), recordId: version.recordId }],
        };
      }
      if (mapping !== undefined) {
        return this.approvedOn(context, 'business_unit_mapping', version.recordId, version.start);
      }
    }
    if (kind === 'location') {
      const [row] = await context.tx
        .select({ retired: locationVersion.retired })
        .from(locationVersion)
        .where(eq(locationVersion.id, versionId));
      if (row?.retired === true) return retirable(context, this.locationInUse, version.recordId);
    }
    return undefined;
  }

  /** The version, and the mapping prepared with a unit's version, taking effect; then the State rule (3.4). */
  private async takeEffect(
    context: TransactionContext,
    kind: MasterKind,
    version: VersionHead,
    versionId: string,
  ): Promise<Effect> {
    await this.inForce(context, kind, version.recordId, versionId, version.start);
    if (kind === 'location') {
      // The nesting rules on the version's final days (3.5; S1-F02-T02 review).
      const [row] = await context.tx
        .select({
          parentId: locationVersion.parentLocationId,
          retired: locationVersion.retired,
          during: sql<string>`${locationVersion.validDuring}::text`,
        })
        .from(locationVersion)
        .where(eq(locationVersion.id, versionId));
      if (row !== undefined) {
        const broken = await locationNesting(context, {
          locationId: version.recordId,
          parentLocationId: row.parentId ?? undefined,
          retired: row.retired,
          during: row.during,
        });
        if (broken !== undefined) return { kind: 'refused', refusal: broken };
      }
    }
    let mappingVersionId: string | undefined;
    if (kind === 'business_unit') {
      const mapping = await mappingPreparedWith(context, versionId);
      if (mapping?.decision === 'Awaiting approval') {
        mappingVersionId = mapping.id;
        await this.inForce(context, 'business_unit_mapping', version.recordId, mapping.id, version.start);
      }
    }
    const mappingId = kind === 'business_unit_mapping' ? versionId : mappingVersionId;
    if (mappingId !== undefined && (await unitOutOfStep(context, { mappingId })) !== undefined) {
      return {
        kind: 'refused',
        refusal: {
          kind: 'refused',
          code: 'organisation.registration-in-another-state',
          missing: [{ kind: 'record', recordType: recordTypeOf('business_unit'), recordId: version.recordId }],
        },
      };
    }
    if (kind === 'site' || kind === 'tax_registration') {
      const unit = await unitOutOfStep(
        context,
        kind === 'site' ? { siteId: version.recordId } : { taxRegistrationId: version.recordId },
      );
      if (unit !== undefined) {
        return {
          kind: 'refused',
          refusal: {
            kind: 'refused',
            code: 'organisation.mapping-out-of-step',
            missing: [{ kind: 'record', recordType: recordTypeOf('business_unit_mapping'), recordId: unit }],
          },
        };
      }
    }
    return mappingVersionId === undefined ? { kind: 'done' } : { kind: 'done', mappingVersionId };
  }

  /** One version taking effect from its start, ending the approved version in force or Scheduled then (2.2). */
  private async inForce(
    context: TransactionContext,
    kind: MasterKind,
    recordId: string,
    versionId: string,
    start: string,
  ): Promise<void> {
    const tables = masterTables[kind];
    const approved = and(eq(tables.owner, recordId), eq(tables.decision, 'Approved'));
    const [next] = await context.tx
      .select({ start: sql<string>`lower(${tables.validDuring})::text` })
      .from(tables.version)
      .where(and(approved, gt(sql`lower(${tables.validDuring})`, sql`${start}::date`)))
      .orderBy(asc(sql`lower(${tables.validDuring})`))
      .limit(1);
    await context.tx.execute(
      sql`update ${tables.version} set valid_during = daterange(lower(valid_during), ${start}::date)
          where ${tables.owner} = ${recordId}::uuid and decision = 'Approved'
            and valid_during @> ${start}::date`,
    );
    await context.tx.execute(
      sql`update ${tables.version}
          set decision = 'Approved', valid_during = daterange(${start}::date, ${next?.start ?? null}::date)
          where id = ${versionId}::uuid`,
    );
  }

  private async publishMapping(context: TransactionContext, unitId: string, mappingVersionId: string): Promise<void> {
    await context.publish(mappingChanged, {
      subject: {
        module: 'organisation',
        recordType: recordTypeOf('business_unit_mapping'),
        recordId: unitId,
        versionId: mappingVersionId,
      },
      payload: { businessUnitId: unitId, mappingVersionId },
    });
  }

  /**
   * Records a version Rejected; it never takes effect (access-and-approvals 9.5). A unit version's mapping is rejected
   * with it.
   */
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
    if (kind === 'business_unit') {
      const mapping = await mappingPreparedWith(context, versionId);
      if (mapping?.decision === 'Awaiting approval') {
        await context.tx
          .update(businessUnitMapping)
          .set({ decision: 'Rejected' })
          .where(eq(businessUnitMapping.id, mapping.id));
        await this.recordDecision(context, decider, 'business_unit_mapping', version.recordId, mapping.id, 'Rejected');
      }
    }
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
    // The record's place facts, as its preparation's audit record carried them (structure-and-masters 6.1).
    const date = await context.businessDate();
    const facts = date.kind === 'set' ? await placeFactsOfRecord(context, kind, recordId, date.date) : undefined;
    await this.audit.record(context, {
      ...(facts === undefined ? {} : { scope: facts }),
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
 * module-map section 3, rule 6), which the composition root hands to `access` at start, with the location-in-use
 * contract `stock` implements (3.5), or none while none answers.
 */
export function organisationApprovals(audit: AuditInterface, locationInUse?: LocationInUse): ModuleApprovals {
  const effects = new StructureEffects(audit, locationInUse);
  return {
    rules: organisationApprovalRules,
    effects: new Map<string, DocumentEffect>(
      masterKinds.map((kind) => [
        actionTypeOf(kind),
        {
          targets: (c, v) => effects.targets(c, kind, v),
          decidesWith: (c, v) => effects.decidesWith(c, kind, v),
          approve: (c, d, v) => effects.approve(c, d, kind, v),
          reject: (c, d, v) => effects.reject(c, d, kind, v),
        },
      ]),
    ),
  };
}
