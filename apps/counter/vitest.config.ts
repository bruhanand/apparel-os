import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Each test runs a real Vite build.
    testTimeout: 60_000,
  },
});
