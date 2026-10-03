import { defineConfig } from 'vitest/config';

// Unit tests. Integration tests (*.int.test.ts) need Docker and run through vitest.integration.config.ts.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['**/*.int.test.ts', '**/node_modules/**', '**/dist/**'],
  },
});
