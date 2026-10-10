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

// S1-F06-T01: the one fixed layout and mapping of the import tracer, written directly as the migration role until
// proposing and confirming them arrives (S1-F06-T03; code-house-rules 11.2: "until an interface exists, a fixture
// writes the fewest rows it needs directly"). Each has one version, Proposed by the person named: no confirmation
// exists yet, so the file a batch reads with it counts as holding every restricted class (imports-and-opening-data
// 11). Every value is SYNTHETIC.

export interface SyntheticProductLayout {
  readonly layoutVersionId: string;
  readonly mappingVersionId: string;
}

/** Writes the SYNTHETIC product layout and its `merchandise` mapping, one Proposed version each. */
export async function writeSyntheticProductLayout(
  database: string,
  proposedByUserId: string,
): Promise<SyntheticProductLayout> {
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
      [layoutId, SYNTHETIC_PRODUCT_LAYOUT_CODE, SYNTHETIC_LAYOUT_SOURCE],
    );
    await owner.query(
      `insert into files_imports.layout_version (id, layout_id, version, structure, state, proposed_by_user_id)
       values ($1, $2, 1, $3, 'Proposed', $4)`,
      [layoutVersionId, layoutId, JSON.stringify(SYNTHETIC_PRODUCT_LAYOUT), proposedByUserId],
    );
    await owner.query(
      `insert into files_imports.mapping (id, code, layout_version_id, target) values ($1, $2, $3, 'merchandise')`,
      [mappingId, SYNTHETIC_PRODUCT_MAPPING_CODE, layoutVersionId],
    );
    await owner.query(
      `insert into files_imports.mapping_version (id, mapping_id, version, fields, state, proposed_by_user_id)
       values ($1, $2, 1, $3, 'Proposed', $4)`,
      [mappingVersionId, mappingId, JSON.stringify(SYNTHETIC_PRODUCT_MAPPING), proposedByUserId],
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
