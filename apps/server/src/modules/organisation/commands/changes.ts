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
  MissingItem,
  NameVersionDraft,
  SiteDraft,
  SiteVersionDraft,
  StateDraft,
  StoreDraft,
  StoreVersionDraft,
  TaxRegistrationDraft,
  TaxRegistrationVersionDraft,
} from '@apparel-os/schemas';
import { and, eq, sql } from 'drizzle-orm';
import { lockTable, type CommandRefusal, type LockTarget, type TransactionContext } from '../../../kernel/index.js';
import type {
  AccessInterface,
  DocumentEffect,
  EffectDecider,
  EffectOutcome,
  ModuleApprovals,
} from '../../access/index.js';
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
import {
  actionTypeOf,
  masterKinds,
  organisationApprovalRules,
  recordTypeOf,
  type MasterKind,
} from '../domain/kinds.js';
import { structureChanged } from '../events.js';

// Maintain the structure (structure-and-masters 2.2, 2.3, 3.8; module-map 4.11, 6.2 flow A; S1-F02-T01): a draft
// version, saved Awaiting approval with its approval request in the preparing command's transaction; then, in the
// decision's transaction, the version taking effect from its start, or rejected, with its audit record and
// `organisation.structure-changed`. Independent approval is access's rule (GC2-2, DEC-105; PRD-ACS-006).

/** The user preparing a change, and the assignment Authorise used (access-and-approvals 7.1 step 3, 9.1). */
export interface Preparer {
  readonly userId: string;
  readonly roleAssignmentId: string;
}

export type Prepared<Answer> =
  | { readonly kind: 'success'; readonly answer: Answer }
  | { readonly kind: 'refusal'; readonly refusal: CommandRefusal };

/** What preparing answers: the record, its draft version and the approval request. */
export interface PreparedVersion {
  readonly recordId: string;
  readonly versionId: string;
  readonly requestId: string;
}

function refusal<Answer>(kind: CommandRefusal['kind'], code: string, missing: MissingItem[] = []): Prepared<Answer> {
  return { kind: 'refusal', refusal: { kind, code, missing } };
}

const notFound = (kind: MasterKind, id: string): MissingItem => ({
  kind: 'record',
  recordType: recordTypeOf(kind),
  recordId: id,
});

/** Today under the Organisation's timezone, or the refusal while it has none (PRD-MOD-009; code-house-rules 9). */
async function today(context: TransactionContext): Promise<string | CommandRefusal> {
  const date = await context.businessDate();
  if (date.kind === 'set') return date.date;
  return {
    kind: 'unavailable',
    code: 'access.business-date-not-set',
    missing: [{ kind: 'setting', setting: 'configuration.timezone' }],
  };
}

/** A version's dates: from its start, open-ended until the next version starts (code-house-rules 7.3). */
const from = (start: string) => `[${start},)`;

/** Whether a record of a kind exists. */
async function exists(context: TransactionContext, kind: MasterKind, id: string): Promise<boolean> {
  const tables = masterTables[kind];
  const rows = await context.tx
    .select({ id: tables.identityId })
    .from(tables.identity)
    .where(eq(tables.identityId, id));
  return rows.length > 0;
}

/** A record another one refers to. */
interface Reference {
  readonly kind: MasterKind;
  readonly id: string;
}

/** The rows a version freezes with it, written after the version row. */
type Children = (context: TransactionContext, versionId: string) => Promise<void>;

interface Change {
  readonly kind: MasterKind;
  readonly validFrom: string;
  /** The records it names, which must exist when it is prepared and be in force on its start when it is approved. */
  readonly references: readonly Reference[];
  /** The changed fields, for the audit record (numbering-and-audit 4.1). */
  readonly changes: readonly AuditChange[];
  readonly writeVersion: (
    context: TransactionContext,
    common: { id: string; validDuring: string; decision: string; preparedByUserId: string },
    recordId: string,
  ) => Promise<void>;
  readonly children?: Children;
}

interface NewRecord {
  /** Whether the code is already a record's in its scope (structure-and-masters 2.1). */
  readonly codeTaken: (context: TransactionContext) => Promise<boolean>;
  readonly writeIdentity: (context: TransactionContext, id: string) => Promise<void>;
  /** The fixed fields, for the audit record. */
  readonly changes: readonly AuditChange[];
}

const value = (field: string, after: unknown): AuditChange =>
  ({ kind: 'value', field, before: null, after: after ?? null }) as AuditChange;

const optionalDate = (date: string | undefined) => date ?? null;

/** A kind as the audit record's operation names it, such as `legal-entity` (numbering-and-audit 4.1). */
const operationName = (kind: MasterKind) => kind.replaceAll('_', '-');

/**
 * Preparing new masters and new versions (structure-and-masters 2.2, 2.3; module-map 4.11 "Maintain the structure").
 * Refused when the version starts on a past date (GC2-7, DEC-105), when a code is taken in its scope (2.1), or when the
 * record or a record it names does not exist. Whether a record it names is in force is checked when it is approved.
 */
export class StructurePreparation {
  constructor(
    private readonly audit: AuditInterface,
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
      if (await record.fixed.codeTaken(context)) return refusal('refused', 'organisation.code-taken');
      recordId = uuidv7();
      await record.fixed.writeIdentity(context, recordId);
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
    // The preparer is the one person who recorded the version, which is frozen when it is prepared (9.1; GC3-1).
    const requestId = await this.access.requestApproval(context, {
      actionType: actionTypeOf(change.kind),
      document: { module: 'organisation', recordType: recordTypeOf(change.kind), recordId, versionId },
      value: { kind: 'none' },
      preparers: [preparer.userId],
      requestedBy: preparer,
    });
    return { kind: 'success', answer: { recordId, versionId, requestId } };
  }

