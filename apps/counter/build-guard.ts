// The build guard of the counter (offline-counter.md 5.4; shared-calculations 2.1, 2.3; PRD-OFF-004): fails the build
// when any module of the costing entry point of @apparel-os/calculations enters the module graph, and writes the list
// of bundled modules, by chunk, for the Playwright run to check again (5.5).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Plugin } from 'vite';

const COSTING_ENTRY = '@apparel-os/calculations/costing';

export interface BuildGuardOptions {
  /** Where the module list is written. */
  readonly reportFile: string;
}

export function buildGuard(options: BuildGuardOptions): Plugin {
  let costingFolder: string | undefined;
  return {
    name: 'apparel-os-build-guard',
    async buildStart() {
      // The folder of the costing entry point as this build resolves it (built output or source alike).
      const resolved = await this.resolve(COSTING_ENTRY);
      costingFolder = resolved === null ? undefined : dirname(resolved.id);
    },
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).flatMap((item) =>
        item.type === 'chunk' ? [{ name: item.fileName, modules: Object.keys(item.modules).sort() }] : [],
      );
      const isCosting = (id: string): boolean =>
        (costingFolder !== undefined && id.startsWith(`${costingFolder}/`)) ||
        /\/calculations\/(?:dist|src)\/costing\//.test(id);
      const found = chunks.flatMap((chunk) => chunk.modules.filter(isCosting));
      // The list is written even on failure, so the cause can be read.
      mkdirSync(dirname(options.reportFile), { recursive: true });
      writeFileSync(options.reportFile, `${JSON.stringify({ chunks }, null, 2)}\n`);
      if (found.length > 0) {
        this.error(
          `The counter bundle holds the costing entry point (PRD-OFF-004; shared-calculations 2.1): ${found.join(', ')}`,
        );
      }
    },
  };
}

export function defaultReportFile(root: string): string {
  return join(root, '.build-report', 'bundled-modules.json');
}
