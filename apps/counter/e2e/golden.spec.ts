// The counter run of the shared golden cases (shared-calculations 12.2; offline-counter.md 5.5; PRD-ACP-018,
// PRD-SEC-016; S1-F11-AT06, S1-F11-AT11). Node reads every case file of packages/calculations/golden and passes each
// to the test page, which runs it through the selling entry point as the counter bundles it. The page compares the
// whole result, versions included, with `expected` or `refusal`; a failed outcome fails the test. A pending case is
// reported as skipped with its reason, and a costing case as server-only: neither is ever counted as passed.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

interface Case {
  id: string;
  function: string;
  pending?: string;
}
type Outcome =
  | { status: 'passed' }
  | { status: 'pending'; reason: string }
  | { status: 'server-only' }
  | { status: 'failed'; run: number; expected: string; actual: string };

const goldenFolder = join(import.meta.dirname, '..', '..', '..', 'packages', 'calculations', 'golden');
const files = readdirSync(goldenFolder)
  .filter((name) => name.endsWith('.json'))
  .sort();
const cases = Object.fromEntries(
  files.map((name) => {
    const value = JSON.parse(readFileSync(join(goldenFolder, name), 'utf8')) as Case;
    return [value.id, value] as const;
  }),
);
// Independent of the runner: which functions the counter never gets (shared-calculations 2.3, 12.2).
const COSTING = ['costLine', 'ticketMargin'];

test.describe.configure({ mode: 'serial' });

let page: Page;
const outcomes = new Map<string, Outcome>();

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.goto('/counter/golden/');
  await page.waitForFunction(() => typeof window.runGoldenCase === 'function');
});
test.afterAll(async () => {
  await page.close();
});

test('PRD-ACP-018 the page runs a case file for every file of golden/', () => {
  expect(files.length).toBeGreaterThan(0);
  expect(Object.keys(cases).length).toBe(files.length);
});

for (const goldenCase of Object.values(cases)) {
  test(`PRD-ACP-018 ${goldenCase.id} on the counter`, async () => {
    const outcome = await page.evaluate(([one, all]) => window.runGoldenCase(one as never, all as never) as Outcome, [
      goldenCase,
      cases,
    ] as const);
    outcomes.set(goldenCase.id, outcome);
    if (outcome.status === 'failed') {
      expect(JSON.parse(outcome.actual), `run ${String(outcome.run)}`).toEqual(JSON.parse(outcome.expected));
    }
    if (goldenCase.pending !== undefined) {
      expect(outcome).toEqual({ status: 'pending', reason: goldenCase.pending });
      test.skip(true, `pending: ${goldenCase.pending}`);
    }
    if (COSTING.includes(goldenCase.function)) {
      expect(outcome).toEqual({ status: 'server-only' });
      test.skip(true, 'server-only: the counter never holds the costing entry point');
    }
    expect(outcome).toEqual({ status: 'passed' });
  });
}

test('PRD-ACP-018 the outcomes number as many as the case files', () => {
  expect(outcomes.size).toBe(files.length);
  expect([...outcomes.values()].filter((o) => o.status === 'failed')).toEqual([]);
  expect([...outcomes.values()].filter((o) => o.status === 'passed').length).toBeGreaterThan(0);
});

test('PRD-OFF-004 the counter bundle holds no module of the costing entry point', () => {
  const report = JSON.parse(
    readFileSync(join(import.meta.dirname, '..', '.build-report', 'bundled-modules.json'), 'utf8'),
  ) as { chunks: { name: string; modules: string[] }[] };
  const modules = report.chunks.flatMap((chunk) => chunk.modules);
  // The list is real: it holds the selling entry point and the runner the page bundles.
  expect(modules.some((id) => id.endsWith('/calculations/dist/index.js'))).toBe(true);
  expect(modules.some((id) => id.endsWith('/calculations/test/golden-runner.ts'))).toBe(true);
  expect(modules.filter((id) => id.includes('/costing/'))).toEqual([]);
});
