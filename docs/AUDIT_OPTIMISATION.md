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
| O2 | Haute | Perf | `taskTileProps` recréé chaque render + `TaskTileCard` non mémoïsé ⇒ re-render de toutes les tuiles par tick | **Fondation posée** : `TaskTileCard` exporté + `React.memo` + test `tests-ui/components/TaskTileCard.test.jsx`. **Reste** : stabiliser les ~11 handlers de `TasksView` (`assign`/`unassign`/`setTaskStatus`…) en `useCallback` + `useMemo(taskTileProps)` pour rendre le memo *effectif* (à faire avec couverture d'interaction) | Faible→Moyen | wip |
| O3 | Haute | Perf | RBAC : 3-5 requêtes DB par requête authentifiée, non caché | **Tenté puis reverté** : un cache TTL avec invalidation par hook (`setPrimaryRole`/routes rbac) s'est avéré à invalidation **incomplète** — des chemins mutent `roles`/`user_roles` en SQL direct (dédup `rbac.js`, tests) → permissions périmées (a cassé `api.test.js`). Re-tenter avec un **compteur de version RBAC global** inclus dans la clé de cache (incrémenté de façon centralisée à toute écriture des tables RBAC) **ou** un cache **request-scoped**. Sécurité-critique : à ne pas livrer sans preuve d'invalidation complète. **Maintenu `differe` (analyse 2026-06-10)** : (a) le cache **request-scoped** n'apporte ~rien — `hydrateAuthFromTokenClaims` (donc `buildAuthzPayload`) ne s'exécute **qu'une fois par requête** (un seul guard d'auth par route), pas de duplication intra-requête à collapser ; (b) le seul sous-ensemble **sûr** à cacher cross-request est `getRolePermissions(roleId)` (clé = `roleId`, partagé entre users, **4 chemins d'écriture seulement**, tous dans `rbac.js`/`lib/rbac.js`) — `getPrimaryRoleForUser` (user→rôle) garde de multiples writers (cause du revert) ; mais **11+ tests écrivent `role_permissions` en SQL direct puis lisent immédiatement** → un cache les casserait sauf bypass `NODE_ENV==='test'` (qui supprime toute vérification). À livrer **uniquement avec une DB** pour valider `api.test.js`/`rbac.test.js` | Moyen | differe |
| O4 | Haute | Sécu/Maint | `xlsx@0.18.5` — 2 CVE High via uploads | **Fait** : adaptateur `lib/spreadsheet.js` (exceljs) + preuve d'équivalence xlsx ; **14 modules d'import migrés** (app principale + 11 libs GL + `contentLibraryBulk`). Production **100 % xlsx-free** ; `xlsx` déplacé en **devDependencies** (fixtures de tests uniquement) → CVE-2023-30533 / CVE-2024-22363 **non joignables au runtime prod**. exceljs corrige en bonus le mojibake emoji de xlsx | Élevé | done |
| O5 | Haute | Extensibilité | `App.jsx` God component + prop-drilling ×4 | **3 contexts livrés** (Provider sur le retour principal d'`App` ; retour invité hors Provider → défauts identiques). **(1) `PublicSettingsContext`** : 9 vues, 18 passes retirées. **(2) `SessionContext`** (valeurs **réellement globales** uniquement) : `isN3Affiliated` + `canParticipateContextComments`, **30 passes retirées** ; `hasPermission`/`hasPermissionInRole`/`isTeacher`/`student`/identités **restent en props** (chemin élève les supprime volontairement). **(3) `DataContext`** : `zones`/`markers`/`plants`/`tasks`/`tutorials`/`taskProjects`/`activeMapId` sur 8 vues, **73 passes retirées** (`App` 2155→2117 l) ; `maps` (variante `visibleMaps`/`maps`) et les noms distincts de `VisitView` (`mapZones`…) restent en props. **Total : ~121 passes de props éliminées.** Reste : découpage JSX (O6) | Élevé | wip |
| O6 | Haute | Maint/Test | Composants monolithiques + 0 test UI sur ~21k LOC | **En cours** : (1) 1er test UI app principale (`TaskTileCard`) ; (2) **logique pure extraite + testée** → `taskComputations.js` (7 fn, 19 tests), `taskListHelpers.js` (18 fn, 35 tests), `taskEnrollment.js` (7 fn, 16 tests), `taskLogDraft.js` (3 fn, 5 tests) + dédup `fileToDataUrl`/date-statut ; (3) **découpage JSX** : 3 modals sortis vers `src/components/tasks/` — `TaskLogModals` (`LogModal`+`TaskLogsViewer`), `TaskProjectFormModal`, `TaskFormModal` (~779 l) ; helpers de formulaire/affichage mutualisés (`taskFormHelpers.js` 9 tests, `taskDisplayHelpers.js` 7 tests). Côté **`map-views.jsx`** : géométrie d'édition de zone → `zoneEditGeometry.js` (8 tests), blocs éditoriaux purs → `visitEditorialBlocks.js` (5 tests), puis `ZoneDrawModal` + champ partagé `ZoneOrMarkerEmojiField` + `PhotoGallery` (+ son helper de réordonnancement testé) → `src/components/map/`. `TaskTileCard` (+`startDateChip`/`Lightbox`) + `TaskProjectsBlock` → `tasks/`, hook `useMapGestures` (~452 l) → `src/hooks/`. Côté carte : blocs partagés (`mapModalShared`) puis les 2 gros modals `ZoneInfoModal` (~800 l) + `MarkerModal` (~935 l) → `src/components/map/` (en-têtes d'imports générés + scan d'exhaustivité des réfs). **`tasks-views.jsx` 4230→1735 l (-59%)** ; **`map-views.jsx` 4049→1302 l (-68%)**. Côté **`visit-views.jsx`** : helpers purs de galerie média extraits → `src/utils/visitMediaGallery.js` (`itemSeenKey`, `visitMediaImgSrc`/`ThumbDisplaySrc`/`LightboxSrc`, `reorderVisitMediaRows`) + test `tests-ui/utils/visitMediaGallery.test.js` (8 tests). Côté **`foretmap-views.jsx`** : helpers purs de liens source → `src/utils/plantSourceLinks.js` (`isHttpLink`, `isLocalUploadsPath`, `isLikelyDirectImageUrl`, parsing Wikimedia Commons `File:`/`Category:`, `getSourceLabel`) + test (9 tests). Stratégie : étendre le filet de tests par extraction de logique pure **avant** de découper les méga-composants | Élevé | wip |
| O7 | Moyenne | Extens/Sécu | `zod` jamais utilisé ; validation manuelle hétérogène | **Infra livrée** : middleware réutilisable `lib/validate.js` (`validate({ body, query, params })`, `req.validatedQuery`/`Params` pour Express 5) + test `tests/validate-middleware.test.js`. Rollout par route **incrémental** (préserver l'ordre auth→validation et les messages existants). **1ère route adoptée** : `routes/media-library.js` — `validate({ query })` (coercition permissive de `limit`, jamais de 400) + `validate({ body })` (upload : `media_data` requis/trim, `original_name`/`originalName` optionnels) ; schémas exportés + test no-DB `tests/media-library-validation.test.js` (3 tests, équivalence comportement historique) | Moyen | wip |
| O8 | Moyenne | Maint | ~338 try/catch dispersés ; `respondInternalError` redéfini en doublon | **Infra livrée** : `lib/asyncHandler.js` (catch sync+async → `next(err)` → handler central `server.js`) + test `tests/async-handler.test.js`. Rollout **incrémental** par route (préserver statut + corps d'erreur existants). Adopté sur `audit`/`zones`/`map`/`maps`/`observations`/`context-comments`/`stats`, **`media-library`** (les 4 routes : contrat 4xx `.status`/`.message` + 500 « Erreur serveur » reproduit par le handler central), puis **`forum`** (8 handlers migrés ; équivalence **prouvée** : diff after-strip-indentation = lignes wrapper/import uniquement, aucun corps modifié ; gate middleware `next(e)` inchangé) | Moyen | wip |
| O9 | Moyenne | Maint | Helpers dupliqués (`normalizeOptionalString` ×25, pagination ×3, `Lightbox` ×2, compression image ×7) | `lib/strings.js`, `lib/pagination.js`, `src/shared/` | Faible | done |
| O10 | Moyenne | Perf | Routes obèses (visit/tasks/games 2000+ l.) ; N+1 d'écriture (boucles INSERT) | Couche service par domaine ; INSERT multi-valeurs. **N+1 d'écriture convertis en INSERT multi-valeurs** (idiome `replaceTaskJoinRows` de `tasks.js`) : `groups.js` (`PUT /:id/members` — membres/managers/scopes carte+projet, + résolution des `user_type` en **1 requête** au lieu d'un SELECT par membre) ; `rbac.js` (duplication de profil — copie des `role_permissions` + résolution du catalogue en **1 requête**) ; `tasks.js` (`POST /:id/assign-group` — affectations en **1 requête**, sémantique `assigned`/`skipped`/créneaux préservée, vérifiée par simulation 8 cas). Équivalence relue (2 agents, 0 anomalie) ; couverts par `groups.test.js`/`rbac.test.js`/tests tasks. **Écarté volontairement** : `gl/admin.js` (gl_players) — récupération d'erreur **par ligne** (`ER_DUP_ENTRY` → report + `continue`) incompatible avec un INSERT multi-valeurs tout-ou-rien. Reste : imports `students`/`plants` (2 étapes, ID par ligne) ; couche service par domaine | Élevé/Faible | wip |
| O11 | Moyenne | Perf bundle | Lazy ineffectif (`foretmap-views`/`stats-views`) ; markdown eager ; GL sans lazy ; sourcemap prod | Lazy renderers mascotte + GL ; **`foretmap-views`/`stats-views` rendus purement lazy** (`Toast`←shared, `PlantCatalogPreviewModal`/`StudentStats`/`StudentProfileEditor` en `lazy`) → `main` **431→315 Ko** (gzip 111→81) ; `sourcemap: false`. (markdown encore eager : reste) | Moyen | done |
| O12 | Basse | Maint | ESLint 4 règles sans react-hooks ; pas de Prettier ; 0 typage | `eslint-plugin-react-hooks` + `no-unused-vars` ; Prettier ; `checkJS` incrémental | Faible | done |
| O13 | Basse | Sécu | Pas de `helmet` ; CORS ouvert par défaut ; `DEPLOY_SECRET` non constant-time | `helmet()` (sans CSP, COEP/CORP off) + `timingSafeEqual`. CORS laisse tel quel volontairement : SPA servie same-origin (CORS peu pertinent) et un refus de boot casserait un deploy prod sans `FRONTEND_ORIGIN` | Faible | done |
| O14 | Basse | Maint | Fichiers morts ; `fs.readFileSync(package.json)` en chemin requête | Suppression ; servir `startupVersion` | Trivial | done |

## 4. Détail technique par module

### Frontend — état & rendu
- `App.jsx` (2117 l.) : hub d'état unique (37 `useState`, 30 `useEffect`). Prop-drilling :
  blocs de props `TasksView`/`MapView` **dupliqués ×4** (prof/élève × split/simple) — **fortement
  réduits par O5**. **3 contexts** (`Provider` sur le retour principal ; retour invité hors Provider,
  les hooks renvoyant un objet vide → défauts identiques) :
  (a) `PublicSettingsContext` (`usePublicSettings`) — 9 vues, 18 passes ;
  (b) `SessionContext` (`useSession()`) — valeurs **passées à l'identique dans les 2 chemins prof/élève**
  uniquement : `isN3Affiliated` + `canParticipateContextComments` (30 passes). Les valeurs dépendantes
  du chemin (`isTeacher`, `student`, identités, et `hasPermission`/`hasPermissionInRole` que le chemin
  élève omet pour forcer `false`) restent **volontairement en props** ;
  (c) `DataContext` (`useData()`) — `zones`/`markers`/`plants`/`tasks`/`tutorials`/`taskProjects`/
  `activeMapId`, 8 vues, **73 passes** retirées. `maps` (variante `visibleMaps`/complet) et `VisitView`
  (noms de props distincts `mapZones`/`catalogTutorials`/`initialMapId`) restent en props.
  **~121 passes de props éliminées au total.** Reste : découpage JSX des méga-composants (O6).
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
- Trou de tests frontend (constat initial) : seuls 3 composants ForetMap testés ;
  `App.jsx` + tous les `*-views.jsx` (~21k LOC) = 0 test Vitest. GL bien couvert (~50 composants).
- **O6 en cours** : la logique métier pure des méga-composants est extraite vers `src/utils/`
  et couverte (taskComputations, taskListHelpers, taskEnrollment, PublicSettingsContext…) →
  suite UI 213→264 tests. Au passage, `map-views.jsx` réutilise désormais `taskListHelpers`
  (dédup des copies `normalizeDateOnly`/`currentLocalDateOnly`/`taskEffectiveStatus`).
  Cela bâtit le filet de sécurité avant le découpage proprement dit des `*-views.jsx`.
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
