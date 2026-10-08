declare const composed: unique symbol;

/**
 * How the application was composed (stock-ledger 13.2, 15.3; DEC-112, H2 and H4). A registry that accepts synthetic
 * entries, such as the ledger's callers and access's approval rules, accepts them only in a test composition, and a
 * synthetic entry in a production composition fails the start.
 *
 * The value is branded, so it cannot be written as a plain object: code under `src/` has only
 * `PRODUCTION_COMPOSITION`. The test composition is made by the test application factories in
 * `apps/server/test/support/composition.ts`, which no code under `src/` can import, and a lint rule refuses a cast to
 * `Composition` anywhere under `src/` but here (code-house-rules 11.2; eslint.config.mjs).
 */
export interface Composition {
  readonly kind: 'production' | 'test';
  readonly [composed]: true;
}

/** The application's own composition, the only one code under `src/` can name. */
export const PRODUCTION_COMPOSITION = Object.freeze({ kind: 'production' }) as Composition;
