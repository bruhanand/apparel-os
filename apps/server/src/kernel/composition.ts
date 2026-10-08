/**
 * How the application was composed (stock-ledger 13.2, 15.3; DEC-112, H2 and H4): `production` by the application's
 * own modules, the only value code under `src/` ever passes, or `test` by the test application factories in
 * `apps/server/test/support/`, which no code under `src/` can import (code-house-rules 11.2). A registry that accepts
 * synthetic entries, such as the ledger's callers and access's approval rules, accepts them only in a test
 * composition, and a synthetic entry in a production composition fails the start. A unit test checks that no file
 * under `src/` names the test composition.
 */
export type Composition = 'production' | 'test';
