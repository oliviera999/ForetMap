# Journal des versions

Ce fichier suit les principes de [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).
Le numéro de version suit [Semantic Versioning](https://semver.org/lang/fr/) (MAJEUR.MINEUR.CORRECTIF).

## [Non publié]

### Ajouté
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
