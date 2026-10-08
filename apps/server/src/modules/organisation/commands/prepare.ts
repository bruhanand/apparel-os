import { uuidv7 } from '@apparel-os/domain';
import type {
  AccountingBookDraft,
  AreaDraft,
  CityDraft,
  CountryDraft,
  GroupingDraft,
  GroupingVersionDraft,
  LegalEntityDraft,
  LegalEntityVersionDraft,
  NameVersionDraft,
  PlaceStatus,
  SiteDraft,
  SiteVersionDraft,
  StateDraft,
  StoreDraft,
  StoreVersionDraft,
  TaxRegistrationDraft,
  TaxRegistrationVersionDraft,
} from '@apparel-os/schemas';
import { and, eq, sql, type AnyColumn } from 'drizzle-orm';
import { sqlStateOf, type TransactionContext } from '../../../kernel/index.js';
import type { AccessInterface } from '../../access/index.js';
import type { AuditChange, AuditInterface } from '../../audit/index.js';
import {
  accountingBook,
  accountingBookVersion,
  area,
  areaVersion,
  city,
  cityVersion,
  country,
  countryVersion,
  grouping,
  groupingMember,
  groupingVersion,
  legalEntity,
  legalEntityVersion,
  site,
  siteAlias,
  siteVersion,
  state,
  stateVersion,
  store,
  storeAlias,
  storeVersion,
  taxRegistration,
  taxRegistrationVersion,
} from '../db/schema.js';
import { masterTables } from '../db/tables.js';
import { actionTypeOf, recordTypeOf, type MasterKind } from '../domain/kinds.js';
import { exists, notFound, refusal, today, type Prepared, type Preparer, type Reference } from './common.js';

// Maintain the structure (structure-and-masters 2.2, 2.3, 3.8; module-map 4.11, 6.2 flow A; S1-F02-T01): a draft
// version, saved Awaiting approval with its approval request in the preparing command's transaction. A different
// authorised person decides it (GC2-2, DEC-105; PRD-ACS-006), and the decision's effect is in effects.ts.

/** What preparing answers: the record, its draft version and the approval request. */
export interface PreparedVersion {
  readonly recordId: string;
  readonly versionId: string;
  readonly requestId: string;
}

/** The columns every version row is written with. */
interface CommonColumns {
  readonly id: string;
  readonly validDuring: string;
  readonly decision: 'Awaiting approval';
  readonly preparedByUserId: string;
}

interface Change {
  readonly kind: MasterKind;
  readonly validFrom: string;
  /** The records it names, which must exist when it is prepared and be in force on its start when it is approved. */
  readonly references: readonly Reference[];
  /** The changed fields, for the audit record (numbering-and-audit 4.1). */
  readonly changes: readonly AuditChange[];
  readonly writeVersion: (context: TransactionContext, common: CommonColumns, recordId: string) => Promise<void>;
  /** The rows the version freezes with it, written after the version row. */
  readonly children?: (context: TransactionContext, versionId: string) => Promise<void>;
}

interface NewRecord {
  readonly code: string;
  /** The code's scope (structure-and-masters 2.1): the parent it is unique under, or the Organisation. */
  readonly under?: { readonly column: AnyColumn; readonly id: string };
  readonly writeIdentity: (context: TransactionContext, id: string) => Promise<void>;
  /** The fixed fields, for the audit record. */
  readonly changes: readonly AuditChange[];
}

type ValueChange = Extract<AuditChange, { kind: 'value' }>;

const value = (field: string, after: ValueChange['after']): ValueChange => ({
  kind: 'value',
  field,
  before: null,
  after,
});

const optionalDate = (date: string | undefined) => date ?? null;

/** A kind as the audit record's operation names it, such as `legal-entity` (numbering-and-audit 4.1). */
export const operationName = (kind: MasterKind) => kind.replaceAll('_', '-');

/** A version's dates: from its start, open-ended until the next version starts (code-house-rules 7.3). */
const from = (start: string) => `[${start},)`;

const UNIQUE_VIOLATION = '23505';

/** The kinds whose versions hold only a name. */
export type NamedKind = 'country' | 'state' | 'city' | 'area' | 'accounting_book';

/**
 * Preparing new masters and new versions (structure-and-masters 2.2, 2.3; module-map 4.11 "Maintain the structure").
 * Refused when the version starts on a past date (GC2-7, DEC-105), when a code is taken in its scope (2.1), or when the
 * record or a record it names does not exist. Whether a record it names is in force is checked when it is approved.
 */
