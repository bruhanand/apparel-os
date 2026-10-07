// S1-F11-AT11 (shared-calculations 2.1, 2.3; offline-counter.md 5.4; PRD-OFF-004): the build guard fails a counter
// build whose module graph holds any module of the costing entry point, and passes one that holds only the selling
// entry point. Each case is a real Vite build of a scratch entry (SYNTHETIC test plumbing, removed afterwards). The
// scratch folder sits inside this package's node_modules so the workspace packages resolve as the counter's own do.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { build } from 'vite';
import { buildGuard } from '../build-guard.ts';

const scratchRoot = join(import.meta.dirname, '..', 'node_modules', '.syn-guard-test');
afterAll(() => {
  rmSync(scratchRoot, { recursive: true, force: true });
});

async function buildScratch(name: string, source: string): Promise<string> {
  const root = join(scratchRoot, name);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'index.html'), '<!doctype html><script type="module" src="./entry.ts"></script>');
  writeFileSync(join(root, 'entry.ts'), source);
  const reportFile = join(root, 'report', 'bundled-modules.json');
  await build({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [buildGuard({ reportFile })],
    build: { outDir: join(root, 'out'), emptyOutDir: true },
  });
  return reportFile;
}

describe('the counter build guard (S1-F11-AT11)', () => {
  it('PRD-OFF-004 passes a build that imports only the selling entry point, and lists its modules', async () => {
    const reportFile = await buildScratch(
      'selling',
      "import { priceBill } from '@apparel-os/calculations';\nconsole.log(priceBill);\n",
    );
    const report = JSON.parse(readFileSync(reportFile, 'utf8')) as { chunks: { modules: string[] }[] };
    const modules = report.chunks.flatMap((chunk) => chunk.modules);
    expect(modules.length).toBeGreaterThan(10);
    expect(modules.filter((id) => id.includes('/costing/'))).toEqual([]);
  });

  it('PRD-OFF-004 fails a build with a deliberate import of the costing entry point', async () => {
    await expect(
      buildScratch('costing', "import { costLine } from '@apparel-os/calculations/costing';\nconsole.log(costLine);\n"),
    ).rejects.toThrow(/holds the costing entry point/);
  });
});
