import { uuidv7 } from '@apparel-os/domain';
import {
  EXTERNAL_CODE_TYPE,
  type CodeMapped,
  type CodeMappingDraft,
  type CodeMappingEnd,
  type CodeResolved,
  type MissingItem,
  type ResolveCodeQuery,
} from '@apparel-os/schemas';
import { and, asc, eq, isNull, ne, not, or, sql } from 'drizzle-orm';
import {
  CommandDefect,
  EXCLUSION_VIOLATION,
  LOCK_STEP,
  lockTable,
  UNIQUE_VIOLATION,
  withSavepoint,
  type CommandRefusal,
  type TransactionContext,
} from '../../../../kernel/index.js';
import type { AuditInterface } from '../../../audit/index.js';
import type { Preparer } from '../../../organisation/index.js';
import type { SupplierRoles } from '../contracts/supplier-roles.js';
import { externalCode, externalCodeKey, pack } from '../db/schema.js';
import { codeMappingChanged } from '../events.js';
import { exists, inForceOn, recordItem, refused, today, type Outcome } from './common.js';

// External codes (structure-and-masters 4.3, 4.7; PRD-MER-006 to PRD-MER-008; S1-F03-T02): a code kept exactly as
// supplied, mapped to a SKU and a unit in one scope over its validity dates, as an active mapping or a historical
// alias. The same-scope conflict is refused by the exclusion constraint; the cross-scope conflict by the service, under
// a lock on the code's row (`external_code_key`), so two mappings of one code never pass each other. Mappings take
// effect when recorded, as no source names an approval for them (2.3). **Design choice.**

/** The code's row, made the first time the code and kind are mapped; a race meets the unique constraint. */
async function codeKey(context: TransactionContext, code: string, kind: CodeMappingDraft['kind']): Promise<string> {
  const find = async () =>
    (
      await context.tx
        .select({ id: externalCodeKey.id })
        .from(externalCodeKey)
        .where(and(eq(externalCodeKey.code, code), eq(externalCodeKey.kind, kind)))
    )[0]?.id;
  const found = await find();
  if (found !== undefined) return found;
  const id = uuidv7();
  const written = await withSavepoint(context, 'merchandise_code_key', [UNIQUE_VIOLATION], () =>
    context.tx.insert(externalCodeKey).values({ id, code, kind }),
  );
  if (written.kind === 'done') return id;
  const again = await find();
  if (again === undefined) throw new CommandDefect('The code row met its unique constraint and was not found after');
  return again;
}

const scopeColumns = (scope: CodeMappingDraft['scope']) => ({
  scopeKind: scope.kind,
  scopePartyId: scope.kind === 'supplier' ? scope.partyId : null,
  scopeBrandId: scope.kind === 'brand' ? scope.brandId : null,
});

/** The first refusal of what the mapping names: the SKU, its pack, the supplier or the brand of its scope (4.3). */
async function namesRefusal(
  context: TransactionContext,
  suppliers: SupplierRoles,
  draft: CodeMappingDraft,
): Promise<CommandRefusal | undefined> {
  if (!(await exists(context, 'sku', draft.skuId))) {
    return { kind: 'not-found', code: 'merchandise.record-not-found', missing: [recordItem('sku', draft.skuId)] };
  }
  if (draft.packId !== undefined) {
    const [owner] = await context.tx.select({ skuId: pack.skuId }).from(pack).where(eq(pack.id, draft.packId));
    const ownerId = owner?.skuId;
    if (ownerId === undefined) {
      return { kind: 'not-found', code: 'merchandise.record-not-found', missing: [recordItem('pack', draft.packId)] };
    }
    if (ownerId !== draft.skuId) {
      return { kind: 'refused', code: 'merchandise.pack-of-another-sku', missing: [recordItem('pack', draft.packId)] };
    }
  }
  if (draft.scope.kind === 'supplier') {
    if (!(await suppliers.holdsSupplierRole(context, draft.scope.partyId, draft.validFrom))) {
      return {
        kind: 'refused',
        code: 'merchandise.party-not-supplier',
        missing: [{ kind: 'record', recordType: 'merchandise.party', recordId: draft.scope.partyId }],
      };
    }
  }
  if (draft.scope.kind === 'brand') {
    const brand = recordItem('brand', draft.scope.brandId);
    if (!(await exists(context, 'brand', draft.scope.brandId))) {
      return { kind: 'not-found', code: 'merchandise.record-not-found', missing: [brand] };
    }
    if (!(await inForceOn(context, 'brand', draft.scope.brandId, draft.validFrom))) {
      return { kind: 'refused', code: 'merchandise.reference-not-in-force', missing: [brand] };
    }
  }
  return undefined;
}

