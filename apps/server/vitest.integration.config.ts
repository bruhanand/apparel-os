import { defineConfig } from 'vitest/config';

// Integration tests start real services (PostgreSQL) in Docker through Testcontainers. One container serves the
// whole run (test/support/global-setup.ts); each test file makes its own databases in it.
export default defineConfig({
  test: {
    include: ['test/**/*.int.test.ts', 'src/**/*.int.test.ts'],
    globalSetup: ['test/support/global-setup.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
