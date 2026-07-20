# Évolution du code ForetMap — État réel et suite

Ce document sert de feuille de route d’évolution **sans changement métier non souhaité**.
Il reflète l’état réel du dépôt (mis à jour en juillet 2026) et priorise la suite en commençant
par des quick wins.

---

## 1. État actuel (2026-04)

## 1.1 Réalisé

- **Juillet 2026 — GL : acquisition des feuillets par consultation (stratégie ③)** : socle
  permettant qu'un élément consultable du site donne un feuillet. À la **première consultation
  gatée** (QCM lié réussi), le joueur gagne un feuillet du **pool du chapitre** (biome ∈ chapitre
  **ou** `plateau_number` **ou** `lien_pays`) **pour son équipe** ; le **découvreur** est mémorisé
  (`gl_game_feuillet_states.discovered_by_*`, migration `157`) et affiché. Acquisition au niveau
  équipe, carnet cumulatif par joueur, **sans filet de clôture** (choix produit). Moteur
  `lib/glFeuilletAcquisition.js` + pool `glFeuilletChapterPool.js`, branché sur le flux
  `routes/gl/learning.js` ; réglages `gameplay.lore_feuillet_acquisition_enabled` (**off** par
  défaut) / `_channels`. Détail `docs/AUDIT_FEUILLETS_ACCES.md` (§11).
- **Juillet 2026 — GL : feuillets non lisibles par défaut (anti-spoiler)** : côté joueur, la liste
  du carnet est **scopée côté serveur** aux biomes des chapitres joués et le contenu est **masqué**
  (aperçu verrouillé configurable, `gameplay.lore_feuillet_preview_fields`) tant que le feuillet
  n'a pas été **trouvé** ; MJ inchangé. `routes/gl/lore.js`, `lib/glLoreFeuilletPreview.js`,
  migration `158`.
