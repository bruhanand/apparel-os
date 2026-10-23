import { uuidv7 } from '@apparel-os/domain';
import type { TransactionContext } from '../../../kernel/index.js';
import type { RecordFacts } from '../../access/index.js';
import type { AuditInterface, AuditScope } from '../../audit/index.js';

// The sensitive-access records of an export that carries cost (numbering-and-audit 5.1, 5.2; PRD-SEC-007,
// PRD-ACS-008; goods-in 9.4, 9.5; S2-F11-T01, S2-F11-T02), a step the stock search's and the stock report's exports
// share: one record for each place and brand whose cost the file carries, all naming the export by an identifier made
// for it, which keeps no row of its own, written in the export's own transaction before its bytes are given.

export interface CostExporter {
  readonly userId: string;
  readonly networkAddress: string;
}

/** Records the access the export is; answers the export's identifier. */
export async function recordCostExport(
  audit: AuditInterface,
  context: TransactionContext,
  exporter: CostExporter,
  record: { readonly module: string; readonly type: string },
  costFacts: readonly RecordFacts[],
): Promise<string> {
  const exportId = uuidv7();
  const scopes = new Map(
    costFacts.map((facts) => {
      const scope: AuditScope = {
        ...(facts.legalEntityId === undefined ? {} : { legalEntityId: facts.legalEntityId }),
        ...(facts.siteId === undefined ? {} : { siteId: facts.siteId }),
        ...(facts.storeId === undefined ? {} : { storeId: facts.storeId }),
        ...(facts.businessUnitId === undefined ? {} : { businessUnitId: facts.businessUnitId }),
        ...(facts.brandId === undefined ? {} : { brandId: facts.brandId }),
      };
      return [JSON.stringify(scope), scope];
    }),
  );
  for (const scope of scopes.values()) {
    await audit.recordAccess(context, {
      kind: 'sensitive-access',
      outcome: 'succeeded',
      userId: exporter.userId,
      networkAddress: exporter.networkAddress,
      scope,
      record: { ...record, id: exportId },
      fieldClass: 'cost',
      exposure: 'exported',
    });
  }
  return exportId;
}
