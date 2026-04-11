---
name: foretmap-tests
description: Guide l'écriture et l'exécution des tests ForetMap (backend API, utilitaires `src/utils` via node:test, smoke). À utiliser pour auth, routes, statuts tâches, géométrie / mascotte visite, exécution `npm test`.
---

# Tests ForetMap

## Quand utiliser ce skill

- Écriture de nouveaux tests backend (route, helper, middleware).
- Correction ou refactoring de tests existants.
- Vérification de non-régression après une évolution.

## Quand ne pas l'utiliser

- Développement sans lien avec les tests : préférer **foretmap-project**.
- Planification d'une évolution globale : préférer **foretmap-evolution**.

## Stack de tests

| Outil | Rôle |
|-------|------|
| `node --test` (built-in) | Runner de tests |
| `supertest` | Requêtes HTTP sur l'app Express |
| `node:assert` | Assertions (strict) |
| `tests/helpers/setup.js` | Chargement `.env`, surcharge `DB_NAME` pour BDD de test, `TEACHER_PIN` par défaut |

## Commandes

```bash
npm test              # lance tous les tests dans tests/
npm run test:local    # idem avec DB_NAME=foretmap_test (cross-env)
npm run test:snapshot # tests "snapshot" contre la DB courante (FORETMAP_SNAPSHOT_TESTS=1)
npm run test:e2e      # lance les scénarios UI Playwright
npm run test:e2e:headed # idem avec navigateur visible
npm run smoke:local:fast # smoke applicatif (scripts/local-smoke.js)
# Charge : npm run test:load / test:load:light / … (voir docs/LOCAL_DEV.md, LOAD_TEST_SECRET)
```

### Ciblage pré-saisie biodiversité

```bash
node --test tests/species-autofill.test.js
node --test tests/api.test.js --test-name-pattern="autofill"
```

Utiliser `{ concurrency: false }` pour les tests qui mockent `global.fetch` afin d’éviter les interférences.

### Tests utilitaires frontend (`src/utils/*.js`)

Certains modules **ESM** partagés avec le build Vite sont validés par **`node --test`** via **import dynamique** (`pathToFileURL` + `import()`, comme `visit-map-geometry.test.js`) :

- `tests/visit-map-geometry.test.js` → `src/utils/visitMapGeometry.js`
- `tests/visit-mascot-placement.test.js` → `src/utils/visitMascotPlacement.js`
- `tests/visit-mascot-visibility.test.js` → `src/utils/visitMascotVisibility.js`
- `tests/visit-mascot-state.test.js` → `src/utils/visitMascotState.js`
- `tests/visit-mascot-catalog.test.js` → `src/utils/visitMascotCatalog.js`

## Débogage / logs

Les réponses API exposent **`X-Request-Id`** : l’inclure dans les rapports de bug. Les erreurs 500 journalisées via **`logRouteError`** contiennent cet id. Voir skill **foretmap-observability** et `docs/API.md` (Observabilité).

## Structure existante

```
tests/
├── helpers/
│   └── setup.js          # env + BDD de test
├── auth.test.js           # register, login, teacher login, rejet mdp
├── api.test.js            # routes CRUD principales
├── species-autofill.test.js # agrégation multi-sources / scoring / fallback
├── tasks-status.test.js   # recalcul statuts tâches (assign/unassign/done)
├── students-delete.test.js # cascade suppression élève
├── new-features.test.js   # tests de nouvelles fonctionnalités
├── visit-map-geometry.test.js   # centroïde / parsing polygones visite
├── visit-mascot-placement.test.js
├── visit-mascot-visibility.test.js
└── recurring-tasks-spawn.test.js # job duplication tâches récurrentes validées
```

## Conventions

- Importer `require('./helpers/setup')` en tête de chaque fichier test pour charger l'environnement.
- Appeler `initSchema()` dans le hook `before()` pour que le schéma soit à jour.
- Utiliser `describe` / `it` de `node:test` et `assert` de `node:assert`.
- Nommer les tests en français, décrivant le comportement attendu.
- Chaque test est indépendant : créer ses propres données (pas de dépendance inter-tests).
- Utiliser `supertest` pour les tests de routes : `request(app).get('/api/...').expect(200)`.
- Les tests snapshot (`tests/snapshot-db.test.js`) ne doivent pas appeler `initSchema()` : ils valident une base déjà importée.

## Priorités de tests backend (voir docs/EVOLUTION.md, stabilité continue)

1. **Auth** : register, login, rejet mot de passe incorrect, teacher login.
2. **Statuts de tâches** : recalcul après assign / unassign / suppression élève.
3. **Suppression élève** : cascade assignments/logs, statuts des tâches mis à jour.
4. **Routes CRUD** : zones, plantes, tâches (créer, modifier, supprimer).
5. **Middleware** : `requireTeacher` (token valide, absent, expiré).

## Priorités de tests UI e2e (voir docs/EVOLUTION.md § 2.1)

- Conserver les scénarios Playwright stables sur les parcours élève/prof critiques.
- Ajouter progressivement des cas limites (erreurs API, interruptions réseau, concurrence d'actions).
- Vérifier l'exécution CI des tests e2e avec les mêmes hypothèses que local (`playwright.config.js` + `e2e/`).
- Pour une évolution mascotte (nouveaux comportements/renderer), valider au minimum : `node --test tests/visit-mascot-state.test.js tests/visit-mascot-catalog.test.js` puis `e2e/visit-mascot.spec.js`.

## Voir aussi

- Règle backend : `.cursor/rules/foretmap-backend.mdc`
- Skill e2e : `.cursor/skills/foretmap-e2e/SKILL.md`
- Feuille de route : [docs/EVOLUTION.md](docs/EVOLUTION.md) § 2.1 (tests UI) et § 3-4 (séquence)
