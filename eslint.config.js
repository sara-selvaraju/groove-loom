import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'prototype/', 'public/', 'playwright-report/', 'test-results/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/web/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['src/server/**/*.ts', 'scripts/**', 'e2e/**', '.railway/**', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
);