export class StructurePreparation {
  constructor(
    protected readonly audit: AuditInterface,
    private readonly access: Pick<AccessInterface, 'requestApproval'>,
  ) {}

  private async prepare(
    context: TransactionContext,
    preparer: Preparer,
    change: Change,
    record: { readonly kind: 'new'; readonly fixed: NewRecord } | { readonly kind: 'existing'; readonly id: string },
  ): Promise<Prepared<PreparedVersion>> {
    const date = await today(context);
    if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
    if (change.validFrom < date) return refusal('refused', 'organisation.starts-in-past');
    if (record.kind === 'existing' && !(await exists(context, change.kind, record.id))) {
      return refusal('not-found', 'organisation.record-not-found', [notFound(change.kind, record.id)]);
    }
    for (const reference of change.references) {
      if (!(await exists(context, reference.kind, reference.id))) {
        return refusal('not-found', 'organisation.record-not-found', [notFound(reference.kind, reference.id)]);
      }
    }
    let recordId: string;
    if (record.kind === 'new') {
      recordId = uuidv7();
      if (!(await this.writeNew(context, change.kind, record.fixed, recordId))) {
        return refusal('refused', 'organisation.code-taken');
      }
    } else {
      recordId = record.id;
    }
    const versionId = uuidv7();
    await change.writeVersion(
      context,
      {
        id: versionId,
        validDuring: from(change.validFrom),
        decision: 'Awaiting approval',
        preparedByUserId: preparer.userId,
      },
      recordId,
    );
    await change.children?.(context, versionId);
    await this.audit.record(context, {
      actor: { kind: 'user', id: preparer.userId },
      roleAssignmentId: preparer.roleAssignmentId,
      record: { module: 'organisation', type: change.kind, id: recordId, versionId },
      operation:
        record.kind === 'new'
          ? `prepare-${operationName(change.kind)}`
          : `prepare-${operationName(change.kind)}-version`,
      changes: [
        ...(record.kind === 'new' ? record.fixed.changes : []),
        ...change.changes,
        value('validFrom', change.validFrom),
      ],
      source: { kind: 'screen' },
    });
    // The preparer is the one person who recorded the version, which is frozen when it is prepared (9.1; GC3-1). A
    // request still open on an earlier version of the record is Superseded (access-and-approvals 9.6).
    const requestId = await this.access.requestApproval(context, {
      actionType: actionTypeOf(change.kind),
      document: { module: 'organisation', recordType: recordTypeOf(change.kind), recordId, versionId },
      value: { kind: 'none' },
      preparers: [preparer.userId],
      requestedBy: preparer,
    });
    return { kind: 'success', answer: { recordId, versionId, requestId } };
  }

  /**
   * Writes a new record's identity row, unless its code is already a record's in its scope (structure-and-masters
   * 2.1). Two preparations of one code at once: the second meets the unique constraint under a savepoint and is
   * refused as taken, never failed.
   */
  private async writeNew(
    context: TransactionContext,
    kind: MasterKind,
    fixed: NewRecord,
    recordId: string,
  ): Promise<boolean> {
    const tables = masterTables[kind];
    const taken = await context.tx
      .select({ id: tables.identityId })
      .from(tables.identity)
      .where(
        and(
          eq(tables.identityCode, fixed.code),
          fixed.under === undefined ? undefined : eq(fixed.under.column, fixed.under.id),
        ),
      );
    if (taken.length > 0) return false;
    await context.tx.execute(sql`savepoint organisation_new_record`);
    try {
      await fixed.writeIdentity(context, recordId);
      await context.tx.execute(sql`release savepoint organisation_new_record`);
      return true;
    } catch (error) {
      if (sqlStateOf(error) !== UNIQUE_VIOLATION) throw error;
      await context.tx.execute(sql`rollback to savepoint organisation_new_record`);
      return false;
    }
  }

  // Geography (3.6; PRD-ORG-007, PRD-ORG-011) and books' names (3.2).

  private nameChange(kind: NamedKind, draft: NameVersionDraft): Change {
    const name = draft.name;
    return {
      kind,
      validFrom: draft.validFrom,
      references: [],
      changes: [value('name', name)],
      writeVersion: async (context, common, recordId) => {
        switch (kind) {
          case 'country':
            await context.tx.insert(countryVersion).values({ ...common, countryId: recordId, name });
            return;
          case 'state':
            await context.tx.insert(stateVersion).values({ ...common, stateId: recordId, name });
            return;
          case 'city':
            await context.tx.insert(cityVersion).values({ ...common, cityId: recordId, name });
            return;
          case 'area':
            await context.tx.insert(areaVersion).values({ ...common, areaId: recordId, name });
            return;
          case 'accounting_book':
            await context.tx.insert(accountingBookVersion).values({ ...common, accountingBookId: recordId, name });
            return;
        }
      },
    };
  }

