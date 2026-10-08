import type { Composition } from '../../src/kernel/index.js';

// The test composition (stock-ledger 13.2, 15.3; DEC-112, H2 and H4): the one value under which the ledger accepts a
// synthetic caller and access a synthetic approval rule. It lives here, in a test folder no code under `src/` can import
// (code-house-rules 11.2), and only here may a value be cast to `Composition` (eslint.config.mjs).

export const TEST_COMPOSITION = Object.freeze({ kind: 'test' }) as unknown as Composition;
