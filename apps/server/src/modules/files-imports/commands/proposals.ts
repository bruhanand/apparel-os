import { uuidv7 } from '@apparel-os/domain';
import {
  ENCRYPTED_FIELD_CLASSES,
  IMPORT_LAYOUT_TYPE,
  IMPORT_MAPPING_TYPE,
  LAYOUT_CONFIRMATION,
  MAPPING_CONFIRMATION,
  MAPPING_RULE_CONFIRMATION,
  MAPPING_RULE_TYPE,
  normalisedName,
  type LayoutProposal,
  type MappingFields,
  type MappingProposal,
  type MappingRuleProposal,
  type MissingItem,
} from '@apparel-os/schemas';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import {
  UNIQUE_VIOLATION,
  withSavepoint,
  type CommandRefusal,
  type TransactionContext,
} from '../../../kernel/index.js';
import type { AccessInterface, Preparer } from '../../access/index.js';
import type { AuditInterface } from '../../audit/index.js';
import type { ImportHandlers } from '../contracts/import-handlers.js';
import { layout, layoutVersion, mapping, mappingRule, mappingRuleVersion, mappingVersion } from '../db/schema.js';
import { normalisedWord } from '../domain/rules.js';
import { layoutStructureSchema, parsedOrDefect } from './import-common.js';

// Propose a layout version, a mapping version or a mapping rule version (imports-and-opening-data 6.1 to 6.4, 13.1;
// PRD-IMP-003, PRD-IMP-008, POL-02.07, POL-02.08; DEC-112 GC6-4; S1-F06-T03). A version is never edited: a change is
// a new version. Each is Proposed, then confirmed or rejected by a different authorised person through the approval
// panel, under the approval rule `files-imports` declares for it (effects.ts), the proposer its one preparer. An
// unconfirmed proposal changes no record (PRD-IMP-008): a batch may preview with it, never publish (6.4).

export type Outcome<Answer> =
  | { readonly kind: 'success'; readonly answer: Answer }
  | { readonly kind: 'refusal'; readonly refusal: CommandRefusal };

export interface ProposalDependencies {
  readonly audit: AuditInterface;
  readonly access: Pick<AccessInterface, 'requestApproval'>;
  readonly handlers: ImportHandlers;
}

function refused<Answer>(kind: CommandRefusal['kind'], code: string, missing: MissingItem[] = []): Outcome<Answer> {
  return { kind: 'refusal', refusal: { kind, code, missing } };
}

const STALE: CommandRefusal = { kind: 'conflict', code: 'kernel.stale-version', missing: [] };

async function audited(
  context: TransactionContext,
  dependencies: ProposalDependencies,
  proposer: Preparer,
  record: { readonly type: string; readonly id: string; readonly versionId: string },
  operation: string,
  changes: Record<string, unknown>,
): Promise<void> {
  await dependencies.audit.record(context, {
    actor: { kind: 'user', id: proposer.userId },
    roleAssignmentId: proposer.roleAssignmentId,
    record: { module: 'files-imports', ...record },
    operation,
    changes: Object.entries(changes).map(([field, after]) => ({
      kind: 'value' as const,
      field,
      before: null,
      after: after as never,
    })),
    source: { kind: 'screen' },
  });
}

/** Requests the confirmation of a version: one preparer, its proposer; a different person decides it (6.4). */
function requestConfirmation(
  context: TransactionContext,
  dependencies: ProposalDependencies,
  proposer: Preparer,
  actionType: string,
  recordType: string,
  recordId: string,
  versionId: string,
): Promise<string> {
  return dependencies.access.requestApproval(context, {
    actionType,
    document: { module: 'files-imports', recordType, recordId, versionId },
    value: { kind: 'none' },
    preparers: [proposer.userId],
    requestedBy: proposer,
  });
}

