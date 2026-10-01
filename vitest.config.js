import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

/*
 * Pool `vmThreads` (contextes `vm` dans des threads réutilisés) plutôt que `forks` (un processus
 * neuf par fichier) : la suite passe de ~9 min à ~2 min en local, et de ~12 min dans le job
 * `quality` (exécuteur 2 cœurs des dépôts privés). Le coût du pool `forks` était la mise en
 * place de jsdom, refaite pour chacun des ~690 fichiers (58 % du temps mesuré).
 *
 * Deux conséquences du pool vm, réglées ci-dessous :
 *   - `isomorphic-dompurify` est servi en version **navigateur** (`dist/browser.mjs`) : sa
 *     version Node charge jsdom → html-encoding-sniffer → `@exodus/bytes`, un module ESM chargé
 *     par `require`, ce que le chargeur CJS du pool vm refuse. La version navigateur est
 *     d'ailleurs celle que Vite livre au front ;
 *   - `FORKS_ONLY` garde dans le pool `forks` les fichiers qui ne peuvent pas tourner en vm.
 *     Y ajouter un fichier plutôt que de revenir sur le pool de toute la suite.
 */
const FORKS_ONLY = [
  // Environnement `node` : prouve que l'auto-lien n'a pas besoin du DOM, donc a besoin de la
  // version Node de DOMPurify (cf. ci-dessus).
  'tests-ui/utils/glLoreGlossaryAutolink.test.js',
  // Remplacent `globalThis.window` par un historique factice : en contexte vm, `window` est
  // l'objet global lui-même, non réassignable.
  'tests-ui/platform/overlayHistory.test.js',
  'tests-ui/platform/tabBrowserHistory.test.jsx',
];

const BASE_EXCLUDE = ['tests/**', 'e2e/**', 'node_modules/**'];

// Options communes aux deux projets. Pas de `extends: true` : il **concatène** les `include`
// au lieu de les remplacer, et le projet `forks` reprendrait alors toute la suite.
const SHARED_TEST = {
  environment: 'jsdom',
  globals: true,
  setupFiles: ['tests-ui/setup.js'],
  // Au-dessus des attentes de Testing Library (5 s chacune, tests-ui/setup.js) : un test qui
  // en enchaîne plusieurs ne doit pas être coupé par le délai global (5 s par défaut).
  testTimeout: 20000,
};

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react()],
        resolve: {
          alias: [
            {
              find: /^isomorphic-dompurify$/,
              replacement: fileURLToPath(
                new URL('./node_modules/isomorphic-dompurify/dist/browser.mjs', import.meta.url),
              ),
            },
          ],
        },
        test: {
          ...SHARED_TEST,
          name: 'vm',
          pool: 'vmThreads',
          include: ['tests-ui/**/*.test.{js,jsx}'],
          exclude: [...BASE_EXCLUDE, ...FORKS_ONLY],
        },
      },
      {
        plugins: [react()],
        test: {
          ...SHARED_TEST,
          name: 'forks',
          pool: 'forks',
          include: FORKS_ONLY,
          exclude: BASE_EXCLUDE,
        },
      },
    ],
  },
});