  prepareCountry(context: TransactionContext, preparer: Preparer, draft: CountryDraft) {
    return this.prepare(context, preparer, this.nameChange('country', draft), {
      kind: 'new',
      fixed: {
        code: draft.code,
        writeIdentity: async (c, id) => {
          await c.tx.insert(country).values({ id, code: draft.code });
        },
        changes: [value('code', draft.code)],
      },
    });
  }

  prepareState(context: TransactionContext, preparer: Preparer, draft: StateDraft) {
    const change = {
      ...this.nameChange('state', draft),
      references: [{ kind: 'country' as const, id: draft.countryId }],
    };
    return this.prepare(context, preparer, change, {
      kind: 'new',
      fixed: {
        code: draft.code,
        under: { column: state.countryId, id: draft.countryId },
        writeIdentity: async (c, id) => {
          await c.tx.insert(state).values({ id, code: draft.code, countryId: draft.countryId });
        },
        changes: [value('code', draft.code), value('countryId', draft.countryId)],
      },
    });
  }

  prepareCity(context: TransactionContext, preparer: Preparer, draft: CityDraft) {
    const change = { ...this.nameChange('city', draft), references: [{ kind: 'state' as const, id: draft.stateId }] };
    return this.prepare(context, preparer, change, {
      kind: 'new',
      fixed: {
        code: draft.code,
        under: { column: city.stateId, id: draft.stateId },
        writeIdentity: async (c, id) => {
          await c.tx.insert(city).values({ id, code: draft.code, stateId: draft.stateId });
        },
        changes: [value('code', draft.code), value('stateId', draft.stateId)],
      },
    });
  }

  prepareArea(context: TransactionContext, preparer: Preparer, draft: AreaDraft) {
    const change = { ...this.nameChange('area', draft), references: [{ kind: 'city' as const, id: draft.cityId }] };
    return this.prepare(context, preparer, change, {
      kind: 'new',
      fixed: {
        code: draft.code,
        under: { column: area.cityId, id: draft.cityId },
        writeIdentity: async (c, id) => {
          await c.tx.insert(area).values({ id, code: draft.code, cityId: draft.cityId });
        },
        changes: [value('code', draft.code), value('cityId', draft.cityId)],
      },
    });
  }

  /** A new version of a geography level's or a book's name. */
  prepareNameVersion(
    context: TransactionContext,
    preparer: Preparer,
    kind: NamedKind,
    recordId: string,
    draft: NameVersionDraft,
  ) {
    return this.prepare(context, preparer, this.nameChange(kind, draft), { kind: 'existing', id: recordId });
  }

  // Legal entities, registrations and books (3.2; PRD-ORG-001, PRD-ORG-020).

  private legalEntityChange(draft: LegalEntityVersionDraft): Change {
    return {
      kind: 'legal_entity',
      validFrom: draft.validFrom,
      references: [],
      changes: [value('legalName', draft.legalName)],
      writeVersion: async (context, common, recordId) => {
        await context.tx
          .insert(legalEntityVersion)
          .values({ ...common, legalEntityId: recordId, legalName: draft.legalName });
      },
    };
  }

  prepareLegalEntity(context: TransactionContext, preparer: Preparer, draft: LegalEntityDraft) {
    return this.prepare(context, preparer, this.legalEntityChange(draft), {
      kind: 'new',
      fixed: {
        code: draft.code,
        writeIdentity: async (c, id) => {
          await c.tx.insert(legalEntity).values({ id, code: draft.code });
        },
        changes: [value('code', draft.code)],
      },
    });
  }

  prepareLegalEntityVersion(
    context: TransactionContext,
    preparer: Preparer,
    recordId: string,
    draft: LegalEntityVersionDraft,
  ) {
    return this.prepare(context, preparer, this.legalEntityChange(draft), { kind: 'existing', id: recordId });
  }

  private taxRegistrationChange(draft: TaxRegistrationVersionDraft): Change {
    return {
      kind: 'tax_registration',
      validFrom: draft.validFrom,
      references: [{ kind: 'state', id: draft.stateId }],
      changes: [
        value('registrationNumber', draft.registrationNumber),
        value('stateId', draft.stateId),
        value('validityFrom', draft.validityFrom),
        value('validityTo', optionalDate(draft.validityTo)),
      ],
      writeVersion: async (context, common, recordId) => {
        await context.tx.insert(taxRegistrationVersion).values({
          ...common,
          taxRegistrationId: recordId,
          registrationNumber: draft.registrationNumber,
          stateId: draft.stateId,
          validity: `[${draft.validityFrom},${draft.validityTo ?? ''})`,
        });
      },
    };
  }

