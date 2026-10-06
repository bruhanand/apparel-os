import { defineConfig, devices } from '@playwright/test';
import { SERVER_PORT, WEB_ORIGIN, WEB_PORT, WORLD_FILE } from './support/world';

// The browser journeys (code-house-rules 10.1; PRD-SEC-016; S1-F01-T15), in Chromium: Chrome and Edge both run on it
// (PRD Stack: Verification). Two servers start first: the server of the journeys, a test composition of the whole
// application on its own PostgreSQL container with synthetic data (apps/server/test/browser/serve.ts, built by
// `build:browser`), and the built web app under `vite preview`, which sends /api to it (vite.config.ts), so the pages
// and the API share one origin (code-house-rules 12.1). Run `pnpm test:e2e` from the root; it builds both first.
// A failed test is never retried (code-house-rules 10.1). Every run keeps its trace in apps/web/test-results, which CI
// keeps as an artefact (S1-F01-T15 "Done when").
export default defineConfig({
  testDir: '.',
  outputDir: '../test-results',
  forbidOnly: process.env.CI !== undefined,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: '../playwright-report' }]],
  timeout: 120_000,
  use: {
    baseURL: WEB_ORIGIN,
    trace: 'on',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node ../server/dist-browser/test/browser/serve.js',
      cwd: '..',
      url: `http://127.0.0.1:${String(SERVER_PORT)}/api/health`,
      env: { AOS_E2E_ORIGIN: WEB_ORIGIN, AOS_E2E_PORT: String(SERVER_PORT), AOS_E2E_WORLD_FILE: WORLD_FILE },
      reuseExistingServer: false,
      // Starting the container and migrating the templates takes a while on a cold machine.
      timeout: 300_000,
      stdout: 'pipe',
    },
    {
      command: `pnpm exec vite preview --port ${String(WEB_PORT)} --strictPort`,
      cwd: '..',
      url: WEB_ORIGIN,
      reuseExistingServer: false,
    },
  ],
});
