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
  {
    files: [
      'tests/map-view-mascot-motion.test.js',
      'tests/visit-editorial-blocks.test.js',
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },
    rules: {
      'no-debugger': 'error',
      'no-duplicate-case': 'error',
      'no-func-assign': 'error',
      'no-unreachable': 'warn',
    },
  },
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        AbortController: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
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
