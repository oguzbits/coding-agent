// ESLint runs only for the rules oxlint cannot express: type-aware promise rules, double type assertions and hooks.
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const doubleAssertion =
  'TSAsExpression > TSAsExpression, TSAsExpression > TSTypeAssertion, TSTypeAssertion > TSAsExpression';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'src/api/schema.d.ts'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { '@typescript-eslint': tseslint.plugin, 'react-hooks': reactHooks },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'no-restricted-syntax': [
        'error',
        { selector: doubleAssertion, message: 'No double type assertion (as unknown as X): fix the types instead.' },
      ],
    },
  },
  {
    files: ['src/**/*.test.{ts,tsx}'],
    rules: { 'no-restricted-syntax': 'off' },
  },
);
