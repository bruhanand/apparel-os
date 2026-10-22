import type { RecordFacts } from '../../access/index.js';
import type { AuditScope } from '../../audit/index.js';

// The scope every row of an Arrival carries (code-house-rules 6.1; goods-in 4.8): its place, legal entity and brand, as
// columns and as the facts its routes authorise with (access-and-approvals 5.3). Pure: no database (code-house-rules 2).

/** The scope columns of an Arrival's rows; a Site with no Store has none. */
export interface ScopeColumns {
  readonly siteId: string;
  readonly storeId: string | null;
  readonly businessUnitId: string;
  readonly legalEntityId: string;
  readonly brandId: string;
}

/** The scope columns every row of an Arrival carries, from a row that has them (code-house-rules 6.1). */
export function scopeColumns(row: ScopeColumns): ScopeColumns {
  return {
    siteId: row.siteId,
    storeId: row.storeId,
    businessUnitId: row.businessUnitId,
    legalEntityId: row.legalEntityId,
    brandId: row.brandId,
  };
}

/** The same as scope facts, which its routes authorise with (access-and-approvals 5.3), a Store only when it has one. */
export function factsOf(row: ScopeColumns): RecordFacts & AuditScope {
  const { storeId, ...facts } = scopeColumns(row);
  return storeId === null ? facts : { ...facts, storeId };
}
