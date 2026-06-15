// ESLint (flat config) — escopo BACKEND. Leniente de proposito: foca em bugs reais
// (no-undef, vars nao usadas) sem inundar o codigo existente. O frontend tem setup
// proprio (squad de front). Rode: pnpm lint
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/*.spec.ts', '**/prisma/**'] },
  {
    files: ['apps/backend/src/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { sourceType: 'module' },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-empty-function': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      // estilo (nao-bug) -> warning, p/ triagem incremental sem bloquear o CI
      'prefer-const': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
    },
  },
);