/** Propose a layout version: a new layout with its first version, or the next version of a layout (6.1). */
export async function proposeLayoutVersion(
  context: TransactionContext,
  dependencies: ProposalDependencies,
  proposer: Preparer,
  proposal: LayoutProposal,
): Promise<Outcome<{ layoutId: string; layoutVersionId: string; version: number; requestId: string }>> {
  let layoutId: string;
  if ('layoutId' in proposal.layout) {
    layoutId = proposal.layout.layoutId;
    const [found] = await context.tx.select({ id: layout.id }).from(layout).where(eq(layout.id, layoutId));
    if (found === undefined) return refused('not-found', 'files-imports.layout-not-found');
  } else {
    layoutId = uuidv7();
    const { code, source, documentType, kinds } = proposal.layout;
    const written = await withSavepoint(context, 'files_imports_layout', [UNIQUE_VIOLATION], () =>
      context.tx.insert(layout).values({ id: layoutId, code, source, documentType, kinds: [...new Set(kinds)] }),
    );
    if (written.kind === 'caught') return refused('refused', 'files-imports.layout-code-taken');
  }
  const [last] = await context.tx
    .select({ version: layoutVersion.version })
    .from(layoutVersion)
    .where(eq(layoutVersion.layoutId, layoutId))
    .orderBy(desc(layoutVersion.version))
    .limit(1);
  const version = (last?.version ?? 0) + 1;
  const layoutVersionId = uuidv7();
  const written = await withSavepoint(context, 'files_imports_layout_version', [UNIQUE_VIOLATION], () =>
    context.tx.insert(layoutVersion).values({
      id: layoutVersionId,
      layoutId,
      version,
      structure: proposal.structure,
      state: 'Proposed',
      proposedByUserId: proposer.userId,
    }),
  );
  // Two proposals of one layout at once: the second meets the version's unique key and is refused, never failed.
  if (written.kind === 'caught') return { kind: 'refusal', refusal: STALE };
  await audited(
    context,
    dependencies,
    proposer,
    { type: 'layout', id: layoutId, versionId: layoutVersionId },
    'propose-layout-version',
    { version, state: 'Proposed', structure: proposal.structure },
  );
  const requestId = await requestConfirmation(
    context,
    dependencies,
    proposer,
    LAYOUT_CONFIRMATION,
    IMPORT_LAYOUT_TYPE,
    layoutId,
    layoutVersionId,
  );
  return { kind: 'success', answer: { layoutId, layoutVersionId, version, requestId } };
}

/**
 * The checks of a mapping's fields against its target's handler and its layout version (6.2, section 11): every field
 * is one the handler has; every column it reads is one the layout names and does not ignore; and none is of an
 * encrypted class, since no field of a stage 1 handler holds one, so such a column is left out of staging.
 */
function fieldsRefusal(
  fields: MappingFields,
  handlerFields: readonly string[],
  structure: ReturnType<typeof layoutStructureSchema.parse>,
): CommandRefusal | undefined {
  const columns = new Map(structure.columns.map((column) => [normalisedName(column.name), column]));
  const encrypted = new Set(ENCRYPTED_FIELD_CLASSES);
  for (const [field, source] of Object.entries(fields.fields)) {
    if (!handlerFields.includes(field)) {
      return {
        kind: 'refused',
        code: 'files-imports.mapping-field-unknown',
        missing: [{ kind: 'import-field', field }],
      };
    }
    const read =
      'calculation' in source ? source.calculation.columns : [source.column, ...(source.alsoCalculated?.columns ?? [])];
    for (const name of read) {
      const column = columns.get(normalisedName(name));
      if (column === undefined || column.ignored === true) {
        return {
          kind: 'refused',
          code: 'files-imports.mapping-column-unknown',
          missing: [{ kind: 'layout-column', column: name }],
        };
      }
      if (column.restrictedClass !== undefined && encrypted.has(column.restrictedClass)) {
        return {
          kind: 'refused',
          code: 'files-imports.mapping-encrypted-column',
          missing: [{ kind: 'layout-column', column: name, fieldClass: column.restrictedClass }],
        };
      }
    }
  }
  return undefined;
}

