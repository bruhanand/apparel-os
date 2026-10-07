// Flat ESLint config for the code workspace. Docs are not linted.
import eslint from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores([
    '**/dist/**',
    '**/dist-seed/**',
    '**/dist-browser/**',
    '**/test-results/**',
    '**/playwright-report/**',
    '**/.build-report/**',
    '**/node_modules/**',
    '**/.turbo/**',
    '**/coverage/**',
    'docs/**',
  ]),
  {
    files: [
      'apps/**/*.{ts,tsx,mts}',
      'packages/**/*.{ts,tsx,mts}',
      'tools/module-check/**/*.mts',
      'tools/link-check/**/*.mts',
    ],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      prettier,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Nest modules are empty classes whose decorator carries the meaning.
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
    },
  },
  {
    // Application code never imports a test, a fixture or the local seed, so no fixture value can become a default
    // (code-house-rules 11.2; AGENTS.md "Never invent a value").
    files: ['apps/*/src/**/*.{ts,tsx,mts}', 'packages/*/src/**/*.{ts,tsx,mts}'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)(test|e2e|fixtures|seed)(/|$)',
              message: 'Application code never imports tests, fixtures or the seed (code-house-rules 11.2).',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression[source.value=/(^|\\/)(test|e2e|fixtures|seed)(\\/|$)/]',
          message: 'Application code never imports tests, fixtures or the seed (code-house-rules 11.2).',
        },
      ],
    },
  },
  {
    // No schema in packages/schemas supplies a value through .default(), .prefault() or .catch() (code-house-rules
    // 12.2; AGENTS.md "Never invent a value"). This block repeats the fixture rule above, since a later block's
    // no-restricted-syntax replaces an earlier one's.
    files: ['packages/schemas/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression[source.value=/(^|\\/)(test|e2e|fixtures|seed)(\\/|$)/]',
          message: 'Application code never imports tests, fixtures or the seed (code-house-rules 11.2).',
        },
        {
          selector: 'CallExpression[callee.property.name=/^(default|prefault|catch)$/]',
          message:
            'No schema supplies a value of its own: no .default(), .prefault() or .catch() (code-house-rules 12.2).',
        },
      ],
    },
  },
);
