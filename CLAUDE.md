# CLAUDE.md — Guide projet ForetMap

Mémoire projet pour Claude Code. **Répondre, commenter et documenter en français.**
Les règles de détail font autorité dans **`.cursor/rules/`** et **`.cursor/skills/`** (ne pas
les dupliquer ici) ; ce fichier en donne la synthèse opérationnelle. Skills Claude Code dédiés
sous **`.claude/skills/`**.

## Vue d'ensemble

- **ForetMap** : application de gestion d'une forêt comestible (Lycée Lyautey). Élèves
  (carte des zones, tâches, stats) et professeurs (mode prof via PIN → JWT : gestion zones /
  plantes / tâches / élèves, validation).
- **GL (Gnomes & Licornes)** : sous-produit du même monorepo, **isolé**, servi par host
  (`gl.*`), API sous `/api/gl/*` (jeu pédagogique : chapitres, carte du royaume, lore, marché,
  sorts, QCM, journal). Voir skill `foretmap-gl`.
- **Stack** : Node.js + Express + MySQL (`mysql2` pool) ; React 19 + Vite (build servi depuis
  `dist/` en prod). Logger Pino.

## Architecture

| Élément                                            | Emplacement                                                                                                                       |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Serveur / montage routeurs / static / SPA fallback | `server.js`                                                                                                                       |
| Pool MySQL, `initDatabase()`, schéma, seed         | `database.js`                                                                                                                     |
| API ForetMap                                       | `routes/*.js` (auth, zones, maps, plants, tasks, stats, students, visit, forum…)                                                  |
| API GL                                             | `routes/gl/*.js`                                                                                                                  |
| Auth prof / GL                                     | `middleware/requireTeacher.js`, `middleware/requireGlAuth.js`                                                                     |
| Utilitaires backend                                | `lib/` (`logger.js`, `helpers.js`, `routeLog.js`, `requestId.js`, `env.js`, `uploads.js`, `speciesAutofill*.js`, `glSettings.js`) |
| Front ForetMap                                     | `index.vite.html` → `src/main.jsx` ; `src/components/`, `src/hooks/`, `src/services/`                                             |
| Front GL                                           | `gl.html` → `src/gl/main.jsx` → `src/gl/AppGL.jsx`                                                                                |
| Migrations                                         | `migrations/NNN_*.sql` (idempotentes) + `sql/schema_foretmap.sql`                                                                 |
| Tests                                              | `tests/*.test.js` (node:test), `tests-ui/**` (vitest), `e2e/*.spec.js` (Playwright)                                               |
| Documentation                                      | `docs/` — `API.md`, `EVOLUTION.md`, `LOCAL_DEV.md`, `EXPLOITATION.md`, `VERSIONING.md`, `GL_*.md`                                 |

## Commandes essentielles

```bash
npm run dev              # serveur en watch (nodemon)
npm run build            # build Vite (build-safe : enchaîne sync:*-pack-lib)
npm run ship -- -m "…"   # routine tout-en-un : build + lint/format/test + bump + commit + push
npm test                 # tests backend (node:test, séquentiel, force-exit)
npm run test:ui          # tests React (Vitest, tests-ui/**)
npm run test:e2e         # Playwright (libère le port puis start:e2e)
npm run lint             # ESLint            | npm run format:check  # Prettier (vérif)
npm run db:init          # schéma + seed     | npm run db:migrate    # migrations seules
npm run deploy:check:prod  # check post-déploiement prod
npm run bump:patch|minor|major  # incrémente package.json (sans tag)
```

## Conventions (à respecter)

- **SQL toujours paramétré** (`?`, jamais d'interpolation). Mots de passe **bcrypt** (facteur 10).
  Utiliser `queryAll/queryOne/execute` de `database.js` ; `result.insertId` après INSERT.
- **Logger Pino** (`lib/logger.js`, `redact`) plutôt que `console.log/error`.
- **Réponses API** : JSON ; erreurs `res.status(4xx|5xx).json({ error })`. 401 + `deleted:true`
  pour compte supprimé (front : déconnexion + toast).
- **Auth prof** : middleware JWT `requireTeacher` sur toute route prof. PIN jamais en dur côté client.
- **Front** : composants fonctionnels + hooks ; locale fr-FR ; thème forêt (`--forest`, `--leaf`…)
  dans `src/index.css` ; cibles tactiles ≥ 44px.
- **Tests dans le même lot que le code** : toute nouvelle route/règle/utilitaire → `tests/*.test.js` ;
  flux UI critique → scénario `e2e/`. Lancer au minimum `npm test` avant commit.
- **Doc API** : toute route publique nouvelle/modifiée → `docs/API.md` dans le même lot.
- **Doc de référence fonctionnelle** (`docs/reference/`, non technique, pour admins/profs/MJ) :
  tout changement de comportement **visible utilisateur** → mise à jour du doc concerné dans le
  même lot. Les éditions faites par l'utilisateur dans ces docs (marqueur `🔧 À implémenter`)
  valent **demandes de changement** pour le code — les vérifier en début de tâche. Détail :
  skill `foretmap-docs-reference` et règle `.cursor/rules/foretmap-docs-reference.mdc`.
- **Ne pas modifier le comportement métier** sans demande explicite (cf. `docs/EVOLUTION.md`).
- **Sécurité données** : ne jamais versionner de dump SQL (PII), secrets dans `.env` (non versionné).

## Pièges critiques

- **Rate limit en e2e** : utiliser `npm run start:e2e` (flag `--foretmap-e2e-no-rate-limit`) ;
  sinon `429` sur inscription/formulaires.
- **e2e en prod locale** : Playwright sert `dist/` (NODE_ENV=production) → lancer `npm run build`
  avant si `dist/` absent/obsolète.
- **Tests GL séquentiels obligatoires** (`--test-concurrency=1 --test-force-exit`) : BDD partagée,
  sinon deadlocks `initSchema()`.
- **Packs mascotte en prod « runtime » sans `src/`** : le build synchronise les miroirs CJS via
  `sync:visit-pack-lib` (→ `lib/visit-pack/`) et `sync:gl-pack-lib` (→ `lib/gl-pack/`).
- **Isolement GL** : un JWT `product:'gl'` est rejeté hors `/api/gl/*` (et inversement).

## Workflow Git / versionnage

- Après chaque lot livrable : `CHANGELOG.md` sous `[Non publié]`, `npm run bump:*`, `git add -A`,
  commit, **push**. Détail : `docs/VERSIONING.md` et skill `foretmap-release`.
- Commits GL exclusifs : préfixe `feat(gl)` / `fix(gl)` / `chore(gl)`.
- CI (`.github/workflows/ci.yml`) : `lint` → `format:check` → `test` → `test:ui` → `test:coverage`.
  Faire passer `npm run lint` et `npm run format:check` avant de pousser.

## Skills Claude Code (`.claude/skills/`)

`foretmap-context` (architecture & fichiers clés) · `foretmap-database` (schéma/migrations/SQL) ·
`foretmap-testing` (backend/UI/e2e) · `foretmap-gl` (sous-produit GL) ·
`foretmap-biodiversity` (pré-saisie espèces / Pl@ntNet) · `foretmap-observability` (logs/diagnostics) ·
`foretmap-release` (versionnage/commit/push) · `foretmap-docs-reference` (doc fonctionnelle
non technique `docs/reference/`).
Pour le détail métier au-delà : `.cursor/skills/**` et `.cursor/rules/**`.
