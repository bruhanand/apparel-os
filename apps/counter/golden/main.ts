// The golden-case test page (offline-counter.md 5.5; shared-calculations 12.2; PRD-ACP-018). The same runner the server
// suite uses, given only the selling entry point as the counter bundles it, so the costing cases come back as
// server-only. It sits outside src/ because application code never imports a test (code-house-rules 11.2); this page
// is test plumbing and the deployed app service does not serve it (5.2).
import * as selling from '@apparel-os/calculations';
import { type CaseOutcome, type GoldenCase, runCase } from '../../../packages/calculations/test/golden-runner.ts';

declare global {
  interface Window {
    /** Runs one case; `allCases` is every case by ID, for the pointers of 12.1. */
    runGoldenCase: (goldenCase: GoldenCase, allCases: Record<string, GoldenCase>) => CaseOutcome;
  }
}

window.runGoldenCase = (goldenCase, allCases) => runCase(goldenCase, new Map(Object.entries(allCases)), { selling });