/** Propose a mapping version: a new mapping of one layout version and target, or its next version (6.2). */
export async function proposeMappingVersion(
  context: TransactionContext,
  dependencies: ProposalDependencies,
  proposer: Preparer,
  proposal: MappingProposal,
): Promise<Outcome<{ mappingId: string; mappingVersionId: string; version: number; requestId: string }>> {
  let mappingId: string;
  let layoutVersionId: string;
  let target: string;
  let code: string | undefined;
  if ('mappingId' in proposal.mapping) {
    mappingId = proposal.mapping.mappingId;
    const [found] = await context.tx.select().from(mapping).where(eq(mapping.id, mappingId));
    if (found === undefined) return refused('not-found', 'files-imports.mapping-not-found');
    layoutVersionId = found.layoutVersionId;
    target = found.target;
  } else {
    mappingId = uuidv7();
    layoutVersionId = proposal.mapping.layoutVersionId;
    target = proposal.mapping.target;
    code = proposal.mapping.code;
  }
  const [layoutRow] = await context.tx.select().from(layoutVersion).where(eq(layoutVersion.id, layoutVersionId));
  if (layoutRow === undefined) return refused('not-found', 'files-imports.layout-not-found');
  const handler = dependencies.handlers.ofTarget(target);
  if (handler === undefined) {
    return refused('refused', 'files-imports.no-import-handler', [{ kind: 'import-handler', target }]);
  }
  const structure = parsedOrDefect(layoutStructureSchema, layoutRow.structure, 'layout version');
  const fieldRefusal = fieldsRefusal(
    proposal.fields,
    handler.fields.map((field) => field.name),
    structure,
  );
  if (fieldRefusal !== undefined) return { kind: 'refusal', refusal: fieldRefusal };
  if (code !== undefined) {
    const mappingCode = code;
    const written = await withSavepoint(context, 'files_imports_mapping', [UNIQUE_VIOLATION], () =>
      context.tx.insert(mapping).values({ id: mappingId, code: mappingCode, layoutVersionId, target }),
    );
    if (written.kind === 'caught') return refused('refused', 'files-imports.mapping-code-taken');
  }
  const [last] = await context.tx
    .select({ version: mappingVersion.version })
    .from(mappingVersion)
    .where(eq(mappingVersion.mappingId, mappingId))
    .orderBy(desc(mappingVersion.version))
    .limit(1);
  const version = (last?.version ?? 0) + 1;
  const mappingVersionId = uuidv7();
  const written = await withSavepoint(context, 'files_imports_mapping_version', [UNIQUE_VIOLATION], () =>
    context.tx.insert(mappingVersion).values({
      id: mappingVersionId,
      mappingId,
      version,
      fields: proposal.fields,
      state: 'Proposed',
      proposedByUserId: proposer.userId,
    }),
  );
  if (written.kind === 'caught') return { kind: 'refusal', refusal: STALE };
  await audited(
    context,
    dependencies,
    proposer,
    { type: 'mapping', id: mappingId, versionId: mappingVersionId },
    'propose-mapping-version',
    { version, state: 'Proposed', fields: proposal.fields },
  );
  const requestId = await requestConfirmation(
    context,
    dependencies,
    proposer,
    MAPPING_CONFIRMATION,
    IMPORT_MAPPING_TYPE,
    mappingId,
    mappingVersionId,
  );
  return { kind: 'success', answer: { mappingId, mappingVersionId, version, requestId } };
}

/** The target and field an attribute names: `<target>.<field>` (6.3). */
export function attributeParts(attribute: string): { readonly target: string; readonly field: string } {
  const at = attribute.lastIndexOf('.');
  return { target: attribute.slice(0, at), field: attribute.slice(at + 1) };
}

/** The handler's check of a rule's target (6.3): its refusal as `files-imports.rule-target-refused`, naming it. */
export async function ruleTargetRefusal(
  context: TransactionContext,
  handlers: ImportHandlers,
  attribute: string,
  target: string,
): Promise<CommandRefusal | undefined> {
  const parts = attributeParts(attribute);
  const handler = handlers.ofTarget(parts.target);
  if (!handler?.fields.some((field) => field.name === parts.field)) {
    return {
      kind: 'refused',
      code: 'files-imports.rule-attribute-unknown',
      missing: [{ kind: 'rule-attribute', attribute }],
    };
  }
  const refusal = await handler.checkRuleTarget(context, parts.field, target);
  if (refusal === undefined) return undefined;
  if (refusal.code === 'files-imports.rule-attribute-unknown') return refusal;
  return {
    kind: 'refused',
    code: 'files-imports.rule-target-refused',
    missing: [{ kind: 'rule-target', attribute, reason: refusal.code }, ...refusal.missing],
  };
}

/**
 * Propose a mapping rule version (6.3): the rule of one word of one attribute in one scope, kept once, with a version
 * for its target and dates. The handler that owns the target checks it first (13.2).
 */
