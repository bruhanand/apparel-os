import { uuidv7 } from '@apparel-os/domain';
import type { TransactionContext } from '../../src/kernel/index.js';
import { IMPORT_BATCH_KIND, IMPORT_BATCH_SCOPE_KEY } from '../../src/modules/files-imports/index.js';
import type { NumberingInterface } from '../../src/modules/numbering/index.js';
import {
  SYNTHETIC_IMPORT_BATCH_FORMAT,
  SYNTHETIC_LAYOUT_SOURCE,
  SYNTHETIC_PRODUCT_LAYOUT,
  SYNTHETIC_PRODUCT_LAYOUT_CODE,
  SYNTHETIC_PRODUCT_MAPPING,
  SYNTHETIC_PRODUCT_MAPPING_CODE,
} from '../fixtures/imports.js';
import { syntheticCode } from '../fixtures/synthetic.js';
import { connect } from './postgres.js';

// S1-F06-T01: the one fixed layout and mapping of the import tracer, written directly as the migration role
// (code-house-rules 11.2: a fixture writes the fewest rows it needs directly). Each has one version, Proposed by the
// person named, so the file a batch reads with it counts as holding every restricted class (imports-and-opening-data
// 11); or, where a test names a confirmer, Confirmed by that different person, as the decision through `access` would
// leave it (6.4; S1-F06-T03, whose own tests propose and confirm through the routes). Every value is SYNTHETIC.

export interface SyntheticProductLayout {
  readonly layoutVersionId: string;
  readonly mappingVersionId: string;
}

/** Writes the SYNTHETIC product layout and its `merchandise` mapping, one Proposed version each. */
export async function writeSyntheticProductLayout(
  database: string,
  proposedByUserId: string,
  confirmedByUserId?: string,
): Promise<SyntheticProductLayout> {
  const confirmed = confirmedByUserId !== undefined;
  return writeSyntheticLayout(
    database,
    {
      layoutCode: confirmed ? `${SYNTHETIC_PRODUCT_LAYOUT_CODE}-CONFIRMED` : SYNTHETIC_PRODUCT_LAYOUT_CODE,
      mappingCode: confirmed ? `${SYNTHETIC_PRODUCT_MAPPING_CODE}-CONFIRMED` : SYNTHETIC_PRODUCT_MAPPING_CODE,
      structure: SYNTHETIC_PRODUCT_LAYOUT,
      fields: SYNTHETIC_PRODUCT_MAPPING,
    },
    proposedByUserId,
    confirmedByUserId,
  );
}

/**
 * Writes a SYNTHETIC layout and its `merchandise` mapping with the structure and fields given, one version each,
 * Proposed, or Confirmed by the different person named (S1-F06-T02).
 */
export async function writeSyntheticLayout(
  database: string,
  layout: {
    readonly layoutCode: string;
    readonly mappingCode: string;
    readonly structure: unknown;
    readonly fields: unknown;
  },
  proposedByUserId: string,
  confirmedByUserId?: string,
): Promise<SyntheticProductLayout> {
  const state = confirmedByUserId === undefined ? 'Proposed' : 'Confirmed';
  const decided = [confirmedByUserId ?? null, confirmedByUserId === undefined ? null : new Date()];
  const layoutId = uuidv7();
  const layoutVersionId = uuidv7();
  const mappingId = uuidv7();
  const mappingVersionId = uuidv7();
  const owner = await connect(database, 'migration');
  try {
    await owner.query('begin');
    await owner.query(
      `insert into files_imports.layout (id, code, source, document_type, kinds)
       values ($1, $2, $3, 'product-master', array['create'])`,
      [layoutId, layout.layoutCode, SYNTHETIC_LAYOUT_SOURCE],
    );
    await owner.query(
      `insert into files_imports.layout_version (id, layout_id, version, structure, state, proposed_by_user_id,
         decided_by_user_id, decided_at)
       values ($1, $2, 1, $3, $4, $5, $6, $7)`,
      [layoutVersionId, layoutId, JSON.stringify(layout.structure), state, proposedByUserId, ...decided],
    );
    await owner.query(
      `insert into files_imports.mapping (id, code, layout_version_id, target) values ($1, $2, $3, 'merchandise')`,
      [mappingId, layout.mappingCode, layoutVersionId],
    );
    await owner.query(
      `insert into files_imports.mapping_version (id, mapping_id, version, fields, state, proposed_by_user_id,
         decided_by_user_id, decided_at)
       values ($1, $2, 1, $3, $4, $5, $6, $7)`,
      [mappingVersionId, mappingId, JSON.stringify(layout.fields), state, proposedByUserId, ...decided],
    );
    await owner.query('commit');
  } catch (error) {
    await owner.query('rollback');
    throw error;
  } finally {
    await owner.end();
  }
  return { layoutVersionId, mappingVersionId };
}

/** Defines the SYNTHETIC import batch code format and an Open series of the import-batch kind (GC9-9). */
export async function defineSyntheticImportBatchSeries(
  context: TransactionContext,
  numbering: NumberingInterface,
  label = 'IMPORT-BATCH',
): Promise<void> {
  const code = syntheticCode(label);
  const format = await numbering.defineFormatVersion(context, code, SYNTHETIC_IMPORT_BATCH_FORMAT);
  if (format.kind !== 'done') throw new Error(`The synthetic batch format was refused: ${format.refusal.code}`);
  const series = await numbering.defineSeries(context, {
    kind: IMPORT_BATCH_KIND.kind,
    scopeKey: IMPORT_BATCH_SCOPE_KEY,
    displayScopeKey: IMPORT_BATCH_SCOPE_KEY,
    formatCode: code,
  });
  if (series.kind !== 'done') throw new Error(`The synthetic batch series was refused: ${series.refusal.code}`);
}
