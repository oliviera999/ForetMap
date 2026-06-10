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
| O2 | Haute | Perf | `taskTileProps` recréé chaque render + `TaskTileCard` non mémoïsé ⇒ re-render de toutes les tuiles par tick | **Fait** : `TaskTileCard = React.memo(...)` ; `taskTileProps` en `useMemo` (deps complètes) ; les ~14 handlers/dérivés de `TasksView` (`assign`/`unassign`/`setTaskStatus`/`deleteTask`/`runTeacherQuickAssign`/`withLoad`/`teacherStatusActions`/`teacherTaskPerms`…) **tous `useCallback`/`useMemo`** → memo **effectif de bout en bout**. Couverture d'interaction présente : `tests-ui/components/TaskTileCard.test.jsx` vérifie qu'un changement d'état parent non lié **ne re-rend pas** la tuile (sonde `tooltipText`) | Faible→Moyen | done |
| O3 | Haute | Perf | RBAC : 3-5 requêtes DB par requête authentifiée, non caché | **Tenté puis reverté** : un cache TTL avec invalidation par hook (`setPrimaryRole`/routes rbac) s'est avéré à invalidation **incomplète** — des chemins mutent `roles`/`user_roles` en SQL direct (dédup `rbac.js`, tests) → permissions périmées (a cassé `api.test.js`). Re-tenter avec un **compteur de version RBAC global** inclus dans la clé de cache (incrémenté de façon centralisée à toute écriture des tables RBAC) **ou** un cache **request-scoped**. Sécurité-critique : à ne pas livrer sans preuve d'invalidation complète. **Maintenu `differe` (analyse 2026-06-10)** : (a) le cache **request-scoped** n'apporte ~rien — `hydrateAuthFromTokenClaims` (donc `buildAuthzPayload`) ne s'exécute **qu'une fois par requête** (un seul guard d'auth par route), pas de duplication intra-requête à collapser ; (b) le seul sous-ensemble **sûr** à cacher cross-request est `getRolePermissions(roleId)` (clé = `roleId`, partagé entre users, **4 chemins d'écriture seulement**, tous dans `rbac.js`/`lib/rbac.js`) — `getPrimaryRoleForUser` (user→rôle) garde de multiples writers (cause du revert) ; mais **11+ tests écrivent `role_permissions` en SQL direct puis lisent immédiatement** → un cache les casserait sauf bypass `NODE_ENV==='test'` (qui supprime toute vérification). À livrer **uniquement avec une DB** pour valider `api.test.js`/`rbac.test.js`. **Implémenté (2026-06-10) via compteur de version global** : `database.js` incrémente `rbacWriteVersion` à **toute écriture RBAC** détectée centralement (`isRbacWriteSql` : verbe d'écriture + table `roles`/`user_roles`/`role_permissions`) dans `execute` (post-écriture) **et** `withTransaction` (post-commit, drapeau `rbacDirty`) — **tous** les chemins d'écriture RBAC passent par là (aucune connexion brute n'écrit ces tables). `lib/rbac.js` cache `getPrimaryRoleForUser`/`getRolePermissions` avec la version en clé → une entrée n'est resservie que si **aucune** écriture RBAC n'a eu lieu depuis (y compris SQL direct des tests → fix exact du mode d'échec du revert). Détection couverte par `tests/rbac-write-detection.test.js` (no-DB, 4 tests, toutes les formes d'écriture réelles). **Validation intégration (`api.test.js`/`rbac.test.js`) déléguée à la CI** (pas de MariaDB en dev) | Moyen | wip |
| O4 | Haute | Sécu/Maint | `xlsx@0.18.5` — 2 CVE High via uploads | **Fait** : adaptateur `lib/spreadsheet.js` (exceljs) + preuve d'équivalence xlsx ; **14 modules d'import migrés** (app principale + 11 libs GL + `contentLibraryBulk`). Production **100 % xlsx-free** ; `xlsx` déplacé en **devDependencies** (fixtures de tests uniquement) → CVE-2023-30533 / CVE-2024-22363 **non joignables au runtime prod**. exceljs corrige en bonus le mojibake emoji de xlsx | Élevé | done |
| O5 | Haute | Extensibilité | `App.jsx` God component + prop-drilling ×4 | **3 contexts livrés** (Provider sur le retour principal d'`App` ; retour invité hors Provider → défauts identiques). **(1) `PublicSettingsContext`** : 9 vues, 18 passes retirées. **(2) `SessionContext`** (valeurs **réellement globales** uniquement) : `isN3Affiliated` + `canParticipateContextComments`, **30 passes retirées** ; `hasPermission`/`hasPermissionInRole`/`isTeacher`/`student`/identités **restent en props** (chemin élève les supprime volontairement). **(3) `DataContext`** : `zones`/`markers`/`plants`/`tasks`/`tutorials`/`taskProjects`/`activeMapId` sur 8 vues, **73 passes retirées** (`App` 2155→2117 l) ; `maps` (variante `visibleMaps`/`maps`) et les noms distincts de `VisitView` (`mapZones`…) restent en props. **Total : ~121 passes de props éliminées.** Reste : découpage JSX (O6) | Élevé | wip |
| O6 | Haute | Maint/Test | Composants monolithiques + 0 test UI sur ~21k LOC | **En cours** : (1) 1er test UI app principale (`TaskTileCard`) ; (2) **logique pure extraite + testée** → `taskComputations.js` (7 fn, 19 tests), `taskListHelpers.js` (18 fn, 35 tests), `taskEnrollment.js` (7 fn, 16 tests), `taskLogDraft.js` (3 fn, 5 tests) + dédup `fileToDataUrl`/date-statut ; (3) **découpage JSX** : 3 modals sortis vers `src/components/tasks/` — `TaskLogModals` (`LogModal`+`TaskLogsViewer`), `TaskProjectFormModal`, `TaskFormModal` (~779 l) ; helpers de formulaire/affichage mutualisés (`taskFormHelpers.js` 9 tests, `taskDisplayHelpers.js` 7 tests). Côté **`map-views.jsx`** : géométrie d'édition de zone → `zoneEditGeometry.js` (8 tests), blocs éditoriaux purs → `visitEditorialBlocks.js` (5 tests), puis `ZoneDrawModal` + champ partagé `ZoneOrMarkerEmojiField` + `PhotoGallery` (+ son helper de réordonnancement testé) → `src/components/map/`. `TaskTileCard` (+`startDateChip`/`Lightbox`) + `TaskProjectsBlock` → `tasks/`, hook `useMapGestures` (~452 l) → `src/hooks/`. Côté carte : blocs partagés (`mapModalShared`) puis les 2 gros modals `ZoneInfoModal` (~800 l) + `MarkerModal` (~935 l) → `src/components/map/` (en-têtes d'imports générés + scan d'exhaustivité des réfs). **`tasks-views.jsx` 4230→1735 l (-59%)** ; **`map-views.jsx` 4049→1302 l (-68%)**. Côté **`visit-views.jsx`** : helpers purs de galerie média extraits → `src/utils/visitMediaGallery.js` (`itemSeenKey`, `visitMediaImgSrc`/`ThumbDisplaySrc`/`LightboxSrc`, `reorderVisitMediaRows`, 8 tests) ; géométrie mascotte → `src/utils/visitMascotGeometry.js` (`visitZoneSvgTextUniformYTransform`, `clampVisitMascotPctForViewport`, 7 tests) ; **constructeur éditorial de `VisitEditorPanel`** découpé : réducteurs purs `buildNewEditorialBlock`/`updateEditorialBlockById`/`moveEditorialBlockById`/`removeEditorialBlockById` ajoutés à `src/utils/visitEditorialBlocks.js` (12 tests : bornes du déplacement, patch ciblé, défauts par type) **avant** de sortir le sous-composant JSX `src/components/visit/VisitEditorialBuilder.jsx` (boutons d'ajout, liste réordonnable ↑/↓/Suppr., champs par type ; état conservé dans le parent, callbacks `onAdd/onMove/onUpdate/onRemove` ; 9 tests d'isolation). Sous-panneau **`VisitSyncPanel`** (import sélectif carte↔visite, ~185 l) sorti vers `src/components/visit/VisitSyncPanel.jsx` avec sa logique de sélection pure → `src/utils/visitSyncSelection.js` (`toggleIdInList`, 5 tests) ; au passage **correction d'une boucle de rendu latente** (les `sourceZones`/`sourceMarkers` en `|| []` recréaient un tableau à chaque rendu, déps d'un effet de présélection → boucle ; `useMemo` recommandé par react-hooks, valeur identique) qui rendait le composant non montable ; 4 tests d'isolation (api mocké : garde enseignant, présélection, toggle, POST `/api/visit/sync`). Côté **`foretmap-views.jsx`** : helpers purs de liens source → `src/utils/plantSourceLinks.js` (`isHttpLink`, `isLocalUploadsPath`, `isLikelyDirectImageUrl`, parsing Wikimedia Commons `File:`/`Category:`, `getSourceLabel`, 9 tests) ; valeurs de formulaire plante → `src/utils/plantFormValues.js` (`normalizedPlantValue`, `isGenericPotagerLabel`, `parseLinkCandidates`, `mergePlantPhotoFieldValue`, **+ `EMPTY_PLANT_FORM`/`extractPlantForm`** déplacés depuis le composant — formulaire vierge 33 colonnes + extraction normalisée d'une fiche, 14 tests) ; géométrie biodiv → `src/utils/biodivMapGeometry.js` (`parseZonePointsJson`, `computeBiodivMapFitRect`, 8 tests) ; catalogue biodiv → `src/utils/plantCatalogHelpers.js` (`isVegetalCatalogEntry`, `groupPlantLocationsByMap` repli `'foret'`, 6 tests) ; formulaire biodiv → `src/utils/biodivPlantForm.js` (`pickPlantnetVernacularName` heuristique nom FR, `prefillPhotoSlotKey`, `findFirstBiodivHeroPhotoCandidate`, 10 tests). Côté **`settings-admin-views.jsx`** : affichage des réglages → `src/utils/settingDisplay.js` (`humanizeKey`, `inferSectionFromKey`, `scopeLabel`, `typeLabel`, `buildConstraintHelp`, 10 tests). Côté **`tutorials-views.jsx`** : liste de tutoriels → `src/utils/tutorialListHelpers.js` (`sortTutorialsByOrder`, `moveIndex`, `linkedTaskStatusLabel`, **+ `tutorialZonePickLabel`** (libellé zone « Nom — espèces ») et **`createInitialTutorialForm`** (formulaire vierge, tableaux neufs), 11 tests). Côté **`profiles-views.jsx`** (`ProfilesAdminView`) : logique RBAC pure → `src/utils/profilesRbacHelpers.js` (`isN3beurTierConfigurableProfile`, `sortRolesForDisplay`, `deriveProfilesCapabilities` ~12 capacités, `normalizeRoleEditFields`, 11 tests) ; **5 sous-composants JSX** sortis vers `src/components/profiles/` — `ProfilesRoleList` (liste profils + réordonnancement ↑↓/sélection/édition/duplication, 6 tests), `ProfilesPermissionRows` (matrice Actif/PIN du catalogue, 4 tests), `ProfilesUserAssignmentList` (attribution de profil par compte + garde admin, 4 tests), `ProfilesRoleQuickConfig` (emoji + PIN du profil, 6 tests), `ProfilesRoleProgressionConfig` (montée auto + seuil/proposition/forum+contexte/plafond du palier n3beur, 7 tests) → **`ProfilesAdminView` 1340→1053 l (-287 l)**. Stratégie : étendre le filet de tests par extraction de logique pure **avant** de découper les méga-composants | Élevé | wip |
| O7 | Moyenne | Extens/Sécu | `zod` jamais utilisé ; validation manuelle hétérogène | **Infra livrée** : middleware réutilisable `lib/validate.js` (`validate({ body, query, params })`, `req.validatedQuery`/`Params` pour Express 5) + test `tests/validate-middleware.test.js`. Rollout par route **incrémental** (préserver l'ordre auth→validation et les messages existants). **1ère route adoptée** : `routes/media-library.js` — `validate({ query })` (coercition permissive de `limit`, jamais de 400) + `validate({ body })` (upload : `media_data` requis/trim, `original_name`/`originalName` optionnels) ; schémas exportés + test no-DB `tests/media-library-validation.test.js` (3 tests, équivalence comportement historique). Étendu **friction-free** (coercition de query, jamais de 400) à **`audit`** (`limit` borné [1,200], reproduit `parseInt||50`) et **`settings`** (`/admin/media-library?limit=`, `/admin/system/logs?lines=`) ; schémas exportés + tests no-DB `tests/audit-query-validation.test.js`/`tests/settings-query-validation.test.js` prouvant l'équivalence exacte avec l'ancienne logique sur les cas limites | Moyen | wip |
| O8 | Moyenne | Maint | ~338 try/catch dispersés ; `respondInternalError` redéfini en doublon | **Infra livrée** : `lib/asyncHandler.js` (catch sync+async → `next(err)` → handler central `server.js`) + test `tests/async-handler.test.js`. Rollout **incrémental** par route (préserver statut + corps d’erreur existants). Adopté sur `audit`/`zones`/`map`/`maps`/`observations`/`context-comments`/`stats`, **`media-library`**, **`forum`** (8 handlers ; équivalence **prouvée** : diff after-strip-indentation = wrappers/import uniquement), **`groups`** (7 handlers ; mapping `1062`→409 « Slug déjà utilisé » préservé via le helper `rethrowSlugConflict` — catch **scopé** à l’INSERT/UPDATE dup-prone, relance une erreur `.status=409` que le handler central renvoie tel quel), **`plants`** (6 handlers CRUD/upload : les 4 CRUD initiaux + `POST /:id/photo-upload` et `POST /import` — ce dernier garde son bloc transaction imbriqué `try/commit/catch/rollback/finally` **inchangé**, seul le catch externe plain devient `asyncHandler` ; diff `-w` = wrappers seuls), et **`students`** (3 handlers à catch *plain* `respondInternalError` : `GET /import/template`, `POST /register`, `DELETE /:id` ; équivalence prouvée par diff after-strip-indentation = wrappers/import. **Laissés** : `POST /import`, `POST /:id/duplicate`, `PATCH /:id/profile` — recovery imbriquée par ligne / `logRouteError` interne → observabilité préservée), et **`settings`** (7 handlers à catch *plain* mono-niveau : `/public`, `GET /admin`, `POST /admin/maps/:id/image`, `GET /admin/media-library`, `GET /admin/system/logs`, `GET /admin/system/oauth-debug`, `POST /admin/system/restart` ; diff `-w` = wrappers/import. **Laissés** : `PUT /admin/:key` (mappe toute erreur en **400 `e.message`** + `logRouteError`), `POST`/`DELETE /admin/media-library` (mapping `.status`+message), `GET .../species-autofill-providers-test` (**message custom** « Auto-test fournisseurs en échec »), et `POST /admin/maps`/`PUT /admin/maps/:id`/`GET .../diagnostics` (try/catch **imbriqué** — laissés par prudence)), et **`tasks`** (12 handlers *plain* mono-niveau migrés en 2 incréments : d'abord 6 GET — `/referent-candidates`, `/:id/image`, `/:id`, `/import/template`, `/:id/logs`, `/:id/logs/:logId/image` — puis 6 autres — `GET /` (liste), `POST /reorder-project`, `DELETE /:id`, `POST /:id/assign`, `POST /:id/assign-group`, `POST /:id/validate` ; diff `-w` = wrappers/import. `tasks.js` garde son `respondInternalError` **local** (doublon connu ligne ~869) car encore utilisé par les handlers **non migrés** : `POST /import` (mapping `e.status===400`), `PUT /:id` (`exposeDetail`), `POST /:id/unassign` (message « Erreur lors du retrait »), et les catches **imbriqués** `POST /`/`POST /proposals`/`POST /:id/done`/`DELETE /:id/logs/:logId` → reprise route par route ultérieure), et **`rbac`** (7 handlers à catch *plain* mono-niveau — 3 `GET`, 1 `PATCH`, 3 `PUT` de lecture/configuration de profils ; diff `-w` = wrappers/import. **Laissés** : les 2 handlers à catch **imbriqué** dup `1062`→409 (création de compte/duplication de profil), et les 3 à `logRouteError`+mapping (`PATCH` profil → 400, `POST` slug `1062`→409) → observabilité/contrat préservés), et **`auth`** (route **sécurité** ; 6 handlers à catch *plain* mono-niveau : `POST /login`, `/forgot-password`, `/reset-password`, `/teacher/forgot-password`, `/teacher/reset-password`, `/elevate` — **seul le chemin 500 catch-all** change, les `return res.status(4xx)` explicites (mauvais identifiants, PIN, etc.) **inchangés** ; diff `-w` = wrappers/import. **Laissés** : `/me`/`/google/start` (sans catch externe), `GET /google/callback` (`logRouteError`+redirect OAuth), et `PATCH /me/profile`/`POST /register`/`/teacher`/`/admin/impersonate*` à catch **imbriqué** (dup `1062`→409 / 401 / `logRouteError`→500). `auth.js` garde son `respondInternalError` **local** (doublon connu l.306)). **Patron `.status` (démo, 2026-06-10)** : `POST /profiles` de `rbac.js` **converti** au patron « mapping spécial » — helper `rethrowSlugConflict` **extrait** vers `lib/slugConflict.js` (canonique, partageable avec `groups.js` → dédup O9 ; 4 tests no-DB) + `catch` **scopé sur l'INSERT** relançant `.status=409` rendu tel quel par le handler central, reste du handler sous `asyncHandler`. Équivalence **raisonnée** (changement structurel, pas un simple `diff -w`) : l'INSERT roles = seule source de `1062` ; autres erreurs → 500 ; supprime un double-log pré-existant. Restants au même patron : `POST /profiles/:id/duplicate` (SQL multi-lignes) + les catches dup imbriqués. **Patron mapping spécial** : scoper un petit catch sur l’opération + relancer une erreur `.status`. **Rollout sélectif restant** : handlers à **label** `logRouteError(e, req, 'label')` ou **recovery custom** (`plants` `autofill`/`plantnet-identify` → 502 ; `gl/*`) laissés en l’état pour préserver l’observabilité/le comportement ; à reprendre route par route, **jamais en masse mécanique** (risque cross-boundary sur catches hétérogènes) | Moyen | wip |
| O9 | Moyenne | Maint | Helpers dupliqués (`normalizeOptionalString` ×25, pagination ×3, `Lightbox` ×2, compression image ×7) | `lib/strings.js`, `lib/pagination.js`, `src/shared/` | Faible | done |
| O10 | Moyenne | Perf | Routes obèses (visit/tasks/games 2000+ l.) ; N+1 d'écriture (boucles INSERT) | Couche service par domaine ; INSERT multi-valeurs. **N+1 d'écriture convertis en INSERT multi-valeurs** (idiome `replaceTaskJoinRows` de `tasks.js`) : `groups.js` (`PUT /:id/members` — membres/managers/scopes carte+projet, + résolution des `user_type` en **1 requête** au lieu d'un SELECT par membre) ; `rbac.js` (duplication de profil — copie des `role_permissions` + résolution du catalogue en **1 requête**) ; `tasks.js` (`POST /:id/assign-group` — affectations en **1 requête**, sémantique `assigned`/`skipped`/créneaux préservée, vérifiée par simulation 8 cas). enfin **import plants** stratégie `replace_all` (`routes/plants.js` — INSERT multi-valeurs **par lots de 200**, 33 colonnes × 2000 lignes max dépasseraient la limite de placeholders d'une requête préparée ; aucune dépendance à `insertId` ; équivalence ordre+compte vérifiée par simulation). Équivalence relue (2 agents, 0 anomalie) ; couverts par `groups.test.js`/`rbac.test.js`/`tasks*`/`plants-import.test.js`. enfin **import students** : l'INSERT users garde sa récupération d'erreur par ligne (non batchable), mais l'**assignation de rôle** (`ensurePrimaryRole` par ligne = N requêtes) passe en **INSERT IGNORE multi-valeurs par lots** après la boucle (role_id résolus en 1 requête ; comptes UUID neufs → équivaut à `ensurePrimaryRole`, vérifié par simulation). Équivalence relue (2 agents, 0 anomalie) ; couverts par `groups.test.js`/`rbac.test.js`/`tasks*`/`plants-import.test.js`/`students-import.test.js` (CI). **Écartés volontairement** (récupération d'erreur **par ligne** `ER_DUP_ENTRY`→report+`continue`, incompatible avec un INSERT tout-ou-rien) : `gl/admin.js` (gl_players), **INSERT users** de students, et branches `upsert_name`/`insert_only` de l'import plants (dépendance à `insertId` pour la dédup intra-lot). Reste : couche service par domaine | Élevé/Faible | wip |
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