- **Juillet 2026 — GL : refonte du carnet personnel « Mon journal »** (doc dédiée : [`docs/GL_CARNET_JOUEUR.md`](GL_CARNET_JOUEUR.md)). Trois évolutions successives : (1) **suppression des limites explicites** de caractères/médias (réglages `gameplay.player_journal_max_chars` / `player_journal_max_assets` par défaut `0` = illimité, plafond optionnel réglable) ; (2) **refonte en articles** (titre optionnel + texte markdown et/ou illustrations, article « média seul », horodatage création/modif) — tables `gl_player_journal_articles` / `gl_player_journal_article_assets` (migration `155`) ; (3) **import d'éléments appris** dans le carnet (feuillet, écosystème, fiche espèce, tutoriel, glossaire écologie/lore, page de contenu) affichés en fil chronologique avec titre réel + lien — table `gl_player_journal_imports` (migration `156`), gaté sur le marquage « appris » (`gl_learning_acknowledgements`, quiz-gating possible). Backend : accusé générique `POST /api/gl/learning/mark/:resourceType/:ref`, registre `lib/glLearnableResources.js` ; front : contrôle réutilisable `GLLearnAndImport` / `GLJournalImportButton`, timeline `GLPlayerJournalView`. Tests backend (`tests/gl-player-journal.test.js`) et UI (`tests-ui/gl/GLContentPage.test.jsx`).
- **Juin 2026 — GL : régularisation des constantes de game design** : deux tables créées manuellement en production hors pipeline sont régularisées par la migration `151_gl_game_constants.sql` afin de garantir la reproductibilité (base neuve = prod). `gl_game_constants` (14 constantes : nombre de cases, positions Départ/Frontière/Arrivée, soins, gemmes, etc.) et `gl_game_constant_refs` (13 liens souples constante → question lore `qcm_lore`, sans FK, à la manière de la migration `144`). Ces tables sont une **source documentaire uniquement, NON câblée au runtime** : aucune route/API ne les lit, aucun comportement métier n'en dépend. Test `tests/gl-game-constants.test.js` (présence des 14 + 13 lignes, valeurs clés, idempotence au rejeu).
- **Juin 2026 — groupes partagés ForetMap/GL + visiteur** : profil par défaut par groupe (`default_role_id`, `grants_n3beur_access`), résolution RBAC via appartenance groupe n3beur (`lib/groupRole.js`), pont `gl_classes` ↔ `groups`, visiteurs ForetMap limités à l’onglet Visite (sans carte/tâches).
- **Auth professeur côté serveur** : `POST /api/auth/teacher`, token JWT, middleware `requireTeacher` sur les routes sensibles.
- **Suppression du PIN en dur côté client** : plus de vérification locale ; le front passe par l’API auth.
- **CORS conditionnel** : origine restreinte en production via `FRONTEND_ORIGIN`.
- **Backend découpé en routeurs** (montage dans `server.js`, préfixe `/api`) : `auth`, `zones`, `maps`, `map`, `plants`, `tasks`, `task-projects`, `tutorials`, `visit`, `stats`, `students`, `observations`, `audit`, `rbac`, `settings`, `forum`, `context-comments` — chacun sous `routes/<nom>.js` sauf cas particulier documenté.
- **Frontend migré vers Vite + React modulaire** : source dans `src/`, build `dist/`, entrée `index.vite.html`.
- **Tests backend en place** (node:test + supertest) : auth, statuts tâches, suppression élève, temps réel, nouvelles fonctionnalités.
- **Tâches récurrentes (job serveur)** : après validation et échéance passée, duplication automatique des tâches avec `recurrence` (voir `lib/recurringTasks.js`, migration `046`, script `npm run tasks:spawn-recurring`).
- **Migrations versionnées** : table `schema_version`, dossier `migrations/` (001+).
- **Images sur disque (source unique)** : `uploads/` + `image_path` côté API/frontend.
- **Retrait legacy base64 réalisé** : fallback `image_data` retiré du code et migration SQL de suppression des colonnes legacy ajoutée (`migrations/006_drop_legacy_image_data.sql`).
- **Lockfile et outillage dev** : `package-lock.json`, `nodemon`, scripts debug.
- **Journalisation et observabilité** : logger Pino, traces d’erreurs route, endpoint admin de lecture des logs.
- **Vérification de déploiement** : scripts `deploy:check` et `deploy:check:prod` (sans argument) pour contrôler `/api/health`, `/api/health/db`, `/api/ready`, `/api/version`.
- **Tests UI smoke Playwright** : infrastructure e2e ajoutée (`playwright.config.js`, `e2e/`) pour couvrir les parcours critiques élève/prof.
- **CI enrichie avec e2e** : le workflow CI exécute désormais les tests Playwright smoke après build et démarrage applicatif.
- **Modularisation frontend avancée** : extraction des vues `stats`, `audit`, `about` hors de `foretmap-views.jsx` vers des modules dédiés.
- **Charge « classe / Wi‑Fi » (validation technique)** : scénario Artillery **`load/artillery-10vu.yml`** avec au plus **10 utilisateurs virtuels** concurrents, **sans** bypass du rate limit (même IP pour tous les clients de la campagne) — commande **`npm run test:load:10vu`**. Permet d’observer **429** et latences sous le plafond **`/api/*`** réel ; documenté dans **`docs/LOCAL_DEV.md`** et **`docs/API.md`**.
- **Temps réel Socket.IO** : tests étendus dans **`tests/realtime.test.js`** (JWT invalide / expiré, changement de carte via **`subscribe:map`**, `tasks:changed` sans `mapId` vers **`domain:tasks`**) ; paragraphe **Robustesse** dans **`docs/API.md`** (section Temps réel).
- **Exploitation temps réel / hébergeur** : **`GET /api/admin/diagnostics`** inclut **`runtimeProcess`** (`pid`, cluster, indices d’environnement) ; guide **`docs/EXPLOITATION.md`** (Passenger / instances) ; smoke charge **`npm run test:load:socketio-smoke`** ; critères de décision hébergement en **§ 1.4** ci-dessous. Quick wins charge : **`tasks:changed` par carte** (élève, import CSV, tutoriels liés) ; refetch jardin **sans `/api/plants`** si événement zone/repère uniquement (`useForetmapRealtime.js`).
- **Prise de contrôle admin (impersonation)** : permission RBAC **`admin.impersonate`** (profil **admin** par défaut) ; **`POST /api/auth/admin/impersonate`** / **`POST /api/auth/admin/impersonate/stop`** ; JWT avec identité cible et acteur conservé ; UI **Profils & utilisateurs** (« Voir comme cet utilisateur ») et bandeau de retour ; journal d’audit **`auth_impersonate_start`** / **`auth_impersonate_stop`**. Référence API : **`docs/API.md`**.
- **Mascotte visite extensible (Rive + spritesheet + sprite_cut)** : catalogue centralisé (`src/utils/visitMascotCatalog.js`) + hook de pilotage (`src/hooks/useVisitMascotStateMachine.js`) ; mascottes Rive (`sprout-rive`, `scrap-rive`), spritesheet (`olu-spritesheet`) et packs **sprite_cut** (ex. Renard 2) avec palette de comportements étendue (ex. `running`, `inspect`, `map_read`, `celebrate`) ; tests renforcés (`tests/visit-mascot-state.test.js`, `tests/visit-mascot-catalog.test.js`, `tests/mascot-pack.test.js`, `e2e/visit-mascot.spec.js`).
- **Avril 2026 — livrées récentes (résumé)** : **packs mascotte** persistés (`visit_mascot_packs`), renderer **`sprite_cut`**, pack **v2** (`interactionProfile`), **bibliothèque sprites** (`visit_mascot_sprite_library`), clonage API, studio unifié onglet **Packs mascotte** + synchro **`lib/visit-pack/`** (y compris `visitMascotInteractionEvents.js`) ; **biodiversité** : identification **Pl@ntNet** par image via route dédiée (hors agrégateur `sources` de l’autofill) ; **galerie** : réordonnancement des photos zone/repère carte et des médias visite ; **exploitation** : sonde **`npm run prod:transport-probe`** (HTTP/2 vs HTTP/1.1, option Socket.IO) documentée avec **`docs/EXPLOITATION.md`**.
- **Mai 2026 — module groupes/sous-groupes (v1 large)** : nouveau socle SQL (`groups`, `group_members`, `group_scopes`) + migration `079_groups_module.sql`, routeur `/api/groups`, permissions RBAC (`groups.read/manage`, `stats.read.group`, `tasks.assign.group`, `forum.group.moderate`, `observations.read.group`), scope resolver central (`lib/groupScope.js`) branché sur stats/tasks/forum/observations, et UI dédiée « Groupes & sous-groupes » dans l’espace profils prof/admin. Premières intégrations transverses : filtres groupe dans stats/tâches et affectation de tâche par groupe (`POST /api/tasks/:id/assign-group`).
- **Mai 2026 — fondation bi-produit ForetMap + Gnomes & Licornes** : ajout d’un routage par host (`resolveProductFromRequest`), entrée Vite `gl.html`, shell React `src/gl/`, API dédiée `/api/gl/*` (auth joueur/admin, contenu éditorial, gameplay V1, admin classes/joueurs/réglages), tables `gl_*` via migrations `080` et `081`, et diffusion Socket.IO de partie `gl:game:event` (rooms `gl:game:{id}`).
- **Mai 2026 — GL Lot 2A : gameplay MJ paramétrable** : 4 toggles `gameplay.*` (`turns_enabled`, `narration_enabled`, `player_actions_enabled`, `scoring_enabled`) lus par `GET /api/gl/gameplay-settings` ; tours cycliques (`/turn/next`), narration MJ, demandes d'action joueur (`/actions`) résolues par le MJ (`/actions/:id/resolve`) avec bonus de score, types d'événements `turn_change` / `narration` / `score` / `action_request` / `action_resolved` (replay enrichi). Migration `082_gl_gameplay_settings.sql` (toggles, `gl_games.current_team_id`, `gl_team_scores`, `gl_action_requests`). Console MJ enrichie (sélecteur d'équipe active, panneaux conditionnels). UI joueur : bandeau narration, toast tour, modale d'action sur marker. Permission RBAC `gl.action.request` côté joueur.
- **Mai 2026 — GL Lot 2B : contenus & chapitres** : nouveau routeur `routes/gl/chapters.js` (`GET /api/gl/chapters/:slug` public + CRUD admin protégé par `gl.content.manage`) pour gérer chapitres et repères depuis l'interface MJ. Sous-onglets `Pages` / `Chapitres` dans `GLContentsAdminView` et nouveau composant `GLChaptersAdminView` (édition markdown histoire/biotope/biocénose, gestion des markers). Suppression d'un chapitre refusée (`409`) s'il est lié à une partie en cours. Importeur WordPress étendu (`--target=chapters` + `chapterMap` dans `scripts/gl-import-wp.config.json`) pour pré-remplir `gl_chapters.story_markdown` depuis le HTML WP. Tests `tests/gl-chapter-detail.test.js`, `tests/gl-chapters-admin.test.js`, e2e `e2e/gl-content.spec.js`.
- **Mai 2026 — GL Lot 2C : mascottes & équipes** : catalogue G&L dédié (`src/utils/glMascotCatalog.js`, ≥ 6 gnomes + ≥ 6 licornes, ids `gl-*`) avec rendu fallback SVG (`GLMascotFallbackSvg`) et composant réutilisable `GLMascotAvatar`. Nouveau routeur `routes/gl/mascots.js` (`GET /api/gl/mascots[?gameId]`, `POST /api/gl/mascots/assign`) avec assignation transactionnelle, refus collision intra-partie (`409`), refus mascotte inconnue (`404`). UI : `GLMascotsAdminView` refondue (grille + filtres + état assigné), affichage mascotte dans `GLGameBoard` / `GLTopBar` (préfixe `gl-` détecté pour basculer du `VisitMapMascotRenderer` vers `GLMascotAvatar`). Pont CJS→ESM `lib/glMascotCatalog.js` (cache). Tests `tests/gl-mascot-catalog.test.js`, `tests/gl-mascots.test.js`, e2e `e2e/gl-mascots.spec.js`.
- **Mai 2026 — GL exécution transposition (lots initiaux)** : alignement migration `083_gl_players_password.sql` côté routes (`/api/gl/auth/login` pseudo+password avec compat `pin`, `/api/gl/auth/change-password`, `/api/gl/admin/players` enrichi, `PUT /api/gl/admin/players/:id`, `POST /reset-password`, alias `reset-pin`, import joueurs CSV/XLSX), ajout des drapeaux modules `modules.*` (backend `lib/glSettings.js` + exposition `/api/gl/auth/config` + validation admin settings), et première brique packs mascotte GL (migration `084_gl_mascot_packs.sql`, validation Zod `lib/gl-pack/mascotPack.js`, endpoints `/api/gl/mascots/packs*` et `/api/gl/mascots/sprite-library*`, studio front initial `GLMascotPackManager`).
- **Juillet 2026 — lots audit code v1.83.4 à v1.83.12** : optimisation `httpRequestLog`, cache
  intra-requête des claims JWT ForetMap après garde produit (`req.verifiedForetJwt`), transactions
  partielles `task-projects`/`tutorials`, cluster `lib/tasks/taskQueries.js`, helpers purs
  `lib/shared/oauthCommon.js`, tirage GL `lib/gl/questionDrawShared.js`, primitives frontend
  `src/shared/appBase.js`, `src/utils/zoneGeometry.js`, `src/utils/glTermAutolink.js`,
  `src/hooks/useApiResource.js`, et découpage progressif des vues admin GL.

## 1.2 Partiellement réalisé / restant

- **Conditionnement « lu/appris » par réussite au quiz — phase 3 livrée (gating OFF par défaut)** :
  modèle polymorphe de liens ressource ↔ question (`resource_question_links` /
  `gl_resource_question_links`), politiques par ressource (`*_gating_policy`), réglages site/chapitre,
  persistance des tentatives QCM (`user_quiz_attempts` / `gl_qcm_attempts`), endpoints CRUD prof/MJ,
  cœur partagé `lib/shared/resourceQuestionGatingCore.js` et **`lib/learningGatingAcknowledge.js`**
  (challenge + garde 403 sur accusé). **Runtime pull** : quiz obligatoire au clic « Marquer comme… »
  (toutes les questions liées, mode `all`), essais illimités, abandon possible ; plus d'auto-marquage
  sur bonne réponse plateau/catalogue. UI : `LearningGatingQuestionPanel` + branchement FM/GL/plantes.
  **Reste optionnel** : granularité `team` au challenge, gating `lore_glossary` / `feuillet`.
- **Observabilité externe (hors scope court terme)** : intégration **Sentry**, **OpenTelemetry** ou agrégation fichier/ELK pour historiser au-delà du tampon mémoire Pino — à trancher selon budget hébergeur et besoin de rétention ; l’app expose déjà stdout, `/api/admin/logs`, `/api/admin/diagnostics` (inclut désormais **`visitMascotHint`** pour diagnostiquer une visite « vide » / mascotte absente côté données) et **`X-Request-Id`** pour corrélation.
- **Frontend (partiellement réalisé)** :
  - `auth`, `tâches`, `carte`, `stats`, `audit`, `about` sont désormais extraits en modules dédiés.
  - **Reste à faire** : éventuel nettoyage final de façade dans `foretmap-views.jsx` (optionnel, faible valeur métier).
- **Couverture tests (partiellement réalisé)** :
  - parcours critiques scripts/images déjà renforcés (`post-deploy-check`, images tâches/zones/observations en mode disque).
  - checklist de vérifications UI manuelles post-modularisation ajoutée dans `docs/EXPLOITATION.md` + tests UI Playwright (smoke + cycles complets) + exécution e2e en CI.
  - **Avancement récent** : ajout des flux complets tâche (création -> prise -> soumission -> validation), photo zone (upload/suppression), retrait d’une tâche par élève et cas PIN invalide ; **Vitest en CI** (`npm run test:ui`) ; e2e ForetMap étendus (biodiversité, stats, impersonation, carnet observations).
  - **Reste à faire** : élargir progressivement vers des cas limites métiers rares (multi-élèves concurrents côté **UI** e2e, interruptions réseau réelles). Côté **API / une IP**, le profil **`test:load:10vu`** couvre déjà une approximation « ~10 utilisateurs » avec rate limiting actif.
- **Frontend — optimisation bundle (partiellement réalisé, juin 2026)** :
  - lazy-load des onglets rares dans `App.jsx`, `manualChunks` Vite, composant toast partagé `TimedToast`, extraction `LivingBeingsCatalogPanel` et `lib/tasks/taskImport.js`, pipeline JWT `lib/auth/jwtPipeline.js`.
  - **Reste à faire** : scinder `plants-views.jsx` hors de `foretmap-views.jsx` (supprimer l’avertissement Vite sur import dynamique), poursuivre le découpage `map-views` / `tasks-views`.
- **Audit d'optimisation (juin/juillet 2026, tracker `docs/AUDIT_OPTIMISATION.md` items O1-O14)** :
  - **Livré ou bien avancé** : lazy renderers mascotte + `sourcemap:false` prod (O1/O11) ; INSERT multi-valeurs jointures tâches (O10 partiel) ; `helmet` + `timingSafeEqual` + `startupVersion` (O13/O14) ; outillage react-hooks/Prettier + correctif hooks conditionnels (O12) ; nettoyage fichiers morts (O14) ; helpers partagés (O9) ; `asyncHandler` déployé sur de nombreux routeurs (O8 wip) ; premières mutualisations backend/frontend de `docs/AUDIT_CODE_2026-07.md`.
  - **Reste à faire (structurel, multi-lots)** : finaliser les Contexts par domaine et découpages JSX (O5/O6) ; poursuivre l'adoption `zod` par middleware `validate(schema)` sur les routeurs restants (O7) ; terminer le rollout `asyncHandler` sur les handlers résiduels (O8) ; couche service par domaine et batchs restants (O10) ; CSS-modules progressifs.
  - **Décision produit en attente** : migration `xlsx@0.18.5` (CVE) — `exceljs` (npm) vs SheetJS CDN (O4).

## 1.2bis Dette / nettoyage différé — vues et tables mortes (juin 2026)

> Section dédiée au suivi de la dette de schéma SQL (objets non consommés par le
> code). À tenir à jour au fil des suppressions effectives.

- **Vues mortes supprimées (migration `152_drop_dead_views.sql`)** : `v_species`
  (créée par la migration `124`) et `v_gl_food_web` (créée par la migration
  `136`) ne sont consommées **nulle part** dans le code (vérifié par grep récursif
  sur `lib/`, `routes/`, `scripts/`, `src/`, `tests/`). `v_gl_food_web` avait été
  provisionnée en amont d'une **UI réseau-trophique GL jamais branchée**. Drop sans
  risque (re-création triviale via les définitions des migrations 124/136 si besoin).
  Les vues `v_food_web` et `v_zone_inventory` sont **conservées** : elles sont lues
  par `routes/food-web.js`.
- **Tables QCM héritées — DROP différé d'une release** : `gl_qcm_question_glossary`
  (≈ 2776 lignes) et `gl_qcm_lore_question_glossary` (≈ 161 lignes) ne sont plus ni
  écrites ni lues depuis le refactor vers le modèle unifié `gl_resource_question_links`.
  La **parité clé-à-clé** entre ces tables héritées et `gl_resource_question_links` a
  été vérifiée. Leur suppression est **prévue au lot suivant** (migration `154` à
  venir, **non incluse ici**), après **reconfirmation de parité sur la prod réelle**
  pour éviter toute perte de liaison ressource ↔ question.
- **À statuer séparément** : la table `gl_species_interactions` (≈ 67 lignes), qui
  alimentait l'ex-vue `v_gl_food_web`, n'est plus exploitée une fois la vue
  supprimée. Décision (conservation comme amorce de contenu GL vs suppression) à
  trancher indépendamment du présent lot.
- **Visite V1 supprimée (migration `166_drop_visit_v1_content.sql`, destructive —
  F4 du registre `docs/reference/INCOHERENCES.md`)** : `visit_zone_content` et
  `visit_marker_content`, gelées depuis la migration `022` (copie douce vers
  `visit_zones`/`visit_markers`), sans plus aucun lecteur/écrivain applicatif.
  La migration rejoue la copie douce en filet de sécurité avant le `DROP`.
  Garde de non-régression : `tests/migrations-guard.test.js`.
- **Liens tâches ↔ zones/repères (F5)** : `task_zones`/`task_markers` sont l'unique
  source de vérité ; `tasks.zone_id`/`tasks.marker_id` ne sont plus qu'une copie du
  premier lien (`syncLegacyLocationColumns`, seul écrivain) conservée pour la compat
  des exports et données historiques. Les replis en lecture ont été retirés.

---

## 1.3 Fonctionnalité livrée — Projets de tâches (V1 minimale)

- **Ajouté :** les tâches peuvent désormais être rattachées à un **projet**.
- **Portée V1 :**
  - projet lié à une carte (`map_id`) ;
  - création de projet dans l’onglet tâches (prof) ;
  - sélection d’un projet dans le formulaire de tâche ;
  - affichage et filtre par projet dans la vue tâches ;
  - API dédiée `/api/task-projects` (GET, POST, PUT, DELETE).
- **Compatibilité :** les tâches existantes sans projet restent valides (`project_id = NULL`).
- **Comportement suppression projet :** les tâches sont conservées et leur `project_id` est remis à `NULL` (`ON DELETE SET NULL`).

### Évolutions possibles (jalons)

1. Vue dédiée de gestion de projets (liste détaillée, édition en masse, archivage).
2. Indicateurs de progression de projet (% tâches terminées/validées, restant à faire).
3. Permissions RBAC fines par projet (création, édition, validation, visibilité).
4. Filtres/stats avancés par projet (prof et élève, export ciblé).
5. Lien projet ↔ tutoriels/ressources pédagogiques pour guider un parcours complet.

---

## 1.4 Temps réel et hébergement — critères de décision (o2switch / charge)

Objectif : **stabilité** avec utilisateurs simultanés et **délai de rafraîchissement** acceptable. Le canal Socket.IO actuel est un **signal** ; la donnée à jour passe par **refetch REST** (debounce côté client).

| Situation                                                                                  | Piste recommandée                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Une instance Node** sur le mutualisé, symptômes rares                                    | **Option B** : conserver l’existant ; surveiller **`GET /api/admin/diagnostics`** (`runtimeProcess`, métriques HTTP), logs Socket.IO (`socket_io_engine_connection_error`, déconnexions anormales) ; **`npm run test:load:10vu`** et **`npm run test:load:socketio-smoke`** en local/préprod. Quick wins côté code : **`tasks:changed` par `mapId`** (suppression élève, import CSV, tutoriels liés), debounce refetch tâches/jardin, refetch jardin **sans `/api/plants`** quand `garden:changed` = zone/repère uniquement. |
| **Plusieurs instances Node** sans Redis                                                    | **Option A/D** : sans **`@socket.io/redis-adapter`** (ou équivalent), les événements ne traversent pas les processus — soit **réduire à une instance** si l’hébergeur le permet, soit **VPS + Redis** pour adapter multi-instance.                                                                                                                                                                                                                                                                                           |
| **Saturation HTTP / latence** liée au **long-polling** (nombreuses connexions simultanées) | **Option C** : hébergement ou frontal avec **WebSocket** correctement terminé ; réactiver WS côté client/serveur **derrière un drapeau** après validation.                                                                                                                                                                                                                                                                                                                                                                   |
| **Proxy WS irréparable** sur le mutualisé                                                  | **Option E** ou maintien du **polling** documenté ; services managés uniquement si le coût / la dépendance externe sont acceptés.                                                                                                                                                                                                                                                                                                                                                                                            |

Références : **`docs/EXPLOITATION.md`** (temps réel / Passenger), **`docs/LOCAL_DEV.md`** (charge Artillery + smoke Socket.IO), **`docs/API.md`** (section Temps réel).

## 2. Backlog restant priorisé

## 2.1 Priorité haute

1. **Consolider les tests UI automatisés**
   - Maintenir et stabiliser les scénarios Playwright désormais étendus (tâches, photos, retrait tâche, auth invalide, **visite / mascotte** : `e2e/visit-mascot.spec.js` + fixture `e2e/fixtures/visit-api.fixture.js`).
   - Ajouter des cas limites avancés (erreurs API, données extrêmes, parcours multi-élèves) pour limiter la fragilité.

## 2.2 Priorité moyenne

2. **Maintenance continue post-bascule image**
   - Maintenir les scripts/reportings en mode no-op explicite quand il n’y a plus de legacy.
   - Garder la documentation “disk-only” alignée avec l’état réel de prod/dev.

## 2.3 Priorité basse

3. **Nettoyage façade historique frontend (optionnel)**
   - Réduire encore `foretmap-views.jsx` si souhaité, sans changement de comportement.

---

## 3. Prochaine séquence recommandée

## Phase 1 — Renforcer la non-régression UI

- Étendre les specs Playwright smoke vers des scénarios complets.
- Ajouter des cas d’erreur (auth invalide, endpoint indisponible, média absent).

## Phase 2 — Industrialiser l’exécution

- Maintenir la stabilité des runs e2e CI (timeouts, artefacts, diagnostics).
- Ajuster les scénarios flaky au fil des retours pipeline.

## Phase 3 — Maintenance de routine

- Garder les docs et scripts de migration/reporting cohérents avec le mode disk-only.
- Continuer l’entretien de la couverture backend/scripts sur les points sensibles.

---

## 4. Ordre suggéré des actions (à partir de maintenant)

| Ordre | Action                                                | Priorité |
| ----- | ----------------------------------------------------- | -------- |
| 1     | Étendre les scénarios Playwright e2e (flux complets)  | Haute    |
| 2     | Maintenir scripts/docs post-bascule image (disk-only) | Moyenne  |
| 3     | Nettoyage façade historique frontend (optionnel)      | Basse    |

---

## Versionnage

Le flux SemVer, `CHANGELOG.md` et les scripts `bump:*` / `release:*` sont décrits dans [VERSIONING.md](VERSIONING.md).
Ce document est mis à jour au fil des évolutions implémentées.
