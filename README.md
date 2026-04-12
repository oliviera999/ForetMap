# ForetMap

Application de gestion de la forêt comestible — **Lycée Lyautey**.

Les élèves peuvent consulter la carte des zones, s’inscrire à des tâches et marquer leur travail comme fait. Les professeurs gèrent les zones, la biodiversité, les tâches et les statistiques via un mode protégé par PIN.

**Version :** `package.json` (SemVer) · [CHANGELOG](CHANGELOG.md) · procédure : [docs/VERSIONING.md](docs/VERSIONING.md) (`bump:*` + commit + tag)

---

## Stack technique

| Couche      | Technologie |
|------------|-------------|
| Backend    | Node.js, Express, Socket.IO (mises à jour temps réel) |
| Base de données | **MySQL** (mysql2, pool promesses) — hébergement o2switch |
| Frontend   | React 18, build **Vite** (`src/`), bundle servi depuis `dist/` en production |
| Auth élèves | bcrypt (hash des mots de passe), session en `localStorage` |

Fichiers principaux : `server.js` (API + fichiers statiques), `database.js` (pool MySQL, helpers, seed), `sql/schema_foretmap.sql` (DDL), `src/` (application React), `index.vite.html` + `vite.config.js` (build → `dist/`).

---

## Installation et démarrage

```bash
cd ForetMap
npm install
cp .env.example .env
# Éditer .env avec DB_HOST, DB_NAME, DB_USER, DB_PASS (MySQL)
npm run db:init   # applique le schéma + seed si tables vides
npm run build     # compile le frontend React dans dist/ (obligatoire avant prod)
npm start
```

L’app est servie sur **http://localhost:3000** (ou le port défini par `process.env.PORT`). Avec `NODE_ENV=production`, Express sert **`dist/`** ; sans build, vous verrez la page d’information dans `public/index.html`.