  /** A registration is fixed to its legal entity at creation (PRD-ORG-020): another legal entity is a new record. */
  prepareTaxRegistration(context: TransactionContext, preparer: Preparer, draft: TaxRegistrationDraft) {
    const change = this.taxRegistrationChange(draft);
    return this.prepare(
      context,
      preparer,
      { ...change, references: [...change.references, { kind: 'legal_entity', id: draft.legalEntityId }] },
      {
        kind: 'new',
        fixed: {
          code: draft.code,
          writeIdentity: async (c, id) => {
            await c.tx.insert(taxRegistration).values({ id, code: draft.code, legalEntityId: draft.legalEntityId });
          },
          changes: [value('code', draft.code), value('legalEntityId', draft.legalEntityId)],
        },
      },
    );
  }

  prepareTaxRegistrationVersion(
    context: TransactionContext,
    preparer: Preparer,
    recordId: string,
    draft: TaxRegistrationVersionDraft,
  ) {
    return this.prepare(context, preparer, this.taxRegistrationChange(draft), { kind: 'existing', id: recordId });
  }

  /** A book is fixed to its legal entity at creation (PRD-ORG-020): another legal entity is a new record. */
  prepareAccountingBook(context: TransactionContext, preparer: Preparer, draft: AccountingBookDraft) {
    const change = {
      ...this.nameChange('accounting_book', draft),
      references: [{ kind: 'legal_entity' as const, id: draft.legalEntityId }],
    };
    return this.prepare(context, preparer, change, {
      kind: 'new',
      fixed: {
        code: draft.code,
        writeIdentity: async (c, id) => {
          await c.tx.insert(accountingBook).values({ id, code: draft.code, legalEntityId: draft.legalEntityId });
        },
        changes: [value('code', draft.code), value('legalEntityId', draft.legalEntityId)],
      },
    });
  }

  // Sites and Stores (3.1, 3.3, 3.7; PRD-ORG-003, PRD-ORG-008 to PRD-ORG-010, PRD-ORG-021).

  /**
   * A Site version. Its status is not prepared: a new Site starts Setting up, and a later version keeps the status of
   * the one before it, since the lifecycle events that change it belong to `site-lifecycle` (3.7; module-map 4.16).
   */
  private siteChange(draft: SiteVersionDraft, status: (context: TransactionContext) => Promise<PlaceStatus>): Change {
    return {
      kind: 'site',
      validFrom: draft.validFrom,
      references: [{ kind: 'area', id: draft.areaId }],
      changes: [
        value('name', draft.name),
        value('physicalKind', draft.physicalKind),
        value('areaId', draft.areaId),
        value('addresses', draft.addresses),
        value('aliases', draft.aliases),
        value('openingDate', optionalDate(draft.openingDate)),
        value('closingDate', optionalDate(draft.closingDate)),
      ],
      writeVersion: async (context, common, recordId) => {
        await context.tx.insert(siteVersion).values({
          ...common,
          siteId: recordId,
          name: draft.name,
          physicalKind: draft.physicalKind,
          areaId: draft.areaId,
          addresses: [...draft.addresses],
          openingDate: draft.openingDate ?? null,
          closingDate: draft.closingDate ?? null,
          status: await status(context),
        });
      },
      children: async (context, versionId) => {
        if (draft.aliases.length === 0) return;
        await context.tx
          .insert(siteAlias)
          .values(draft.aliases.map((alias) => ({ id: uuidv7(), siteVersionId: versionId, alias })));
      },
    };
  }

  prepareSite(context: TransactionContext, preparer: Preparer, draft: SiteDraft) {
    return this.prepare(
      context,
      preparer,
      this.siteChange(draft, () => Promise.resolve('Setting up')),
      {
        kind: 'new',
        fixed: {
          code: draft.code,
          writeIdentity: async (c, id) => {
            await c.tx.insert(site).values({ id, code: draft.code });
          },
          changes: [value('code', draft.code), value('status', 'Setting up')],
        },
      },
    );
  }

  prepareSiteVersion(context: TransactionContext, preparer: Preparer, recordId: string, draft: SiteVersionDraft) {
    return this.prepare(
      context,
      preparer,
      this.siteChange(draft, (c) => latestStatus(c, 'site', recordId)),
      { kind: 'existing', id: recordId },
    );
  }

