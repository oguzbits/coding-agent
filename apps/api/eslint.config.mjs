// ESLint runs only for the rules oxlint cannot express: type-aware promise rules, double type assertions and model IDs.
import tseslint from 'typescript-eslint';

const doubleAssertion =
  'TSAsExpression > TSAsExpression, TSAsExpression > TSTypeAssertion, TSTypeAssertion > TSAsExpression';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      'no-restricted-syntax': [
        'error',
        { selector: doubleAssertion, message: 'No double type assertion (as unknown as X): fix the types instead.' },
        { selector: 'Literal[value=/^(models\\/)?gemini-[0-9]/]', message: 'Model IDs belong in src/config only.' },
      ],
    },
  },
  {
    files: ['src/**/*.test.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['src/config/**/*.ts'],
    rules: { 'no-restricted-syntax': ['error', { selector: doubleAssertion, message: 'No double type assertion.' }] },
  },
);
