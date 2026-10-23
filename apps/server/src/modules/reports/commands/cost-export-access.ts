import { uuidv7 } from '@apparel-os/domain';
import { STOCK_RECEIPT_ORIGIN_TYPE } from '@apparel-os/schemas';
import type { CommandRefusal, TransactionContext } from '../../../kernel/index.js';
import type { AccessInterface } from '../../access/index.js';
import type { AuditInterface, AuditScope } from '../../audit/index.js';
import type { CostShown } from '../queries/stock-search.js';

// The authority and the sensitive-access records of an export that carries cost (numbering-and-audit 5.1, 5.2;
// PRD-SEC-007, PRD-ACS-008; goods-in 9.4, 9.5; S2-F11-T01, S2-F11-T02), a step the stock search's and the stock
// report's exports share: for each place and brand whose cost the file carries, once, the assignment granting its cost
// is held at step 0 and rechecked, as a PT's download holds its own (code-house-rules 8.2; goods-in 6.6); then one
// sensitive-access record for each, all naming the export by an identifier made for it, which keeps no row of its own,
// written in the export's own transaction before its bytes are given.

export interface CostExporter {
  readonly userId: string;
  readonly networkAddress: string;
}

/** Holds the authority and records the access the export is; answers a refusal of the authority, or none. */
export async function recordCostExport(
  access: Pick<AccessInterface, 'holdAuthority'>,
  audit: AuditInterface,
  context: TransactionContext,
  exporter: CostExporter,
  record: { readonly module: string; readonly type: string },
  costShown: readonly CostShown[],
): Promise<CommandRefusal | undefined> {
  // Each place and brand whose cost the file carries, once, with the assignment granting its cost.
  const scopes = new Map(
    costShown.map((each) => {
      const { facts } = each;
      const scope: AuditScope = {
        ...(facts.legalEntityId === undefined ? {} : { legalEntityId: facts.legalEntityId }),
        ...(facts.siteId === undefined ? {} : { siteId: facts.siteId }),
        ...(facts.storeId === undefined ? {} : { storeId: facts.storeId }),
        ...(facts.businessUnitId === undefined ? {} : { businessUnitId: facts.businessUnitId }),
        ...(facts.brandId === undefined ? {} : { brandId: facts.brandId }),
      };
      return [JSON.stringify(scope), { scope, facts, roleAssignmentId: each.roleAssignmentId }];
    }),
  );
  // Step 0 (code-house-rules 8.2): the authority to export cost at each of them, held and rechecked before the access
  // records are written.
  const [first, ...further] = [...scopes.values()].map((each) => ({
    roleAssignmentId: each.roleAssignmentId,
    need: {
      action: 'view' as const,
      recordType: STOCK_RECEIPT_ORIGIN_TYPE,
      facts: each.facts,
      fieldClasses: [{ fieldClass: 'cost' as const, use: 'view' as const }],
    },
  }));
  if (first !== undefined) {
    const held = await access.holdAuthority(
      context,
      { kind: 'user', id: exporter.userId },
      first.roleAssignmentId,
      first.need,
      [],
      further,
    );
    if (held !== undefined) return held;
  }
  // One sensitive-access record for each of them, naming the export (numbering-and-audit 5.1, 5.2).
  const exportId = uuidv7();
  for (const { scope } of scopes.values()) {
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
  return undefined;
}
