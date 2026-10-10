import type { AttributeValue, ProposedSku, ProposedStyle } from '@apparel-os/schemas';

// Product proposals and SKU identity as `merchandise` stores them (structure-and-masters 4.1, 4.2, 6.2; S1-F03-T02).

/**
 * A product proposal as stored, the shape `product-proposal/1`: the new style or the existing style's identifier, and
 * its SKUs, exactly as proposed. Nothing in it is filled from a guess (PRD-IMP-009).
 */
export interface StoredProposal {
  readonly shape: 'product-proposal/1';
  readonly style?: ProposedStyle;
  readonly styleId?: string;
  readonly skus: readonly ProposedSku[];
}

/** One identity attribute's value on a SKU: a vocabulary value, text, or neither while Unknown (4.1; 2.4). */
export interface IdentityValue {
  readonly attributeId: string;
  readonly valueId?: string;
  readonly text?: string;
}

/**
 * A SKU's identity as its rows keep it (4.1): every identity attribute of its category in force when the SKU is made,
 * in identifier order, with the vocabulary value or text given, or Unknown (named by its attribute alone).
 */
export function identityOf(identityAttributeIds: readonly string[], given: readonly AttributeValue[]): IdentityValue[] {
  const values = new Map(given.map((each) => [each.attributeId.toLowerCase(), each]));
  return [...new Set(identityAttributeIds.map((id) => id.toLowerCase()))]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((attributeId) => {
      const value = values.get(attributeId);
      if (value?.valueId !== undefined) return { attributeId, valueId: value.valueId.toLowerCase() };
      if (value?.text !== undefined) return { attributeId, text: value.text };
      return { attributeId };
    });
}

/**
 * The canonical key of an identity (4.1 as built): each attribute in identifier order, then `=v` and the vocabulary
 * value's identifier, `=t`, the text's length in characters, `:` and the text, or `=?` while Unknown, joined by commas.
 * `merchandise.check_sku_identity_key` (migration 0047) rebuilds it from the SKU's rows at commit and refuses any
 * difference, so the unique constraint `sku_identity_once` holds one SKU per style, size and identity, an Unknown
 * counting as one value (PRD-MER-005).
 */
export function identityKey(identity: readonly IdentityValue[]): string {
  return [...identity]
    .sort((a, b) => (a.attributeId < b.attributeId ? -1 : a.attributeId > b.attributeId ? 1 : 0))
    .map((each) => {
      if (each.valueId !== undefined) return `${each.attributeId}=v${each.valueId}`;
      if (each.text !== undefined) return `${each.attributeId}=t${String(Array.from(each.text).length)}:${each.text}`;
      return `${each.attributeId}=?`;
    })
    .join(',');
}
