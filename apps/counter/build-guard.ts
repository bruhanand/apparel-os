// The build guard of the counter (offline-counter.md 5.4; shared-calculations 2.1, 2.3; PRD-OFF-004): fails the build
// when any module of the costing entry point of @apparel-os/calculations enters the module graph, and writes the list
// of bundled modules, by chunk, for the Playwright run to check again (5.5).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Plugin } from 'vite';
import { COSTING_ENTRY, isCostingModule } from './costing-module.ts';

/** `reportFile` is where the module list is written. */
export function buildGuard(options: { readonly reportFile: string }): Plugin {
  let costingFolder = '';
  return {
    name: 'apparel-os-build-guard',
    async buildStart() {
      // The folder of the costing entry point as this build resolves it (built output or source alike). A guard that
      // cannot find it must not pass silently.
      const resolved = await this.resolve(COSTING_ENTRY);
      if (resolved === null) this.error(`The build guard cannot resolve ${COSTING_ENTRY}`);
      costingFolder = dirname(resolved.id);
    },
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).flatMap((item) =>
        item.type === 'chunk' ? [{ name: item.fileName, modules: Object.keys(item.modules).sort() }] : [],
      );
      const found = chunks.flatMap((chunk) => chunk.modules.filter((id) => isCostingModule(id, costingFolder)));
      // The list is written even on failure, so the cause can be read.
      mkdirSync(dirname(options.reportFile), { recursive: true });
      writeFileSync(options.reportFile, `${JSON.stringify({ costingFolder, chunks }, null, 2)}\n`);
      if (found.length > 0) {
        this.error(
          `The counter bundle holds the costing entry point (PRD-OFF-004; shared-calculations 2.1): ${found.join(', ')}`,
        );
      }
    },
  };
}
