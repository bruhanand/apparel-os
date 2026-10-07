import {
  fieldClassSchema,
  HISTORY_PAGE_CAP,
  type AccessHistoryEntry,
  type AccessHistoryPage,
  type AuditHistoryEntry,
  type AuditHistoryPage,
  type FieldClass,
  type HistoryActor,
  type HistoryChange,
  type MissingItem,
} from '@apparel-os/schemas';
import { desc, inArray, sql } from 'drizzle-orm';
import type { CommandRefusal, TransactionContext } from '../../../kernel/index.js';
import type {
  AccessRecordGroup,
  AuditActor,
  AuditChange,
  AuditHistoryEntry as AuditRow,
  AuditInterface,
  AuditScope,
  HistoryPosition,
  HistoryQuery,
} from '../../audit/index.js';
import { appUserVersion, serviceIdentity } from '../db/schema.js';
import type { RecordFacts } from '../domain/scope.js';
import type { Authorisation, AuthoriseRequest } from './authorise.js';

// History (numbering-and-audit 4.5, 5; access-and-approvals 6, 7.2, 9.11; module-map 4.3 "Stage 1 report: access
// history", 4.5 "Read history"). `access` serves the history reads: `audit` reads the rows under the reader's own
// row-level security, and `access`, which `audit` may not call (module-map 2.1), shows each row through one
// assignment that grants view on it and masks every restricted value that assignment's field classes do not grant,
// so no masked value leaves the server (PRD-ACS-008, PRD-SEC-005; design-language 10.6).

/** What the history reads need of `access` itself. */
export interface HistoryAuthority {
  authorise(context: TransactionContext, request: AuthoriseRequest): Promise<Authorisation>;
  restrictFields(
    context: TransactionContext,
    request: {
      readonly roleAssignmentId: string;
      readonly actorId: string;
      readonly fieldClasses: readonly FieldClass[];
    },
    use: 'view' | 'edit',
  ): Promise<{ readonly granted: FieldClass[]; readonly masked: FieldClass[] }>;
}

export type HistoryAnswer<Page> =
  | { readonly kind: 'page'; readonly page: Page }
  | { readonly kind: 'refused'; readonly refusal: CommandRefusal<'not-authorised' | 'unavailable'> };

/** The record type each access record group is read under (numbering-and-audit 4.5; migration 0011). */
const GROUP_TYPE: Readonly<Record<AccessRecordGroup, string>> = {
  access: 'audit.access_record',
  'sensitive-access': 'audit.sensitive_access_record',
  device: 'audit.device_access_record',
};

/** A cursor's text: the position's UTC recording time to the microsecond, `_`, and the row's identifier. */
export function cursorOf(position: HistoryPosition): string {
  return `${position.recordedAt}_${position.id}`;
}

export function positionOf(cursor: string): HistoryPosition {
  const at = cursor.lastIndexOf('_');
  return { recordedAt: cursor.slice(0, at), id: cursor.slice(at + 1) };
}

function factsOf(scope: AuditScope): RecordFacts {
  return { ...scope };
}

export class History {
  constructor(
    private readonly audit: AuditInterface,
    private readonly authority: HistoryAuthority,
  ) {}

  /**
   * The history of one record, oldest first. The reader must hold view on the record's own type: one who holds none
   * is refused, naming it (PRD-UXP-003); a reader whose assignments cover only some of its rows sees those (5.3).
   */
  async recordHistory(
    context: TransactionContext,
    readerId: string,
    query: { readonly recordType: string; readonly recordId: string; readonly after?: string | undefined },
  ): Promise<HistoryAnswer<AuditHistoryPage>> {
    const missing = await this.permissionMissing(context, readerId, query.recordType);
    if (missing !== undefined) return missing;
    const dot = query.recordType.indexOf('.');
    return {
      kind: 'page',
      page: await this.auditPage(context, readerId, {
        of: 'record',
        module: query.recordType.slice(0, dot),
        type: query.recordType.slice(dot + 1),
        id: query.recordId,
        ...(query.after === undefined ? {} : { after: positionOf(query.after) }),
      }),
    };
  }

  /** The changes one actor made, oldest first, on the records the reader may view (numbering-and-audit 4.5). */
  async actorHistory(
    context: TransactionContext,
    readerId: string,
    query: { readonly actorId: string; readonly after?: string | undefined },
  ): Promise<HistoryAnswer<AuditHistoryPage>> {
    return {
      kind: 'page',
      page: await this.auditPage(context, readerId, {
        of: 'actor',
        actorId: query.actorId,
        ...(query.after === undefined ? {} : { after: positionOf(query.after) }),
      }),
    };
  }

