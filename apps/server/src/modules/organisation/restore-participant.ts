import { tablesOf, type RestoreParticipant } from '../../kernel/index.js';
import * as organisationTables from './db/schema.js';

/**
 * Organisation's part in backup and restore (backup-and-restore 10.1, 10.2; PRD-ACP-019): the totals of its tables,
 * and the records every other module refers to by their scope facts and places (code-house-rules 6.1): legal
 * entities, Sites, Stores, business units, locations, accounting books and tax registrations.
 */
export const organisationRestoreParticipant: RestoreParticipant = {
  unit: 'organisation',
  tier: 2,
  tables: tablesOf(organisationTables),
  records: [
    {
      recordType: 'organisation.legal_entity',
      table: 'organisation.legal_entity',
      suffixes: ['legal_entity_id'],
      arraySuffixes: ['legal_entity_ids'],
    },
    { recordType: 'organisation.site', table: 'organisation.site', suffixes: ['site_id'], arraySuffixes: ['site_ids'] },
    {
      recordType: 'organisation.store',
      table: 'organisation.store',
      suffixes: ['store_id'],
      arraySuffixes: ['store_ids'],
    },
    {
      recordType: 'organisation.business_unit',
      table: 'organisation.business_unit',
      suffixes: ['business_unit_id'],
      arraySuffixes: ['business_unit_ids'],
    },
    { recordType: 'organisation.location', table: 'organisation.location', suffixes: ['location_id'] },
    { recordType: 'organisation.accounting_book', table: 'organisation.accounting_book', suffixes: ['book_id'] },
    {
      recordType: 'organisation.tax_registration',
      table: 'organisation.tax_registration',
      suffixes: ['tax_registration_id'],
    },
  ],
};
