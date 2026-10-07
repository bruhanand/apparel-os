import { defineConfig, devices } from '@playwright/test';

// The counter run of the golden cases (shared-calculations 12.2; offline-counter.md 5.5): `vite preview` of the built
// counter on a fixed local port, Chromium (Chrome and Edge both run on it; PRD Stack: Counter). Run `pnpm test:counter`
// from the root; it builds first. No server, no database. A failed test is never retried (code-house-rules 10.1).
const PORT = 4317;

export default defineConfig({
  testDir: '.',
  outputDir: '../test-results',
  forbidOnly: process.env.CI !== undefined,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: '../playwright-report' }]],
  timeout: 60_000,
  use: {
    baseURL: `http://127.0.0.1:${String(PORT)}`,
    trace: 'on',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec vite preview --host 127.0.0.1 --port ${String(PORT)} --strictPort`,
    cwd: '..',
    url: `http://127.0.0.1:${String(PORT)}/counter/golden/`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
