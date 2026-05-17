'use strict';

/** ESLint minimal — garde-fous sans imposer un refactor massif du legacy. */
module.exports = [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'deploy/**',
      'public/**',
      'lib/visit-pack/**',
      'src/**',
      'e2e/**',
      '**/*.min.js',
    ],
  },
  {
    files: [
      'server.js',
      'database.js',
      'lib/**/*.js',
      'middleware/**/*.js',
      'routes/**/*.js',
      'scripts/**/*.js',
      'tests/**/*.js',
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
      },
    },
    rules: {
      'no-debugger': 'error',
      'no-duplicate-case': 'error',
      'no-func-assign': 'error',
      'no-unreachable': 'warn',
    },
  },
];
