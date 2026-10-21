import type { CodeScope, ExternalCodeKind } from '@apparel-os/schemas';

// External codes as `merchandise` keeps them (structure-and-masters 4.3 as built with S2-F04-T01).

/**
 * The kind and scope of a mapping that may name another SKU than another mapping of its code: a brand's barcode, a
 * supplier barcode recorded under a brand, whose tags may repeat it across products (PRD-MER-007; RR-554, decided by the
 * product owner, 21 Oct 2026). The exclusion constraint of the migration `repeats_only_under_a_brand` names the same
 * kind and scope. **Design choice:** a brand's barcode is a code of the kind supplier barcode (S2-F04-T01).
 */
export const REPEATABLE_KIND: ExternalCodeKind = 'supplier-barcode';
export const REPEATABLE_SCOPE: CodeScope['kind'] = 'brand';

/** Whether a mapping of this kind in this scope may repeat across products; every other names one target (4.3). */
export const mayRepeat = (kind: ExternalCodeKind, scopeKind: CodeScope['kind']): boolean =>
  kind === REPEATABLE_KIND && scopeKind === REPEATABLE_SCOPE;
