import { describe, it } from 'vitest';
import { runIsolationProbe } from './support/isolation-probe.js';

// S0-T06: this file and fixtures-isolation-a.int.test.ts run at the same time, each in its own copies of the
// templates, and wait for each other (support/isolation-probe.ts; code-house-rules 11.3).
describe('test files at the same time (code-house-rules 11.3)', () => {
  it('code-house-rules 11.3 file b sees only the rows of its own directory and Organisation databases', async () => {
    await runIsolationProbe('b');
  }, 300_000);
});