  /** Whether a code is a record's already, for a master whose code is unique in the Organisation (2.1). */
  private codeTakenIn(kind: MasterKind, code: string) {
    const tables = masterTables[kind];
    return async (context: TransactionContext) =>
      (await context.tx.select({ id: tables.identityId }).from(tables.identity).where(eq(tables.identityCode, code)))
        .length > 0;
  }

  // Geography (3.6; PRD-ORG-007, PRD-ORG-011).

  private nameChange(kind: 'country' | 'state' | 'city' | 'area' | 'accounting_book', draft: NameVersionDraft): Change {
    const versionTables = {
      country: [countryVersion, 'countryId'],
      state: [stateVersion, 'stateId'],
      city: [cityVersion, 'cityId'],
      area: [areaVersion, 'areaId'],
      accounting_book: [accountingBookVersion, 'accountingBookId'],
    } as const;
    const [table, owner] = versionTables[kind];
    return {
      kind,
      validFrom: draft.validFrom,
      references: [],
      changes: [value('name', draft.name)],
      writeVersion: async (context, common, recordId) => {
        await context.tx.insert(table).values({ ...common, [owner]: recordId, name: draft.name } as never);
      },
    };
  }

  prepareCountry(context: TransactionContext, preparer: Preparer, draft: CountryDraft) {
    return this.prepare(context, preparer, this.nameChange('country', draft), {
      kind: 'new',
      fixed: {
        codeTaken: (c) => this.codeTakenIn('country', draft.code)(c),
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
        codeTaken: async (c) =>
          (
            await c.tx
              .select({ id: state.id })
              .from(state)
              .where(and(eq(state.countryId, draft.countryId), eq(state.code, draft.code)))
          ).length > 0,
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
        codeTaken: async (c) =>
          (
            await c.tx
              .select({ id: city.id })
              .from(city)
              .where(and(eq(city.stateId, draft.stateId), eq(city.code, draft.code)))
          ).length > 0,
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
        codeTaken: async (c) =>
          (
            await c.tx
              .select({ id: area.id })
              .from(area)
              .where(and(eq(area.cityId, draft.cityId), eq(area.code, draft.code)))
          ).length > 0,
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
    kind: 'country' | 'state' | 'city' | 'area' | 'accounting_book',
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
        codeTaken: (c) => this.codeTakenIn('legal_entity', draft.code)(c),
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
          codeTaken: (c) => this.codeTakenIn('tax_registration', draft.code)(c),
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
        codeTaken: (c) => this.codeTakenIn('accounting_book', draft.code)(c),
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
  private siteChange(draft: SiteVersionDraft, status: (context: TransactionContext) => Promise<string>): Change {
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
          codeTaken: (c) => this.codeTakenIn('site', draft.code)(c),
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
  private storeChange(draft: StoreVersionDraft, status: (context: TransactionContext) => Promise<string>): Change {
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
          codeTaken: (c) => this.codeTakenIn('store', draft.code)(c),
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
        codeTaken: async (c) =>
          (await c.tx.select({ id: grouping.id }).from(grouping).where(eq(grouping.code, draft.code))).length > 0,
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
async function latestStatus(context: TransactionContext, kind: 'site' | 'store', recordId: string): Promise<string> {
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

/** Whether a record has an approved version in force on a date (structure-and-masters 2.2). */
export async function inForceOn(
  context: TransactionContext,
  kind: MasterKind,
  recordId: string,
  date: string,
): Promise<boolean> {
  const tables = masterTables[kind];
  const rows = await context.tx
    .select({ id: tables.versionId })
    .from(tables.version)
    .where(
      and(eq(tables.owner, recordId), eq(tables.decision, 'Approved'), sql`${tables.validDuring} @> ${date}::date`),
    );
  return rows.length > 0;
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
  ): Promise<{ recordId: string; decision: string; start: string } | undefined> {
    const tables = masterTables[kind];
    const [row] = await context.tx
      .select({
        recordId: sql<string>`${tables.owner}`,
        decision: sql<string>`${tables.decision}`,
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
   * under the master's lock: still Awaiting approval; not starting on a past date, or refused, to be prepared again
   * from today or later (GC2-7, DEC-105); no approved version, a Scheduled one included, starting on or after its
   * start; every record it names in force on its start. The approved version in force or Scheduled at its start ends
   * there. A record it names stays in force once it is: an approved version ends only where the next one starts, and
   * none is withdrawn yet, so no later change opens a gap under it.
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
    const [later] = await context.tx
      .select({ id: tables.versionId })
      .from(tables.version)
      .where(
        and(
          eq(tables.owner, version.recordId),
          eq(tables.decision, 'Approved'),
          sql`lower(${tables.validDuring}) >= ${version.start}::date`,
        ),
      )
      .limit(1);
    if (later !== undefined) {
      return refusal('refused', 'organisation.version-overlaps', [
        { kind: 'version', recordType: recordTypeOf(kind), recordId: version.recordId, versionId: String(later.id) },
      ]);
    }
    for (const reference of await referencesOf(context, kind, version.recordId, versionId)) {
      if (!(await inForceOn(context, reference.kind, reference.id, version.start))) {
        return refusal('refused', 'organisation.reference-not-in-force', [
          { kind: 'approval', recordType: recordTypeOf(reference.kind), recordId: reference.id },
        ]);
      }
    }
    await context.tx.execute(
      sql`update ${tables.version} set valid_during = daterange(lower(valid_during), ${version.start}::date)
          where ${tables.owner} = ${version.recordId}::uuid and decision = 'Approved'
            and valid_during @> ${version.start}::date`,
    );
    await context.tx.execute(sql`update ${tables.version} set decision = 'Approved' where id = ${versionId}::uuid`);
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
