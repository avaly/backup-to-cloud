import js from '@eslint/js';
import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier/flat';

export default [
  js.configs.recommended,
  {
    files: ['**/*.js', 'bin/backup-*'],
    languageOptions: {
      ecmaVersion: 2025,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      indent: ['error', 2],
      'linebreak-style': ['error', 'unix'],
      'no-console': ['off'],
      'no-else-return': ['error'],
      semi: ['error', 'always'],
    },
  },
  eslintConfigPrettier,
  {
    ignores: ['coverage/**', 'data/**', 'dist/**'],
  },
];
