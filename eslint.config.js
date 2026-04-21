const js = require('@eslint/js');
const globals = require('globals');
const eslintConfigPrettier = require('eslint-config-prettier/flat');

module.exports = [
  js.configs.recommended,
  eslintConfigPrettier,
  {
    files: ['**/*.js', 'bin/backup-*'],
    languageOptions: {
      ecmaVersion: 2025,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      indent: ['error', 2],
      'linebreak-style': ['error', 'unix'],
      'no-console': ['off'],
      'no-else-return': ['error'],
      quotes: ['error', 'single'],
      semi: ['error', 'always'],
    },
  },
  {
    files: ['test/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.mocha,
      },
    },
  },
  {
    ignores: ['coverage/**', 'data/**', 'dist/**', 'package-lock.json'],
  },
];
