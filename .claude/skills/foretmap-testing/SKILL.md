---
name: foretmap-testing
description: Tests ForetMap — backend (node:test + supertest), utilitaires src/utils en ESM (import dynamique), UI React (Vitest), e2e (Playwright). À utiliser pour écrire/corriger/exécuter des tests ou vérifier une non-régression.
---

# Tests ForetMap

## Commandes

```bash
npm test              # backend code : node --test, séquentiel + force-exit, tests/*.test.js
npm run test:content  # corpus pédagogique : tests/content/*.test.js (job CI `contenu`)
npm run test:ui       # UI React : Vitest (tests-ui/**, jsdom)
npm run test:e2e      # e2e : libère le port puis Playwright (start:e2e)
npm run test:all      # backend + contenu + UI
node --test tests/<fichier>.test.js   # cibler un fichier
```

## Backend (`tests/*.test.js`)

- Runner `node:test` + `supertest` + `node:assert/strict`.
- En tête : `require('./helpers/setup')` (charge `.env`, `DB_NAME` de test).
  Appeler `initSchema()` dans `before()`. Tests **indépendants** (chacun crée ses données).
- Utilitaires ESM de `src/utils/*` testés par **import dynamique** (`pathToFileURL` + `import()`),
  ex. `visit-map-geometry`, `visit-mascot-*`.
- Pour les tests qui mockent `global.fetch` : `{ concurrency: false }`.
- Helper GL : `tests/helpers/glFixtures.js` (admin, classe, joueur, partie, tokens).

## Contenu pédagogique (`tests/content/*.test.js`)

- Assertions sur les **données** semées par les migrations : espèces, liaisons trophiques,
  rattachements ressource ↔ QCM. Pas de code applicatif testé ici.
- **Hors du glob `tests/*.test.js`** depuis le 11/09/2026 : une dérive du corpus ne doit plus
  faire échouer la suite de code ni bloquer une PR de documentation. Job CI dédié : `contenu`.
- Requires à un niveau de plus : `require('../helpers/setup')`, `require('../../database')`.
- **Piège** : les semis d'interactions (migrations `224`, `225`…) résolvent les espèces par
  `JOIN ... ON nom_commun = ?`. Un nom absent au moment du passage est **silencieusement**
  abandonné. Ne jamais écrire `if (!espèce) continue;` dans un test : c'est ce qui a masqué
  la liaison manquante « Hérisson commun → Escargot des bois » (migration `230`). Affirmer
  la présence de l'espèce, puis celle de la liaison.
- Nouvelle espèce citée par un semis → vérifier qu'une migration la **crée** (base neuve ≠ prod :
  `gl_species` n'est peuplé que par `225` et `229`+ ; SP0001–SP0254 n'existent qu'en production).

## UI (`tests-ui/**`) — Vitest + RTL (jsdom)

- **Lintés depuis le 27/08** : `tests-ui/**` n'apparaissait dans aucun bloc `files:`
  d'`eslint.config.cjs` — ~460 fichiers échappaient à `no-undef` / `no-unused-vars`. Le bloc
  reprend les règles de `src/**` sans celles des Hooks (un test _monte_ des composants, il n'en
  déclare pas) ; `no-console` y est autorisé.
- **Tester un composant racine** — patron `tests-ui/AppShellWiring.test.jsx` : monter le vrai
  composant, avec des **sondes** (`vi.mock` qui empile les props reçues) à la place des grosses
  vues, et neutraliser les hooks de données/temps réel. Sert autant à vérifier un câblage de prop
  qu'à garantir que l'écran rend sans lever. Même patron de sondes dans
  `tests-ui/components/app/PedagoTabs.test.jsx`.
  > Un composant racine sans test de montage est une zone aveugle : lint, build et 3 153 tests
  > n'ont pas vu un `ReferenceError` levé à chaque rendu de l'écran authentifié
  > (`docs/AUDIT_REFACTORING_APP_2026-08.md` §5).
- Mock partiel d'un module : `vi.mock(chemin, async (importOriginal) => ({ ...(await importOriginal()), … }))`
  — un mock exhaustif casse les imports secondaires (`withAppBase` dans `services/api`, par exemple).

## e2e (`e2e/*.spec.js`) — Playwright

- `npm run test:e2e` libère le port puis démarre `npm run start:e2e`
  (`--foretmap-e2e-no-rate-limit` → évite les `429`). Sert `dist/` (NODE_ENV=production) :
  faire `npm run build` avant si `dist/` est obsolète.
- Sélecteurs robustes (`getByRole`/`getByLabel`). Mascotte : conteneur `.visit-map-mascot` en 0×0
  (« hidden ») → cibler `.visit-map-mascot-inner`.

## Gotchas

- **Tests GL : séquentiels obligatoires** (`--test-concurrency=1 --test-force-exit`) — BDD partagée.
- Inclure l'en-tête `X-Request-Id` dans les rapports de bug (corrélation `logRouteError`).

## Voir aussi

`.cursor/skills/foretmap-tests/SKILL.md`, `.cursor/skills/foretmap-e2e/SKILL.md`,
`docs/LOCAL_DEV.md` (§ tests), `docs/GL_TESTS.md`.
