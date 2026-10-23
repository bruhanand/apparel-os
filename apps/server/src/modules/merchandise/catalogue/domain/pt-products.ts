import type { CommandRefusal } from '../../../../kernel/index.js';
import type { AuditActor } from '../../../audit/index.js';
import type { AttributeValue, MissingItem } from '@apparel-os/schemas';
import type { IdentityValue } from './products.js';

// The new products a PT approval confirms, and the barcodes of its rows it records: the shapes the check, the
// confirmation and the mapping share, in their own files (queries/pt-products.ts, commands/confirm-pt-products.ts,
// commands/map-pt-barcodes.ts, commands/pt-barcode-keys.ts; code review 7). Pure.
//
// The new products a PT approval confirms, and the barcodes of its rows it records (goods-in 5.5, 6.3 step 2, 6.6;
// structure-and-masters 4.2, 4.3 "As built with S2-F06-T01"; PRD-MER-007, PRD-MER-013; DEC-135; S2-F06-T01). The PT
// approver confirms the products the upload proposed with the PT, a different person from its uploader (DM-5, DEC-105),
// so each is a product proposal Confirmed in the approval's transaction, the uploader its proposer and the approver its
// decider, kept with the PT file's batch, document and staged rows (imports-and-opening-data 5), with no request of its
// own: the PT's approval decides it. By the rule the product owner decided on 22 Oct 2026 (RR-585), each new SKU takes a
// code drawn from the SKU code series (numbering-and-audit 2), the stock unit Piece and the purpose Merchandise; they
// change later only through the product master. A new style takes the style code, the Sub category, the HSN and the
// season, gender, type, item and fit of the first row proposing it, in the file's order; a SKU takes the row's colour
// as its identity value of the colour list, and its size is the row's size code, which must be in its category's size
// set in force, as the upload compares a SKU's size with a row's (goods-in 5.5 "As built"). **Design choice**
// throughout, the rule's own parts excepted. Every row's barcode not yet mapped to its product is recorded under the
// GRN's brand, where only a barcode may repeat (RR-554), so the scan-in resolves it (goods-in 7.2).

/** A new product a PT proposes, with what the PT's rows give it (goods-in 5.5). */
export interface PtProductRequest {
  /** The PT's proposal it is (`merchandise.pt_proposed_sku`). */
  readonly key: string;
  /** The first row proposing it, which a refusal names. */
  readonly rowNumber: number;
  readonly stagedRowIds: readonly string[];
  readonly styleCode: string;
  /** The brand's style of that code, or null for a new style. */
  readonly existingStyleId: string | null;
  readonly brandId: string;
  readonly categoryId: string;
  readonly hsn: string;
  /** The row's values of the style-level lists: season, gender, type, item, fit. */
  readonly styleValueIds: readonly string[];
  readonly colourValueId: string;
  /** The row's size code (goods-in 5.3). */
  readonly size: string;
}

/** A new style a PT approval makes. */
export interface CheckedPtStyle {
  readonly styleId: string;
  readonly versionId: string;
  readonly code: string;
  readonly brandId: string;
  readonly categoryId: string;
  readonly hsn: string;
  readonly attributes: readonly AttributeValue[];
  /** The products of it, the first row's the style's values. */
  readonly keys: readonly string[];
}

/** A new SKU a PT approval makes, its identifiers made now so the stock ledger can name it (stock-ledger 13.19). */
export interface CheckedPtProduct {
  readonly key: string;
  readonly rowNumber: number;
  readonly stagedRowIds: readonly string[];
  readonly styleId: string;
  readonly newStyle: boolean;
  readonly skuId: string;
  readonly skuVersionId: string;
  readonly size: string;
  readonly identity: readonly IdentityValue[];
  readonly identityKey: string;
  /** The SKU as the stock ledger reads one at the GRN's Site on the date (stock-ledger 13.1 Plan, 13.9). */
  readonly facts: {
    readonly skuId: string;
    readonly versionId: string;
    readonly brandId: string;
    readonly stockUnit: 'piece';
    readonly pieceTracked: boolean;
    readonly batchTracked: boolean;
  };
}

export interface CheckedPtProducts {
  readonly styles: readonly CheckedPtStyle[];
  readonly products: readonly CheckedPtProduct[];
}

/** A row named in a refusal by its number in the file (code-house-rules 12.3 "What is missing"). */
export const ptRowItem = (rowNumber: number): MissingItem => ({ kind: 'pt-row', rowNumber: String(rowNumber) });

/** A refusal of the PT's products, of the kind `refused` (code-house-rules 12.3). */
export const ptProductRefusal = (code: string, missing: MissingItem[]): CommandRefusal => ({
  kind: 'refused',
  code,
  missing,
});

/** The stock unit and purpose every new product of a PT takes (RR-585, product owner, 22 Oct 2026). */
export const PT_STOCK_UNIT = 'piece';
export const PT_PURPOSE = 'merchandise';

/**
 * Who confirms: the PT's approver, the approval decision, and who writes it, the approver in the decision's transaction
 * or a posting job's service identity on their behalf, with the assignment relied on (access-and-approvals 9.5, 9.8).
 */
export interface PtConfirmer {
  readonly userId: string;
  readonly approvalDecisionId: string;
  readonly actor: AuditActor;
  readonly roleAssignmentId: string;
}
