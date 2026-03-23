# Journal des versions

Ce fichier suit les principes de [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).
Le numéro de version suit [Semantic Versioning](https://semver.org/lang/fr/) (MAJEUR.MINEUR.CORRECTIF).

## [Non publié]

### Ajouté
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
