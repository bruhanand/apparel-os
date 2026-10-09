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

/**
 * A SKU's identity as its row keeps it (4.1): each identity attribute of its category, in force when the SKU is made,
 * to the vocabulary value or text given, or null while Unknown; PostgreSQL's jsonb equality makes two SKUs with the same
 * values one, an Unknown counting as one value (`sku_identity_once`).
 */
export function identityOf(
  identityAttributeIds: readonly string[],
  given: readonly AttributeValue[],
): Record<string, string | null> {
  const values = new Map(given.map((each) => [each.attributeId, each.valueId ?? each.text ?? null]));
  return Object.fromEntries(identityAttributeIds.map((id) => [id, values.get(id) ?? null]));
}

/** The attribute values of an identity as a record shows them: an Unknown one names its attribute alone. */
export function identityView(
  identity: Readonly<Record<string, string | null>>,
  listAttributes: ReadonlySet<string>,
): { attributeId: string; valueId?: string; text?: string }[] {
  return Object.entries(identity)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([attributeId, value]) => {
      if (value === null) return { attributeId };
      return listAttributes.has(attributeId) ? { attributeId, valueId: value } : { attributeId, text: value };
    });
}