  /**
   * The access history report of one group, newest first (module-map 4.3; numbering-and-audit 5). The group's record
   * type carries scope facts, so each row is authorised with its own facts here, not by the route's guard
   * (access-and-approvals 5.3, 7.1 step 3; RR-296). A reader no assignment grants view on the type is refused.
   */
  async accessHistory(
    context: TransactionContext,
    readerId: string,
    group: AccessRecordGroup,
    query: { readonly userId?: string | undefined; readonly before?: string | undefined },
  ): Promise<HistoryAnswer<AccessHistoryPage>> {
    const recordType = GROUP_TYPE[group];
    const missing = await this.permissionMissing(context, readerId, recordType);
    if (missing !== undefined) return missing;
    const rows = await this.audit.readAccessHistory(context, {
      group,
      ...(query.userId === undefined ? {} : { userId: query.userId }),
      ...(query.before === undefined ? {} : { before: positionOf(query.before) }),
      limit: HISTORY_PAGE_CAP + 1,
    });
    const page = rows.slice(0, HISTORY_PAGE_CAP);
    const shown: typeof page = [];
    const viewing = this.viewing(context, readerId);
    for (const row of page) {
      if ((await viewing(recordType, factsOf(row.scope), [])).kind === 'shown') shown.push(row);
    }
    const names = await namesOf(
      context,
      shown.flatMap((row) => (row.userId === null ? [] : [{ kind: 'user' as const, id: row.userId }])),
    );
    const entries: AccessHistoryEntry[] = shown.map((row) => ({
      id: row.id,
      recordedAt: row.recordedAt.toISOString(),
      occurredAt: row.occurredAt.toISOString(),
      kind: row.kind,
      outcome: row.outcome,
      user: row.userId === null ? null : names({ kind: 'user', id: row.userId }),
      deviceId: row.deviceId,
      networkAddress: row.networkAddress,
      identityVerification: row.identityVerification,
      auditRecordId: row.auditRecordId,
      change:
        row.change === null
          ? null
          : { recordType: `${row.change.module}.${row.change.type}`, operation: row.change.operation },
      record:
        row.record === null ? null : { recordType: `${row.record.module}.${row.record.type}`, recordId: row.record.id },
      fieldClass: row.fieldClass,
      exposure: row.exposure,
      correlationId: row.correlationId,
    }));
    return { kind: 'page', page: { asOf: context.startedAt.toISOString(), entries, next: nextOf(rows, page) } };
  }

  private async auditPage(
    context: TransactionContext,
    readerId: string,
    query: HistoryQuery,
  ): Promise<AuditHistoryPage> {
    const rows = await this.audit.readHistory(context, { ...query, limit: HISTORY_PAGE_CAP + 1 });
    const page = rows.slice(0, HISTORY_PAGE_CAP);
    const viewing = this.viewing(context, readerId);
    const shown: { row: AuditRow; granted: ReadonlySet<string> }[] = [];
    for (const row of page) {
      const classes = row.changes.flatMap((each) => (each.kind === 'restricted' ? [each.fieldClass] : []));
      const seen = await viewing(`${row.record.module}.${row.record.type}`, factsOf(row.scope), classes);
      if (seen.kind === 'shown') shown.push({ row, granted: seen.granted });
    }
    const names = await namesOf(
      context,
      shown.flatMap(({ row }) => [
        row.actor,
        ...(row.actor.kind === 'service-identity' && row.actor.onBehalfOfUserId !== undefined
          ? [{ kind: 'user' as const, id: row.actor.onBehalfOfUserId }]
          : []),
      ]),
    );
    const entries: AuditHistoryEntry[] = shown.map(({ row, granted }) => ({
      id: row.id,
      recordedAt: row.recordedAt.toISOString(),
      occurredAt: row.occurredAt.toISOString(),
      businessDate: row.businessDate,
      actor: names(row.actor),
      onBehalfOf:
        row.actor.kind === 'service-identity' && row.actor.onBehalfOfUserId !== undefined
          ? names({ kind: 'user', id: row.actor.onBehalfOfUserId })
          : null,
      recordType: `${row.record.module}.${row.record.type}`,
      recordId: row.record.id,
      versionId: row.record.versionId ?? null,
      operation: row.operation,
      changes: row.changes.map((each) => masked(each, granted)),
      reason: row.reason,
      source: {
        kind: row.source.kind,
        reference: row.source.reference ?? null,
        row: row.source.kind === 'import' ? (row.source.row ?? null) : null,
      },
      approvalDecisionId: row.approval?.decisionId ?? null,
      correlationId: row.correlationId,
    }));
    return { asOf: context.startedAt.toISOString(), entries, next: nextOf(rows, page) };
  }

  /** A refusal naming the view permission on a record type when no assignment of the reader grants it at all. */
  private async permissionMissing(
    context: TransactionContext,
    readerId: string,
    recordType: string,
  ): Promise<{ kind: 'refused'; refusal: CommandRefusal<'not-authorised' | 'unavailable'> } | undefined> {
    const authorised = await this.authority.authorise(context, { actorId: readerId, action: 'view', recordType });
    if (authorised.kind === 'allowed') return undefined;
    const permission = authorised.refusal.missing.some((item: MissingItem) => item.kind === 'permission');
    // A scope or field-class gap is decided row by row; only a missing permission, or no business date, refuses all.
    if (permission || authorised.refusal.kind === 'unavailable')
      return { kind: 'refused', refusal: authorised.refusal };
    return undefined;
  }

