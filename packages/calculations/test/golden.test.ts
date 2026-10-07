// The server run of the shared golden cases (shared-calculations 12.2; PRD-ACP-018, PRD-MOD-007, PRD-SEC-016):
// Vitest in Node loads every case file of golden/ and runs it through the package's two entry points, imported by
// package name as the server imports them (built first: this package's turbo.json). A pending case
// is reported as skipped with its reason, never as passed. The counter run of the same files is `apps/counter/e2e/golden.spec.ts`
// (S1-F11-T10).

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as selling from '@apparel-os/calculations';
import * as costing from '@apparel-os/calculations/costing';
import { type GoldenCase, caseShapeProblems, runCase } from './golden-runner.js';

const folder = fileURLToPath(new URL('../golden/', import.meta.url));
const files = readdirSync(folder)
  .filter((name) => name.endsWith('.json'))
  .sort();
const loaded = files.map((name) => ({
  stem: name.replace(/\.json$/, ''),
  value: JSON.parse(readFileSync(join(folder, name), 'utf8')) as unknown,
}));
const cases = new Map(loaded.map(({ stem, value }) => [stem, value as GoldenCase]));
const api = { selling, costing };

describe('golden case files (shared-calculations 12.1)', () => {
  it('PRD-ACP-018 holds every case of 12.4', () => {
    const wanted = [
      ...['01', '02', '03', '04', '05', '06', '07a', '07b', '08', '09', '10', '11', '12', '13', '14'],
      ...[
        '15a',
        '15b',
        '15c',
        '15d',
        '15e',
        '15f',
        '15g',
        '16',
        '16b',
        '17',
        '18a',
        '18b',
        '18c',
        '18d',
        '19a',
        '19b',
        '19c',
      ],
      ...['20a', '20b', '20c', '21', '21b', '22'],
    ].map((n) => `CG-${n}`);
    expect([...cases.keys()].sort()).toEqual(wanted.sort());
  });

  it.each(loaded.map(({ stem, value }) => [stem, value] as const))(
    'PRD-ACP-018 %s follows the format of 12.1',
    (stem, value) => {
      expect(caseShapeProblems(value, stem)).toEqual([]);
    },
  );

  it('PRD-SEC-017 labels every case synthetic and every code in it SYN', () => {
    for (const { stem, value } of loaded) {
      expect((value as GoldenCase).synthetic, stem).toBe(true);
      // Every code-like value (upper-case words joined by hyphens) carries the SYN marker (code-house-rules 11.1).
      const text = JSON.stringify(value);
      const codes = [...text.matchAll(/"([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)"/g)].map((m) => m[1] ?? '');
      const unmarked = codes.filter((code) => !code.startsWith('SYN-') && !/^(PRD|POL|DEC|CG)-/.test(code));
      expect(unmarked, stem).toEqual([]);
    }
  });
});

describe('golden cases on the server (shared-calculations 12.2)', () => {
  for (const goldenCase of cases.values()) {
    const title = `${goldenCase.covers.join(' ')} shared-calculations 12.4 ${goldenCase.id} ${goldenCase.title}`;
    if (goldenCase.pending !== undefined) {
      // Reported, never passed: the reason shows in the skipped test's name.
      it.skip(`${title} — pending: ${goldenCase.pending}`, () => undefined);
      continue;
    }
    it(title, () => {
      const outcome = runCase(goldenCase, cases, api);
      if (outcome.status === 'failed') {
        expect(JSON.parse(outcome.actual), `run ${String(outcome.run)}`).toEqual(JSON.parse(outcome.expected));
      }
      expect(outcome.status).toBe('passed');
    });
  }
});