/**
 * The active mapping of the code in an overlapping scope, over overlapping dates, to another target, if any (4.3):
 * scopes overlap when they name the same supplier or brand, or when either is the whole Organisation. A supplier scope
 * and a brand scope are not compared here; Resolve refuses a request that matches both with different targets.
 */
async function crossScopeConflict(
  context: TransactionContext,
  keyId: string,
  draft: CodeMappingDraft,
): Promise<string | undefined> {
  const { scopeKind, scopePartyId, scopeBrandId } = scopeColumns(draft.scope);
  const range = `[${draft.validFrom},${draft.validTo ?? ''})`;
  const sameScope = and(
    eq(externalCode.scopeKind, scopeKind),
    scopePartyId === null ? isNull(externalCode.scopePartyId) : eq(externalCode.scopePartyId, scopePartyId),
    scopeBrandId === null ? isNull(externalCode.scopeBrandId) : eq(externalCode.scopeBrandId, scopeBrandId),
  );
  const [conflict] = await context.tx
    .select({ id: externalCode.id })
    .from(externalCode)
    .where(
      and(
        eq(externalCode.codeKeyId, keyId),
        not(externalCode.alias),
        sql`${externalCode.validDuring} && ${range}::daterange`,
        ne(externalCode.target, `${draft.skuId}/${draft.packId ?? ''}`),
        scopeKind === 'organisation' ? undefined : or(eq(externalCode.scopeKind, 'organisation'), sameScope),
      ),
    )
    .limit(1);
  return conflict?.id;
}

/** Map a code (4.3, 4.7): an active mapping that would make the code ambiguous is refused (PRD-MER-007). */
export async function mapCode(
  context: TransactionContext,
  dependencies: { readonly audit: AuditInterface; readonly suppliers: SupplierRoles },
  preparer: Preparer,
  draft: CodeMappingDraft,
): Promise<Outcome<CodeMapped>> {
  const date = await today(context);
  if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
  // GC2-7, DEC-105: no mapping starts on a past date (2.2).
  if (draft.validFrom < date) return refused('refused', 'merchandise.starts-in-past');
  const keyId = await codeKey(context, draft.code, draft.kind);
  await context.lock(LOCK_STEP.document, [
    { table: lockTable('merchandise', 'external_code_key'), id: keyId, mode: 'exclusive' },
  ]);
  // What the mapping names, read under the code's lock, after every lock is taken (code-house-rules 8.2 rechecks).
  const names = await namesRefusal(context, dependencies.suppliers, draft);
  if (names !== undefined) return { kind: 'refusal', refusal: names };
  const conflictItem = (id: string): MissingItem => ({
    kind: 'record',
    recordType: 'merchandise.external_code',
    recordId: id,
  });
  if (!draft.alias) {
    const conflict = await crossScopeConflict(context, keyId, draft);
    if (conflict !== undefined) return refused('refused', 'merchandise.code-conflict', [conflictItem(conflict)]);
  }
  const mappingId = uuidv7();
  const written = await withSavepoint(context, 'merchandise_map_code', [EXCLUSION_VIOLATION], () =>
    context.tx.insert(externalCode).values({
      id: mappingId,
      codeKeyId: keyId,
      ...scopeColumns(draft.scope),
      skuId: draft.skuId,
      packId: draft.packId ?? null,
      alias: draft.alias,
      validDuring: `[${draft.validFrom},${draft.validTo ?? ''})`,
      preparedByUserId: preparer.userId,
    }),
  );
  // The same-scope conflict, held by the exclusion constraint behind the service (6.2).
  if (written.kind === 'caught') return refused('refused', 'merchandise.code-conflict');
  await dependencies.audit.record(context, {
    actor: { kind: 'user', id: preparer.userId },
    roleAssignmentId: preparer.roleAssignmentId,
    record: { module: 'merchandise', type: 'external_code', id: mappingId },
    operation: 'map-code',
    changes: [
      { kind: 'value', field: 'code', before: null, after: draft.code },
      { kind: 'value', field: 'kind', before: null, after: draft.kind },
      { kind: 'value', field: 'scope', before: null, after: { ...draft.scope } },
      { kind: 'value', field: 'skuId', before: null, after: draft.skuId },
      { kind: 'value', field: 'packId', before: null, after: draft.packId ?? null },
      { kind: 'value', field: 'alias', before: null, after: draft.alias },
      { kind: 'value', field: 'validFrom', before: null, after: draft.validFrom },
      { kind: 'value', field: 'validTo', before: null, after: draft.validTo ?? null },
    ],
    source: { kind: 'screen' },
  });
  await context.publish(codeMappingChanged, {
    subject: { module: 'merchandise', recordType: EXTERNAL_CODE_TYPE, recordId: mappingId },
    payload: { mappingId, skuId: draft.skuId },
  });
  return { kind: 'success', answer: { mappingId } };
}