  /** A Store version, with its Site link (3.3); its status as for a Site. */
  private storeChange(draft: StoreVersionDraft, status: (context: TransactionContext) => Promise<PlaceStatus>): Change {
    return {
      kind: 'store',
      validFrom: draft.validFrom,
      references: [{ kind: 'site', id: draft.siteId }],
      changes: [
        value('name', draft.name),
        value('format', draft.format),
        value('operatingModel', draft.operatingModel),
        value('siteId', draft.siteId),
        value('aliases', draft.aliases),
        value('openingDate', optionalDate(draft.openingDate)),
        value('closingDate', optionalDate(draft.closingDate)),
      ],
      writeVersion: async (context, common, recordId) => {
        await context.tx.insert(storeVersion).values({
          ...common,
          storeId: recordId,
          name: draft.name,
          format: draft.format,
          operatingModel: draft.operatingModel,
          siteId: draft.siteId,
          openingDate: draft.openingDate ?? null,
          closingDate: draft.closingDate ?? null,
          status: await status(context),
        });
      },
      children: async (context, versionId) => {
        if (draft.aliases.length === 0) return;
        await context.tx
          .insert(storeAlias)
          .values(draft.aliases.map((alias) => ({ id: uuidv7(), storeVersionId: versionId, alias })));
      },
    };
  }

  prepareStore(context: TransactionContext, preparer: Preparer, draft: StoreDraft) {
    return this.prepare(
      context,
      preparer,
      this.storeChange(draft, () => Promise.resolve('Setting up')),
      {
        kind: 'new',
        fixed: {
          code: draft.code,
          writeIdentity: async (c, id) => {
            await c.tx.insert(store).values({ id, code: draft.code });
          },
          changes: [value('code', draft.code), value('status', 'Setting up')],
        },
      },
    );
  }

  prepareStoreVersion(context: TransactionContext, preparer: Preparer, recordId: string, draft: StoreVersionDraft) {
    return this.prepare(
      context,
      preparer,
      this.storeChange(draft, (c) => latestStatus(c, 'store', recordId)),
      { kind: 'existing', id: recordId },
    );
  }

  // Groupings (3.6; PRD-ORG-007).

  private groupingChange(draft: GroupingVersionDraft): Change {
    return {
      kind: 'grouping',
      validFrom: draft.validFrom,
      references: draft.storeIds.map((id) => ({ kind: 'store' as const, id })),
      changes: [value('name', draft.name), value('storeIds', draft.storeIds)],
      writeVersion: async (context, common, recordId) => {
        await context.tx.insert(groupingVersion).values({ ...common, groupingId: recordId, name: draft.name });
      },
      children: async (context, versionId) => {
        if (draft.storeIds.length === 0) return;
        await context.tx
          .insert(groupingMember)
          .values(draft.storeIds.map((storeId) => ({ id: uuidv7(), groupingVersionId: versionId, storeId })));
      },
    };
  }

  prepareGrouping(context: TransactionContext, preparer: Preparer, draft: GroupingDraft) {
    return this.prepare(context, preparer, this.groupingChange(draft), {
      kind: 'new',
      fixed: {
        code: draft.code,
        writeIdentity: async (c, id) => {
          await c.tx.insert(grouping).values({ id, code: draft.code, kind: draft.kind });
        },
        changes: [value('code', draft.code), value('kind', draft.kind)],
      },
    });
  }

  prepareGroupingVersion(
    context: TransactionContext,
    preparer: Preparer,
    recordId: string,
    draft: GroupingVersionDraft,
  ) {
    return this.prepare(context, preparer, this.groupingChange(draft), { kind: 'existing', id: recordId });
  }
}

/**
 * The status of a Site's or Store's latest approved version, or Setting up while it has none (3.7): a new version
 * keeps it, since only lifecycle events change it.
 */
async function latestStatus(
  context: TransactionContext,
  kind: 'site' | 'store',
  recordId: string,
): Promise<PlaceStatus> {
  const table = kind === 'site' ? siteVersion : storeVersion;
  const owner = kind === 'site' ? siteVersion.siteId : storeVersion.storeId;
  const [latest] = await context.tx
    .select({ status: table.status })
    .from(table)
    .where(and(eq(owner, recordId), eq(table.decision, 'Approved')))
    .orderBy(sql`lower(${table.validDuring}) desc`)
    .limit(1);
  return latest?.status ?? 'Setting up';
}
