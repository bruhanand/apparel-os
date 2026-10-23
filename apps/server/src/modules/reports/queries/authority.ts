import { STOCK_RECEIPT_ORIGIN_TYPE, STOCK_SEARCH_READS } from '@apparel-os/schemas';
import type { CommandRefusal, TransactionContext } from '../../../kernel/index.js';
import type { AccessInterface, RecordFacts } from '../../access/index.js';
import type { Authority } from './stock-search.js';

// What a reader may see of stock search, through `access` (access-and-approvals 5.3, 6, 7.1 step 3; PRD-ACS-004,
// PRD-ACS-008, PRD-SEC-005; goods-in 9.1, 9.4; S2-F11-T01). A result is shown only when the reader's grants of view on
// every stock record type it is read from cover its place and brand, so its quantities never leave out a hold or a
// reservation the reader may not see; its cost only when the assignment that grants view on its receipt origins grants
// the cost field class too. In a list each row is authorised with its own facts, the assignments read once (RR-296).

/** The search refused as a whole: the reader holds no grant of view on a stock record type it reads (7.1 step 3). */
export class SearchRefused extends Error {
  constructor(readonly refusal: CommandRefusal) {
    super(`Stock search refused: ${refusal.code}`);
    this.name = 'SearchRefused';
  }
}

export function readerAuthority(access: AccessInterface, context: TransactionContext, actorId: string): Authority {
  return {
    visible: async (facts: readonly RecordFacts[]) => {
      const shown = facts.map(() => true);
      // One after another: one transaction's connection answers one statement at a time.
      for (const recordType of STOCK_SEARCH_READS) {
        const checked = await access.authoriseEach(context, { actorId, action: 'view', recordType }, facts);
        if (checked.kind === 'refused') throw new SearchRefused(checked.refusal);
        checked.each.forEach((each, at) => {
          if (each.kind !== 'allowed') shown[at] = false;
        });
      }
      return shown;
    },
    cost: async (facts: readonly RecordFacts[]) => {
      const checked = await access.authoriseEach(
        context,
        {
          actorId,
          action: 'view',
          recordType: STOCK_RECEIPT_ORIGIN_TYPE,
          fieldClasses: [{ fieldClass: 'cost', use: 'view' }],
        },
        facts,
      );
      if (checked.kind === 'refused') return facts.map(() => false);
      return checked.each.map((each) => each.kind === 'allowed');
    },
  };
}
