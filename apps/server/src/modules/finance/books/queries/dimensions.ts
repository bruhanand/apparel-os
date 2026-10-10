import type { TransactionContext } from '../../../../kernel/index.js';
import { mappingOn } from '../../../organisation/index.js';
import type { Outcome } from '../commands/lines.js';

// The dimensions of a journal line (books-and-posting 2.1, 3.2, 8.1; POL-09.11, PRD-ORG-005, PRD-ORG-006, PRD-LED-002,
// PRD-ACP-013; S1-F09-T01): the business unit's book, found through its mapping on the accounting date from
// `organisation`, keeping the mapping version; the Store from the unit, none for a warehouse or office unit; the brand
// the source names. Post (S1-F09-T02) uses this lookup and refuses a missing required dimension.

export interface LineDimensions {
  readonly businessUnitId: string;
  /** The book the unit's mapping names on the date: books are reached through the unit, never the Site (2.1). */
  readonly bookId: string;
  readonly legalEntityId: string;
  /** The mapping version read, which the journal keeps (PRD-ACP-013). */
  readonly mappingVersionId: string;
  /** The Store the unit belongs to; none for a warehouse or office unit (PRD-ORG-006). */
  readonly storeId: string | null;
  /** The brand the source names, or none. */
  readonly brandId: string | null;
}

/** The dimensions of a line for a unit on a date, or the refusal when the unit has no mapping in force then. */
export async function dimensionsOn(
  context: TransactionContext,
  source: { readonly businessUnitId: string; readonly brandId: string | null },
  date: string,
): Promise<Outcome<LineDimensions>> {
  const mapping = await mappingOn(context, source.businessUnitId, date);
  if (mapping === undefined) {
    return {
      kind: 'refusal',
      refusal: {
        kind: 'not-found',
        code: 'organisation.no-mapping-in-force',
        missing: [
          { kind: 'record', recordType: 'organisation.business_unit_mapping', recordId: source.businessUnitId },
        ],
      },
    };
  }
  return {
    kind: 'success',
    answer: {
      businessUnitId: source.businessUnitId,
      bookId: mapping.accountingBookId,
      legalEntityId: mapping.legalEntityId,
      mappingVersionId: mapping.mappingVersionId,
      storeId: mapping.storeId,
      brandId: source.brandId,
    },
  };
}
