import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Architekturgrenze: Domain darf nichts aus Infrastructure/API/Frontend importieren.
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '@/infrastructure/*',
            '@/api/*',
            '@/frontend/*',
            '../infrastructure/*',
            '../api/*',
            '../frontend/*',
          ],
        },
      ],
    },
  },
);
