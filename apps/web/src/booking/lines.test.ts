import { describe, expect, it } from 'vitest';
import { cellKey, draftLineOf, gridLines, inputOf, lineProblems, splitList } from './lines';

// S2-F01-T03: the size-colour grid and the lines of the booking form (goods-in 3.1; PRD-BKG-001, PRD-MER-005;
// DEC-130). Every code, colour, size and price here is SYNTHETIC.

describe('the size-colour grid (goods-in 3.1; PRD-BKG-001)', () => {
  it('PRD-BKG-001 makes one line per cell with a quantity, colours down and sizes across, at the style’s cost and MRP', () => {
    const lines = gridLines({
      styleCode: ' SYN-ST-1 ',
      cost: '500',
      mrp: '999',
      colours: ['SYNTHETIC NAVY', 'SYNTHETIC RED'],
      sizes: ['S', 'M'],
      cells: {
        [cellKey('SYNTHETIC NAVY', 'S')]: '10',
        [cellKey('SYNTHETIC NAVY', 'M')]: ' ',
        [cellKey('SYNTHETIC RED', 'M')]: '4',
      },
    });
    expect(lines).toEqual([
      {
        styleCode: 'SYN-ST-1',
        colour: 'SYNTHETIC NAVY',
        size: 'S',
        quantity: '10',
        cost: '500',
        mrp: '999',
        deliveryDate: '',
      },
      {
        styleCode: 'SYN-ST-1',
        colour: 'SYNTHETIC RED',
        size: 'M',
        quantity: '4',
        cost: '500',
        mrp: '999',
        deliveryDate: '',
      },
    ]);
  });

  it('reads colours and sizes as written, separated by commas, each once', () => {
    expect(splitList(' S , M,, m ,S ')).toEqual(['S', 'M', 'm']);
    expect(splitList(' ')).toEqual([]);
  });
});

describe('a line (goods-in 3.1; DEC-130)', () => {
  const typed = {
    styleCode: 'SYN-ST-2',
    colour: '',
    size: '',
    quantity: '5',
    cost: '1,250.50',
    mrp: '2,499',
    deliveryDate: '',
  };

  it('PRD-MER-005 a style-level line keeps no colour and no size, never a default; amounts in whole paise', () => {
    expect(draftLineOf(typed)).toEqual({
      styleCode: 'SYN-ST-2',
      colour: null,
      size: null,
      quantity: 5,
      indicativeCost: 125_050,
      mrp: 249_900,
      deliveryDate: null,
    });
  });

  it('names each field that is not a line the route takes, and makes no line of it', () => {
    const wrong = { ...typed, styleCode: ' ', quantity: '0', cost: '12.345', mrp: 'abc' };
    expect(lineProblems(wrong)).toEqual({ styleCode: true, quantity: true, cost: true, mrp: true });
    expect(draftLineOf(wrong)).toBeUndefined();
  });

  it('a saved line is typed back as the same paise', () => {
    const saved = {
      id: '01900000-0000-7000-8000-000000000001',
      lineNumber: 1,
      styleCode: 'SYN-ST-3',
      colour: 'SYNTHETIC TEAL',
      size: null,
      quantity: 2,
      indicativeCost: 1_23_456_78,
      mrp: 99,
      deliveryDate: '2026-11-01',
    };
    const input = inputOf(saved as Parameters<typeof inputOf>[0]);
    expect(input).toMatchObject({ cost: '1,23,456.78', mrp: '0.99', size: '' });
    expect(draftLineOf(input)).toMatchObject({
      indicativeCost: 1_23_456_78,
      mrp: 99,
      size: null,
      colour: 'SYNTHETIC TEAL',
    });
  });
});
