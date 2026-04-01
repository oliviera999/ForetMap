# Journal des versions

Ce fichier suit les principes de [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).
Le numéro de version suit [Semantic Versioning](https://semver.org/lang/fr/) (MAJEUR.MINEUR.CORRECTIF).

## [Non publié]

### Modifié
- **Cartes & tâches (vue scindée)** : la zone carte est alignée en haut sous la barre d’outils (`padding-top` supprimé, `align-items: flex-start`) pour supprimer l’espace entre la barre d’édition et l’image.
- **Profils & utilisateurs / édition compte** : erreurs (ex. **élévation PIN**, 403) visibles **dans la modale** (auparavant masquées sous le calque `z-index: 200`) ; `<form noValidate>` + bouton **submit** ; repli **`user_type`** depuis la ligne liste ; **`load()`** après succès isolé. Préremplissage : fusion liste + GET détail, clés insensibles à la casse, `encodeURIComponent`, `jsonTextField` côté API.
- **Notifications (UI)** : le panneau du centre de notifications se ferme au **clic à l’extérieur** (hors panneau et hors bouton cloche) et via un bouton **×** en haut à droite du panneau.
- **Profils & utilisateurs / édition compte** : ouverture avec **`GET /api/rbac/users/:userType/:userId`** ; champs préremplis avec les valeurs serveur ; si `first_name`/`last_name` sont absents, complément à partir de `display_name` ou de la partie locale de l’email. Prénom et nom obligatoires à l’enregistrement ; indicateur de chargement dans la modale. Documentation **`docs/API.md`** ; test **`rbac.test.js`**.

### Ajouté
- **Profils & utilisateurs** : modification d’un **compte quelconque** (n3beur ou enseignant) depuis la section « Attribution des profils » — bouton **Modifier** (prénom, nom, pseudo, email, description, affiliation n3beur, mot de passe optionnel). API **`PATCH /api/rbac/users/:userType/:userId`** (permission `admin.users.assign_roles`, même élévation PIN que l’attribution de profils) ; un compte au profil principal **admin** n’est modifiable que par un acteur **admin**. **`GET /api/rbac/users`** enrichi (`first_name`, `last_name`, `pseudo`, `description`, `affiliation`). Renommage n3beur : synchronisation des noms dans **`task_assignments`** et **`task_logs`**. Documentation **`docs/API.md`** ; test **`rbac.test.js`**.
- **RBAC / inscriptions tâches** : plafond d’inscriptions **simultanées** configurable par **profil n3beur** (`roles.max_concurrent_tasks`, migration **`047_roles_max_concurrent_tasks.sql`**) — seules les tâches **non validées** comptent ; `NULL` = utiliser le réglage global `tasks.student_max_active_assignments` ; `0` = pas de limite pour ce profil ; `POST /api/tasks/:id/assign` et `GET /api/auth/me` utilisent le plafond effectif. Édition dans **Profils & utilisateurs** (même périmètre que forum / seuils paliers). Documentation **`docs/API.md`** ; tests **`api.test.js`**.
- **Tâches récurrentes** : job quotidien (`lib/recurringTasks.js`) après init BDD — duplication automatique des tâches **validées** avec `recurrence` (weekly / biweekly / monthly) lorsque `due_date` est passée (fuseau `FORETMAP_RECURRENCE_TZ`, défaut Europe/Paris) ; clone en `available` sans assignations, copie zones / repères / tutoriels, nouvelles dates décalées (`start_date` absent → repli sur la date de `created_at`) ; idempotence `tasks.recurrence_spawned_for_due_date` ; `parent_task_id` vers la source ; audit `recurring_task_spawn` ; temps réel. Désactivation : `FORETMAP_DISABLE_RECURRING_TASK_JOB=1` ou `NODE_ENV=test`. Script `npm run tasks:spawn-recurring`. Migration **`046_task_recurrence_spawn_marker.sql`**.

- **RBAC** : duplication d’un profil — `POST /api/rbac/profiles/:id/duplicate` (slug et nom affiché distincts ; copie des permissions, seuils, ordre et flags forum / commentaires contextuels ; **PIN non copié**) ; bouton **Dupliquer** dans **Profils & utilisateurs** (permission `admin.roles.manage`).
- **Carte** : création/édition de **zones** et **repères** — champ pour coller ou taper un emoji personnalisé (la grille de suggestions reste disponible) ; **API repères** : troncature de l’emoji à 16 caractères (alignement `map_markers.emoji`).

### Modifié
- **RBAC** : création et duplication de profil refusent les **slugs réservés** (`admin`, `prof`, `visiteur`, `eleve_novice`, `eleve_avance`, `eleve_chevronne`) avec message explicite — le slug technique doit rester distinct du profil système ; le **nom affiché** peut toujours être libre (ex. « Admin » avec le slug `admin_delegue`). Prompts **Profils & utilisateurs** et `docs/API.md` alignés ; test **`rbac.test.js`**.
- **Build / déploiement** : régénération des artefacts `dist/` (bundles Vite) et synchronisation de `package-lock.json`.
- **Carte / zones** : détection et retrait du préfixe emoji en tête de nom étendus aux emojis hors liste prédéfinie (affichage, édition, nom enregistré).
- **Visite (édition)** : titres de zone — même logique de détection de préfixe emoji que sur la carte.
- **Documentation API** : `docs/API.md` — zones (`name` avec préfixe emoji) et repères (`emoji` tronqué à 16 caractères).
- **RBAC / forum / commentaires contextuels** : la participation au forum et aux commentaires de contexte (tâches, projets, zones) est réglée par **profil** (`roles.forum_participate`, `roles.context_comment_participate`, défaut activé) et non plus par compte utilisateur. `GET /api/auth/me`, les gardes API et `GET /api/rbac/users` suivent le **profil principal** du n3beur ; `PATCH /api/rbac/profiles/:id` accepte `forum_participate` et `context_comment_participate` (booléens) pour les profils dont le slug commence par `eleve_` ; suppression de `PATCH /api/rbac/users/student/:id/forum-participate` et `.../context-comment-participate`. UI **Profils & utilisateurs** : cases dans la section Permissions du profil n3beur sélectionné (permission `admin.roles.manage` + PIN). Migration **`045_participation_forum_comments_on_roles.sql`** : agrégation par rôle (MIN des anciennes valeurs utilisateur), puis suppression des colonnes sur `users`.
- **Documentation API** : `docs/API.md` — sections forum, commentaires contextuels et tableau RBAC alignés sur le modèle par profil ; retrait des routes `PATCH` par utilisateur.
- **RBAC / PATCH profil** : lecture des flags avec `COALESCE(..., 1)` ; **Profils (UI)** : cases forum / commentaires contextuels désactivées sans la permission `admin.roles.manage`.
- **Documentation & outillage dev** : mise à jour de `docs/LOCAL_DEV.md`, `docs/API.md`, `README.md`, skills **foretmap-e2e** et **foretmap-project** (pointeur e2e), règles **foretmap-conventions** / **foretmap-backend** (démarrage e2e `start:e2e`, flag `--foretmap-e2e-no-rate-limit`, `E2E_REUSE_SERVER`, `TEACHER_PIN` via dotenv Playwright) ; **`test:e2e:headed`** aligné sur la libération du port comme **`test:e2e`**.

### Ajouté
- **Paramètres admin** : réglages publics `ui.map.emoji_label_center_gap` (6–32, défaut 14), `ui.map.overlay_emoji_size_percent` et `ui.map.overlay_label_size_percent` (70–150 %, défaut 100) pour l’espacement emoji/libellé et l’échelle du texte sur la carte (zones SVG + repères) ; section « Modules UI » de la page Réglages ; utilitaire `resolveMapOverlayTypography` côté client.
- **Tests de charge** : ajout d’un scénario Artillery `load/artillery.yml` (phases warmup/ramp-up/plateau/cool-down, mix de lectures `/api/health`, `/api/health/db`, `/api/version`, `/api/zones`, `/api/plants`) et des scripts `npm run test:load` / `npm run test:load:report`.
- **Tests de charge (automatisation)** : 3 profils prêts à l’emploi (`light`, `normal`, `stress`) avec lanceurs npm dédiés (`test:load:*`), exécution enchaînée `test:load:all`, archivage horodaté des rapports JSON dans `load/reports/` et génération de résumés Markdown par profil.
- **Tests de charge (réalisme utilisateur)** : profils `light`, `normal` et `stress` renforcés avec davantage d’utilisateurs simultanés, phases plus longues et sessions plus réalistes (enchaînements multi-pages + pauses `think`).

### Corrigé
- **Migrations / participation paliers n3beur** : migration **`048_eleve_participation_defaults.sql`** — rétablit `forum_participate` et `context_comment_participate` à `1` pour les profils système `eleve_novice`, `eleve_avance` et `eleve_chevronne` lorsque la migration **045** les avait passés à `0` via le MIN des anciennes valeurs par compte (cas fréquent en base locale de test). Sans cela, les n3beurs « novice » héritaient d’une **lecture seule** sur le forum et les **commentaires de contexte** (`403`), ce qui faisait échouer `tests/context-comments.test.js` et `tests/forum.test.js`.
- **RBAC** : un enseignant dont le **profil principal** est un **duplicata du n3boss** (slug ≠ `prof`, rang ≥ 400, permission `teacher.access`) n’était plus traité comme profil staff : les permissions marquées « PIN » disparaissaient du JWT et l’UI **Profils & utilisateurs** exigeait un PIN inopérant si aucun secret PIN n’existait pour ce rôle. Alignement sur le comportement du slug `prof` via **`nativePrivileged`** (`lib/rbac.js`, JWT, `GET /api/auth/me`, garde `requirePermission`) et prise en compte côté client (export / import / création utilisateur, onglet Tuto).
- **Commentaires de contexte (tâches / projets / zones)** : le nombre affiché sur le bouton (section repliée) restait à **0** tant qu’on n’avait pas ouvert le panneau ; chargement du total à l’affichage du composant (requête légère) et mise à jour du compteur via temps réel même lorsque la section est fermée.
- **Notifications (n3boss)** : propositions de tâches — en plus du ref **cumulatif** (évite les faux positifs quand la liste des tâches est vide entre deux rafraîchissements) : **réhydratation** du suivi depuis les notifications déjà enregistrées (localStorage) au chargement, **dédoublonnage durable** pour les clés `teacher-proposed-*` (indépendant du cooldown 10 min, qui refaisait une entrée pour une proposition toujours en attente), remise à zéro du suivi si le n3boss **supprime** la notif, clé de tâche **stabilisée** (`String(id)`).
- **RBAC / PATCH profil** : éviter « Aucun champ de profil fourni » sur des requêtes valides — corps normalisé (objet plat), champs reconnus via liste autorisée ; alias **`forumParticipate`** / **`contextCommentParticipate`** acceptés. **`api()` (client)** : envoi du corps JSON dès que l’argument n’est pas `undefined`/`null` (ne plus s’appuyer sur la vérité de la valeur, qui omettait à tort `0` ou `false`). Cases forum / commentaires : envoi en **0/1**. Réordonnancement des profils : ignore les entrées sans `id` ou sans `display_order`.
- **RBAC (UI + API)** : les blocs « seuil de tâches validées », « proposition de tâches » et « forum / commentaires contextuels » ne s’affichaient que pour les slugs `eleve_*`, donc pas pour les **nouveaux** paliers dupliqués ou créés avec un autre slug (ex. copie d’un `prof`). Ils s’appliquent désormais à tout **palier n3beur** : slug `eleve_*`, ou profil avec `rank` strictement inférieur à **400** (rang du n3boss), hors `admin`, `prof`, `visiteur`. `PATCH /api/rbac/profiles/:id` accepte `forum_participate` / `context_comment_participate` dans les mêmes conditions ; validation « aucun champ » corrigée si seuls ces booléens sont envoyés sur un profil interdit. Sélection automatique du profil après **Créer un profil**. `docs/API.md` et test **`rbac.test.js`** alignés.
- **RBAC (UI — Profils & utilisateurs)** : les cases « participation forum » et « commentaires contextuels » sur un profil n3beur n’étaient plus cliquables sans session « élevée » (`authElevated`), alors que le serveur autorise déjà `PATCH /api/rbac/profiles/:id` pour les comptes **prof** / **admin** natifs sans PIN ; les cases suivent désormais la même règle que le reste de l’édition de profil (`admin.roles.manage`, requête refusée avec message serveur si élévation requise).
- **n3boss — barre d’onglets du haut (parchemin)** : hauteur **uniforme** quel que soit l’onglet ou le format d’écran, via variables `clamp()` (`--top-tabs-row-inner-h`, etc.) ; suppression des surcharges mobile/desktop contradictoires sur `.top-tab` ; marge sous la barre également en `clamp()` pour tous les viewports.
- **Carte** : la carte ne s’affichait plus — le conteneur en `width`/`height: auto` se repliait à 0×0 (contenu uniquement en `position: absolute`, sans taille intrinsèque en flux) ; retour à `width: 100%`, `max-height: 100%` et `aspect-ratio` ; retrait des règles `html`/`body`/`#root`/`#app` avec `:has(.map-view-root--solo)` qui pouvaient perturber la chaîne flex.
- **RBAC / progression** : `syncStudentPrimaryRoleFromProgress` ne rétrograde plus un n3beur vers un profil de rang inférieur (ex. `eleve_avance` → `eleve_novice` avec 0 tâche validée), ce qui retirait `tasks.propose` et provoquait des **403** sur les propositions de tâches ; seules les promotions (rang cible ≥ rang actuel) sont appliquées automatiquement.
- **RBAC** : `getPrimaryRoleForUser` sélectionne le profil primaire par `rank` décroissant puis `assigned_at` ; `repairDuplicatePrimaryRoles` pour les n3beurs préfère un profil non **visiteur** en cas de plusieurs `is_primary=1`.
- **RBAC (API)** : `PUT /api/rbac/users/.../role` s’appuie sur `getPrimaryRoleForUser` pour le profil courant ; le garde « dernier administrateur » ne compte que les rôles admin **enseignant**. Test **settings** : admin identifié par `TEACHER_ADMIN_EMAIL` ; **200** accepté s’il existe plusieurs admins enseignants (base de test).
- **Schéma** : table **`observation_logs`** dans `sql/schema_foretmap.sql` (`CREATE IF NOT EXISTS`) pour aligner `initSchema` sur les routes observations lorsque la table manque malgré une `schema_version` élevée.
- **Tests backend** : flux enseignant pour assign / done / unassign (`tasks-status`, `api.test.js`, `new-features`, `students-delete`) ; plafond d’inscription — email + **login** après changement de rôle ; `students-duplicate` — URL `POST .../:id/duplicate` sans token ; `tasks-status` — `ensureRbacBootstrap` après `initSchema`.
- **Mobile (carte, portrait)** : la barre d’outils sous l’en-tête (plans, modes, zoom) paraissait plus haute que sur les autres onglets, car le bouton d’aide « ? » restait en 48×48px alors que les autres contrôles étaient compacts ; alignement sur ~36px dans cette barre uniquement, et compaction CSS aussi ciblée sur `.map-view-root--solo` pour éviter un retour à la ligne si la classe `main--map-visible` manque.
- **Commentaires contextuels (UI)** : ouverture du panneau « Commentaires » (tâches / zones / projets) — la variable `canUseCommentActions` n’était plus définie, ce qui provoquait une erreur au rendu ; rétabli en l’alignant sur `canParticipateContextComments`.
- **Tests e2e (Playwright)** : bypass du rate limiting fiable en local Windows via le script **`npm run start:e2e`** (`node server.js --foretmap-e2e-no-rate-limit`) — la variable d’environnement seule ne parvenait pas toujours au process Node ; config Playwright enchaîne `db:init` puis `start:e2e` ; CI alignée (`nohup npm run start:e2e`).
- **Tests e2e** : `playwright.config.js` charge `.env` pour aligner **`TEACHER_PIN`** avec le serveur ; fixture **`enableTeacherMode`** utilise `E2E_ELEVATION_PIN` puis `TEACHER_PIN`.
- **Tests e2e** : `tasks-full-cycle.spec.js` — clic sur le bouton prof **`✔️ Validée`** et assertion sur le toast **`Statut mis à jour : Validée`** (libellés UI actuels).
- **Accessibilité / e2e** : modale « Rapport de tâche » — liaison **`label` / `textarea`** (`useId`) pour le champ commentaire.
- **Commentaires contextuels** : le profil **visiteur** n’a plus accès aux routes `/api/context-comments` (**403**, y compris lecture), aligné sur le forum.
- **Tests e2e (Playwright)** : fixture d’inscription (labels en mode strict, sélection **Mon espace**, champs mot de passe) ; déconnexion via le bouton **Déconnexion** ; assertions de navigation alignées sur les libellés d’onglets actuels (ex. **🗺️ Carte** en `exact`, Biodiversité / Tuto / À propos).
- **Tests backend** : le script `npm test` passe **`--test-force-exit`** à Node pour éviter que le processus reste actif après la fin de la suite.
- **Mobile** : interface figée ou très lente sur la carte — le `ResizeObserver` recalculait le cadrage à chaque variation de hauteur de vue (barre d’adresse, clavier) et déclenchait des re-renders React en rafale via `setCommitted` ; recalcul du fit **différé (120 ms)** et mise à jour d’état **uniquement si la pose change** réellement.
- **Réseau** : les appels `fetch` de l’API client passent par un **délai d’attente 40 s** (`AbortController`) pour qu’un chargement bloqué ne reste pas indéfiniment sur l’écran « Chargement… ».

### Modifié
- **Carte** : espacement emoji ↔ libellé des **repères** aligné sur celui des **zones** (même écart entre centres, `14×inv`, et mêmes tailles de police partagées) ; mise en page en colonne et zone tactile min. 48×48 conservée sur mobile.
- **Rate limiting API** : bypass optionnel et ciblé pour les campagnes de charge via header `X-ForetMap-Load-Test` quand `LOAD_TEST_SECRET` est défini côté serveur ; comportement inchangé par défaut.
- **Carte** : emojis des zones et des repères, pastilles de statut des tâches et libellés légèrement agrandis pour une meilleure lisibilité.
- **Build** : régénération des bundles `dist/` (Vite production).
- **Mobile (écran carte)** : barre d’outils (plans, modes, zoom) plus compacte pour réduire la hauteur perdue par rapport aux autres onglets ; le bouton d’aide « ? » conserve une taille tactile adaptée.
- **Mobile (en-tête + carte n3boss)** : hauteur de l’en-tête vert plafonnée et une seule ligne (logo + actions) ; actions un peu plus compactes ; onglets du haut (`.top-tabs`) réduits seulement quand la vue carte est affichée (`:has(.map-view-root)`) ; barre d’outils carte encore plus basse — la zone du haut sur « Carte » se rapproche des autres pages.
- **Mobile (navigation n3boss)** : suppression du saut visuel de hauteur des onglets supérieurs en changeant d’onglet (Carte ↔ autres vues) ; onglets compacts désormais stables en mode prof/admin, et compaction de la barre d’outils carte appliquée uniquement quand la carte est réellement affichée.
- **Cartes & tâches (vue split)** : le plan est aligné en haut de la colonne carte (plus de centrage vertical) pour rester sous la barre d’outils lorsque la liste des tâches impose une grande hauteur.
- **PWA / mobile** : icônes d’application (`pwa-icon-192.png`, `pwa-icon-512.png`, `pwa-maskable-512.png`, `apple-touch-icon`) et `favicon-n3.png` régénérées avec le logo **n³ en blanc** sur fond `#1a4731` ; script `npm run icons:pwa` (`scripts/generate-pwa-icons-n3-white.js`, dépendance dev `sharp`) ; cache service worker `foretmap-offline-v6`.

### Ajouté
- **Paramètres admin** : réglage `tasks.student_max_active_assignments` (0–99, défaut 0 = illimité) — nombre maximal de tâches **actives** (non validées, toutes cartes) auxquelles un n3beur peut **s’auto-inscrire** ; section « Tâches & inscriptions n3beurs » dans l’UI admin.
- **API** : garde sur `POST /api/tasks/:id/assign` pour l’auto-inscription (`code: TASK_ENROLLMENT_LIMIT` si dépassement) ; `GET /api/auth/me` enrichi avec `taskEnrollment` pour les n3beurs (`maxActiveAssignments`, `currentActiveAssignments`, `atLimit`).
- **UI n3beur** : désactivation des seuls contrôles d’**inscription** à la limite ; **proposition de tâche** et **retrait** restent disponibles ; bandeaux explicites (liste tâches, modales zone/repère) ; sur la carte, les pastilles « places disponibles » restent fidèles à la tâche (la limite personnelle est portée par `canEnrollOnTasks`, pas par `canStudentAssignTask`).
- **Forum** : participation paramétrable par compte n3beur (`users.forum_participate`, défaut activé) — désactivé = lecture seule sur le forum ; case dans Profils & utilisateurs (PIN élevé), `PATCH /api/rbac/users/student/:userId/forum-participate`, `forumParticipate` sur `GET /api/auth/me`, code `FORUM_READ_ONLY` sur les mutations refusées. Migration `043_users_forum_participate.sql`.
- **Commentaires contextuels** : participation paramétrable par compte n3beur (`users.context_comment_participate`, défaut activé) — désactivé = lecture seule sur les commentaires des tâches / projets / zones (pas le forum) ; case « Commentaires (tâches, zones…) » dans Profils & utilisateurs, `PATCH /api/rbac/users/student/:userId/context-comment-participate`, `contextCommentParticipate` sur `GET /api/auth/me`, code `CONTEXT_COMMENT_READ_ONLY` sur les mutations refusées. Migration `044_users_context_comment_participate.sql`.

### Modifié
- **Sélecteur de carte** : le bandeau de choix de plan (carte principale et visite) n’apparaît que lorsqu’au moins deux cartes sont disponibles ; masqué quand une seule carte reste visible (cartes désactivées en admin ou restriction de profil / affiliation).
- **Carte & visite** : les repères s’affichent comme les zones (emoji seul, sans disque blanc bordé de vert) sur la carte principale et sur la carte de visite ; zone de touche minimale conservée pour le mobile.
- **Build frontend** : régénération des bundles dans `dist/` (Vite production).

### Ajouté
- **Profils & utilisateurs (colonne Permissions)** : bloc « Progression par tâches validées » — case à cocher pour activer ou désactiver la montée de niveau automatique des profils élèves (réglage `rbac.progression_by_validated_tasks`, aussi éditable dans Paramètres admin) ; pour chaque profil `eleve_*`, champ numérique + bouton pour fixer le nombre de tâches validées requises (`min_done_tasks`) sans repasser par « Modifier ».
- **API** : `GET /api/rbac/profiles` renvoie `{ roles, progressionByValidatedTasksEnabled }` ; `PATCH /api/rbac/progression-by-validated-tasks` avec `{ enabled: boolean }` ; les réponses stats exposent `progression.autoProgressionEnabled`.
- **Vue statistiques élève** : bandeau explicite lorsque la progression automatique est désactivée (paliers affichés à titre indicatif).

### Modifié
- **Profils & utilisateurs** : pour chaque profil `eleve_*`, bloc « Proposition de tâches » (activation de `tasks.propose` + option PIN) ; la ligne dupliquée est retirée de la grille des permissions pour ce type de profil.
- **Terminologie interface** : libellés visibles « élève(s) / prof(esseur)(s) / enseignant » remplacés par **n3beur(s)** et **n3boss** partout dans l’UI, les messages d’erreur API affichés côté client, le RBAC par défaut (`lib/rbac.js`), les modèles d’import (tâches : colonne « n3beurs requis » ; utilisateurs : fichiers `foretmap-modele-n3beurs.*`), le préfixe de description des propositions (`Proposition n3beur:`), la doc `docs/API.md`, et la migration `042_ui_terminology_n3beur_n3boss.sql` (rôles, permissions, rétro-migration des descriptions de tâches). `getRoleTerms()` renvoie désormais toujours cette terminologie (plus de variante selon l’affiliation). Compatibilité : parsing `Proposition élève:` ou `Proposition n3beur:` ; import utilisateurs accepte toujours `eleve` / `prof` dans les CSV.
- **Profils & utilisateurs** : boutons Monter / Descendre (↑ ↓) à côté de chaque profil pour réordonner la liste sans repasser par la boîte « Modifier » ; les `display_order` sont recalculés (0, 1, 2, …) pour refléter le nouvel ordre ; les listes d’attribution suivent le même ordre ; édition directe de l’emoji (champ + aperçu + « Enregistrer l’emoji ») pour le profil sélectionné.
- **Vue élève / vue prof (aperçu)** : bandeau explicite sous l’en-tête lorsque l’enseignant ou l’admin bascule en mode aperçu, pour que le changement de navigation (onglets du haut ↔ barre du bas) et la nature « simulation d’interface » soient visibles immédiatement.

### Corrigé
- **Paramètres admin (champs texte sans `maxLength`)** : `maxLength` HTML n’est plus dérivé de `null` via `Number(null) === 0` (le navigateur appliquait `maxLength={0}` et bloquait saisie et collage, ex. `ui.map.location_emojis`) ; l’aide sous le champ n’affiche plus de faux « min 0 / max 0 / max 0 caractères » pour les contraintes absentes.
- **Mobile (vue carte)** : barre de navigation du bas en défilement horizontal (plus de colonnes ultra-étroites + texte sur plusieurs lignes qui faisait exploser la hauteur) ; hauteur plafonnée ; barre d’outils de la carte en une ligne défilante sur petit écran ; recalage de la carte au redimensionnement (`ResizeObserver`) et garde sur les dimensions du conteneur pour éviter un zoom à 0.
- **Paramètres admin (texte / emojis)** : les champs texte et zones multilignes (dont `ui.map.location_emojis` et `ui.reactions.allowed_emojis`) sont désormais **contrôlés** par React avec resynchronisation après chargement serveur, pour un collage depuis le presse-papiers fiable ; `touch-action: auto` sur les champs sous `.settings-admin` évite l’interférence du `pan-y` du conteneur (mobile / certains navigateurs) ; `setSavingKey` est libéré dans un `finally` après enregistrement.
- **Vue scindée (desktop) / ascenseur** : la grille carte+tâches utilise une ligne `minmax(0, 1fr)` pour ne plus étirer la page à la hauteur totale des tâches ; `overflow: hidden` sur `.main` et `.teacher-main` pour confiner le défilement aux zones prévues (liste des tâches, vues longues).
- **Tests (RBAC)** : assertions sur `GET /api/rbac/profiles` alignées sur la réponse `{ roles, progressionByValidatedTasksEnabled }`.
- **Tests backend (tâches / forum)** : promotion explicite en `eleve_novice` pour les scénarios d’affectation, de capacité et de suppression d’élève ; jeton admin des tests enrichi de `tasks.validate` ; le test « forum visiteur » force `ui.modules.forum_enabled` pour éviter les courses avec les autres fichiers de suite.
- **Carte (layout laptop / desktop)** : la hauteur du bloc carte ne repose plus sur des calculs en `100dvh` déconnectés des onglets professeur et des marges ; chaîne flex (`#app` → `teacher-main` / `main` → contenu) avec `min-height: 0` ; vue scindée carte/tâches en colonnes étirées et liste des tâches en flex avec défilement interne ; zone de gestes carte avec `min-height: 0` pour un cadrage correct de l'image.
- **Modales mobile (feuilles)** : `modal-overlay` + panneaux `.modal` / `.log-modal` / prévisualisation tutoriel alignés sur le viewport dynamique (`100dvh`) et les encoches (`safe-area`), pour éviter que le haut ou le bas soit masqué par les barres système.
- **Formulaire tâche (zones / repères / tutoriels)** : les cases à cocher des listes à sélection multiple ne héritent plus des styles `.field input` (`width: 100%`, padding) — la case redevient compacte à gauche et le libellé s’affiche correctement à sa droite (y compris la liste des tutoriels associés).
- **Tâches (commentaires)** : le texte en cours de saisie dans les commentaires de tâche (et le volet qui se refermait) n’est plus perdu lorsque la liste des tâches se rafraîchit (polling ou temps réel) et que la carte est recréée ; le brouillon est conservé dans `sessionStorage` jusqu’à publication. Même principe pour le commentaire optionnel de la fenêtre « Rapport de tâche ».

### Supprimé
- **Outil collectif retiré (frontend + backend)** : suppression complète de la vue `Collectif`, des endpoints `/api/collective/*`, de la diffusion temps réel `collective:changed`, des tables SQL associées (`collective_sessions*`), des migrations dédiées et des tests backend liés.

### Modifié
- **Identité visuelle (logo n³)** : ajout de la source officielle `public/app-logo-n3.png`, régénération des icônes PWA (`pwa-icon-*`, `pwa-maskable-*`) et du `favicon-n3.png`, affichage du logo dans l'en-tête (version claire par filtre sur fond vert) et sur l'écran d'authentification ; raccourcis du manifeste alignés sur `pwa-icon-192.png` ; cache service worker passé en `v5`.
- **Build frontend** : régénération des bundles dans `dist/` (build Vite production) pour le déploiement avec les sources courantes.
- **Profil visiteur (observateur)** : pas de progression RBAC automatique depuis les tâches validées ; blocage API des actions et contenus exposant les données d’autres utilisateurs (commentaires de contexte, carnet d’observations en écriture, propositions de tâches) ; filtrage des affectations sur le détail d’une tâche.
- **Auth élève** : `POST /api/auth/register` respecte le réglage `ui.auth.allow_register` (403 si désactivé, aligné sur l’UI admin).
- **RBAC** : amorçage sans second rôle primaire pour les élèves déjà profilés (ex. visiteur après inscription) ; réparation des doublons `is_primary` au bootstrap ; PIN des profils en bcrypt (compatibilité lecture des anciens hash SHA-256).
- **RBAC (`lib/rbac.js`)** : le visiteur ne passe plus par la resynchronisation de progression ; réparation explicite des `is_primary` dupliqués au bootstrap ; attribution « élève novice » seulement sans rôle primaire existant ; vérification des PIN acceptant bcrypt et anciens hash SHA-256.
- **Tâches** : le contexte JWT est réhydraté depuis la BDD sur les routes concernées (`parseOptionalAuth`) pour que le rôle effectif suive les changements en base sans exiger une reconnexion.
- **Formulaire tâche (emplacement)** : les sélections multiples **zones** et **repères** sont regroupées dans une seule liste défilante, avec séparateurs visuels lorsque les deux types sont présents.
- **Tâches (libellés mode de validation)** : l’ancien libellé « classique » est remplacé par **individuel** / **Validation individuelle** (chip et liste déroulante), en parallèle de **collectif** / **Validation collective**.
- **Avatar en-tête après changement de photo** : URL des fichiers `/uploads/` préfixée avec `withAppBase` (déploiement sous-dossier) ; `StudentAvatar` réagit à `avatar_path` et remonte l’`<img>` si le chemin change ; session élève / `getStoredSession` conservent et propagent `avatar_path` (y compris fusion avec l’état précédent et champ `user`).
- **Modale profil / statistiques perso** : en-tête fixe avec bouton ✕ (comme les autres feuilles modales) et corps défilant — la croix reste visible en haut à droite pendant le scroll.
- **Mobile (débordement horizontal)** : chaîne flex avec `min-width: 0` sur `#root`, `#app`, en-tête, zones principales et pied de page ; `overflow-x: clip` + `overscroll-behavior-x: none` sous 1024px ; grille forum en une colonne sur petit écran ; champ réponse forum avec `min-width: 0` pour respecter la largeur utile.
- **Profils & utilisateurs (mobile)** : suppression des `gridTemplateColumns` inline qui surchargeaient le CSS — la page repasse bien en une colonne sur viewport ≤ 1023px (grilles profils/permissions, attribution, création, suppression).
- **Profils élèves (RBAC progression)** : la création/édition des profils supporte désormais `emoji`, `min_done_tasks` (niveau requis) et `display_order` (ordre d’affichage), avec synchronisation de la progression élève basée sur les attributs des rôles plutôt que sur `app_settings`.
- **Paramètres admin (progression)** : suppression des anciens réglages `progression.student_role_min_done_*` et de leur affichage UI, désormais remplacés par la configuration directe des profils.
- **Validation locale backend** : le script `test:local` exécute maintenant les suites de tests fichier par fichier avec réinitialisation BDD entre chaque fichier, pour éliminer les flakiness dues à l’état partagé (RBAC/permissions/sessions) et fiabiliser la passe complète.
- **Pipeline local unifié** : ajout d’une passe `smoke:local` qui enchaîne contrôle d’environnement, build et tests backend isolés pour valider rapidement l’état du projet avant livraison.
- **Smoke local paramétrable** : le script `local-smoke.js` accepte désormais `--fast` pour ignorer l’étape build tout en conservant les contrôles d’environnement et les tests backend isolés.
- **Rate-limit en environnement de test** : les limiteurs Express (`general` et `auth`) sont désormais ignorés lorsque `NODE_ENV=test` pour supprimer les faux positifs `429` sur les suites backend intensives.
- **Pool MySQL en test** : `queueLimit` passe en illimité (`0`) pendant les tests pour éviter les échecs intermittents `Queue limit reached` sur les scénarios volumineux.
- **Tâches (mode de validation)** : ajout du mode `completion_mode` (`single_done`/`all_assignees_done`) dans l’API et l’UI, avec recalcul de statut selon la progression réelle des assignés (`assignees_done_count` / `assignees_total_count`) et garde-fou sur `POST /api/tasks/:id/validate` (validation uniquement si la tâche est déjà `done`).
- **Affectation rapide professeur** : la vue tâches permet désormais une sélection multiple d’élèves pour l’affectation rapide sur une tâche, avec feedback sur le nombre de places disponibles et les affectations partielles.
- **Contenus texte éditables** : extension des réglages `content.*` pour personnaliser les textes Accueil/Auth, Visite, À propos et messages globaux (loader, indisponibilité serveur, préfixe version), avec fallback frontend local.
- **Tuiles tâches (titres de catégories)** : ajout d’un emoji préfixe sur tous les titres de sections (`Projets`, `Mes tâches`, `Propositions`, `En attente`, `Validées`, `Résultats filtrés`, etc.) pour harmoniser la lecture visuelle avec les statuts.
- **Build frontend (rafraîchissement local)** : régénération des bundles versionnés dans `dist/` via les workflows `build` et `deploy:prepare:fast` pour forcer la prise en compte des derniers assets côté déploiement.
- **Paramètres admin + profils (UX)** : l’API settings admin renvoie désormais la liste des profils de progression (hors `prof/admin`) affichée dans la section progression, et la vue `Profils & utilisateurs` adopte une mise en page responsive dédiée pour éviter les débordements sur écrans moyens/petits.
- **Statuts des tâches (icônes UI)** : remplacement des pastilles de statut `À faire` / `En cours` par les emojis `🔥` et `⚙️` dans les boutons d’action des tuiles, avec le même préfixe emoji ajouté aux titres de sections correspondants.
- **Carte (verrou repères UX)** : ajout d’un toast utilisateur lors de l’activation/désactivation du verrou de déplacement des repères pour confirmer immédiatement l’état courant.
- **Carte (labels repères)** : la taille des libellés de repères suit désormais le même calcul dynamique que les zones pour conserver un affichage homogène.
- **Barre de réactions compacte** : dans le forum et les commentaires contextuels, la barre de réactions affiche désormais uniquement le premier emoji en mode compact, puis se déplie au clic pour proposer toute la palette configurée.
- **Hygiène dépôt** : ajout d’une règle `.gitignore` pour exclure les archives locales de logs CI `ci-job-*-logs.zip`.
- **Maintenance BDD collectif** : ajout d’un script `db:collective:cleanup:audit` pour supprimer les tables `collective_*` et auditer la structure complète de la base à partir de `sql/schema_foretmap.sql`.
- **Sélecteur d’emojis zone/repère** : suppression du plafond de 400 emojis dans `parseEmojiListSetting`, afin d’afficher la liste complète configurée dans les fenêtres de création/édition.
- **Sélecteur d’emojis zones/repères (création + édition)** : la liste personnalisée `ui.map.location_emojis` est désormais fusionnée avec la base existante (au lieu de l’écraser), et la contrainte de longueur côté réglages a été retirée pour ne plus limiter la quantité affichable.
- **Scroll mobile des sélecteurs d’emojis** : ajout d’un conteneur à défilement vertical tactile dans les modales zone/repère pour éviter le blocage du scroll quand la liste d’emojis est longue.
- **Scroll mobile global + console Paramètres** : sécurisation du verrouillage de scroll `body` (lightbox) pour éviter les blocages persistants, et forçage de la vue `Paramètres admin` en colonne unique sur mobile/tablette avec débordements horizontaux neutralisés.

### Ajouté
- **PWA mobile installable (Android + iOS)** : finalisation du manifeste avec icônes PNG (`192/512` + `maskable`) et captures d'écran, ajout d'un bouton d'installation contextuel (événement `beforeinstallprompt`) dans l'en-tête, aide iOS "Ajouter à l'écran d'accueil", et synchronisation du cache service worker avec les nouveaux assets.
- **Réglages modules** : interrupteurs publics `ui.modules.forum_enabled` et `ui.modules.context_comments_enabled` (page Paramètres admin), refus API `503` quand désactivés, masquage onglet forum et blocs commentaires contexte côté UI.
- **Réglages publics (frontend)** : fusion après `GET /api/settings/public` des branches `ui.modules`, `ui.map` et `ui.auth` vers les objets `modules`, `map` et `auth` déjà consommés par l’app, pour appliquer les valeurs serveur après chargement.
- **Runner de tests isolés** : ajout de `scripts/test-local-isolated.js` pour orchestrer `db:init` + `node --test` sur chaque fichier `tests/*.test.js`, avec arrêt immédiat au premier échec.
- **Script smoke local** : ajout de `scripts/local-smoke.js` et de la commande `npm run smoke:local` pour exécuter un contrôle CI local reproductible en une seule commande.
- **Commande smoke rapide** : ajout de `npm run smoke:local:fast` pour les itérations locales fréquentes sans build frontend.
- **Migration rôles progression** : ajout de `migrations/041_roles_progression_fields.sql` pour introduire `roles.emoji`, `roles.min_done_tasks` et `roles.display_order` avec initialisation des rôles système.
- **Migration SQL tâches (mode collectif)** : nouvelle migration `040_task_completion_mode_and_assignment_done.sql` pour ajouter `tasks.completion_mode` et `task_assignments.done_at`, alignée avec le schéma principal.
- **Utilitaire frontend `content`** : ajout de `src/utils/content.js` pour lire de façon robuste les clés `content.*` et appliquer un fallback texte propre.
- **Carte (verrou repères)** : ajout d’un bouton `🔒/🔓 Repères` pour les profils autorisés afin de verrouiller/déverrouiller explicitement le déplacement des repères sur la carte.
- **Projets de tâches + mise en pause** : ajout des routes et du schéma associés à la gestion des projets de tâches et au statut `on_hold`, avec migration SQL dédiée et tests backend mis à jour.
- **Date de départ facultative des tâches** : ajout du champ `start_date` (UI + API + SQL) ; avant cette date, la tâche reste en attente et l’inscription élève est bloquée.
- **Commentaires contextuels multi-espaces** : ajout d’un module complet de commentaires (`/api/context-comments`) pour les contextes tâche/projet/zone avec pagination, suppression modérée, signalement anti-doublon, audit et diffusion temps réel Socket.IO.
- **Tables SQL de commentaires contextuels** : nouvelles tables `context_comments` et `context_comment_reports` avec index dédiés, suppression logique et contrainte FK de nettoyage des signalements.
- **Contrôle de concurrence sessions collectives** : ajout d’un versionnement optimiste (`collective_sessions.version`) avec `expectedVersion` sur les écritures, plus opérations bulk tâches/élèves pour les animations de séance.
- **RBAC rafraîchi + rôle visiteur système** : migration du catalogue de permissions/profils système (idempotente) et ajout du rôle `visiteur` par défaut pour durcir les parcours lecture seule.
- **Aide contextuelle UI (collégiens + prof/admin)** : ajout d’un socle d’aide produit côté frontend avec tooltips enrichis (`Tooltip`), panneau contextuel `?` par section (`HelpPanel`) et registre centralisé des messages (`src/constants/help.js`) différenciés selon le rôle.
- **Synchronisation sélective carte/visite** : ajout des endpoints `GET /api/visit/sync/options` et `POST /api/visit/sync` (prof, session élevée) avec import bidirectionnel ciblé des zones/repères entre carte principale et module visite.
- **Progression de profil élève configurable** : nouveaux réglages `progression.student_role_min_done_eleve_avance` et `progression.student_role_min_done_eleve_chevronne` avec synchronisation automatique du rôle principal élève selon le nombre de tâches validées.
- **Import visuel sélectif dans l’UI visite** : nouveau panneau enseignant dans la vue visite pour choisir les éléments à importer (zones/repères), direction du flux et exécuter la synchronisation sans quitter l’interface.
- **Forum global natif** : ajout d’un module forum complet (BDD `forum_threads/forum_posts/forum_reports`, routeur `routes/forum.js`, vue `src/components/forum-views.jsx`, onglet `Forum` élève/prof, événement temps réel `forum:changed`, tests backend `tests/forum.test.js` et documentation API associée).
- **Édition du profil connecté (API unifiée)** : ajout de `PATCH /api/auth/me/profile` avec vérification du mot de passe actuel, validation/normalisation des champs (`pseudo`, `email`, `description`, `affiliation`), contrôles d’unicité et journalisation d’audit.
- **Diagnostics problèmes site (MD + JSON)** : ajout des endpoints `GET /api/site-issues` et `GET /api/site-issues.json` pour exposer un inventaire centralisé des risques techniques potentiels (`docs/SITE_ISSUES.md`, `docs/SITE_ISSUES.json`).
- **Sélection de session “Collectif”** : ajout d’une sélection persistée des tâches et des élèves par session (`collective_session_tasks`, `collective_session_students`), avec API dédiée pour inclure/exclure les éléments sans perdre le contexte.
- **Vue “Collectif” (prof/admin)** : ajout d’une nouvelle vue `👥 Collectif` (desktop) pour piloter une session collective (présents/absents) et assigner/retirer des élèves sur les tâches par contexte (carte/projet), avec API `/api/collective/*` et migration `031_collective_sessions.sql`.
- **Audit admin + intégrité BDD** : nouveau script `scripts/ensure-admin-and-audit-db.js` (commandes `db:admin:audit` et `db:admin:audit:dry`) pour garantir que l’utilisateur critique (`oliviera9` par défaut) reste admin RBAC et pour contrôler la cohérence globale de la base (tables clés, rôles primaires, liens orphelins).
- **Réparation ciblée des assignations orphelines** : ajout de l’option `--fix-orphans` et de la commande `db:admin:audit:fix-orphans` pour neutraliser automatiquement les `task_assignments.student_id` sans élève existant (compatible `--dry-run`).
- **Mode de vue par rôle (prof/admin)** : ajout d’une bascule d’interface `vue élève` (prof + admin) et `vue prof` (admin), avec retour immédiat au rôle normal en un clic pour prévisualiser les parcours sans se déconnecter.
- **Bootstrap local en une commande** : ajout du script `npm run local:setup` (Docker MySQL + install deps + init BDD + check local).
- **Unification progressive des identités** : ajout d’une table canonique `users`, d’un script de backfill (`npm run db:backfill:users`) et de migrations dédiées (`027_users_unification_and_history.sql`, `028_admin_oliviera9_guard.sql`) pour converger sans rupture depuis `students`/`teachers`.
- **Historique structuré des actions utilisateur** : nouvelle table `security_events`, enrichissement de `audit_log` (acteur/résultat/payload), et journalisation étendue (auth succès/échec, élévation PIN, opérations RBAC, actions tâches).
- **Plan de validation migration users** : nouveau document `docs/USERS_MIGRATION.md` avec matrice de tests, contrôles SQL et critères de bascule.
- **RBAC complet configurable** : ajout d’un gestionnaire de profils (Admin, Prof, Élève chevronné, Élève avancé, Élève novice) avec permissions par profil, attribution utilisateur et élévation des droits via PIN de profil.
- **Schéma RBAC** : nouvelles tables `roles`, `permissions`, `role_permissions`, `role_pin_secrets`, `user_roles`, `elevation_audit` + migration `025_rbac_profiles.sql` et seed initial des profils.
- **API admin RBAC** : nouvelles routes `/api/rbac/*` pour gérer profils, permissions, PIN et affectation des rôles.
- **Page dédiée admin** : nouvelle vue frontend `Gestionnaire de profils` (onglet prof/admin) pour administrer noms de profil, droits, PIN et attributions.
- **Console “Paramètres admin”** : nouvelle interface GUI centralisée (onglet prof/admin) pour piloter l’accueil/auth, les modules UI, les cartes/plans (URL + upload image), et les actions d’exploitation (logs, debug OAuth, redémarrage).
- **Auth enrichie** : endpoint `/api/auth/elevate`, endpoint `/api/auth/me`, tokens JWT avec permissions effectives et statut `elevated`.
- **Auth élève par identifiant** : la connexion accepte désormais un champ unique `identifier` (pseudo ou email) avec compatibilité maintenue sur l’ancien format `firstName + lastName`.
- **Mot de passe oublié (élève + prof)** : nouveaux endpoints de reset (`forgot-password` / `reset-password`) avec email de réinitialisation, token fort hashé, expiration et usage unique.
- **Comptes prof email/mot de passe** : ajout de la table `teachers`, de l’auth prof par email (`POST /api/auth/teacher/login`) et conservation complète du mode PIN existant.
- **Service email SMTP** : nouveau module `lib/mailer.js`, variables `.env` associées, script `npm run db:seed:teacher`, et documentation API/README mise à jour.
- **UI authentification refondue** : écran de connexion en `identifiant + mot de passe`, lien `Mot de passe oublié`, et coexistence PIN / email côté modal prof.
- **Couverture de tests auth** : extension des tests backend auth et ajout d’un scénario e2e de connexion par pseudo/email.
- **Import élèves en masse (prof)** : ajout de `POST /api/students/import` pour importer des comptes élèves depuis un fichier CSV/XLSX, avec validation par ligne, mode simulation (`dryRun`) et rapport détaillé des erreurs.
- **Template élèves téléchargeable** : ajout de `GET /api/students/import/template` (CSV/XLSX) avec colonnes prêtes à l’emploi et une ligne d’exemple à remplacer/supprimer avant import.
- **UI prof — Gestion des élèves** : import/export/création/suppression déplacés dans l’onglet `Profils & utilisateurs` (`src/components/profiles-views.jsx`) pour centraliser l’administration.
- **Vue “Collectif” (prof/admin)** : nouvel onglet `Collectif` (tablette/desktop) pour activer une session par carte/projet, marquer des absences, et assigner/retirer des élèves sur les tâches (drag & drop ou boutons).
- **Tests import élèves** : nouveau fichier `tests/students-import.test.js` couvrant le template CSV, la simulation et la création réelle d’élèves.
- **Page Visite publique** : nouvelle expérience `Visite` accessible sans connexion depuis l’écran d’accueil, et via un onglet dédié placé avant « À propos » pour les utilisateurs connectés.
- **API visite dédiée** : nouveau routeur `routes/visit.js` (`/api/visit/content`, `/api/visit/progress`, `/api/visit/seen`) avec endpoints prof pour éditer les contenus zone/repère, gérer les médias de visite et sélectionner les tutoriels affichés.
- **Persistance vu/non-vu** : support connecté (BDD) et non connecté (cookie signé `anon_visit_token` + stockage serveur TTL 1 jour) pour conserver l’état même après fermeture de l’app.
- **Schéma visite** : nouvelles tables SQL (`visit_zone_content`, `visit_marker_content`, `visit_media`, `visit_tutorials`, `visit_seen_students`, `visit_seen_anonymous`) + migration `021_visit_public_flow.sql`.
- **Nouvelle vue frontend** : composant `src/components/visit-views.jsx` avec carte interactive, indicateurs rouge/vert, panneau de détails (sous-titre, description, bloc dépliable, galerie photo) et section tutoriels choisis par le professeur.
- **Tests visite** : nouveaux scénarios backend sur le contenu visite, la persistance anonyme via cookie signé et la persistance élève en base.

### Modifié
- **Propositions de tâches (édition auteur)** : un élève peut désormais modifier sa propre proposition (`status = proposed`) depuis l’UI, avec contrôle API strict pour empêcher la modification des propositions d’autrui et des champs réservés au mode professeur.
- **Visibilité des tâches côté élève** : la vue par défaut affiche désormais aussi les sections `En cours (déjà prises)` et `En attente de validation`, en plus des tâches disponibles et récemment validées.
- **Filtrage des tâches élève** : l’état “Résultats filtrés” s’active maintenant dès qu’un filtre est appliqué (texte, zone/repère, projet, statut, carte), pour éviter les listes incomplètes.
- **Filtres de tâches (zones + repères)** : la liste de filtrage des localisations inclut désormais aussi les repères de carte (`📍`) en plus des zones, avec un filtrage robuste par type (`zone`/`marker`) pour éviter les collisions d’identifiants.
- **Vue tâches (prof)** : ajout d’un bouton `⚡ Affectation rapide` sur chaque carte de tâche, avec état de chargement et messages contextuels pour expliquer pourquoi l’affectation est possible ou bloquée.
- **Attribution directe des tâches (prof/admin)** : ajout d’une affectation rapide d’élève depuis les tuiles de tâches (sélection d’un élève cible puis clic sur la tuile) et d’une attribution optionnelle dès la création de tâche.
- **Vue tâches (élève/prof)** : remplacement du libellé `Disponible` par `À faire`, exclusion des tâches `en cours` de la section `À faire` dès la première inscription, ajout d’une vue en tuiles animées (style tutoriels) et d’une bascule persistante `Tuiles/Liste`.
- **Emojis zones/repères configurables** : ajout du réglage public `ui.map.location_emojis` dans la console « Paramètres admin » ; les listes d’emojis utilisées en carte/visite (zones, repères et tâches liées au contexte) sont désormais pilotables dynamiquement, avec fallback robuste sur la liste par défaut.
- **Réactions emoji configurables** : le set de réactions forum/commentaires contextuels est désormais piloté par le réglage public `ui.reactions.allowed_emojis` (console paramètres admin), avec fallback robuste sur le set par défaut.
- **Accessibilité et compréhension des icônes** : harmonisation des boutons icône-only (header, carte, tâches, biodiversité, visite) avec `aria-label` explicites, infobulles cohérentes et activation pilotable via le nouveau réglage public `ui.modules.help_enabled`.
- **Console paramètres admin** : réorganisation des paramètres par sections (auth, modules, progression, sécurité, exploitation), ajout d’une recherche multi-critères et affichage des contraintes/valeurs par champ pour accélérer l’administration.
- **Temps réel Socket.IO** : retour au mode `websocket + polling` avec reprise de connexion renforcée (recovery serveur/client, fallback hors-ligne temporisé, réabonnement map) pour mieux tolérer les micro-coupures.
- **Statistiques élève** : affichage des paliers de progression dynamiques (labels/seuils issus de la config) et exposition API de la progression (`thresholds`, `steps`, rôle courant).
- **Profil utilisateur (prof/admin)** : la modale `Mon profil` passe par l’API unifiée `/api/auth/me/profile` et prend en charge les comptes prof/admin (nom affiché robuste, mise à jour immédiate de la session locale).
- **Badge utilisateur (en-tête)** : ouverture des modales stats/profil alignée sur l’utilisateur connecté (élève, prof ou admin) au lieu d’être limitée au parcours élève.
- **Accessibilité des modales et formulaires** : ajout d’un hook partagé `useDialogA11y` (focus initial, piège de focus, fermeture `Escape`, retour focus) et application sur les modales clés (profil/stats, carte, tâches, lightbox), avec labels/`htmlFor`/`aria-*` renforcés.
- **Navigation adaptative carte+tâches** : en grand écran, fusion des onglets carte/tâches en une entrée unifiée côté prof et élève, avec compteur de tâches contextualisé (à valider / assignées actives).
- **Formulaires tâches multi-liens** : normalisation des identifiants `zone_ids`/`marker_ids` (trim, dédoublonnage, comparaisons robustes) pour éviter les incohérences de sélection selon les cartes/projets.
- **Terminologie UI conditionnelle N3** : pour les comptes avec `affiliation = n3`, les libellés visibles `élève(s)` et `prof(esseur)(s)` sont remplacés en interface par `n3beur(s)` et `n3boss` (auth, profils, stats, tâches, collectif, audit, visite, paramètres, à propos), sans modifier les clés techniques backend/API.
- **Layout grand écran (prof + élèves)** : ajout d’un mode adaptatif qui fusionne `Carte` et `Tâches` sur une seule page quand la largeur disponible le permet (fallback automatique en onglets si l’espace devient insuffisant), extension de la zone utile en desktop et agrandissement de la carte en vue `Collectif`.
- **Inscription élève (UI)** : le formulaire demande désormais explicitement l’espace d’activité (`N3`, `Forêt comestible` ou `les deux`) via un sélecteur obligatoire, puis transmet ce choix (`affiliation`) à l’API d’inscription.
- **Connexion unifiée multi-rôles** : `POST /api/auth/login` devient l’unique endpoint de connexion (élève/prof/admin) via `identifier` + mot de passe, sans fallback legacy.
- **Mode professeur frontend** : la connexion email passe désormais par `/api/auth/login`, avec activation du mode prof selon la permission `teacher.access`.
- **Compat legacy supprimée** : les anciens endpoints de connexion prof (`/api/auth/teacher/login` et PIN global hors session) sont désactivés côté backend.
- **Bascule users-only** : suppression des accès backend aux tables `students`/`teachers` au profit de `users` (auth, RBAC, routes métier, scripts SQL/ops), ajout de la migration de coupure `029_users_only_cutover.sql` (repointage des FK + drop legacy).
- **Authentification élève** : suppression du login `firstName+lastName`, maintien du seul mode `identifier` (`email`/`pseudo`) + mot de passe.
- **Couverture de tests migration users** : adaptation des tests backend critiques (`auth`, `api`, `students-delete`, `students-import`, `new-features`, `observations-images`) aux requêtes et payloads `users`.
- **Compatibilité applicative migration users** : double lecture/écriture côté backend et frontend (session unifiée `foretmap_session`, JWT enrichi avec `canonicalUserId`, fallback legacy maintenu).
- **Traçabilité des tâches/stats** : ajout de `student_id` sur `task_assignments`/`task_logs` avec fallback nominal maintenu pour rétrocompatibilité.
- **Durcissement admin prod** : garde-fou explicite pour conserver les droits admin de l’identité canonique `oliviera9` lors des migrations.
- **Protection des routes sensibles** : remplacement de la logique binaire `requireTeacher` par des permissions RBAC explicites sur zones, tâches, plantes, stats, audit, visite, observations, tutoriels et gestion élèves.
- **Flux professeur** : la saisie du PIN devient une élévation de session post-connexion (compatibilité PIN historique conservée en secours).
- **Gating UI** : affichage/activation conditionnelle de plusieurs actions prof selon permissions réelles et statut d’élévation.
- **Configuration dynamique** : ajout d’une couche `app_settings` persistée en BDD (`/api/settings/public`, `/api/settings/admin/*`) pour remplacer des options front hardcodées.
- **Cartes multi-paramètres** : enrichissement `maps` avec `is_active` et `frame_padding_px`, exposés via API et consommés par l’UI.
- **Visite/tâches complètement dissociées** : la visite utilise désormais ses propres entités (`visit_zones`, `visit_markers`) avec outils professeur dédiés pour créer/éditer/supprimer zones et repères directement sur la carte de visite, sans dépendre des zones/repères du système de tâches.
- **Panel emojis centralisé et enrichi** : création de `src/constants/emojis.js`, remplacement des listes locales, ajout d’emojis biodiversité, techno et école pour les repères (tâches/visite) et formulaires liés.
- **Navigation/auth** : ajout d’un CTA « Visiter sans connexion » dans l’écran d’authentification et intégration de l’onglet `Visite` dans les navigations élève/prof.

### Corrigé
- **Carte (cohérence labels zones/repères)** : le texte des repères adopte maintenant le même style visuel que les zones (typographie, contraste et lisibilité), en supprimant le badge sombre qui créait un rendu différent.
- **Paramètres cartes réellement appliqués** : la carte par défaut est maintenant réappliquée lors du chargement des réglages publics et lors des changements de contexte (élève/prof/visite), et les cartes inactives (`is_active = false`) sont exclues des sélecteurs utilisateur (visite + tâches) pour respecter la configuration admin.
- **Chargement initial résilient (prod)** : l’écran n’est plus vidé si un endpoint API échoue (ex. `map_id` invalide) ; chaque ressource retombe sur une valeur de secours et la carte active est automatiquement reroutée vers une carte valide.
- **Inscrits visibles pour les élèves** : `GET /api/tasks` renvoie de nouveau les participants d’une tâche pour les élèves non visiteurs (noms/prénoms), tout en conservant la restriction lecture seule pour le rôle visiteur.
- **Statuts tâches (API + notifications prof)** : normalisation robuste des statuts invalides/vides en `available` côté lecture/édition, et notifications “propositions élèves” enrichies pour n’alerter que lors de vrais changements de liste.
- **Paramètres admin (mobile)** : rétablissement du scroll vertical et refonte responsive des blocs en colonne unique sur smartphone (sections paramètres, cartes/plans et actions système) pour éviter les blocages de navigation tactile.
- **Durcissement anti-bugs full stack (tâches/auth/realtime)** : sécurisation des actions élève sur les tâches (`assign`/`done`/`unassign`) avec contrôle d’identité/session, uniformisation des erreurs 500 pour éviter les fuites de messages internes, rafraîchissement réactif des claims de session côté commentaires contextuels, robustesse accrue du client API sur réponses vides/non-JSON, et stabilisation des effets asynchrones carte/temps réel (photo gallery + subscriptions map).
- **Ordre de navigation principal (prof)** : réorganisation des onglets en `Cartes & tâches`, `Carte`, `Tâches`, `Biodiversité`, `Tuto`, `Forum`, `Stats`, `Visites` pour aligner le parcours demandé.
- **Onglets Carte/Tâches (desktop)** : suppression de la fusion automatique grand écran ; `Carte & Zones` affiche uniquement la carte et `Tâches` affiche uniquement les tâches, aligné sur le comportement smartphone.
- **Persistance de l’onglet actif** : après un rafraîchissement de page, l’application conserve désormais l’onglet en cours via stockage local (`foretmap_active_tab`) au lieu de revenir systématiquement sur `Cartes`.
- **Carte mobile (déplacement)** : les gestes carte sont de nouveau actifs par défaut en mode vue sur mobile, sans réverrouillage automatique après inactivité.
- **Centre de notifications (clic)** : le panneau de notifications est désormais affiché en couche fixe sous l’en-tête, ce qui restaure l’ouverture/clic sur mobile et desktop quand le badge est visible.
- **Catalogue biodiversité (photos)** : affichage des vignettes en bande horizontale avec défilement latéral pour éviter l’empilement vertical sur écran étroit.
- **Crash frontend (React #310)** : stabilisation de l’ordre des hooks dans `App` en rendant `useDialogA11y` inconditionnel, ce qui supprime l’écran “Une erreur s’est produite / Recharger la page” au changement d’état de chargement/session.
- **Service worker (schémas non HTTP)** : les requêtes `chrome-extension://` (et autres schémas non supportés) sont désormais ignorées dans le cache runtime pour éviter l’exception `Failed to execute 'put' on 'Cache'`.
- **Service worker (mise à jour forcée)** : passage du cache offline en `foretmap-offline-v2`, stratégie `network-first` pour les bundles JS/CSS et `Cache-Control: no-store` sur `/sw.js` pour réduire les cas de frontend bloqué sur des assets obsolètes après déploiement.
- **Résilience API Express (async)** : les erreurs des handlers asynchrones sont désormais redirigées vers le middleware d’erreur centralisé, évitant un `unhandledRejection` fatal et une indisponibilité complète du site en cas d’erreur BDD.
- **Carte (repères interactifs)** : conversion des pastilles de repère en boutons clavier/accessibles, avec libellés contextuels et styles `focus-visible` pour améliorer la navigation non tactile.
- **Modales zone/repère (ordre des actions)** : réorganisation de sections dans les vues prof pour privilégier la lecture des liaisons existantes avant l’action de liaison, sans changer la logique métier.
- **Affichage grand écran** : stabilisation de la barre de navigation élève (hauteur maîtrisée et non-expansive), alignement de l’espace réservé (`main`/`toast`) sur la hauteur réelle de menu, et densification légère desktop des champs/boutons/onglets pour réduire l’effet visuel trop “gros” sans régression mobile.
- **Navigation carte mobile (refonte gestes)** : extraction de la logique tactile dans un hook dédié avec stratégie mobile explicite (carte passive par défaut, bouton d’activation des gestes, réverrouillage auto après inactivité), pour supprimer les blocages de scroll tout en conservant le zoom/pan volontaire.
- **Carte mobile (gestes tactiles)** : en mode vue non zoomé, le glissement à un doigt privilégie désormais le scroll de page (et conserve le zoom/pan carte à deux doigts), pour éviter les blocages de navigation sur smartphone.
- **Carte mobile (repères)** : augmentation légère de la taille des icônes de repère sur smartphone pour restaurer la lisibilité, tout en conservant un rendu plus compact que la taille historique initiale.
- **Carte mobile (repères lisibilité)** : agrandissement supplémentaire des repères tactiles (pastille, emoji, zone de touche) et du badge d'état pour améliorer la lecture et le ciblage sur portable.
- **Carte mobile (repères lisibilité ++)** : augmentation additionnelle de la taille des repères sur petit écran et alignement visuel des titres de repères avec la taille des labels de zones.
- **Vue “Collectif” (prof/admin)** : blocage préventif des actions refusées côté API (inscription sur tâche pleine/terminée/validée/proposée, retrait sur tâche terminée/validée), avec feedback explicite pour éviter les erreurs inutiles en séance.
- **Accès stats (admin/prof)** : l’icône de profil (badge utilisateur en haut à droite) ouvre désormais la page `📊 Stats` en vue professeur/admin, au lieu de rester inactive.
- **En-tête prof/admin (mobile)** : suppression du débordement horizontal en petite largeur (conteneur d’actions contraint et scroll interne) et réaffichage de l’avatar/logo utilisateur dans le badge stats, avec libellé nom fiable (plus de fallback intempestif sur « Utilisateur »).
- **Connexion Google (UI)** : simplification du libellé du bouton de connexion pour n’afficher que `Continuer avec Google` (sans parenthèses de domaines) en mode élève et professeur.
- **Badge de version (en-tête)** : le badge de version en haut de page n'est plus affiché pour les élèves (visible uniquement en mode professeur).
- **Profil utilisateur explicite** : la vue `Mon profil` affiche désormais clairement le type de profil (`admin`, `prof` ou `eleve`) pour éviter l’ambiguïté sur les droits actifs.
- **Modales stats/profil** : amélioration de la fermeture des fenêtres (bouton accessible + arrêt de propagation du clic) pour éviter les fermetures involontaires.
- **Navigation mobile** : meilleure lisibilité des libellés d’onglets avec retour à la ligne contrôlé sur petits écrans.
- **Session prof et vues stats** : correction du décodage JWT base64url (padding inclus), revalidation `/api/auth/me` au démarrage pour resynchroniser les permissions, et suppression des loaders infinis sur les vues statistiques en cas d’erreur API.
- **Build serveur sans Vite** : `npm run build` devient tolérant en production sans dépendances dev ; si `vite` est absent mais `dist/` est déjà présent, la commande ne casse plus (`scripts/build-safe.js`).
- **Bootstrap local MySQL** : `local:setup` attend désormais explicitement la disponibilité du serveur MySQL (`scripts/wait-mysql-ready.js`) avant `db:init`, évitant les échecs aléatoires de type `PROTOCOL_CONNECTION_LOST`.
- **Environnement local** : suppression de la configuration npm qui omettait les dépendances dev par défaut, ce qui bloquait `supertest` et `@playwright/test` après un `npm install` standard.
- **E2E local** : Playwright démarre automatiquement l’application hors CI (`db:init` + `npm start`) et bloque les service workers pour éviter les caches obsolètes.
- **Helpers e2e auth** : attente explicite du champ `Prénom` après bascule “Créer un compte” pour réduire les faux timeouts.
- **Sécurité stats élève** : `GET /api/stats/me/:studentId` exige désormais une session authentifiée et limite l’accès au propriétaire (élève) ou aux rôles autorisés (`stats.read.all`).
- **Sécurité carnet d’observations** : suppression de la confiance dans `studentId` envoyé par le client ; lecture/création/suppression et accès image reposent maintenant sur l’identité JWT (propriétaire ou professeur autorisé).
- **Fuite d’affectations sur les tâches** : `GET /api/tasks` ne charge plus toutes les assignations globales ; filtrage SQL par `task_id` et exposition réduite selon le rôle.
- **Migrations SQL** : arrêt explicite sur erreur non idempotente au lieu d’avancer silencieusement la version de schéma.
- **Résilience process** : en cas de `uncaughtException` / `unhandledRejection`, le serveur journalise en fatal puis s’arrête proprement (`exit 1`) pour éviter un état incohérent.
- **Endpoints admin** : retrait du secret en query string pour `/api/admin/logs` et `/api/admin/oauth-debug` (header `x-deploy-secret` uniquement).
- **Frontend carte** : correction d’un `ReferenceError` (`isMine`) dans les modales d’inscription aux tâches liées zone/repère.
- **Outillage tests** : script `npm test` rendu portable (`node --test \"tests/*.test.js\"`) et ajout de `@playwright/test` dans les dépendances de développement.
- **Connexion multi-profils** : suppression du blocage `Type de compte non pris en charge` sur `/api/auth/login`; la session est désormais résolue via le rôle RBAC principal pour accepter les comptes élève/prof/admin.
- **PIN et droits natifs** : les rôles `admin` et `prof` accèdent désormais à leurs droits natifs sans code PIN ; le PIN ne sert plus qu’à l’élévation temporaire des droits.
- **Accès admin profils/utilisateurs** : l’onglet professeur affiche désormais `Profils & utilisateurs` dès qu’un rôle possède les permissions RBAC concernées (`admin.roles.manage` ou `admin.users.assign_roles`), même avant élévation PIN.
- **Statut des tâches à l'inscription** : une tâche passe désormais en `en cours` dès la première prise en charge élève (même si `required_students > 1`) ; le recalcul `unassign` reste cohérent (`available` seulement quand il ne reste aucune assignation).
- **Retrait de tâche (élève)** : `POST /api/tasks/:id/unassign` n’exige plus le JWT professeur, comme `assign` et comme l’UI « Me retirer » ; corrige le `401 Unauthorized` en production.
- **Garde-fou anti-lockout admin** : `PUT /api/rbac/users/:userType/:userId/role` bloque la rétrogradation du dernier administrateur actif.

### Modifié
- **Navigation Tuto (élève/prof)** : l’onglet `Tuto` affiche désormais une vraie liste consultable (cartes animées), avec aperçu intégré et actions de téléchargement HTML/PDF.
- **Tâches** : ajout du champ `tutorial_ids` sur création/édition de tâche, affichage des tutoriels liés dans les cartes de tâches et sélection multi-tutoriels dans le formulaire prof.
- **Liste des tâches** : pastille de statut discrète (rouge/orange en fondu pulsé pour à faire / en cours, vert fixe pour terminée ou validée), avec libellé accessible au survol et pour les lecteurs d’écran.
- **Carte (zones/repères)** : ajout des pastilles de statut des tâches directement sur la carte (rouge/orange en fondu, vert fixe), avec agrégation par priorité quand plusieurs tâches sont liées au même élément.
- **Contraste des statuts** : teinte orange “en cours” renforcée (`#f59e0b`) pour mieux se distinguer du rouge “à faire”, en vue tâches et sur la carte.
- **Préparation de déploiement** : exécution du workflow build local `npm run deploy:prepare` pour générer `dist/` et l’archive de livraison.

### Ajouté
- **Catalogue tutoriels enrichi** : intégration de 6 nouveaux tutoriels HTML du dossier `tutos/` (`associations`, `compost`, `eau`, `semences`, `sol`, `sol-vivant`) via seed SQL et migration `021_add_new_tutorials_seed.sql`.
- **Module Tutoriels complet** : nouveau routeur `routes/tutorials.js` (`GET/POST/PUT/DELETE`, rendu HTML, téléchargement HTML et PDF généré à la volée), nouveau composant frontend `src/components/tutorials-views.jsx`, et exposition statique du dossier `tutos/`.
- **Schéma tutoriels + lien avec tâches** : ajout des tables `tutorials` et `task_tutorials` (migration `020_tutorials_and_task_links.sql`), avec seed initial des 4 tutoriels HTML du dossier `tutos/`.
- **Tests tutoriels** : nouveau fichier `tests/tutorials.test.js` couvrant la lecture, les droits prof, les téléchargements HTML/PDF et l’association `tutorial_ids` lors de la création d’une tâche.
- **Tâches multi-zones / multi-repères** : tables `task_zones` et `task_markers`, API `zone_ids` / `marker_ids`, formulaire prof avec cases à cocher (plusieurs zones et repères sur la même carte), liens/déliens depuis la carte sans écraser les autres associations ; migration `019_task_zones_markers_multi.sql`.
- **Réconciliation des uploads orphelins** : nouveau script `scripts/reconcile-orphan-uploads.js` + commandes `db:uploads:reconcile:dry` et `db:uploads:reconcile` pour détecter/supprimer les fichiers orphelins sous `uploads/` (mode dry-run par défaut, scope géré sécurisé) ; tests dans `tests/uploads-reconcile-script.test.js`.
- **Audit consolidé bugs/incohérences** : ajout de `docs/AUDIT_BUGS_INCOHERENCES.md` avec une matrice unique des constats (sécurité, médias, temps réel, documentation) et priorisation d'actions.
- **Affectation des tâches depuis la carte** : ajout du lien direct tâche↔zone et tâche↔repère depuis les modales carte (onglets/actions dédiés en mode prof), avec support backend `marker_id` sur les tâches.
- **Associations multiples d’êtres vivants** : les zones et repères acceptent désormais plusieurs êtres vivants associés (`living_beings`), avec conservation d’un être vivant principal pour compatibilité UI/API.
- **Multi-cartes (Forêt + N3)** : ajout du support de cartes multiples avec entité `maps`, `map_id` sur zones/repères/tâches, switch de carte dans l’UI, création de zones/repères contextualisée, filtrage des tâches par carte (avec option toutes cartes) et route `GET /api/maps`.
- **Carte N3 réelle** : intégration du plan image `public/maps/plan n3.jpg` comme fond de la carte `N3`.
- **Import biodiversité (UI prof)** : ajout d’un bouton `Télécharger template complet` (toutes les colonnes `plants`) en complément du template vierge.
- **Template vierge téléchargeable (import biodiversité)** : ajout d’un bouton mode prof pour télécharger un CSV vierge prêt à remplir, plus le fichier `docs/templates/plants-import-template-vierge.csv`.
- **Import biodiversité (prof)** : ajout de la route `POST /api/plants/import` (CSV/XLSX/Google Sheet), stratégies `upsert_name|insert_only|replace_all`, mode prévisualisation (`dryRun`) et rapport d’erreurs ligne/champ.
- **Guide + templates d’import biodiversité** : ajout de `docs/IMPORT_BIODIVERSITE.md` et des fichiers `docs/templates/plants-import-template.csv` + `docs/templates/plants-import-template-minimal.csv`.
- **Migration 014 photos biodiversité (curation manuelle)** : ajout de `migrations/014_plants_manual_photo_links_curated.sql` avec un jeu de liens directs `Special:FilePath` sélectionnés manuellement pour `Menthe` et les espèces récemment corrigées, sans auto-résolution heuristique.
- **Corrections scientifiques ciblées `plants`** : ajout de `migrations/013_plants_scientific_fixes.sql` (températures invalides corrigées, noms scientifiques normalisés pour certaines espèces, fiche `Menthe` complétée).
- **Consolidation des sources biodiversité** : ajout du script `scripts/consolidate-plants-sources.js` (+ commandes `db:plants:sources:consolidate:dry` et `db:plants:sources:consolidate`) pour vérifier les liens `sources`, retirer les URLs injoignables et enrichir avec des références fiables (Wikipedia/Wikidata) cohérentes avec l’espèce.
- **Migration photo* direct-only** : ajout de `migrations/012_plants_photo_links_direct_only.sql` pour ne conserver en base que des URLs photo directes (`.jpg/.png/...` ou `Special:FilePath`) et neutraliser les liens non compatibles.
- **Résolution auto des photos biodiversité** : ajout du script `scripts/resolve-plants-photo-direct-links.js` (+ commandes `db:plants:photos:direct:dry` et `db:plants:photos:direct`) pour rechercher automatiquement des images Wikimedia cohérentes et remplacer les liens `photo*` non directs dans la table `plants`.
- **Migration plantes depuis Excel (data-only)** : ajout de `migrations/010_plants_excel_data_only.sql` pour synchroniser le référentiel biodiversité (mise à jour des plantes existantes par `name`, insertion des nouvelles entrées) sans modifier le schéma.
- **Déploiement serveur 100% automatisé (cron)** : ajout du script `scripts/auto-deploy-cron.sh` (fetch/pull conditionnel, redémarrage sécurisé via `DEPLOY_SECRET`, check post-déploiement, lock anti-concurrence) et documentation d’activation dans `docs/EXPLOITATION.md` avec exemple cron robuste (`mkdir -p logs` + chemin `scripts/` explicite).
- **Filtre Biodiversité par grand groupe** : ajout d’un sélecteur “Grand groupe” (champ `group_1`) dans les vues élève/prof, combinable avec la recherche texte.
- **Profil utilisateur enrichi** : ajout des champs `pseudo`, `email`, `description` avec édition côté élève, validations backend/frontend et visibilité publique limitée (`pseudo` + `description`).
- **Avatar élève** : avatar par défaut généré via DiceBear (seed pseudo/nom) et possibilité de photo de profil personnalisée (upload image `png/jpg/webp`, stockage disque sous `uploads/students`, option de retour au défaut DiceBear).
- **Scénario e2e retrait de tâche** : ajout de `e2e/tasks-unassign-flow.spec.js` pour couvrir le parcours élève “Je m’en occupe” -> “Me retirer”.
- **Scénarios e2e complets** : ajout de `e2e/tasks-full-cycle.spec.js` (création prof -> prise élève -> soumission -> validation prof) et `e2e/photos-upload-delete.spec.js` (upload/suppression photo de zone).
- **Couverture e2e renforcée** : ajout d’un scénario Playwright `teacher-auth-invalid-pin.spec.js` pour sécuriser le cas d’erreur PIN prof.
- **Tests UI smoke Playwright** : ajout de l’infrastructure e2e (`playwright.config.js`, `e2e/fixtures/auth.fixture.js`) et de 3 specs critiques (auth/navigation élève, carte prof, parcours tâches).
- **Modularisation frontend (stats/audit/about)** : nouveaux modules `src/components/stats-views.jsx`, `src/components/audit-views.jsx`, `src/components/about-views.jsx` avec imports dédiés dans `src/App.jsx`.
- **Modularisation frontend (carte complète)** : `src/components/map-views.jsx` devient le module réel du domaine carte (`MapView`, `ZoneInfoModal`, `ZoneDrawModal`, `MarkerModal`, `PhotoGallery`, `Lightbox`) avec imports mis à jour côté app.
- **Checklist UI post-modularisation** : ajout d’une section dédiée dans `docs/EXPLOITATION.md` pour valider rapidement les parcours prof/élève après découpage frontend.
- **Tests images observations** : nouveau fichier `tests/observations-images.test.js` couvrant la lecture d’image observation sur disque et le cas fichier manquant (`404`).
- **Migration SQL de retrait legacy** : nouvelle migration `migrations/006_drop_legacy_image_data.sql` pour supprimer `image_data` de `zone_photos` et `task_logs` après bascule complète.
- **Compatibilité outils post-bascule** : les scripts `image-migration-report` et `migrate-images-to-disk` détectent désormais l’absence des colonnes legacy et passent en mode no-op explicite.
- **Documentation d'exploitation production** : nouveau guide `docs/EXPLOITATION.md` avec checklist post-déploiement (`deploy:check:prod`), procédure lock o2switch et séquence complète de bascule images.
- **Modularisation frontend (tâches)** : nouveau module `src/components/tasks-views.jsx` pour isoler `TasksView`, `TaskFormModal`, `LogModal`, `TaskLogsViewer`, en conservant une façade de compatibilité via `src/components/foretmap-views.jsx`.
- **Façade carte dédiée** : ajout de `src/components/map-views.jsx` et adoption dans `src/App.jsx` pour préparer l'extraction progressive du domaine carte.
- **Déploiement prod sans arguments** : nouvelle commande `npm run deploy:check:prod` (base URL hardcodée sur `https://foretmap.olution.info`) pour les environnements qui ne permettent pas de passer `--base-url`.
- **Reporting migration images** : nouveau script `scripts/image-migration-report.js` + commande `db:migrate:images:report` pour mesurer les reliquats `image_data` avant la bascule finale.
- **Vérification post-déploiement** : script `scripts/post-deploy-check.js` + commande `npm run deploy:check` pour contrôler `/api/health`, `/api/health/db` et `/api/version` après publication.
- **Migration images progressive** : nouveau script `scripts/migrate-images-to-disk.js` + commandes `db:migrate:images:dry`, `db:migrate:images`, `db:migrate:images:clear` pour convertir `image_data` vers `image_path` sur `zone_photos` et `task_logs` sans rupture immédiate.
- **Tests script migration images** : `tests/images-migration-script.test.js` (parse des flags et génération des chemins cible).
- **Tests sécurité/admin/images** : nouveau fichier `tests/security-admin-images.test.js` couvrant les accès prof sans token/avec token invalide, la protection de `POST /api/admin/restart` et la rétrocompatibilité `image_data` pour les images legacy.
- **Préparation de déploiement** : script PowerShell `scripts/prepare-dist-deploy.ps1` pour automatiser install dépendances, build Vite et génération d’une archive ZIP prête à uploader (`deploy/`). Scripts npm associés : `deploy:prepare` et `deploy:prepare:fast`.
- **Frontend Vite** : application React dans `src/` (`App.jsx`, `components/foretmap-views.jsx`, `services/api.js`, `hooks/useForetmapRealtime.js`, `constants/`, `utils/`), entrée `index.vite.html` / `src/main.jsx`, styles `src/index.css` ; client Socket.IO via `socket.io-client` (devDependency npm, bundlé par Vite). Script `npm run dev:client` (Vite) ; proxy dev `/api` et `/socket.io` dans `vite.config.js`.
- **CI** : étape `npm run build` après les tests pour valider le bundle.
- **GET /api/admin/logs** : dernières lignes Pino via tampon mémoire (secret `DEPLOY_SECRET`, header `X-Deploy-Secret`) ; option `LOG_BUFFER_MAX_LINES` ; module [`lib/logBuffer.js`](lib/logBuffer.js). Doc [docs/API.md](docs/API.md), [README](README.md), [.env.example](.env.example). Tests dans `tests/api.test.js`.
- **Mode prof** : indicateur discret du temps réel (point coloré dans l’en-tête + infobulle : connecté, connexion, hors ligne, client absent).
- **Dependabot** : [`.github/dependabot.yml`](.github/dependabot.yml) (npm, hebdomadaire, regroupement patch/mineures, PR séparées pour les majeures) ; section *Dépendances npm* dans le [README](README.md).
- **Temps réel (Socket.IO)** : serveur HTTP + `socket.io` sur `/socket.io` ; événements `tasks:changed`, `students:changed`, `garden:changed` émis après les mutations concernées (tâches, auth inscription, élèves, zones/photos, plantes, marqueurs).
- **Frontend (comportement inchangé)** : après connexion élève, rafraîchissement ciblé des tâches / jardin (debounce) ; événement DOM `foretmap_realtime` pour recharger les stats prof ; reconnexion → `fetchAll()`. Polling ~30 s conservé en secours.
- **Tests** : `tests/realtime.test.js`.
- **Documentation** : section *Temps réel* dans [docs/API.md](docs/API.md).
- **Page À propos** : nouvel onglet (élève/prof) avec description de l'application, version affichée, mention de l'auteur, liens de documentation locaux (`/README.md`, `/CHANGELOG.md`, `/docs/*`) et lien global vers le dépôt GitHub.

### Modifié
- **Sécurité observations** : restriction de `GET /api/observations/student/:studentId` (prof ou élève concerné) et de `DELETE /api/observations/:id` (prof ou propriétaire) pour limiter l'IDOR et les suppressions non autorisées.
- **Suppression de zone** : purge explicite des fichiers photos associés avant suppression SQL afin d'éviter les fichiers orphelins sur disque.
- **Règle Cursor frontend** : `.cursor/rules/foretmap-frontend.mdc` alignée sur la stack réelle React + Vite (`src/`, `dist/`) pour éviter les corrections erronées de type legacy UMD.
- **Affichage carte responsive** : ajout d’un padding configurable par carte (`frame_padding_px` si fourni, sinon défaut par carte) pour mieux adapter le cadre d’affichage aux dimensions des plans, notamment N3.
- **Cartes multi-zones (correctif compatibilité)** : fallback robuste des fonds de carte côté frontend (ordre de secours N3/Forêt), normalisation des URLs `/api/maps` et migration `016_maps_image_urls_backfill.sql` pour éviter la disparition visuelle des zones en cas de déploiement partiel ou d’URL historique.
- **Mode prof biodiversité** : ajout d’un panneau d’import dans `PlantManager` pour charger un CSV/XLSX ou une URL Google Sheet avec choix de stratégie, prévisualisation et rapport détaillé.
- **Script résolution photos biodiversité** : remplacement des appels `fetch` (undici/Wasm) par `http/https` natif Node dans `scripts/resolve-plants-photo-direct-links.js` pour éviter les erreurs mémoire sur hébergement contraint (CloudLinux/LVE).
- **Biodiversité (liens photos stricts)** : validation backend renforcée sur `POST/PUT /api/plants` pour accepter uniquement des URLs d'image directes (et rejeter les pages/catégories), avec consigne explicite dans le formulaire prof.
- **Check post-déploiement (`deploy:check:prod`)** : ajout d’un `User-Agent` explicite et d’un retry léger sur HTTP `429` (respect de `Retry-After`) pour fiabiliser les vérifications derrière proxy/CDN.
- **Photos biodiversité (Wikimedia Category)** : résolution automatique côté frontend d’une image représentative pour les liens `commons.wikimedia.org/wiki/Category:...` (API Wikimedia), afin de réafficher des miniatures au lieu de simples liens.
- **Photos biodiversité (liens cassés)** : rendu frontend durci pour afficher en vignette uniquement les URLs d’images directes ; les pages (ex. Wikimedia `Category`) restent des liens cliquables pour éviter les miniatures cassées.
- **Nettoyage BDD photo*** : ajout de `migrations/011_plants_photo_links_cleanup.sql` (normalisation des champs photo, placeholders vides -> `NULL`, upgrade `http` -> `https`, conversion des liens Wikimedia `/wiki/File:` vers `/wiki/Special:FilePath/`).
- **Mise à jour automatique frontend** : service worker amélioré pour activer immédiatement une nouvelle version (`SKIP_WAITING`), vérifier les updates au retour onglet actif et recharger automatiquement quand le nouveau worker prend le contrôle.
- **Stratégie de cache HTML** : `/` et `/index.html` passent en `network-first` pour éviter de rester bloqué sur une ancienne interface quand le réseau est disponible.
- **Version affichée fiable** : route `GET /api/version` lit désormais `package.json` à chaque requête (fallback sécurisé sur la version de démarrage) pour refléter la version réellement déployée.
- **Retour utilisateur MAJ** : ajout d’un toast « Nouvelle version installée. » et d’un badge persistant `vX.Y.Z` dans l’en-tête.
- **Script auto-deploy cron** : ajout d’un garde-fou qui bloque le déploiement si des fichiers frontend (`src/`, Vite/public) changent sans mise à jour de `dist/` (build local obligatoire avant push).
- **Terminologie UI/docs** : renommage de l’onglet « Plantes » en « Biodiversité » et harmonisation des libellés vers « biodiversité » / « êtres vivants » selon le contexte (frontend, docs API/README, tests e2e).
- **Déploiement runtime local** : ajout d'un script `deploy:prepare:runtime` pour préparer un bundle complet (`dist` + `node_modules` prod) afin d'éviter les erreurs de build/install sur serveur (`vite` introuvable, locks panel).
- **Sécurité photos plantes** : validation backend des champs photo* avec rejet des URLs invalides et obligation HTTPS sur POST/PUT /api/plants.
- **Sécurité HTTP** : ajout d'une politique Content-Security-Policy côté serveur pour restreindre img-src aux sources sûres ('self', https:, data:, blob:).
- **Catalogue plantes (sources)** : le champ sources affiche désormais des noms de domaine cliquables (labels lisibles) au lieu des URLs brutes.
- **Catalogue plantes (photos)** : les champs URL photo (photo*) sont maintenant rendus en miniatures élégantes avec ouverture en lightbox au clic, au lieu de simples liens texte.
- **Durcissement Playwright** : configuration e2e stabilisée en CI (`workers=1`, `globalTimeout`, `forbidOnly`) et helpers de navigation/auth renforcés.
- **Diagnostic CI e2e** : dump explicite des logs serveur en cas d’échec dans `.github/workflows/ci.yml`.
- **CI** : le workflow `.github/workflows/ci.yml` exécute désormais les tests Playwright smoke après build, avec démarrage applicatif, attente santé et upload d’artefacts en cas d’échec.
- **Documentation d’exploitation/dev** : ajout des consignes d’exécution Playwright (`README.md`, `docs/LOCAL_DEV.md`, `docs/EXPLOITATION.md`) et mise à jour de l’état réel dans `docs/EVOLUTION.md`.
- **Script deploy check** : ajout de `--image-check-path` optionnel (200/404 acceptés, non bloquant) + test associé.
- **Allègement façade historique** : `src/components/foretmap-views.jsx` recentré sur les composants restants après extraction des vues stats/audit/about.
- **Skill évolution Cursor** : mise à jour de `.cursor/skills/foretmap-evolution/SKILL.md` pour refléter l’état actuel du projet.
- **Modularisation frontend** : `src/components/foretmap-views.jsx` est allégé en retirant les composants carte vers `src/components/map-views.jsx` tout en conservant le comportement existant.
- **Tests deploy check** : `tests/post-deploy-check-script.test.js` étendu avec scénarios HTTP réels (`requestJsonWithTimeout`, `checkEndpoint`).
- **Script deploy check** : `scripts/post-deploy-check.js` exporte désormais `requestJsonWithTimeout` et `checkEndpoint` pour améliorer la testabilité.
- **API/Frontend en mode disk-only** : suppression du fallback de lecture `image_data` pour les images zones et logs de tâches ; les endpoints image servent uniquement les fichiers `image_path` (ou 404).
- **Schéma de référence** : `sql/schema_foretmap.sql` aligné sur le mode disk-only (colonnes `image_data` retirées de `zone_photos`/`task_logs`).
- **Migration SQLite -> MySQL** : conversion des anciennes images base64 en fichiers disque lors de l’import, avec écriture de `image_path`.
- **Tests images** : fin des scénarios fallback legacy, remplacement par des scénarios disk-only (lecture fichier, fichier manquant, scripts post-retrait).
- **Flux image tâches** : `POST /api/tasks/:id/done` persiste désormais directement en mode disk-only (écriture fichier puis `image_path`), sans dépendance legacy `image_data`.
- **Couverture de tests migration images** : ajout de scénarios intégration pour fallback legacy `task_logs.image_data`, fichier manquant (`404`) et lecture disque après clear; extension des tests scripts `migrate-images-to-disk` et `image-migration-report` au-delà du simple parse des flags.
- **Documentation** : `README.md`, `docs/EVOLUTION.md` et `public/deploy-help.html` alignés avec la nouvelle doc d'exploitation et l'usage de `deploy:check:prod`.
- **Hotfix deploy check** : `scripts/post-deploy-check.js` n’utilise plus `fetch`/undici (Wasm) et passe en `http/https` natif pour éviter les erreurs mémoire sur certains environnements Node 22 contraints.
- **Checklist de bascule images** : ajout d’un flux recommandé (report -> dry-run -> migration -> clear) dans `README.md` et `docs/LOCAL_DEV.md`; avancement mis à jour dans `docs/EVOLUTION.md`.
- **Documentation déploiement** : ajout de l’étape de validation post-déploiement dans `README.md` et mise à jour de l’avancement dans `docs/EVOLUTION.md`.
- **Documentation migration images** : ajout des étapes de migration progressive dans `README.md`, `docs/LOCAL_DEV.md` et mise à jour de l’état d’avancement dans `docs/EVOLUTION.md`.
- **Plan d’évolution** : `docs/EVOLUTION.md` mis à jour selon l’état réel du code (réalisé / partiel / restant), avec backlog priorisé (quick wins, moyen terme, long terme) et nouvel ordre d’exécution.
- **Configuration production (hardening)** : mode professeur explicitement désactivé si `JWT_SECRET` est absent en production (`middleware/requireTeacher.js`, `routes/auth.js`) ; warnings additionnels sur `JWT_SECRET` et `DEPLOY_SECRET` au démarrage (`lib/env.js`).
- **Frontend** : extraction de `PinModal` et `AuthScreen` vers `src/components/auth-views.jsx` pour poursuivre la modularisation sans changement de comportement.
- **Outillage dev** : ajout du script `npm run dev:client` dans `package.json` pour aligner scripts et documentation.
- **Documentation config** : clarification des variables prod (`TEACHER_PIN`, `JWT_SECRET`, `FRONTEND_ORIGIN`, `DEPLOY_SECRET`) dans `README.md` et `.env.example`.
- **Bundle production (`dist/`)** : hotfix appliqué directement sur l’asset Vite versionné pour forcer le transport Socket.IO en `polling` côté client, afin d’éviter les erreurs WebSocket en hébergement sans build serveur (`npm` indisponible).
- **Temps réel (hotfix prod)** : transport Socket.IO client temporairement forcé en `polling` (au lieu de `websocket + polling`) pour contourner les erreurs WebSocket `reserved bits are on` observées derrière proxy/CDN. Ajout d'une checklist diagnostic et d'une procédure de retour arrière dans le [README](README.md).
- **Entrée SPA en production** : suppression du conflit `dist/index.html` (copie de `public/index.html`) vs entrée Vite. Le fallback Express sert désormais l’entrée Vite (`dist/index.vite.html`), et la page d’aide est déplacée dans `public/deploy-help.html`.
- **Déploiement Git (Option A)** : le dossier `dist/` est désormais versionné sur `main` (plus ignoré), afin que le cron serveur basé sur `git pull` puisse publier l’UI sans build côté hébergement.
- **Déploiement serveur (`deploy:prepare:fast`)** : si Vite est absent (devDependencies non installées), le script installe automatiquement les dépendances dev avant build pour éviter l’erreur `vite: commande introuvable` (code 127).
- **Script de déploiement** : remplacement de l’appel npm via PowerShell par un script Node.js portable (`scripts/prepare-dist-deploy.js`) compatible Linux (`sh`) et Windows.
- **Build frontend** : correction d’un doublon `compressImage` dans `src/components/foretmap-views.jsx` qui bloquait `vite build`.
- **Express** : en production (`NODE_ENV=production`) avec `dist/index.html` présent, fichiers statiques et fallback SPA depuis **`dist/`** ; sinon `public/` (page d’information si build absent).
- **`public/index.html`** : remplacé par une page courte expliquant la nécessité du build Vite (l’ancienne app monolithique + Babel a été migrée vers `src/`).
- **Modales (mode prof / tâches / stats)** : fond d’overlay opaque immédiat (plus d’animation transparent→noir ni `backdrop-filter` sur l’overlay) pour éviter un voile bloquant les clics ; `prefers-reduced-motion` force l’affichage des feuilles modales ; confirmations tâches/élève : clic réservé au fond + `stopPropagation` sur le panneau ; lightbox photo sans animation de fond. Carte prof : hauteur `100dvh - 56px` (sans réserver la barre élève).
- `lib/logger.js` : sortie Pino dupliquée vers stdout et tampon [`lib/logBuffer.js`](lib/logBuffer.js).
- `server.js` : création du serveur via `http.createServer(app)` pour attacher Socket.IO.
- **Page À propos** : correction des crédits avec l'auteur principal `Mohammed El Farrai` (majuscules respectées) et `oliviera999` mentionné comme contributeur.

---

## [1.2.0] - 2026-03-20

### Ajouté
- **Filtres/recherche tâches :** barre de filtres dans la vue tâches (recherche texte, filtre par zone, filtre par statut côté prof).
- **Échéances proches :** bannière d'urgence pour les élèves montrant les tâches dues dans les 3 prochains jours.
- **Progression visuelle élève :** barre de rang (Nouveau → Débutant → Actif → Expert) avec indicateur du prochain palier dans les statistiques élève.
- **Export CSV stats :** endpoint `GET /api/stats/export` (prof, JWT) ; bouton de téléchargement dans la vue stats prof.
- **Catalogue plantes élève :** composant `PlantViewer` (recherche, zones associées) + onglet « Plantes » dans la navigation élève.
- **Modération des logs :** endpoint `DELETE /api/tasks/:id/logs/:logId` (prof) ; bouton de suppression dans le visualiseur de rapports.
- **Carnet d'observation :** table `observation_logs`, route CRUD `routes/observations.js`, composant `ObservationNotebook` + onglet « Carnet » dans la navigation élève.
- **Tâches récurrentes :** champ `recurrence` sur la table `tasks` (migration 005), sélecteur dans le formulaire de tâche, chip dans les cartes de tâches.
- **Historique audit prof :** table `audit_log` (migration 004), route `routes/audit.js` avec `logAudit()`, enregistrement automatique des actions critiques (validation, suppression), onglet « Audit » dans la vue prof.
- **Tests nouvelles fonctionnalités :** `tests/new-features.test.js` (export CSV, modération logs, audit, observations).
- **Mode hors-ligne basique :** Service Worker (`public/sw.js`) avec cache network-first pour l'API et cache-first pour les assets statiques.
- Migrations versionnées : `003_observation_logs.sql`, `004_audit_log.sql`, `005_task_recurrence.sql`.
- Débogage : journalisation des erreurs 500 sur toutes les routes API (`lib/routeLog.js`), journalisation des étapes de migration SQL (`database.js`), scripts `npm run debug` / `debug:dev` (Node `--inspect`), configuration [`.vscode/launch.json`](.vscode/launch.json) (lancer le serveur, attacher, tests `node --test`), source maps sur le build Vite (`vite.config.js`). Documentation : `LOG_LEVEL` dans `.env.example`, sections débogage dans [README](README.md) et [docs/EVOLUTION.md](docs/EVOLUTION.md).
- Environnement local : `docker-compose.yml` (MySQL 8), `docker/mysql-init/` (bases `foretmap_local` + `foretmap_test`), `env.local.example`, scripts `docker:up` / `docker:down`, `test:local` (tests sur `foretmap_test`), doc [docs/LOCAL_DEV.md](docs/LOCAL_DEV.md). Dépendance dev `cross-env`.
- Route `GET /api/health/db` (ping MySQL, 200 ou 503) pour le diagnostic en prod.
- Front : après 3 échecs serveur consécutifs (5xx / réseau), rafraîchissement espacé (2 min) + bandeau « Serveur indisponible » et bouton « Réessayer ».

### Modifié
- Navigation élève élargie : 4 onglets (Carte, Tâches, Plantes, Carnet) au lieu de 2.
- Navigation prof élargie : 5 onglets (Carte & Zones, Tâches, Plantes, Stats, Audit) au lieu de 4.
- Avertissements `lib/env.js`, `lib/uploads.js` et échec validation `.env` au démarrage : messages via Pino (`lib/logger.js`) au lieu de `console.*` ; frontend : erreurs API auparavant ignorées journalisées avec `console.error('[ForetMap] …')` ou toast (stats prof).
- Fallback SPA : chemin absolu `path.resolve`, logs enrichis (`resolvedPath`, `code`) si `index.html` introuvable.
- Version API : lecture de `package.json` via `path.join(__dirname, …)`.
- README : section *Débogage* (logs, inspect Node, bonnes pratiques front) ; procédure « Can't acquire lock » o2switch, racine d’app + variables BDD, section diagnostic `/api/health` vs `/api/health/db`.

### Déploiement
- **Requis avant redémarrage :** `npm run db:migrate` pour appliquer les migrations 003-005.

---

## [1.1.1] - 2026-03-18

### Ajouté
- Version de l’app en pied de page : `GET /api/version`, affichage sur l’écran de connexion et en bas de l’interface une fois connecté.
- Redémarrage déclenché après déploiement : `POST /api/admin/restart` (secret `DEPLOY_SECRET`, header `X-Deploy-Secret` ou body `secret`). Documentation dans README et `.env.example`.

---

## [1.1.0] - 2026-03-18

### Ajouté
- Auth professeur côté serveur : `POST /api/auth/teacher` (vérification PIN via `TEACHER_PIN`), JWT, middleware `requireTeacher` sur les routes sensibles (zones, plants, tasks, stats, students, map).
- CORS restreint en production via `FRONTEND_ORIGIN`.
- Découpage backend en routeurs : `routes/` (auth, zones, map, plants, tasks, stats, students), `middleware/requireTeacher.js`, `lib/helpers.js`.
- Images sur disque : `uploads/` (zones, task-logs), colonnes `image_path` en BDD, rétrocompat base64 ; `lib/uploads.js`.
- Migrations de schéma versionnées : table `schema_version`, dossier `migrations/` (001_schema_version, 002_image_path).
- Tests backend (Node `node:test` + supertest) : auth, statuts tâches (assign/unassign), suppression élève (cascade). Script `npm test`.
- Base Vite + React : `vite.config.js`, `index.html`, `src/main.jsx`, scripts `build` / `preview`.
- Validation des variables d’environnement au démarrage (`lib/env.js`), logging Pino (`lib/logger.js`), middleware d’erreur centralisé.
- CI GitHub Actions : `.github/workflows/ci.yml` (Node 20, MySQL 8, `npm ci` + `npm test`).
- Documentation API : `docs/API.md` (routes, codes d’erreur, note a11y).
- Script `npm run dev` avec nodemon.

### Modifié
- Frontend : plus de PIN en clair ; appel à `POST /api/auth/teacher`, token en `localStorage`, header `Authorization` sur les requêtes prof ; prise en charge `image_url` pour photos et logs.
- `.env.example` : `TEACHER_PIN`, `JWT_SECRET`, `FRONTEND_ORIGIN`.
- `.gitignore` : dossier `uploads/`.

---

## [1.0.1] - 2026-03-18

### Ajouté
- Routine de versionnage : CHANGELOG.md, docs/VERSIONING.md, scripts `bump:*` / `release:*`, règle Cursor.

---

## [1.0.0] - 2026-03-18

### Ajouté
- Version initiale documentée : application forêt comestible (zones, tâches, plantes, élèves, mode prof).
