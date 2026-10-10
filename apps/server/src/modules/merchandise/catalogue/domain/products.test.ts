import { describe, expect, it } from 'vitest';
import { identityKey, identityOf } from './products.js';

// The canonical key of a SKU's identity (structure-and-masters 4.1 as built; PRD-MER-005). The database's
// merchandise.check_sku_identity_key builds the same key from the SKU's rows at commit (migration 0047). SYNTHETIC ids.

const COLOUR = '01900000-0000-7000-8000-00000000000a';
const FIT = '01900000-0000-7000-8000-00000000000b';
const RED = '01900000-0000-7000-8000-0000000000ff';

describe('SKU identity key', () => {
  it('PRD-MER-005 names every identity attribute in identifier order, an Unknown one as unknown', () => {
    expect(identityKey(identityOf([FIT, COLOUR], [{ attributeId: COLOUR, valueId: RED }]))).toBe(
      `${COLOUR}=v${RED},${FIT}=?`,
    );
  });

  it('keeps any text unambiguous by its length in characters', () => {
    const tricky = identityKey(identityOf([COLOUR, FIT], [{ attributeId: FIT, text: 'a,b=?é' }]));
    expect(tricky).toBe(`${COLOUR}=?,${FIT}=t6:a,b=?é`);
    expect(identityKey(identityOf([FIT], [{ attributeId: FIT, text: '😀' }]))).toBe(`${FIT}=t1:😀`);
  });

  it('is empty for a category with no identity attributes', () => {
    expect(identityKey(identityOf([], []))).toBe('');
  });
});
