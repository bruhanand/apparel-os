import { availableParallelism } from 'node:os';
import { defineConfig } from 'vitest/config';

// Integration tests start real services (PostgreSQL) in Docker through Testcontainers. One container serves the
// whole run (test/support/global-setup.ts); each test file clones its own databases in it from the run's templates.
// Test files run in parallel, at least two at once, because the two fixtures-isolation files wait for each other
// (code-house-rules 10.1, 11.3).
export default defineConfig({
  test: {
    include: ['test/**/*.int.test.ts', 'src/**/*.int.test.ts'],
    globalSetup: ['test/support/global-setup.ts'],
    fileParallelism: true,
    maxWorkers: Math.max(2, availableParallelism() - 1),
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
