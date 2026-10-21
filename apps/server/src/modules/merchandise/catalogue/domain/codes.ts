import type { ExternalCodeKind } from '@apparel-os/schemas';

// External codes as `merchandise` keeps them (structure-and-masters 4.3 as built with S2-F04-T01).

/**
 * The kind of code that may name more than one SKU: a brand's barcode, which its tags carry as the supplier barcode and
 * may repeat across products (PRD-MER-007 as reworded by DEC-135). The exclusion constraint of the migration
 * `repeated_brand_barcodes` names the same kind. **Design choice.**
 */
export const REPEATABLE_KIND: ExternalCodeKind = 'supplier-barcode';