/** End a mapping on a date, today or later, after its start and before any end it has; the row is kept (PRD-MER-007). */
export async function endCodeMapping(
  context: TransactionContext,
  audit: AuditInterface,
  preparer: Preparer,
  mappingId: string,
  draft: CodeMappingEnd,
): Promise<Outcome<CodeMapped>> {
  const date = await today(context);
  if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
  const [head] = await context.tx
    .select({ key: externalCode.codeKeyId, skuId: externalCode.skuId })
    .from(externalCode)
    .where(eq(externalCode.id, mappingId));
  const item: MissingItem = { kind: 'record', recordType: 'merchandise.external_code', recordId: mappingId };
  if (head === undefined) return refused('not-found', 'merchandise.record-not-found', [item]);
  await context.lock(LOCK_STEP.document, [
    { table: lockTable('merchandise', 'external_code_key'), id: head.key, mode: 'exclusive' },
  ]);
  const [range] = await context.tx
    .select({
      start: sql<string>`lower(${externalCode.validDuring})::text`,
      end: sql<string | null>`upper(${externalCode.validDuring})::text`,
    })
    .from(externalCode)
    .where(eq(externalCode.id, mappingId));
  if (
    range === undefined ||
    draft.validTo < date ||
    draft.validTo <= range.start ||
    (range.end !== null && draft.validTo >= range.end)
  ) {
    return refused('refused', 'merchandise.end-not-allowed', [item]);
  }
  await context.tx
    .update(externalCode)
    .set({ validDuring: sql`daterange(lower(${externalCode.validDuring}), ${draft.validTo}::date)` })
    .where(eq(externalCode.id, mappingId));
  await audit.record(context, {
    actor: { kind: 'user', id: preparer.userId },
    roleAssignmentId: preparer.roleAssignmentId,
    record: { module: 'merchandise', type: 'external_code', id: mappingId },
    operation: 'end-code-mapping',
    changes: [{ kind: 'value', field: 'validTo', before: range.end, after: draft.validTo }],
    source: { kind: 'screen' },
  });
  await context.publish(codeMappingChanged, {
    subject: { module: 'merchandise', recordType: EXTERNAL_CODE_TYPE, recordId: mappingId },
    payload: { mappingId, skuId: head.skuId },
  });
  return { kind: 'success', answer: { mappingId } };
}

/**
 * Resolve a code (4.7; PRD-MER-006, PRD-MER-007): the mappings of the code and kind in force on the date whose scope is
 * the Organisation, or the supplier or brand given. Active mappings first: one target answers it, more than one is
 * ambiguous and refused. With no active match, historical aliases the same way. None matching is not found.
 * **Design choice:** an alias answers only where no active mapping does, so an old label still finds its SKU.
 */
export async function resolveCode(
  context: TransactionContext,
  query: ResolveCodeQuery,
): Promise<{ readonly resolved: CodeResolved } | { readonly refusal: CommandRefusal }> {
  const rows = await context.tx
    .select({
      id: externalCode.id,
      skuId: externalCode.skuId,
      packId: externalCode.packId,
      alias: externalCode.alias,
      target: externalCode.target,
    })
    .from(externalCode)
    .innerJoin(externalCodeKey, eq(externalCodeKey.id, externalCode.codeKeyId))
    .where(
      and(
        eq(externalCodeKey.code, query.code),
        eq(externalCodeKey.kind, query.kind),
        sql`${externalCode.validDuring} @> ${query.date}::date`,
        or(
          eq(externalCode.scopeKind, 'organisation'),
          query.supplierId === undefined
            ? undefined
            : and(eq(externalCode.scopeKind, 'supplier'), eq(externalCode.scopePartyId, query.supplierId)),
          query.brandId === undefined
            ? undefined
            : and(eq(externalCode.scopeKind, 'brand'), eq(externalCode.scopeBrandId, query.brandId)),
        ),
      ),
    )
    .orderBy(asc(externalCode.id));
  for (const alias of [false, true]) {
    const matches = rows.filter((row) => row.alias === alias);
    const targets = new Set(matches.map((row) => row.target));
    if (targets.size > 1) {
      return {
        refusal: {
          kind: 'refused',
          code: 'merchandise.code-ambiguous',
          missing: matches.map((row) => ({
            kind: 'record',
            recordType: 'merchandise.external_code',
            recordId: row.id,
          })),
        },
      };
    }
    const [match] = matches;
    if (match !== undefined) {
      return {
        resolved: {
          skuId: match.skuId,
          ...(match.packId === null ? {} : { packId: match.packId }),
          mappingId: match.id,
          alias,
        },
      };
    }
  }
  return { refusal: { kind: 'not-found', code: 'merchandise.code-not-found', missing: [] } };
}
