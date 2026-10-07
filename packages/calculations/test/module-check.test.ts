// Rule 4 of the module check (tools/module-check/check.mts; shared-calculations 2.1, 2.3), run on a scratch copy of the
// workspace: the check fails when the selling side imports the costing entry point or any package but
// @apparel-os/domain, and passes otherwise. Every scratch file is SYNTHETIC test plumbing.

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const checker = fileURLToPath(new URL('../../../tools/module-check/check.mts', import.meta.url));
const scratch: string[] = [];

afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

/** Runs the module check over a scratch workspace holding only the given calculations source files. */
function runCheck(
  files: Readonly<Record<string, string>>,
  other: Readonly<Record<string, string>> = {},
): { status: number | null; output: string } {
  const root = mkdtempSync(join(tmpdir(), 'syn-module-check-'));
  scratch.push(root);
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  mkdirSync(join(root, 'tools/module-check'), { recursive: true });
  copyFileSync(checker, join(root, 'tools/module-check/check.mts'));
  write('apps/server/src/kernel/index.ts', 'export {};\n');
  write('packages/calculations/src/costing/index.ts', "export const costing = 'syn';\n");
  for (const [path, text] of Object.entries(files)) write(`packages/calculations/src/${path}`, text);
  for (const [path, text] of Object.entries(other)) write(path, text);
  const run = spawnSync(process.execPath, [join(root, 'tools/module-check/check.mts')], { encoding: 'utf8' });
  return { status: run.status, output: `${run.stdout}${run.stderr}` };
}

describe('module check rule 4 (shared-calculations 2.1, 2.3)', () => {
  it('PRD-OFF-004 fails when the selling entry point imports the costing entry point', () => {
    const result = runCheck({ 'index.ts': "export { costing } from './costing/index.js';\n" });
    expect(result.status).toBe(1);
    expect(result.output).toMatch(/reaches the costing entry point/);
  });

  it('PRD-MOD-007 fails when the package imports anything but @apparel-os/domain', () => {
    const result = runCheck({ 'index.ts': "import { z } from 'zod';\nexport const schema = z;\n" });
    expect(result.status).toBe(1);
    expect(result.output).toMatch(/imports only @apparel-os\/domain/);
  });

  it('PRD-MOD-002 passes when selling imports only the domain package and its own files, and costing imports selling', () => {
    const result = runCheck({
      'index.ts':
        "import { paise } from '@apparel-os/domain';\nexport { paise };\nexport const own = './numbers.js';\n",
      'numbers.ts': 'export const one = 1;\n',
      'costing/costing.ts': "import { one } from '../numbers.js';\nexport const costing = one;\n",
    });
    expect(result.output).toMatch(/Module check passed/);
    expect(result.status).toBe(0);
  });
});

describe('module check rule 5, the counter (offline-counter.md 5.1, 5.4)', () => {
  it('PRD-OFF-004 fails when the counter imports the costing entry point', () => {
    const result = runCheck(
      {},
      {
        'apps/counter/src/main.ts':
          "import { costLine } from '@apparel-os/calculations/costing';\nexport { costLine };\n",
      },
    );
    expect(result.status).toBe(1);
    expect(result.output).toMatch(/apps\/counter imports only/);
  });

  it('PRD-MOD-002 fails when the counter imports apps/web or apps/server', () => {
    const result = runCheck(
      {},
      {
        'apps/web/src/screen.ts': 'export const screen = 1;\n',
        'apps/counter/src/main.ts': "import { screen } from '../../web/src/screen.js';\nexport { screen };\n",
      },
    );
    expect(result.status).toBe(1);
    expect(result.output).toMatch(/apps\/counter must not import from apps\/web/);
  });

  it('PRD-MOD-002 passes when the counter imports the selling entry point, the domain and its own files', () => {
    const result = runCheck(
      {},
      {
        'apps/counter/src/main.ts':
          "import { paise } from '@apparel-os/domain';\nimport { priceBill } from '@apparel-os/calculations';\nimport './own.js';\nexport { paise, priceBill };\n",
        'apps/counter/src/own.ts': 'export const own = 1;\n',
      },
    );
    expect(result.output).toMatch(/Module check passed/);
    expect(result.status).toBe(0);
  });
});
