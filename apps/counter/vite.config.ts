import { join, resolve } from 'node:path';
import { defineConfig } from 'vite';
import { buildGuard } from './build-guard.ts';

// Base path /counter/ (offline-counter.md 5.2). Two entries in one build, so Rollup puts the selling entry point of
// @apparel-os/calculations in a chunk both share (5.5).
export default defineConfig({
  base: '/counter/',
  plugins: [buildGuard({ reportFile: join(import.meta.dirname, '.build-report', 'bundled-modules.json') })],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        golden: resolve(import.meta.dirname, 'golden/index.html'),
      },
    },
  },
});
