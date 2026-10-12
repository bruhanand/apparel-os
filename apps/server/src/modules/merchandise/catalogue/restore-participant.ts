import { tablesOf, type RestoreParticipant } from '../../../kernel/index.js';
import * as catalogueTables from './db/schema.js';

/**
 * The catalogue's part in backup and restore (backup-and-restore 10.1, 10.2; PRD-ACP-019): the totals of its tables,
 * and the brands and SKUs other modules refer to.
 */
export const catalogueRestoreParticipant: RestoreParticipant = {
  unit: 'merchandise.catalogue',
  tier: 2,
  tables: tablesOf(catalogueTables),
  records: [
    {
      recordType: 'merchandise.brand',
      table: 'merchandise.brand',
      suffixes: ['brand_id'],
      arraySuffixes: ['brand_ids'],
    },
    { recordType: 'merchandise.sku', table: 'merchandise.sku', suffixes: ['sku_id'] },
  ],
};
