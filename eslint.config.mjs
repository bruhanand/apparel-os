// Flat ESLint config for the code workspace. Docs and the doc checker are not linted.
import eslint from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores([
    '**/dist/**',
    '**/dist-seed/**',
    '**/node_modules/**',
    '**/.turbo/**',
    '**/coverage/**',
    'docs/**',
    'tools/doc-check/**',
  ]),
  {
    files: ['apps/**/*.{ts,tsx,mts}', 'packages/**/*.{ts,tsx,mts}', 'tools/module-check/**/*.mts'],
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
);
