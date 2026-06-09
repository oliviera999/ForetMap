# Audit d'optimisation ForetMap — Extensibilité · Maintenabilité · Performance

Date : 2026-06-09 · Version de référence : `1.58.19`

Ce document consolide l'audit technique d'optimisation du projet (frontend React,
backend Express, tests, dépendances, bundle) et **sert de tracker** des lots de
correction. Il complète — sans les remplacer — les audits sécurité/bugs existants
(`docs/AUDIT_BUGS_INCOHERENCES.md`, `docs/SITE_ISSUES.md`).

Périmètre analysé : ~159 000 LOC (hors `node_modules`/`dist`). Deux applications
servies par un backend Express commun : **ForetMap** (`src/main.jsx` → `src/App.jsx`)
et **GL « Gnomes & Licornes »** (`src/gl/AppGL.jsx`, zone de développement la plus active).

## 1. Vue d'ensemble de l'architecture

- **Backend** : `server.js` (879 l.) monte 39 routeurs `/api/*` et `/api/gl/*`.
  Data layer `database.js` propre : pool `mysql2`, helpers `queryAll/queryOne/execute/withTransaction`,
  **requêtes 100 % paramétrées**, 120 migrations versionnées. Logique métier partiellement
  externalisée dans `lib/` (134 fichiers).
- **Frontend** : React 19 + Vite (build Rolldown). **Pas de state manager** : tout l'état
  vit dans `App.jsx` / `AppGL.jsx`, propagé par props. CSS global unique `src/index.css` (5 491 l.).
- **Flux de données** : `App.jsx` → `fetchAll()` (6 requêtes parallèles) → polling adaptatif
  (≥60 s) + Socket.IO en transport `polling` seul (contrainte WAF o2switch).
- **Hébergement** : o2switch mutualisé (Passenger, process unique, ressources limitées),
  cible de charge « classe / Wi-Fi » (≤10 VU). ⇒ perf réseau et charge DB **non théoriques**.

### Points sains (à préserver)
Data layer paramétré et transactionnel ; CI complète (MariaDB + lint + node:test + Vitest +
Playwright) ; dette de surface très faible (0 `console.log`, 0 `TODO/FIXME`, 0 `eslint-disable`) ;
fondamentaux sécurité solides (isolation JWT par produit, bcrypt, rate-limiting, arrêt gracieux) ;
backend bien testé ; couche transport API mutualisée ; couche `src/shared/` réelle et utilisée.

## 2. Synthèse — points les plus critiques

1. **`App.jsx` God component + prop-drilling massif sans mémoïsation** (37 `useState`,
   blocs de props dupliqués ×4, 0 `React.memo` dans tout le frontend) + refetch global
   toutes les 60 s ⇒ re-render de l'arbre entier. Touche les 3 axes.
2. **Composants monolithiques + ~21 000 LOC de vues sans aucun test UI**
   (`TasksView` ~1680 l., `ProfilesAdminView` ~1560 l., `MarkerModal` ~1420 l.).
   Violation de la convention `foretmap-frontend.mdc`.