export async function proposeMappingRule(
  context: TransactionContext,
  dependencies: ProposalDependencies,
  proposer: Preparer,
  proposal: MappingRuleProposal,
): Promise<Outcome<{ ruleId: string; ruleVersionId: string; requestId: string }>> {
  // A version never starts on a past date (code-house-rules 7.3; GC2-7, DEC-105), checked against today under the
  // Organisation's timezone; its confirmation checks it again.
  const date = await context.businessDate();
  if (date.kind !== 'set') {
    return refused('unavailable', 'access.business-date-not-set', [
      { kind: 'setting', setting: 'configuration.timezone' },
    ]);
  }
  if (proposal.validFrom < date.date) return refused('refused', 'files-imports.starts-in-past');
  const targetRefusal = await ruleTargetRefusal(context, dependencies.handlers, proposal.attribute, proposal.target);
  if (targetRefusal !== undefined) return { kind: 'refusal', refusal: targetRefusal };
  const scopeId = proposal.scope.kind === 'organisation' ? null : proposal.scope.id;
  if (proposal.scope.kind === 'layout') {
    const [found] = await context.tx.select({ id: layout.id }).from(layout).where(eq(layout.id, proposal.scope.id));
    if (found === undefined) {
      return refused('not-found', 'files-imports.rule-scope-not-found', [
        { kind: 'layout', layoutId: proposal.scope.id },
      ]);
    }
  }
  const normal = normalisedWord(proposal.word, proposal.caseSensitive);
  const identity = and(
    eq(mappingRule.attribute, proposal.attribute),
    eq(mappingRule.scopeKind, proposal.scope.kind),
    scopeId === null ? isNull(mappingRule.scopeId) : eq(mappingRule.scopeId, scopeId),
    eq(mappingRule.normalisedWord, normal),
    eq(mappingRule.caseSensitive, proposal.caseSensitive),
  );
  let [rule] = await context.tx.select({ id: mappingRule.id }).from(mappingRule).where(identity);
  if (rule === undefined) {
    const ruleId = uuidv7();
    const written = await withSavepoint(context, 'files_imports_mapping_rule', [UNIQUE_VIOLATION], () =>
      context.tx.insert(mappingRule).values({
        id: ruleId,
        attribute: proposal.attribute,
        scopeKind: proposal.scope.kind,
        scopeId,
        word: normalisedName(proposal.word),
        normalisedWord: normal,
        caseSensitive: proposal.caseSensitive,
      }),
    );
    if (written.kind === 'caught') return { kind: 'refusal', refusal: STALE };
    rule = { id: ruleId };
  }
  const ruleVersionId = uuidv7();
  const range = `[${proposal.validFrom},${proposal.validTo ?? ''})`;
  await context.tx.insert(mappingRuleVersion).values({
    id: ruleVersionId,
    mappingRuleId: rule.id,
    target: proposal.target,
    validDuring: range,
    state: 'Proposed',
    proposedByUserId: proposer.userId,
  });
  await audited(
    context,
    dependencies,
    proposer,
    { type: 'mapping_rule', id: rule.id, versionId: ruleVersionId },
    'propose-mapping-rule-version',
    {
      attribute: proposal.attribute,
      scope: proposal.scope,
      word: proposal.word,
      caseSensitive: proposal.caseSensitive,
      target: proposal.target,
      validDuring: range,
      state: 'Proposed',
    },
  );
  const requestId = await requestConfirmation(
    context,
    dependencies,
    proposer,
    MAPPING_RULE_CONFIRMATION,
    MAPPING_RULE_TYPE,
    rule.id,
    ruleVersionId,
  );
  return { kind: 'success', answer: { ruleId: rule.id, ruleVersionId, requestId } };
}

/** The Confirmed rule versions in force on a date, as staging matches them (6.3; PRD-IMP-008). */
export async function rulesInForce(context: TransactionContext, date: string) {
  const rows = await context.tx
    .select({
      ruleId: mappingRule.id,
      ruleVersionId: mappingRuleVersion.id,
      attribute: mappingRule.attribute,
      scopeKind: mappingRule.scopeKind,
      scopeId: mappingRule.scopeId,
      normalisedWord: mappingRule.normalisedWord,
      caseSensitive: mappingRule.caseSensitive,
      target: mappingRuleVersion.target,
    })
    .from(mappingRuleVersion)
    .innerJoin(mappingRule, eq(mappingRule.id, mappingRuleVersion.mappingRuleId))
    .where(and(eq(mappingRuleVersion.state, 'Confirmed'), sql`${mappingRuleVersion.validDuring} @> ${date}::date`));
  return rows.map((row) => ({
    ruleId: row.ruleId,
    ruleVersionId: row.ruleVersionId,
    attribute: row.attribute,
    scope:
      row.scopeKind === 'organisation' || row.scopeId === null
        ? ({ kind: 'organisation' } as const)
        : ({ kind: row.scopeKind, id: row.scopeId } as const),
    normalisedWord: row.normalisedWord,
    caseSensitive: row.caseSensitive,
    target: row.target,
  }));
}
