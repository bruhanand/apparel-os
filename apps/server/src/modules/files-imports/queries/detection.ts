import {
  IMPORT_BATCH_TYPE,
  layoutStructureSchema,
  type LayoutDetection,
  type ValueSuggestion,
} from '@apparel-os/schemas';
import { and, asc, eq } from 'drizzle-orm';
import { ApiRefusal, type TransactionContext } from '../../../kernel/index.js';
import { handedInFile, storedGrid } from '../commands/start-import.js';
import {
  BATCH_NOT_FOUND,
  documentsOf,
  factsOfBatch,
  handlerOf,
  parsedOrDefect,
  visibleBatch,
  type ImportActor,
  type ImportDependencies,
} from '../commands/import-common.js';
import { layout, layoutVersion, stagedRow } from '../db/schema.js';
import { detect } from '../domain/detection.js';

// Detecting a layout for a file, and the suggestions for one field of a staged row (imports-and-opening-data 5, 6.5;
// PRD-IMP-004, PRD-IMP-009; S1-F06-T03). Detection reads the stored file: the read of the file and the versions, then
// the object fetched, decrypted and read outside any transaction (code-house-rules 8.3), then the comparison.

function refuse(
  kind: 'not-found' | 'not-authorised' | 'refused',
  code: string,
  missing: { kind: string }[] = [],
): never {
  throw new ApiRefusal({ kind, code, missing: missing });
}

/** Detect a layout (6.5): for whoever may start an import, on a file they handed in. */
export async function detectLayout(
  deps: ImportDependencies,
  actor: ImportActor,
  input: { readonly storedFileId: string; readonly fileReceiptId: string; readonly hint?: string | undefined },
): Promise<LayoutDetection> {
  const request = {
    commandName: 'files-imports.detect-layout',
    organisation: actor.organisation,
    correlationId: actor.correlationId,
    actor: { kind: 'actor' as const, actorId: actor.userId },
  };
  const planned = await deps.runner.read(request, async (context) => {
    const authorised = await deps.access.authoriseEach(
      context,
      { actorId: actor.userId, action: 'create', recordType: IMPORT_BATCH_TYPE },
      [],
    );
    if (authorised.kind === 'refused') {
      refuse('not-authorised', authorised.refusal.code, [...authorised.refusal.missing]);
    }
    const file = await handedInFile(context, actor.userId, input.storedFileId, input.fileReceiptId);
    const versions = await context.tx
      .select({ version: layoutVersion, layout })
      .from(layoutVersion)
      .innerJoin(layout, eq(layout.id, layoutVersion.layoutId))
      .orderBy(asc(layout.code), asc(layoutVersion.version));
    return { file, versions, asOf: context.startedAt.toISOString() };
  });
  const grid = await storedGrid(deps, actor.organisation.organisationCode, planned.file);
  const found = detect(
    grid,
    planned.versions.map((row) => ({
      layoutVersionId: row.version.id,
      layoutCode: row.layout.code,
      source: row.layout.source,
      version: row.version.version,
      state: row.version.state,
      structure: parsedOrDefect(layoutStructureSchema, row.version.structure, 'layout version'),
    })),
    input.hint,
  );
  return {
    asOf: planned.asOf,
    compatible: [...found.compatible],
    ...(found.proposed === undefined ? {} : { proposed: found.proposed }),
    incompatible: found.incompatible.map((each) => ({ ...each, missing: [...each.missing] })),
    sheets: grid.sheets.map((sheet) => ({
      name: sheet.name,
      firstRow: (sheet.rows[0]?.cells ?? []).map((cell) => (cell.type === 'error' ? '' : cell.text.trim())),
    })),
  };
}

/**
 * The suggestions for one field of one staged row (section 5; PRD-IMP-009): exact or close matches the target's
 * handler finds in its own records, for a person to accept. Identity and commercial facts are never filled from one
 * nobody accepted. Needs edit on the batch, as entering the value does.
 */
export async function valueSuggestions(
  deps: Pick<ImportDependencies, 'access' | 'handlers'>,
  context: TransactionContext,
  actorId: string,
  input: { readonly batchId: string; readonly stagedRowId: string; readonly field: string },
): Promise<{ asOf: string; suggestions: ValueSuggestion[] }> {
  const batch = await visibleBatch(context, input.batchId);
  if (batch === undefined) refuse('not-found', BATCH_NOT_FOUND.code);
  const authorised = await deps.access.authorise(context, {
    actorId,
    action: 'edit',
    recordType: IMPORT_BATCH_TYPE,
    facts: factsOfBatch(batch),
  });
  if (authorised.kind === 'refused') refuse('not-authorised', authorised.refusal.code, [...authorised.refusal.missing]);
  const handler = handlerOf(deps.handlers, batch);
  if (!handler.fields.some((field) => field.name === input.field)) {
    refuse('refused', 'files-imports.field-unknown', [
      { kind: 'import-field', field: input.field } as { kind: string },
    ]);
  }
  const [row] = await context.tx
    .select({ id: stagedRow.id })
    .from(stagedRow)
    .where(and(eq(stagedRow.id, input.stagedRowId), eq(stagedRow.batchId, batch.id), eq(stagedRow.role, 'data')));
  if (row === undefined) refuse('not-found', 'files-imports.staged-row-not-found');
  const document = (await documentsOf(context, batch.id)).find((each) =>
    each.rows.some((candidate) => candidate.stagedRowId === row.id),
  );
  const value = document?.rows.find((candidate) => candidate.stagedRowId === row.id)?.values[input.field];
  const word =
    value === undefined || value.kind === 'unknown'
      ? value?.kind === 'unknown'
        ? value.origin?.text
        : undefined
      : value.kind === 'mapped'
        ? value.word
        : value.value;
  return {
    asOf: context.startedAt.toISOString(),
    suggestions: await handler.suggestions(context, input.field, word?.trim()),
  };
}
