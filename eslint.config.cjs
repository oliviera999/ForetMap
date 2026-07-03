'use strict';

const globals = require('globals');
const reactHooks = require('eslint-plugin-react-hooks');

/** ESLint — garde-fous progressifs (incl. regles des Hooks React) sans refactor massif du legacy. */
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
        ...globals.node,
      },
    },
    rules: {
      'no-debugger': 'error',
      'no-duplicate-case': 'error',
      'no-func-assign': 'error',
      'no-undef': 'error',
      'no-unreachable': 'warn',
      // Le code de prod (server/database/lib/middleware/routes) ne doit pas logger via
      // console (utiliser pino) ; désactivé pour scripts/** et tests/** plus bas.
      'no-console': 'warn',
      'no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: [
      'tests/auto-save.test.js',
      'tests/fetch-all-loop-guard.test.js',
      'tests/map-overlay-scale.test.js',
      'tests/map-overlay-typography.test.js',
      'tests/map-view-mascot-motion.test.js',
      'tests/motion-hooks.test.js',
      'tests/pct-polygon.test.js',
      'tests/qcm-feedback.test.js',
      'tests/image-lightbox-click.test.js',
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
      'no-undef': 'error',
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
        ...globals.browser,
        // Code isomorphe / garde-fous `typeof Buffer` côté front (bundle Vite).
        Buffer: 'readonly',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'no-debugger': 'error',
      'no-duplicate-case': 'error',
      'no-func-assign': 'error',
      'no-undef': 'error',
      'no-unreachable': 'warn',
      'no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Pas de console.log en prod front ; warn/error tolérés (logs d'erreur légitimes).
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // Regles des Hooks : violations reelles bloquantes (hook conditionnel, etc.) ;
      // dependances manquantes en avertissement pour guider la stabilisation (useCallback/useMemo).
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // Tests manipulant le DOM (jsdom) : globals navigateur en plus des globals Node.
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    // Outils CLI (scripts/**) et tests : l'usage de console y est légitime.
    files: ['scripts/**/*.js', 'tests/**/*.js'],
    rules: { 'no-console': 'off' },
  },
];
