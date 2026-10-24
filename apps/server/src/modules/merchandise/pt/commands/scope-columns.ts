/** The scope facts a PT's rows carry: its GRN's place, legal entity and brand (code-house-rules 6.1; goods-in 5.8). */
export interface PtScope {
  readonly siteId: string;
  readonly storeId?: string | null;
  readonly businessUnitId: string;
  readonly legalEntityId: string;
  readonly brandId: string;
}

/** The scope columns every row of a PT is written with, from its GRN's facts or a PT row's own; no Store is none. */
export function scopeColumnsOf(scope: PtScope) {
  return {
    siteId: scope.siteId,
    storeId: scope.storeId ?? null,
    businessUnitId: scope.businessUnitId,
    legalEntityId: scope.legalEntityId,
    brandId: scope.brandId,
  };
}

/**
 * The same facts as an audit record, an event or an exception of a PT carries them: no Store is left out, never a null
 * as a fact (numbering-and-audit 4.1; code-house-rules 12.8).
 */
export function auditScopeOf(scope: PtScope) {
  return {
    siteId: scope.siteId,
    businessUnitId: scope.businessUnitId,
    legalEntityId: scope.legalEntityId,
    brandId: scope.brandId,
    ...(scope.storeId === null || scope.storeId === undefined ? {} : { storeId: scope.storeId }),
  };
}
