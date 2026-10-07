// The counter run of the shared golden cases (shared-calculations 12.2; offline-counter.md 5.5; PRD-ACP-018,
// PRD-SEC-016; S1-F11-AT06, S1-F11-AT11). Node reads every case file of packages/calculations/golden and passes each
// to the test page, which runs it through the selling entry point as the counter bundles it. The page compares the
// whole result, versions included, with `expected` or `refusal`; a failed outcome fails the test. A pending case is
// reported as skipped with its reason, and a costing case as server-only: neither is ever counted as passed.
// Each case is its own test, so a failing or throwing case never hides the cases after it.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { COSTING, type CaseOutcome, type GoldenCase } from '../../../packages/calculations/test/golden-runner.ts';
import { isCostingModule } from '../costing-module.ts';

type PageOutcome = CaseOutcome | { status: 'threw'; message: string };

const goldenFolder = join(import.meta.dirname, '..', '..', '..', 'packages', 'calculations', 'golden');
const files = readdirSync(goldenFolder)
  .filter((name) => name.endsWith('.json'))
  .sort();
const cases: Record<string, GoldenCase> = Object.fromEntries(
  files.map((name) => {
    const value = JSON.parse(readFileSync(join(goldenFolder, name), 'utf8')) as GoldenCase;
    return [value.id, value] as const;
  }),
);

let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.goto('/counter/golden/');
  await page.waitForFunction(() => typeof window.runGoldenCase === 'function');
});
test.afterAll(async () => {
  await page.close();
});

/** Runs one case on the page; a case that throws there is reported as a case-level outcome, not a crash. */
async function runOnPage(goldenCase: GoldenCase): Promise<PageOutcome> {
  return page.evaluate(
    ([one, all]) => {
      try {
        return window.runGoldenCase(one, all);
      } catch (error) {
        return { status: 'threw', message: error instanceof Error ? error.message : String(error) };
      }
    },
    [goldenCase, cases] as const,
  );
}

function expectNotFailed(id: string, outcome: PageOutcome): void {
  if (outcome.status === 'threw') expect.soft(outcome.message, `${id} threw on the page`).toBe('');
  if (outcome.status === 'failed') {
    expect(JSON.parse(outcome.actual), `${id} run ${String(outcome.run)}`).toEqual(JSON.parse(outcome.expected));
  }
}

test('PRD-ACP-018 the page runs a case file for every file of golden/', () => {
  expect(files.length).toBeGreaterThan(0);
  expect(Object.keys(cases).length).toBe(files.length);
});

for (const goldenCase of Object.values(cases)) {
  test(`PRD-ACP-018 ${goldenCase.id} on the counter`, async () => {
    const outcome = await runOnPage(goldenCase);
    expectNotFailed(goldenCase.id, outcome);
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

test('PRD-ACP-018 every case file gets an outcome, and at least one passes', async () => {
  const outcomes = await Promise.all(Object.values(cases).map(runOnPage));
  expect(outcomes.length).toBe(files.length);
  expect(outcomes.filter((o) => o.status === 'failed' || o.status === 'threw')).toEqual([]);
  expect(outcomes.filter((o) => o.status === 'passed').length).toBeGreaterThan(0);
});

// S1-F11-AT06 failure path: a deliberately wrong case (SYNTHETIC: a real case with its expected result broken) is
// reported failed by the page. It is a copy fed to the page; no file changes and the real run is untouched.
test('S1-F11-AT06 a wrong expected result is reported as failed, not passed', async () => {
  const source = Object.values(cases).find(
    (c) => c.pending === undefined && !COSTING.includes(c.function) && c.runs === undefined && 'expected' in c,
  );
  expect(source, 'a single-run case with an expected result exists').toBeDefined();
  const wrong = { ...source, id: 'SYNTHETIC-wrong-expected', expected: { wrong: 'on purpose' } } as GoldenCase;
  const outcome = await runOnPage(wrong);
  expect(outcome.status).toBe('failed');
});

test('PRD-OFF-004 the counter bundle holds no module of the costing entry point', () => {
  const report = JSON.parse(
    readFileSync(join(import.meta.dirname, '..', '.build-report', 'bundled-modules.json'), 'utf8'),
  ) as { costingFolder: string; chunks: { name: string; modules: string[] }[] };
  const modules = report.chunks.flatMap((chunk) => chunk.modules);
  // The list is real: it names the costing folder it checked and holds the runner the page bundles.
  expect(report.costingFolder).not.toBe('');
  expect(modules.some((id) => id.endsWith('/calculations/test/golden-runner.ts'))).toBe(true);
  expect(modules.filter((id) => isCostingModule(id, report.costingFolder))).toEqual([]);
});
