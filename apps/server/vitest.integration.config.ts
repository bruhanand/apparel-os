import { defineConfig } from 'vitest/config';

// Integration tests start real services (PostgreSQL) in Docker through Testcontainers.
export default defineConfig({
  test: {
    include: ['test/**/*.int.test.ts', 'src/**/*.int.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
