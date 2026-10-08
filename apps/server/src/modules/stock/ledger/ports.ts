import { CommandDefect, type TransactionContext } from '../../../kernel/index.js';

// The read contracts Plan uses (stock-ledger 13.1), as the ledger needs them from `organisation` and `merchandise`
// (module-map 4.11, 4.12; structure-and-masters 3.8, 4.7). Those modules are not built yet (S1-F02, S1-F03), so the
// ledger declares the shape it reads; development tests give stand-ins built to it, and acceptance runs through the
// real modules (S1-F10-T04; product owner, 6 Oct 2026). Each answer is as of the request's business date.

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

/** The production composition's reads until `organisation` and `merchandise` provide them (S1-F02, S1-F03). */
export const placesNotBuilt: LedgerPlaces = {
  unitAt: () => Promise.reject(new CommandDefect('organisation has no structure read yet (S1-F02)')),
  locationOf: () => Promise.reject(new CommandDefect('organisation has no structure read yet (S1-F02)')),
};

export const skusNotBuilt: LedgerSkus = {
  skuAt: () => Promise.reject(new CommandDefect('merchandise has no SKU read yet (S1-F03)')),
};