  /**
   * Whether a row is shown, and which of its field classes: the row is shown through one assignment that grants view
   * on its record type and covers its facts (access-and-approvals 7.2); a restricted value is shown only when that
   * same assignment grants its field class (6; PRD-ACS-004). Answers are kept for the read, by type, facts and classes.
   */
  private viewing(context: TransactionContext, readerId: string) {
    const known = new Map<string, Promise<{ kind: 'hidden' } | { kind: 'shown'; granted: ReadonlySet<string> }>>();
    return (recordType: string, facts: RecordFacts, classes: readonly string[]) => {
      const fieldClasses = [...new Set(classes)]
        .flatMap((each) => {
          const parsed = fieldClassSchema.safeParse(each);
          return parsed.success ? [parsed.data] : [];
        })
        .sort();
      const key = JSON.stringify([recordType, facts, fieldClasses]);
      let answer = known.get(key);
      if (answer === undefined) {
        answer = this.decide(context, readerId, recordType, facts, fieldClasses);
        known.set(key, answer);
      }
      return answer;
    };
  }

  private async decide(
    context: TransactionContext,
    readerId: string,
    recordType: string,
    facts: RecordFacts,
    fieldClasses: readonly FieldClass[],
  ): Promise<{ kind: 'hidden' } | { kind: 'shown'; granted: ReadonlySet<string> }> {
    const request = { actorId: readerId, action: 'view' as const, recordType, facts };
    if (fieldClasses.length > 0) {
      const all = await this.authority.authorise(context, {
        ...request,
        fieldClasses: fieldClasses.map((fieldClass) => ({ fieldClass, use: 'view' as const })),
      });
      if (all.kind === 'allowed') return { kind: 'shown', granted: new Set(fieldClasses) };
    }
    const viewed = await this.authority.authorise(context, request);
    if (viewed.kind === 'refused') return { kind: 'hidden' };
    if (fieldClasses.length === 0) return { kind: 'shown', granted: new Set() };
    const restricted = await this.authority.restrictFields(
      context,
      { roleAssignmentId: viewed.roleAssignmentId, actorId: readerId, fieldClasses },
      'view',
    );
    return { kind: 'shown', granted: new Set(restricted.granted) };
  }
}

/** A change as the reader may see it: a restricted value whose field class is not granted is masked (4.3). */
function masked(change: AuditChange, granted: ReadonlySet<string>): HistoryChange {
  if (change.kind === 'restricted' && !granted.has(change.fieldClass)) {
    return { kind: 'masked', field: change.field, fieldClass: change.fieldClass };
  }
  return change;
}

/** The cursor of the next page: the last row's position, when a row was read beyond the page. */
function nextOf(rows: readonly { position: HistoryPosition }[], page: readonly { position: HistoryPosition }[]) {
  const last = page.at(-1);
  return rows.length > page.length && last !== undefined ? cursorOf(last.position) : null;
}

/**
 * The names of the actors the rows name: a user's display name from their latest Approved version, else their latest
 * version; a service identity's code. Null when none is found.
 */
async function namesOf(
  context: TransactionContext,
  actors: readonly AuditActor[],
): Promise<(actor: { readonly kind: AuditActor['kind']; readonly id: string }) => HistoryActor> {
  const userIds = [...new Set(actors.filter((each) => each.kind === 'user').map((each) => each.id))];
  const identityIds = [...new Set(actors.filter((each) => each.kind === 'service-identity').map((each) => each.id))];
  const users = new Map<string, string>();
  if (userIds.length > 0) {
    const rows = await context.tx
      .selectDistinctOn([appUserVersion.appUserId], {
        userId: appUserVersion.appUserId,
        displayName: appUserVersion.displayName,
      })
      .from(appUserVersion)
      .where(inArray(appUserVersion.appUserId, userIds))
      .orderBy(
        appUserVersion.appUserId,
        sql`${appUserVersion.decision} = 'Approved' desc`,
        desc(appUserVersion.recordedAt),
      );
    for (const row of rows) users.set(row.userId, row.displayName);
  }
  const identities = new Map<string, string>();
  if (identityIds.length > 0) {
    const rows = await context.tx
      .select({ id: serviceIdentity.id, code: serviceIdentity.code })
      .from(serviceIdentity)
      .where(inArray(serviceIdentity.id, identityIds));
    for (const row of rows) identities.set(row.id, row.code);
  }
  return (actor) => ({
    kind: actor.kind,
    id: actor.id,
    name: (actor.kind === 'user' ? users.get(actor.id) : identities.get(actor.id)) ?? null,
  });
}
