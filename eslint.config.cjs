'use strict';

const globals = require('globals');
const reactHooks = require('eslint-plugin-react-hooks');
const jsxA11y = require('eslint-plugin-jsx-a11y');

/** Dossiers produit (ForetMap ou GL) interdits d'import depuis `src/shared/**`. */
const SHARED_PRODUCT_DIRS = [
  'components',
  'gl',
  'services',
  'hooks',
  'utils',
  'constants',
  'contexts',
  'data',
];
const SHARED_ISOLATION_MESSAGE =
  'src/shared ne doit pas importer de code produit (ForetMap ou GL) — promouvoir le module dans src/shared ou injecter la dépendance.';

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
      'tests/profiles-user-list-filters.test.js',
      'tests/groups-admin-list-filters.test.js',
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
      'jsx-a11y': jsxA11y,
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
      // ── Accessibilité (jsx-a11y) ────────────────────────────────────────────────────
      // Stratégie : cf. `docs/AUDIT_VISITE_UI_UX_2026-09.md` §6. Trois niveaux, pour ne pas
      // rendre la dette invisible ni bloquer la CI sur du legacy :
      //
      //   `error` — les 22 règles qui n'avaient AUCUNE violation à l'activation. Coût nul,
      //             régression désormais impossible. C'est le meilleur du lot.
      //   `warn`  — les règles qui portent de la dette. Le cliquet
      //             `tests/a11y-static-guard.test.js` fait échouer toute violation NOUVELLE
      //             et interdit à l'inventaire de grossir ; c'est lui qui bloque, pas ESLint.
      //   `off`   — dépréciées en amont, ou trop bruyantes pour un signal exploitable.
      //
      // À zéro violation → verrouillées.
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-ambiguous-text': 'error',
      'jsx-a11y/anchor-has-content': 'error',
      'jsx-a11y/anchor-is-valid': 'error',
      'jsx-a11y/aria-activedescendant-has-tabindex': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-proptypes': 'error',
      'jsx-a11y/aria-unsupported-elements': 'error',
      'jsx-a11y/autocomplete-valid': 'error',
      'jsx-a11y/heading-has-content': 'error',
      'jsx-a11y/html-has-lang': 'error',
      'jsx-a11y/iframe-has-title': 'error',
      // Celle-ci aurait signalé, à l'écriture, les zones du plan cliquables mais pas
      // focusables (audit §2.1) une fois leur `role="button"` posé.
      'jsx-a11y/interactive-supports-focus': 'error',
      'jsx-a11y/lang': 'error',
      'jsx-a11y/media-has-caption': 'error',
      'jsx-a11y/mouse-events-have-key-events': 'error',
      'jsx-a11y/no-access-key': 'error',
      'jsx-a11y/no-distracting-elements': 'error',
      'jsx-a11y/no-noninteractive-tabindex': 'error',
      'jsx-a11y/no-redundant-roles': 'error',
      'jsx-a11y/scope': 'error',
      'jsx-a11y/tabindex-no-positive': 'error',
      // Avec dette : visibles ici, verrouillées par le cliquet.
      'jsx-a11y/aria-role': 'warn',
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/img-redundant-alt': 'warn',
      'jsx-a11y/no-aria-hidden-on-focusable': 'warn',
      'jsx-a11y/no-autofocus': 'warn',
      // `no-interactive-element-to-noninteractive-role` est la règle qui aurait attrapé le
      // `role="listitem"` posé sur des `<button aria-pressed>` (audit §2.6).
      'jsx-a11y/no-interactive-element-to-noninteractive-role': 'warn',
      'jsx-a11y/no-noninteractive-element-interactions': 'warn',
      'jsx-a11y/no-noninteractive-element-to-interactive-role': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
      'jsx-a11y/role-has-required-aria-props': 'warn',
      'jsx-a11y/role-supports-aria-props': 'warn',
      // Désactivées, et pourquoi :
      // - dépréciées en amont par le greffon lui-même (remplacées ou obsolètes en React) ;
      'jsx-a11y/accessible-emoji': 'off',
      'jsx-a11y/label-has-for': 'off',
      'jsx-a11y/no-onchange': 'off',
      // - bruit sans signal exploitable : ~370 et ~140 remontées, inchangées même avec
      //   `depth: 5`, essentiellement sur des `<label>` enveloppants valides et des cellules
      //   de tableau. À reprendre avec une configuration ajustée avant d'être jugées.
      'jsx-a11y/control-has-associated-label': 'off',
      'jsx-a11y/label-has-associated-control': 'off',
      // - purement stylistique (préférer `<button>` à `role="button"`), sans impact
      //   d'accessibilité réel quand le rôle est correctement porté.
      'jsx-a11y/prefer-tag-over-role': 'off',
      // Zone morte temporelle : un `const` declare plus bas dans le corps d'un composant,
      // reference depuis un tableau de dependances de hook, leve un ReferenceError a CHAQUE
      // rendu — invisible pour le build et pour les tests qui ne montent pas le composant.
      // Cas rencontre le 27/08 sur App.jsx (ecran authentifie entierement casse).
      // `functions: false` : les declarations de fonction sont hissees, l'ordre y est libre.
      'no-use-before-define': [
        'error',
        { functions: false, classes: false, variables: true, allowNamedExports: true },
      ],
    },
  },
  {
    // Gabarit PWA : module CommonJS consommé par scripts/build-pwa.js et lib/pwaRoutes.js
    // (Node), jamais par le bundle navigateur — globals Node et `require`/`module`.
    files: ['src/shared/pwa/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
  },
  {
    // Étanchéité de src/shared (code commun ForetMap + GL) : un module partagé ne doit pas
    // remonter vers du code produit. En erreur depuis le lot 3 (plateforme front,
    // `docs/AUDIT_CONVERGENCE_APPS_2026-09.md` §5.2) : la dette recensée a été résorbée
    // (promotions dans `src/shared/platform/`, `media/`, `mascot/`, dépendances injectées).
    // Motifs distincts par profondeur : depuis `src/shared/components/`, `../utils/*` désigne
    // `src/shared/utils/` (légitime) alors que `../../utils/*` désigne `src/utils/` (produit).
    files: ['src/shared/*.{js,jsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: SHARED_PRODUCT_DIRS.map((dir) => `../${dir}/**`),
              message: SHARED_ISOLATION_MESSAGE,
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/shared/*/*.{js,jsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: SHARED_PRODUCT_DIRS.map((dir) => `../../${dir}/**`),
              message: SHARED_ISOLATION_MESSAGE,
            },
          ],
        },
      ],
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
    // Tests UI React (Vitest, jsdom) : ils n'etaient couverts par AUCUN bloc `files:`,
    // donc pas lintes du tout (~460 fichiers). Memes garde-fous que `src/**`, sans les
    // regles de Hooks : un test monte les composants, il n'en declare pas.
    files: ['tests-ui/**/*.{js,jsx}'],
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
        ...globals.node,
      },
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
      'no-use-before-define': [
        'error',
        { functions: false, classes: false, variables: true, allowNamedExports: true },
      ],
    },
  },
  {
    // Outils CLI (scripts/**) et tests : l'usage de console y est légitime.
    files: ['scripts/**/*.js', 'tests/**/*.js', 'tests-ui/**/*.{js,jsx}'],
    rules: { 'no-console': 'off' },
  },
];
