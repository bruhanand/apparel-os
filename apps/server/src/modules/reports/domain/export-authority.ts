import { STOCK_RECEIPT_ORIGIN_TYPE, type FieldClass } from '@apparel-os/schemas';
import type { RecordFacts } from '../../access/index.js';
import type { AuditScope } from '../../audit/index.js';

// What an export of stock that may carry cost holds at its step 0 (code-house-rules 8.2 "Authority first"; goods-in
// 9.4, 9.5; access-and-approvals 6, 7.1 step 4; code review 8 of stage 2): every grant that shows a row of the file,
// view on each stock record type the row is read from at its facts, and the cost field class where its cost is shown,
// each once. Pure: no database, no clock (code-house-rules 2).

/** A row of the file with the grants that show it, as the read answered them (queries/authority.ts `Shown`). */
export interface ShownRow {
  readonly facts: RecordFacts;
  readonly views: readonly { readonly recordType: string; readonly roleAssignmentId: string }[];
  readonly costAssignmentId: string | undefined;
}

/** One permission held at step 0, with the assignment that grants it. */
export interface HeldNeed {
  readonly roleAssignmentId: string;
  readonly need: {
    readonly action: 'view';
    readonly recordType: string;
    readonly facts: RecordFacts;
    readonly fieldClasses?: readonly { readonly fieldClass: FieldClass; readonly use: 'view' }[];
  };
}

/** The audit scope of a row's facts, no fact left as a null (numbering-and-audit 4.1). */
export const auditScopeOf = (facts: RecordFacts): AuditScope => ({
  ...(facts.legalEntityId === undefined ? {} : { legalEntityId: facts.legalEntityId }),
  ...(facts.siteId === undefined ? {} : { siteId: facts.siteId }),
  ...(facts.storeId === undefined ? {} : { storeId: facts.storeId }),
  ...(facts.businessUnitId === undefined ? {} : { businessUnitId: facts.businessUnitId }),
  ...(facts.brandId === undefined ? {} : { brandId: facts.brandId }),
});

/** Every grant the rows rely on, each once by its record type, assignment and facts, the cost's apart. */
export function heldNeedsOf(rows: readonly ShownRow[]): HeldNeed[] {
  const needs = new Map<string, HeldNeed>();
  for (const row of rows) {
    const scope = JSON.stringify(auditScopeOf(row.facts));
    for (const view of row.views) {
      needs.set(JSON.stringify(['view', view.recordType, view.roleAssignmentId, scope]), {
        roleAssignmentId: view.roleAssignmentId,
        need: { action: 'view', recordType: view.recordType, facts: row.facts },
      });
    }
    if (row.costAssignmentId !== undefined) {
      needs.set(JSON.stringify(['cost', row.costAssignmentId, scope]), {
        roleAssignmentId: row.costAssignmentId,
        need: {
          action: 'view',
          recordType: STOCK_RECEIPT_ORIGIN_TYPE,
          facts: row.facts,
          fieldClasses: [{ fieldClass: 'cost', use: 'view' }],
        },
      });
    }
  }
  return [...needs.values()];
}
