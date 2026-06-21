---
name: foretmap-testing
description: Tests ForetMap — backend (node:test + supertest), utilitaires src/utils en ESM (import dynamique), UI React (Vitest), e2e (Playwright). À utiliser pour écrire/corriger/exécuter des tests ou vérifier une non-régression.
---

# Tests ForetMap

## Commandes

```bash
npm test           # backend : node --test, séquentiel + force-exit, tests/*.test.js
npm run test:ui    # UI React : Vitest (tests-ui/**, jsdom)
npm run test:e2e   # e2e : libère le port puis Playwright (start:e2e)
npm run test:all   # backend + UI
node --test tests/<fichier>.test.js   # cibler un fichier
```

## Backend (`tests/*.test.js`)

- Runner `node:test` + `supertest` + `node:assert/strict`.
- En tête : `require('./helpers/setup')` (charge `.env`, `DB_NAME` de test, `TEACHER_PIN`).
  Appeler `initSchema()` dans `before()`. Tests **indépendants** (chacun crée ses données).
- Utilitaires ESM de `src/utils/*` testés par **import dynamique** (`pathToFileURL` + `import()`),
  ex. `visit-map-geometry`, `visit-mascot-*`.
- Pour les tests qui mockent `global.fetch` : `{ concurrency: false }`.
- Helper GL : `tests/helpers/glFixtures.js` (admin, classe, joueur, partie, tokens).

## UI (`tests-ui/**`) — Vitest + RTL (jsdom).

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
