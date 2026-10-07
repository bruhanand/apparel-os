import { defineConfig, devices } from '@playwright/test';
import { join } from 'node:path';
import { SERVER_PORT, WEB_ORIGIN, WORLD_FILE } from './support/world';

// The browser journeys (code-house-rules 10.1; PRD-SEC-016; S1-F01-T15), in Chromium: Chrome and Edge both run on it
// (PRD Stack: Verification). The server of the journeys starts first: a test composition of the whole application on
// its own PostgreSQL container with synthetic data (apps/server/test/browser/serve.ts, built by `build:browser`), which
// serves the built web app and the API from one origin, as the `app` service does (deployment.md section 3;
// code-house-rules 12.1; S1-F01-T27). Run `pnpm test:e2e` from the root; it builds both first.
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
    // An action that cannot happen fails the step soon, instead of waiting out the whole journey.
    actionTimeout: 15_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node ../server/dist-browser/test/browser/serve.js',
      cwd: '..',
      url: `http://127.0.0.1:${String(SERVER_PORT)}/api/health`,
      env: {
        AOS_E2E_ORIGIN: WEB_ORIGIN,
        AOS_E2E_PORT: String(SERVER_PORT),
        AOS_E2E_WORLD_FILE: WORLD_FILE,
        // Beside the traces, which CI keeps as an artefact (spec section 15).
        AOS_E2E_LOG_FILE: join(import.meta.dirname, '..', 'test-results', 'server-log.jsonl'),
      },
      reuseExistingServer: false,
      // Starting the container and migrating the templates takes a while on a cold machine.
      timeout: 300_000,
      // Playwright kills a web server outright unless told otherwise; SIGTERM lets serve.ts write its log sample, drop
      // its databases and stop its container.
      gracefulShutdown: { signal: 'SIGTERM', timeout: 20_000 },
      stdout: 'pipe',
    },
  ],
});