**Développement UI :** terminal 1 — `npm run dev` (Express, port 3000) ; terminal 2 — `npm run dev:client` (Vite, proxy `/api` et `/socket.io` vers 3000). Ouvrir l’URL affichée par Vite (souvent **http://localhost:5173**).

### Débogage (logs, breakpoints)

- **Niveau de log :** variable optionnelle `LOG_LEVEL` (ex. `debug`, `info`, `warn`). Sans `LOG_LEVEL`, Pino utilise `debug` hors production et `info` en production — voir `lib/logger.js`.
- **Erreurs API :** les réponses HTTP 500 sont journalisées côté serveur (`lib/routeLog.js`) avec chemin et méthode ; les migrations SQL loguent les échecs inattendus (`database.js`).
- **Inspect Node :** `npm run debug` (ou `npm run debug:dev` avec rechargement nodemon), puis dans VS Code / Cursor : exécuter la configuration **ForetMap : attacher au process Node** (port d’inspect par défaut **9229**), ou **ForetMap : lancer server.js (inspect)** depuis [`.vscode/launch.json`](.vscode/launch.json).
- **Frontend :** éviter les blocs `catch` vides sur les appels réseau ; les erreurs secondaires sont au minimum tracées dans la console du navigateur (`[ForetMap] …`).
- **Frontend :** plus de Babel dans le navigateur ; le bundle est produit par **Vite** (`npm run build`). Voir [docs/LOCAL_DEV.md](docs/LOCAL_DEV.md) pour le mode dev (Express + Vite).

### Environnement local complet (Docker + tests avant déploiement)

Guide pas à pas : **[docs/LOCAL_DEV.md](docs/LOCAL_DEV.md)** — MariaDB 11.4 (Docker `mariadb:11.4.10`), `env.local.example` → `.env`, `npm run db:init`, `npm run dev`, `npm run test:local` (base `foretmap_test` séparée).  
Exploitation prod : **[docs/EXPLOITATION.md](docs/EXPLOITATION.md)** (check post-déploiement, lock o2switch, bascule images). Diagnostic à distance depuis Cursor (MCP) : **[docs/MCP_FORETMAP_CURSOR.md](docs/MCP_FORETMAP_CURSOR.md)** (fichier **`.cursor/mcp.json`**, secret deploy dans **`.env`** ou variable d’environnement).
Déploiement entièrement automatisé (push -> cron -> mise à jour): voir la section dédiée dans `docs/EXPLOITATION.md`.
Le script auto-deploy bloque volontairement un pull si `src/` change sans artefacts `dist/` mis à jour (build local requis avant push).

### Dépendances npm (mises à jour prudentes)

- **Lockfile** : le dépôt versionne `package-lock.json` ; en CI et en prod, privilégier **`npm ci`** (déjà le cas dans [`.github/workflows/ci.yml`](.github/workflows/ci.yml)) pour des installs reproductibles.
- **Dependabot** : configuration dans [`.github/dependabot.yml`](.github/dependabot.yml) — ouverture hebdomadaire (lundi) de **pull requests** proposant les mises à jour. **Ne pas merger** sans vérifier que la CI est verte et, pour une version **majeure**, jeter un œil au changelog du paquet.
- **Version de l’application** (SemVer dans `package.json`) : ce n’est pas géré par Dependabot ; utiliser les scripts `npm run bump:patch|minor|major` et suivre [docs/VERSIONING.md](docs/VERSIONING.md) + [CHANGELOG.md](CHANGELOG.md).

### Migration images (état actuel)

Le fallback legacy `image_data` a été retiré côté API/frontend. La source d’image est désormais `image_path` (fichiers disque) uniquement.

Les scripts de migration existent encore pour les environnements n’ayant pas encore appliqué la migration SQL finale :

```bash
# 0) Mesurer les reliquats legacy
npm run db:migrate:images:report

# 1) Simulation (aucune écriture)
npm run db:migrate:images:dry

# 2) Migration disque
npm run db:migrate:images

# 3) nettoyage legacy (avant migration SQL finale)
npm run db:migrate:images:clear
```

Une fois la migration SQL finale appliquée (`migrations/006_drop_legacy_image_data.sql`), `report`/`migrate` indiquent qu’il n’y a plus de colonnes legacy à traiter.

Checklist recommandée avant migration SQL finale :

1. `npm run db:migrate:images:report` retourne `total legacy: 0`.
2. Vérification fonctionnelle des photos zones et logs de tâches en UI.
3. Sauvegarde BDD récente disponible (rollback).

### Import biodiversité (mode professeur)

Le mode prof inclut un bloc **Import biodiversité** dans la gestion des plantes.

Sources supportées:

- fichier `.csv`, `.xlsx`, `.xls`,
- URL Google Sheet (partage lecture).

Stratégies disponibles à l’import:

- `upsert_name` (maj si même nom, sinon création),
- `insert_only` (création uniquement),
- `replace_all` (remplacement complet avec confirmation).

Documentation détaillée et templates:

- [docs/IMPORT_BIODIVERSITE.md](docs/IMPORT_BIODIVERSITE.md)
- [docs/templates/plants-import-template-minimal.csv](docs/templates/plants-import-template-minimal.csv)
- [docs/templates/plants-import-template.csv](docs/templates/plants-import-template.csv)

### Variables d’environnement

| Variable | Description |
|----------|-------------|
| `DB_HOST` | Hôte MySQL (défaut : localhost) |
| `DB_PORT` | Port MySQL (défaut : 3306) |
| `DB_NAME` | Nom de la base |
| `DB_USER` | Utilisateur MySQL |
| `DB_PASS` | Mot de passe MySQL |
| `PORT` | Port du serveur (défaut : 3000) |
| `IP` ou `ALWAYSDATA_HTTPD_IP` | Adresse d’écoute (défaut : 0.0.0.0) |
| `DEPLOY_SECRET` | Optionnel : secret pour redémarrage à distance après déploiement (voir ci‑dessous) |
| `TEACHER_PIN` | PIN de secours historique (élévation admin de compatibilité) |
| `JWT_SECRET` | Secret JWT (requis en production) |
| `TEACHER_ADMIN_EMAIL` | Optionnel : email du compte prof auto-créé (auth email/mot de passe) |
| `TEACHER_ADMIN_PASSWORD` | Optionnel : mot de passe initial du compte prof auto-créé |
| `TEACHER_ADMIN_DISPLAY_NAME` | Optionnel : nom affiché du compte prof auto-créé |
| `RBAC_DEFAULT_STUDENT_ROLE` | Optionnel : rôle élève assigné par défaut (`eleve_novice` par défaut) |
| `FRONTEND_ORIGIN` | En production : origine CORS autorisée (ex. `https://foretmap.olution.info`) |
| `PASSWORD_RESET_BASE_URL` | URL de base incluse dans les emails de réinitialisation (défaut `FRONTEND_ORIGIN` puis `http://localhost:3000`) |
| `SMTP_HOST` | Hôte SMTP pour l’envoi d’emails (mot de passe oublié) |
| `SMTP_PORT` | Port SMTP (défaut 587) |
| `SMTP_SECURE` | `true` pour SMTPS (défaut auto selon port) |
| `SMTP_USER` / `SMTP_PASS` | Identifiants SMTP (si requis par le fournisseur) |
| `SMTP_FROM` | Expéditeur des emails (ex. `ForetMap <no-reply@exemple.com>`) |
| `SMTP_JSON_TRANSPORT` | Optionnel (dev/test) : active un transport JSON sans envoi réel |
| `FORETMAP_RECURRENCE_TZ` | Optionnel : fuseau IANA pour la date du jour du job tâches récurrentes (défaut `Europe/Paris`). |
| `FORETMAP_DISABLE_RECURRING_TASK_JOB` | Optionnel : `1` pour ne pas planifier le job de duplication des tâches récurrentes (hors `NODE_ENV=test` qui le désactive déjà). |
| `FORETMAP_SHUTDOWN_TIMEOUT_MS` | Optionnel : délai max (ms) avant `exit 1` si l’arrêt gracieux (`SIGTERM` / `SIGINT` / redémarrage admin) bloque ; entre **3000** et **120000**, défaut **12000**. |
| `LOG_LEVEL` | Optionnel : niveau Pino (`debug`, `info`, …). Voir section *Débogage* ci‑dessus. |

Le réglage GUI admin `tasks.recurring_automation_enabled` permet de suspendre globalement la création automatique des tâches récurrentes (ex. vacances) sans couper le timer serveur. Pour couper complètement la planification, utiliser `FORETMAP_DISABLE_RECURRING_TASK_JOB=1`.

**Obligatoires au démarrage** : `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME`. Si l’une manque, le serveur refuse de démarrer.  
**En production** : `JWT_SECRET` est requis pour l’authentification JWT. `TEACHER_PIN` est uniquement un secours de compatibilité.  
**Recommandé en production** : définir `FRONTEND_ORIGIN` (CORS restreint), `DEPLOY_SECRET` (activer les endpoints admin protégés), ainsi que la configuration SMTP pour le flux « mot de passe oublié ».

Pour créer/mettre à jour manuellement le compte prof email avec les variables `TEACHER_ADMIN_*` :

```bash
npm run db:seed:teacher
```

Un fichier `.env` (copié depuis `.env.example`) est utilisé en local ; il est ignoré par Git. En production sur o2switch, configurer les variables dans l’interface « Setup Node.js App ».

---

## Migration SQLite → MySQL

Si vous partez d’un ancien fichier `foretmap.db` (SQLite) :

1. Appliquer le schéma MySQL : `npm run db:init` (ou exécuter `sql/schema_foretmap.sql` à la main).
2. Placer `foretmap.db` à la racine du projet (ou définir `SQLITE_PATH`).
3. Lancer la migration : `npm run migrate:sqlite-to-mysql`.

Le script vide les tables MySQL puis recopie toutes les données (zones, biodiversité, tâches, élèves, photos, etc.). Tester de préférence sur une copie de la BDD avant la prod.

---

## Déploiement o2switch (foretmap.olution.info)

1. **Créer l’application Node.js** dans cPanel : **Setup Node.js App** — choisir la version Node proposée par l’hébergeur (**18**, **20** ou **22** ; la prod foretmap utilise **22**). **Le répertoire de l’application** doit contenir `server.js`, le dossier **`public/`** (assets + `sw.js` + page d’aide `deploy-help.html`) et, après build, le dossier **`dist/`** avec l’entrée SPA Vite (`index.vite.html`). En production (`NODE_ENV=production`), l’UI est servie depuis **`dist/`**.

2. **Variables d’environnement** dans l’interface de l’app Node (obligatoires pour l’API) :  
   `DB_HOST=localhost`, `DB_NAME=oliviera_foretmap`, `DB_USER=oliviera_foretmap`, `DB_PASS=...`, `NODE_ENV=production`.  
   Sans ces variables MySQL, la page d’accueil peut s’afficher mais les appels `/api/*` échoueront (erreur serveur).

3. **Fichier d’entrée (Application startup file)** : **`app.js`** (valeur par défaut de cPanel). Ce fichier charge `server.js` et lance le serveur via `boot()`. Il écrit un diagnostic immédiat dans `startup-diag.log` pour faciliter le débogage. Si le champ est sur `server.js`, le démarrage direct fonctionne aussi (`node server.js` appelle `boot()` automatiquement).

4. **Déployer le code (mode standard)** : upload du dépôt (sans `.env`), puis sur le serveur :
   ```bash
   npm install --production
   ```
   **Erreur « Can't acquire lock for app: … »** : message du panel o2switch (pas de l’app). **Arrêter l’application** dans Setup Node.js App, attendre quelques secondes, lancer **npm install**, puis **redémarrer** l’app. Ne pas ouvrir l’URL du site pendant l’install si le panel ou un script interroge l’app à ce moment.

5. **Initialiser la BDD** (une fois) : exécuter le schéma puis éventuellement la migration :
   - En SSH, depuis le répertoire de l’app : `npm run db:init`
   - Si migration depuis SQLite : copier `foretmap.db` sur le serveur, puis `npm run migrate:sqlite-to-mysql` (après `npm install` pour avoir `better-sqlite3` en dev si nécessaire ; en prod on peut l’installer temporairement : `npm install better-sqlite3 --save-dev`).

6. **Sous-domaine** : pointer **foretmap.olution.info** vers l’application Node (domaine/addon dans cPanel, puis lier au répertoire de l’app Node).

7. **Redémarrer** l’app depuis l’interface Setup Node.js App après toute modification des variables ou du code.

8. **Vérifier le déploiement** (recommandé) :
   ```bash
   npm run deploy:check -- --base-url https://foretmap.olution.info
   ```
   Ce script valide `/api/health` et `/api/health/db` (bloquants), puis `/api/version` (non bloquant).
   Si votre interface ne permet pas de passer des arguments, utilisez :
   ```bash
   npm run deploy:check:prod
   ```
   En cas de **`ERR_HTTP2_PROTOCOL_ERROR`** côté navigateur : **`npm run prod:transport-probe`** (HTTP/1.1 vs HTTP/2). Checklist d’exploitation : [docs/EXPLOITATION.md](docs/EXPLOITATION.md).

### Variante recommandée: bundle runtime préparé en local (sans npm côté serveur)

Cette variante évite les pannes observées côté hébergeur (`vite` absent, lock panel pendant `npm install`).

1. En local (Linux / macOS / Windows — script **Node**, voir [docs/LOCAL_DEV.md](docs/LOCAL_DEV.md)) :
   ```bash
   npm run deploy:prepare:runtime
   ```
   Cette commande :
   - installe les dépendances (dev),
   - build le frontend,
   - prune en dépendances production,
   - remplit le dossier de staging `deploy/runtime/foretmap-runtime-*` (code + `dist/` + `node_modules` prod),
   - tente en plus de produire `deploy/foretmap-runtime-*.zip` (**optionnel** ; pratique pour un seul fichier à uploader).

2. Sur le serveur :
   - **soit** synchroniser le contenu du dossier `deploy/runtime/foretmap-runtime-*` vers le dossier de l'app (celui avec `server.js`) — `rsync`, SFTP récursif, etc. ;
   - **soit** extraire le ZIP dans ce dossier si tu l'as généré ;
   - **sans** lancer `npm install`,
   - redémarrer l'application Node.js.

3. Vérifier:
   ```bash
   npm run deploy:check:prod
   ```

> Le bundle runtime est spécifique à l'OS cible. Le préparer sur un environnement compatible avec le serveur d'hébergement (dossier ou ZIP).

### Workflow conseillé (résumé)

- **Si auto-deploy cron est actif sur le serveur**: build local + `dist/` à jour, commit/push, attendre le run cron, puis vérifier avec `npm run deploy:check:prod`.
- **Si l'hébergement est instable avec npm côté serveur** : utiliser `npm run deploy:prepare:runtime`, uploader le dossier `deploy/runtime/foretmap-runtime-*` **ou** extraire le ZIP sur le serveur, redémarrer, puis `npm run deploy:check:prod`.
- En cas de `429` ponctuel au check post-déploiement, relancer la vérification après quelques secondes puis confirmer `GET /api/version`.

### Incident temps réel Socket.IO (WebSocket)

Si la console navigateur affiche `reserved bits are on` ou `connect_error websocket error`, cela indique généralement une altération des trames WebSocket par un proxy/CDN (pas une erreur métier ForetMap).

**Contournement actuellement appliqué côté client :**
- transport forcé en `polling` dans `src/hooks/useForetmapRealtime.js` pour maintenir le temps réel sans dépendre de WebSocket.

**Checklist de diagnostic côté hébergeur / proxy :**
- vérifier que la route `https://foretmap.olution.info/socket.io/` est bien routée vers l’app Node ;
- vérifier la prise en charge WebSocket (upgrade HTTP) sur le reverse proxy ;
- transmettre correctement les headers `Upgrade: websocket` et `Connection: upgrade` ;
- éviter toute réécriture/inspection de trames WebSocket par un CDN/WAF/antivirus proxy ;
- vérifier que l’origine front (`FRONTEND_ORIGIN`) correspond exactement au domaine servi (schéma + hôte).

**Marche arrière une fois l’infra corrigée :**
1. remettre `transports: ['websocket', 'polling']` dans `src/hooks/useForetmapRealtime.js` ;
2. redéployer le frontend (`npm run build`) ;
3. redémarrer l’app Node.js ;
4. valider en navigateur qu’il n’y a plus de `connect_error websocket error`.

### Redémarrage automatique après déploiement

Si vous définissez la variable d’environnement `DEPLOY_SECRET` (une chaîne secrète de votre choix), vous pouvez déclencher un redémarrage de l’app à distance après un `git pull` ou un déploiement. Le processus Node s’arrête proprement ; le gestionnaire de process (o2switch, PM2, systemd, etc.) le relance s’il est configuré pour cela.

Depuis votre script de déploiement ou en ligne de commande après un pull :

```bash
curl -X POST https://foretmap.olution.info/api/admin/restart \
  -H "X-Deploy-Secret: VOTRE_DEPLOY_SECRET"
```

Ou en JSON : `POST /api/admin/restart` avec body `{ "secret": "VOTRE_DEPLOY_SECRET" }`. En cas de succès, l’app répond puis s’arrête 1 seconde après ; le serveur doit être configuré pour relancer l’application automatiquement.

### Consultation des logs applicatifs (tampon mémoire)

Avec le **même** `DEPLOY_SECRET`, tu peux récupérer les dernières lignes émises par **Pino** depuis le démarrage du process (JSON par ligne) :

```bash
curl -s "https://foretmap.olution.info/api/admin/logs?lines=300" \
  -H "X-Deploy-Secret: VOTRE_DEPLOY_SECRET"
```

Réponse JSON : `entries` (tableau de chaînes), `bufferLines`, `bufferMax`. Préférer le **header** au secret en query string pour limiter l’exposition dans les journaux d’accès du serveur web. Taille du tampon : variable optionnelle **`LOG_BUFFER_MAX_LINES`** (voir `.env.example`). Pour l’historique complet ou les erreurs avant boot, utiliser aussi les logs du panel Node (o2switch).

Référence : [FAQ o2switch – Node.js](https://faq.o2switch.fr/cpanel/logiciels/hebergement-nodejs-multi-version/).

### Diagnostic (BDD vs app)

- **`GET /api/health`** — l’app répond (sans toucher à MySQL).
- **`GET /api/health/db`** — renvoie `200` si la connexion MySQL fonctionne, **`503`** si la base est inaccessible (utile pour distinguer une panne BDD d’un problème de fichiers ou de proxy).
- **`startup-diag.log`** — écrit par `app.js` dès son chargement (avant même `server.js`). Si ce fichier n’apparaît pas après un redémarrage cPanel, le fichier d’entrée configuré n’est pas `app.js`.
- **`startup.log`** — écrit par `server.js` lors du `boot()`. Contient les variables d’environnement, le port, et le résultat de l’init BDD.

---

## Structure du projet

```
ForetMap/
├── server.js          # Serveur Express, routes API async (zones, plants, tasks, auth, stats…)
├── database.js        # Pool MySQL (mysql2), helpers queryAll/queryOne/execute, init + seed
├── docker-compose.yml # MariaDB 11.4 local (dev / tests)
├── docker/mysql-init/ # Création des bases foretmap_local + foretmap_test
├── sql/
│   └── schema_foretmap.sql   # DDL MySQL (InnoDB, utf8mb4)
├── scripts/
│   └── migrate-sqlite-to-mysql.js   # Migration SQLite → MySQL
├── index.vite.html     # Entrée HTML du build Vite
├── vite.config.js
├── package.json
├── .env.example
├── env.local.example  # Modèle .env pour Docker local (voir docs/LOCAL_DEV.md)
├── README.md
├── src/                # Application React (App, composants, services, hooks, styles)
├── docs/
│   ├── LOCAL_DEV.md    # Environnement local complet avant déploiement
│   └── EVOLUTION.md    # Recommandations d’évolution (audit)
├── .cursor/
│   ├── rules/          # Règles Cursor (conventions du projet)
│   └── skills/         # Skills Cursor (contexte ForetMap)
├── dist/               # Sortie `npm run build` (servi en prod, non versionné si absent)
└── public/
    ├── index.html      # Message si build absent ; assets copiés dans dist/ au build
    └── sw.js           # Service worker (PWA légère)
```

---

## Pousser le dépôt sur GitHub

1. Créez un dépôt sur [github.com/new](https://github.com/new) (ex. nom `ForetMap`), sans initialiser avec un README.

2. Depuis le dossier du projet :

   ```bash
   git remote add origin https://github.com/VOTRE_UTILISATEUR/ForetMap.git
   git push -u origin main
   ```

   En SSH :

   ```bash
   git remote add origin git@github.com/VOTRE_UTILISATEUR/ForetMap.git
   git push -u origin main
   ```

---

## Évolution du projet

Les recommandations issues de l’audit (sécurité, architecture, performance, tests) sont détaillées dans **[docs/EVOLUTION.md](docs/EVOLUTION.md)**. Ce document sert de feuille de route pour faire évoluer le code sans modifier le comportement actuel de l’application.

## Tests UI smoke (Playwright)

Des tests UI de non-régression (parcours élève/prof) sont disponibles dans `e2e/`.

```bash
npm run test:e2e
```

La commande libère le port d’écoute (souvent **3000**), puis Playwright démarre **`npm run start:e2e`** (serveur avec **`--foretmap-e2e-no-rate-limit`** pour éviter les **429** sur l’API). Détails : **[docs/LOCAL_DEV.md](docs/LOCAL_DEV.md)** (§ 5bis).

Par défaut, ils ciblent `http://127.0.0.1:3000`. Vous pouvez surcharger avec **`E2E_BASE_URL`**.
