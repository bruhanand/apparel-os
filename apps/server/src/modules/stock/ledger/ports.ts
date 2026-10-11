import { CommandDefect, type TransactionContext } from '../../../kernel/index.js';
import { skuOn } from '../../merchandise/catalogue/index.js';
import { locationPlace, mappingOn } from '../../organisation/index.js';
import type { BooksInterface } from '../../finance/books/index.js';

// The read contracts Plan uses (stock-ledger 13.1), as the ledger needs them from `organisation` and `merchandise`
// (module-map 4.11, 4.12; structure-and-masters 3.8, 4.7). The ledger declares the shape it reads; the production
// composition wires it to the real modules (RR-436), development tests may give stand-ins built to it, and acceptance
// runs through the real modules (S1-F10-T04; product owner, 6 Oct 2026). Each answer is as of the request's business
// date.

/** A business unit at a Site and its mapping in force (structure-and-masters 3.3, 3.4; PRD-ORG-005). */
export interface UnitFacts {
  readonly siteId: string;
  /** The Store the unit belongs to; none for a unit that belongs to no Store, such as a warehouse (SL-25 (b)). */
  readonly storeId: string | null;
  readonly businessUnitId: string;
  readonly legalEntityId: string;
  readonly bookId: string;
  readonly taxRegistrationId: string;
  /** The mapping version the ledger stores on what it writes (PRD-MOD-010). */
  readonly mappingVersionId: string;
}

/** A SKU as of a date at a Site (structure-and-masters 4.4 to 4.7; PRD-MER-010, PRD-MER-011, PRD-MER-014). */
export interface SkuFacts {
  readonly skuId: string;
  readonly versionId: string;
  readonly brandId: string;
  readonly stockUnit: 'piece' | 'pair' | 'pack';
  readonly pieceTracked: boolean;
  readonly batchTracked: boolean;
}

export interface LedgerPlaces {
  /** The unit at the Site with its mapping in force on the date, or undefined when there is none (13.8). */
  unitAt(
    context: TransactionContext,
    place: { readonly siteId: string; readonly businessUnitId: string },
    businessDate: string,
  ): Promise<UnitFacts | undefined>;
  /** The one Site and business unit a location belongs to (structure-and-masters 3.5), or undefined. */
  locationOf(
    context: TransactionContext,
    locationId: string,
  ): Promise<{ readonly siteId: string; readonly businessUnitId: string } | undefined>;
}

export interface LedgerSkus {
  /** The SKU's facts in force at the Site on the date, or undefined. */
  skuAt(
    context: TransactionContext,
    skuId: string,
    siteId: string,
    businessDate: string,
  ): Promise<SkuFacts | undefined>;
}

/**
 * The place read wired to `organisation` (structure-and-masters 3.5, 3.8; the organisation half of RR-436;
 * S1-F10-T04): a unit at a Site is its mapping in force on the date, Read a unit's mapping as of a date, with the
 * mapping version the ledger stores (PRD-ACP-013, PRD-MOD-010); a unit at another Site, or with no mapping in force, is
 * none. A location is the Site and unit it was made at. The mapping's verification is not asked: the ledger takes no
 * statutory action (POL-10.08 is for the caller that does).
 */
export const organisationPlaces: LedgerPlaces = {
  async unitAt(context, place, businessDate) {
    const mapping = await mappingOn(context, place.businessUnitId, businessDate);
    if (mapping?.siteId !== place.siteId) return undefined;
    return {
      siteId: mapping.siteId,
      storeId: mapping.storeId,
      businessUnitId: place.businessUnitId,
      legalEntityId: mapping.legalEntityId,
      bookId: mapping.accountingBookId,
      taxRegistrationId: mapping.taxRegistrationId,
      mappingVersionId: mapping.mappingVersionId,
    };
  },
  locationOf: (context, locationId) => locationPlace(context, locationId),
};

/**
 * The SKU read wired to `merchandise` · catalogue's Read a SKU as of a date (structure-and-masters 4.7; the merchandise
 * half of RR-436; S1-F03-T02): the version in force, its brand, stock unit, and whether piece rules and batch tracking
 * apply at the Site. A SKU with no version in force, or whose category has no tracking profile in force, is undefined:
 * its tracking is Unknown, and the ledger never defaults it.
 */
export const catalogueSkus: LedgerSkus = {
  async skuAt(context, skuId, siteId, businessDate) {
    const read = await skuOn(context, skuId, siteId, businessDate);
    if ('refusal' in read || read.sku.tracking === undefined) return undefined;
    const sku = read.sku;
    const tracking = read.sku.tracking;
    return {
      skuId,
      versionId: sku.versionId,
      brandId: sku.brandId,
      stockUnit: sku.stockUnit,
      pieceTracked: tracking.pieceTracked,
      batchTracked: tracking.batchExpiryRequired,
    };
  },
};

/**
 * What the ledger calls in `finance` · books (stock-ledger 7.11, 13.1; books-and-posting 2.2, 8, 9.1): the book's cost
 * setting a new pool takes, read at Plan; Check postable before any lock; Hold periods at step 7; and Post, inside
 * Write, in the movement's transaction (PRD-MOD-013, DEC-087). The ledger never writes a journal itself.
 */
export type LedgerBooks = Pick<BooksInterface, 'costSettingOn' | 'checkPostable' | 'holdPeriods' | 'post'>;

const notComposed = () => Promise.reject(new CommandDefect('This composition gives the ledger no finance books'));

/**
 * For a composition whose ledger posts no valued item, such as the quantity tests of S1-F10-T02. With no books no book
 * has a cost setting, so a reservation's value is Unknown (13.10 "Value for approval"); anything that would post is a
 * defect.
 */
export const booksNotComposed: LedgerBooks = {
  costSettingOn: () => Promise.resolve({ kind: 'not-set' }),
  checkPostable: notComposed,
  holdPeriods: notComposed,
  post: notComposed,
};
