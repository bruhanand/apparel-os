import type { Composition } from '../../../kernel/index.js';
import { ITEM_KINDS, type ImportKind, type LedgerItemKind, type LedgerSource } from './domain/request.js';
import { refusalOf } from './domain/request.js';
import type { CommandRefusal } from '../../../kernel/index.js';

// Registered callers (stock-ledger 13.2; DEC-112, H2): the ledger accepts requests only from the module and record
// types registered at start, with the item kinds and import kinds each may send. A registration is fixed once the
// application has started. Registration keeps wrong or synthetic documents out of the ledger; it is not an access
// control (13.2 "What the guard is").

/** One record type a caller posts from, with the item kinds and import kinds it may send (13.2). */
export interface RegisteredRecordType {
  readonly recordType: string;
  readonly itemKinds: readonly LedgerItemKind[];
  readonly importKinds: readonly Exclude<ImportKind, 'historical-reference'>[];
}

/** A caller's registration: its module (or part), its record types and whether it is synthetic (13.2). */
export interface CallerRegistration {
  readonly module: string;
  readonly recordTypes: readonly RegisteredRecordType[];
  /** A synthetic caller, accepted only in a test composition (13.2; DEC-112, H2 and H5). */
  readonly synthetic: boolean;
}

/**
 * The registry, built once at start from every registration (13.2). It refuses to start with a synthetic registration
 * outside a test composition, a second registration of one module and record type, an item kind the ledger does not
 * take, or historical reference among the import kinds (PRD-LIF-014). In stage 1 the production composition
 * registers no caller, so no stock posts outside tests (2.3 "Stage live").
 */
export class CallerRegistry {
  private readonly byRecordType = new Map<string, RegisteredRecordType>();

  constructor(registrations: readonly CallerRegistration[], composition: Composition) {
    for (const registration of registrations) {
      if (registration.synthetic && composition.kind !== 'test') {
        throw new Error(`Synthetic stock caller ${registration.module} outside a test composition`);
      }
      for (const recordType of registration.recordTypes) {
        const key = `${registration.module} ${recordType.recordType}`;
        if (this.byRecordType.has(key)) throw new Error(`Stock caller ${key} is registered twice`);
        for (const kind of recordType.itemKinds) {
          if (!ITEM_KINDS.includes(kind)) throw new Error(`Stock caller ${key}: no item kind ${kind}`);
        }
        if ((recordType.importKinds as readonly string[]).includes('historical-reference')) {
          throw new Error(`Stock caller ${key} carries historical reference (PRD-LIF-014)`);
        }
        this.byRecordType.set(key, recordType);
      }
    }
  }

  /** Whether any caller is registered: none in the stage 1 production composition (13.2). */
  get isEmpty(): boolean {
    return this.byRecordType.size === 0;
  }

  /**
   * Plan's first check (13.2): the source's module and record type are registered, its import kind is not historical
   * reference and is one the registration lists, and every item kind is listed. Answers the refusal, or undefined.
   */
  check(
    source: LedgerSource,
    itemKinds: readonly { kind: LedgerItemKind; lineId: string }[],
  ): CommandRefusal | undefined {
    if (source.importKind === 'historical-reference') {
      return refusalOf('historical-reference-source', undefined, [{ kind: 'source', recordType: source.recordType }]);
    }
    const registered = this.byRecordType.get(`${source.module} ${source.recordType}`);
    if (registered === undefined || !(registered.importKinds as readonly string[]).includes(source.importKind)) {
      return refusalOf('caller-not-registered', undefined, [
        { kind: 'source', module: source.module, recordType: source.recordType, importKind: source.importKind },
      ]);
    }
    const unlisted = itemKinds.find((item) => !registered.itemKinds.includes(item.kind));
    if (unlisted !== undefined) {
      return refusalOf('item-not-registered', unlisted.lineId, [{ kind: 'item', itemKind: unlisted.kind }]);
    }
    return undefined;
  }
}
