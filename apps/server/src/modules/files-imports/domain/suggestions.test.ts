import { describe, expect, it } from 'vitest';
import { closeSuggestions, optionSuggestions } from './suggestions.js';

// The suggestions every import handler offers (imports-and-opening-data 5, 13.2; PRD-IMP-009). SYNTHETIC values.

describe('suggestions', () => {
  it('PRD-IMP-009 offers the exact option alone, case ignored', () => {
    expect(optionSuggestions(['piece', 'pair'], 'PIECE')).toEqual([{ kind: 'exact', value: 'piece' }]);
  });

  it('PRD-IMP-009 offers close options when none is exact, and nothing for an empty value', () => {
    expect(optionSuggestions(['piece', 'pair', 'set'], 'pie')).toEqual([{ kind: 'close', value: 'piece' }]);
    expect(optionSuggestions(['piece'], '')).toEqual([]);
  });

  it('13.2 keeps the best five close matches, each value once', () => {
    const matches = ['A', 'B', 'A', 'C', 'D', 'E', 'F'].map((value) => ({ value, label: `SYNTHETIC ${value}` }));
    expect(closeSuggestions(matches).map((each) => each.value)).toEqual(['A', 'B', 'C', 'D', 'E']);
  });
});