3. **`xlsx@0.18.5` : 2 CVE High exploitables via uploads** (parsing serveur d'imports).
4. **RBAC recalculé depuis la DB à chaque requête authentifiée** (3-5 requêtes SQL),
   sans cache, alors que `lib/memoryTtlCache.js` existe.
5. **`zod` installé mais jamais utilisé** : validation 100 % manuelle et hétérogène (39 routeurs).
6. **Chaîne d'imports statiques bundle** : `MapView` tire les 4 renderers de mascotte
   (rive 166 KB + spriteCut 102 KB) au premier paint alors qu'un seul sert.

## 3. Tracker des recommandations

Statuts : `todo` · `wip` · `done` · `differe` (décision produit requise).

| ID | Prio | Axe | Problème | Recommandation | Effort | Statut |
|----|------|-----|----------|----------------|--------|--------|
| O1 | Haute | Perf | 268 KB de renderers mascotte (rive+spriteCut) chargés en eager sur la Carte (`VisitMapMascotRenderer.jsx`) | `React.lazy` par renderer + `Suspense` | Faible | done |
| O2 | Haute | Perf | `taskTileProps` recréé chaque render + `TaskTileCard` non mémoïsé ⇒ re-render de toutes les tuiles par tick | `useMemo` + `React.memo` | Faible | done |
| O3 | Haute | Perf | RBAC : 3-5 requêtes DB par requête authentifiée, non caché | Cache TTL court (`lib/memoryTtlCache.js`), invalidé sur mutation de rôle | Moyen | done |
| O4 | Haute | Sécu/Maint | `xlsx@0.18.5` — 2 CVE High via uploads | Migration `exceljs` (npm) ou SheetJS CDN | Élevé | differe |
| O5 | Haute | Extensibilité | `App.jsx` God component + prop-drilling ×4 | Contexts par domaine (session, données, settings) | Élevé | wip |
| O6 | Haute | Maint/Test | Composants monolithiques + 0 test UI sur ~21k LOC | Extraire logique pure → tests ; puis découper | Élevé | wip |
| O7 | Moyenne | Extens/Sécu | `zod` jamais utilisé ; validation manuelle hétérogène | Middleware `validate(schema)` + schémas par endpoint | Moyen | wip |
| O8 | Moyenne | Maint | ~338 try/catch dispersés ; `respondInternalError` redéfini en doublon | Wrapper `asyncHandler` → handler central | Moyen | todo |
| O9 | Moyenne | Maint | Helpers dupliqués (`normalizeOptionalString` ×25, pagination ×3, `Lightbox` ×2, compression image ×7) | `lib/strings.js`, `lib/pagination.js`, `src/shared/` | Faible | done |
| O10 | Moyenne | Perf | Routes obèses (visit/tasks/games 2000+ l.) ; N+1 d'écriture (boucles INSERT) | Couche service par domaine ; INSERT multi-valeurs | Élevé/Faible | wip |
| O11 | Moyenne | Perf bundle | Lazy ineffectif (`foretmap-views`/`stats-views`) ; markdown eager ; GL sans lazy ; sourcemap prod | Corriger les lazy, lazifier markdown/GL, `sourcemap: hidden` | Moyen | done |
| O12 | Basse | Maint | ESLint 4 règles sans react-hooks ; pas de Prettier ; 0 typage | `eslint-plugin-react-hooks` + `no-unused-vars` ; Prettier ; `checkJS` incrémental | Faible | done |
| O13 | Basse | Sécu | Pas de `helmet` ; CORS ouvert par défaut ; `DEPLOY_SECRET` non constant-time | `helmet()` ; boot refusé sans origine prod ; `timingSafeEqual` | Faible | done |
| O14 | Basse | Maint | Fichiers morts ; `fs.readFileSync(package.json)` en chemin requête | Suppression ; servir `startupVersion` | Trivial | done |

## 4. Détail technique par module

### Frontend — état & rendu
- `App.jsx` (2141 l.) : hub d'état unique (37 `useState`, 30 `useEffect`). Prop-drilling :
  blocs de props `TasksView`/`MapView` **dupliqués ×4** (prof/élève × split/simple).
- **0 `React.memo`** dans `src/`. `taskTileProps` (`tasks-views.jsx:2408`) recréé chaque
  render, spreadé dans ~16 `.map()` vers `TaskTileCard` (`:3399`) non mémoïsé.
- Composants monolithiques : voir tableau §2. Logique dupliquée : `Lightbox` ×2
  (`map-views.jsx:62`, `tasks-views.jsx:95`), helper curried `set` ×4, compression image ×7.
- Aucune virtualisation de liste (catalogues plantes/tâches/users rendus en bloc).

### Frontend — bundle
- Payload initial ForetMap ≈ 1 049 KB brut / ≈ 285 KB gzip (14 chunks en `modulepreload`).
- Cause racine : `MapView` (eager) → `VisitMapMascotRenderer.jsx:7-10` importe **les 4 renderers**
  en statique (rive 166 KB, spriteCut 102 KB) ; un seul sert à l'exécution.
- `markdown` (66 KB, marked+DOMPurify) tiré en eager par map/tasks-views.
- Lazy ineffectif : `foretmap-views`/`stats-views` importés à la fois statique et dynamique.
- `vite.config.js:11` : `sourcemap: true` en prod ⇒ ~6 MB de `.map`.
- GL : 36 vues en eager dans `AppGL.jsx` ⇒ chunk `gl` ~510 KB monolithique.

### Backend
- `zod` non importé par les 39 routeurs ; validation manuelle (Sets, longueurs inline,
  magic bytes à la main). Adopter un middleware `validate(schema)`.
- RBAC : `buildAuthzPayload` (`lib/rbac.js:605`) appelé via `hydrateAuthFromTokenClaims`
  (`middleware/requireTeacher.js`) sur chaque requête authentifiée → 3-5 SELECT.
- N+1 d'écriture : `tasks.js:558-584` (`setTaskZones/Markers/Tutorials`) — `DELETE` puis
  `for … await execute(INSERT)`. Idem `zones.js`, `map.js`, `gl/kingdom-map.js`.
- Routes obèses : `visit.js` 2367 l., `tasks.js` 2167 l. (946 l. de helpers avant le 1er handler),
  `gl/games.js` 2001 l. — extraire des services par domaine.
- Gestion d'erreur : handler central `server.js:673` court-circuité par ~338 try/catch ;
  `respondInternalError` redéfini en doublon (`tasks.js:866`, `auth.js`).
- Sécurité (durcissement) : pas de `helmet` ; CORS ouvert par défaut en prod si var absente ;
  `DEPLOY_SECRET` comparé non constant-time (`server.js:405,415,433`).
- `fs.readFileSync(package.json)` à chaque `/api/version` et `/api/admin/diagnostics`.

### Tests & qualité
- Trou de tests frontend : seuls 3 composants ForetMap testés ; `App.jsx` + tous les
  `*-views.jsx` (~21k LOC) = 0 test Vitest. GL bien couvert (~50 composants).
- ESLint laxiste (4 règles, sans `eslint-plugin-react-hooks` sur 65k LOC React).
- Pas de Prettier. 0 typage (`tsconfig`/`.d.ts` absents), JSDoc épars non vérifié.

### Dépendances
- Aucune dépendance morte. `marked` (MD→HTML) et `turndown` (HTML→MD) complémentaires
  (pas un doublon). `xlsx`/`pdfkit` **hors bundle client** (parsing serveur uniquement).
- `xlsx@0.18.5` : CVE-2023-30533 (Prototype Pollution) + CVE-2024-22363 (ReDoS),
  non corrigées sur npm. Surface = parsing d'uploads serveur (14 modules).
- Fichiers morts supprimés : `tmp-test-ctx-one.js`, `scripts/_patch_map_solo.py`.

## 5. Séquencement

Du plus sûr au plus risqué, chaque lot livré avec tests + doc + lint/build verts :
1. Documentation + nettoyage (ce document, fichiers morts). 
2. Bundle (O1, O11) — frontend, vérifiable par build.
3. Rendu (O2) — vérifiable par Vitest + build.
4. Backend quick wins (O3, O13, O14, O10 partiel) — vérifiable par tests DB.
5. Dédup helpers (O9).
6. Outillage (O12).
7. Structurel (O5, O6, O7, O8, O10) — incrémental, multi-commits.
8. Décision produit puis migration (O4 `xlsx`).

> **O4 (xlsx)** est marqué `differe` : il implique un choix entre SheetJS CDN (hors npm,
> supply-chain à assumer) et `exceljs` (npm, réécriture de 14 modules avec API différente).
> À trancher avant exécution pour éviter une régression sur les imports élèves/plantes.
