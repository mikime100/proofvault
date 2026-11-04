import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}', 'apps/store/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // Fitsum's pipeline gets data passed in. It must never reach for the database or PayPal itself.
    files: ['apps/api/src/pipeline/**', 'apps/api/src/rules/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['@prisma/*', '**/db/*', '**/paypal/*'] },
      ],
    },
  },
);
