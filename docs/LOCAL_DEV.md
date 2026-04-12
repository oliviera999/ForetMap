# Développement local complet (avant déploiement)

Environnement aligné sur la CI : **MariaDB 11.4** (image Docker `mariadb:11.4.10`), deux bases (`foretmap_local` pour l’app, `foretmap_test` pour les tests). **N’utilisez pas** les identifiants o2switch ici.

## Prérequis

- Node.js 18 ou 20
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows / macOS / Linux)

## 1. Démarrer MariaDB (Docker)

À la racine du projet :

```bash
npm run docker:up
# ou : docker compose up -d
```

Attendre que le conteneur soit **healthy** (10–40 s la première fois). Vérifier :

```bash
docker compose ps
```

**Port 3306 déjà utilisé** (autre MariaDB/MySQL, XAMPP, etc.) : dans `.env` (racine du projet, lu par Docker Compose et par Node), définissez **`FORETMAP_DB_PUBLISH_PORT=3307`** et **`DB_PORT=3307`**, puis `docker compose up -d` (le mapping hôte devient `3307→3306` dans le conteneur). Recréez le conteneur si besoin : `docker compose down -v` puis `docker compose up -d` (le `-v` supprime le volume : perte des données du conteneur). Alternative ponctuelle sous PowerShell : `$env:FORETMAP_DB_PUBLISH_PORT='3307'; $env:DB_PORT='3307'; docker compose up -d`.

**Ancien conteneur MySQL 8 (volume `foretmap_mysql_data`)** : après passage à MariaDB, exécutez `docker compose down -v` puis `docker compose up -d` pour repartir sur le volume `foretmap_mariadb_data` (les données binaires MySQL 8 ne sont pas réutilisables telles quelles par MariaDB 11).

## 2. Configuration

```bash
cp env.local.example .env
```

Le mot de passe root du conteneur MariaDB est **`foretmap_local_root`** (déjà cohérent avec `env.local.example`). Ajustez `DB_PORT` si vous avez changé le mapping de port.

## 3. Dépendances et base de données

```bash
npm install
npm run db:init
```

Cela applique le schéma et le seed sur **`foretmap_local`**.

### Police emoji (Noto Color Emoji, auto-hébergée)

L’application sert `public/fonts/noto-color-emoji.woff2` pour afficher les emojis (carte, visite, badges, etc.) même lorsque le système n’a pas de police colorée complète. Après `npm install` ou une mise à jour de `@fontsource/noto-color-emoji`, régénérer la copie versionnée :

```bash
npm run fonts:sync-noto-emoji
```

Puis committer `public/fonts/noto-color-emoji.woff2` si le fichier change. Le réglage admin `ui.map.location_emojis` contrôle **quelles** emojis sont proposées dans les sélecteurs ; le **rendu** repose sur cette police (voir le libellé du champ dans la console réglages).

### Option rapide (bootstrap en une commande)

```bash
npm run local:setup
```

Cette commande enchaîne :
- démarrage Docker (MariaDB),
- installation des dépendances (incluant dev),
- attente active de disponibilité du serveur MariaDB,
- initialisation BDD,
- vérification locale (`check:local`).

### Optionnel — migration legacy images (avant migration SQL finale)

```bash
# Mesurer les reliquats
npm run db:migrate:images:report

# Simulation
npm run db:migrate:images:dry

# Migration réelle
npm run db:migrate:images
```

Après la migration SQL finale (`migrations/006_drop_legacy_image_data.sql`), ces commandes deviennent des no-op (colonnes legacy absentes).

### Import d'un dump SQL distant (copie de production)

Le script d'import local remet d'abord la base cible a zero, puis importe le dump :

```bash
npm run db:import:dump -- --file "C:\Users\olivi\Downloads\oliviera_foretmap.sql"
npm run db:migrate
```

Vous pouvez aussi passer le chemin via variable d'environnement :

```bash
set FORETMAP_DUMP_PATH=C:\Users\olivi\Downloads\oliviera_foretmap.sql
npm run db:import:dump
npm run db:migrate
```

Important :
- Le dump contient des donnees reelles (PII : noms, emails, historique). Ne pas le versionner dans Git.
- Le script cible `DB_NAME` courant (par defaut `foretmap_local`) et execute un `DROP DATABASE` + `CREATE DATABASE`.
- Le dump peut ecraser les secrets de PIN en base (`role_pin_secrets`). Le `TEACHER_PIN` de `.env` peut alors ne plus correspondre.

Apres import, deux options :
- Option A : utiliser les credentials/PIN reels deja presents dans le dump (sans les copier dans le depot).
- Option B : realigner le local sur `.env` pour les tests/dev avec :

```bash
npm run db:reset:role-pins:local
npm run db:seed:teacher
```

## 4. Lancer l’application

### Option A — Développement (recommandé : Express + Vite)

Deux terminaux à la racine du projet :

```bash
# Terminal 1 — API + Socket.IO (port 3000)
npm run dev
```

```bash
# Terminal 2 — interface React avec proxy vers l’API
npm run dev:client
```

Ouvrir l’URL affichée par Vite (souvent **http://localhost:5173**). Les requêtes `/api/*` et `/socket.io` sont proxifiées vers **localhost:3000**.

Connexion prof : PIN défini dans `.env` (`TEACHER_PIN`, ex. `1234`).

### Option B — Comme en production (un seul port)

```bash
npm run build
npm run dev
```

Ouvrir **http://localhost:3000** : Express sert le contenu de **`dist/`** (SPA compilée).

## 5. Tests d’intégration (base séparée)

Les tests utilisent **`foretmap_test`** pour ne pas toucher à votre base de dev :

```bash
npm run test:local
```

Le script force `DB_NAME=foretmap_test` ; le schéma est (re)créé par les fichiers de test.

### Récapitulatif des commandes de test (référence)

| Commande | Rôle |
|----------|------|
| `npm test` | Tous les **`tests/*.test.js`** (API + utilitaires **`src/utils`** : géométrie visite, mascotte, etc.) |
| `npm run test:e2e` | Playwright sur **`e2e/`** (inclut visite / mascotte) |
| `npm run smoke:local:fast` | Smoke applicatif (`scripts/local-smoke.js`) |
| `npm run test:snapshot` | Snapshot DB importée (`FORETMAP_SNAPSHOT_TESTS=1`, voir § 5ter) |
| `npm run test:load` (et variantes) | Charge Artillery (`LOAD_TEST_SECRET`, voir § **5quinquies**) |

Après une modification **frontend** : **`npm run build`** si le serveur sert **`dist/`** (`NODE_ENV=production`), avant **`npm run test:e2e`**.

### Vérification ciblée pré-saisie biodiversité (MVP)

Tests backend rapides :

```bash
node --test tests/species-autofill.test.js
node --test tests/api.test.js --test-name-pattern="autofill"
```

Parcours UX manuel recommandé (profil n3boss avec élévation active) :

1. Ouvrir `Biodiversité` puis `+ Ajouter`.
2. Renseigner un nom (ex. `tomate`) et cliquer `✨ Pré-saisir depuis sources externes`.
3. Vérifier l’affichage du panneau de revue (confiance, warnings, champs cochables, photos).
4. Cliquer `Appliquer la sélection`.
5. Contrôler les champs critiques avant sauvegarde (`scientific_name`, `description`, `sources`, photos/licences).

## 5ter. Tests etendus sur snapshot importe (optionnel)

Pour valider rapidement une copie de base distante deja importee dans `foretmap_local`, utilisez :

```bash
npm run test:snapshot
```

Le test `tests/snapshot-db.test.js` est actif uniquement avec `FORETMAP_SNAPSHOT_TESTS=1` (deja active par le script `test:snapshot`) et verifie :
- `/api/health` et `/api/health/db` ;
- la presence de donnees sur `/api/zones`, `/api/plants`, `/api/tasks`.

Remarque : `npm run test:local` reste le mode CI/local standard avec reset sur `foretmap_test`.

## 5bis. Tests UI smoke (Playwright)

Prérequis : MySQL accessible (même base que le dev local, schéma à jour), navigateurs Playwright :

```bash
npx playwright install
npm run test:e2e
```

La commande **`npm run test:e2e`** enchaîne :

1. **`scripts/e2e-kill-listen-port.js`** (hors CI) : libère le port **3000** (ou `PORT` / `E2E_KILL_PORT`) pour éviter un vieux Node qui écoute encore sans le mode e2e.
2. **Playwright** : hors CI, **`webServer`** exécute **`npm run db:init && npm run start:e2e`**.  
   - **`npm run start:e2e`** = **`node server.js --foretmap-e2e-no-rate-limit`** : désactive le **rate limiting** (sinon inscription / formulaires peuvent renvoyer **« Trop de requêtes »**). Sur Windows, ce **flag CLI** est plus fiable que la seule variable **`E2E_DISABLE_RATE_LIMIT`**.
3. Le fichier **`playwright.config.js`** charge **`.env`** : le PIN prof des tests suit **`TEACHER_PIN`** (surcharge possible avec **`E2E_ELEVATION_PIN`**).

Si **`NODE_ENV=production`** dans l’environnement du serveur (souvent via **`.env`**), Express sert le bundle **`dist/`** : après une modification du frontend, exécuter **`npm run build`** avant **`npm run test:e2e`**, sinon les tests peuvent tourner sur un **JavaScript périmé** (ex. élévation PIN / temps réel).

**Réutiliser un serveur déjà démarré** : définir **`E2E_REUSE_SERVER=1`**. Le process sur le port doit alors être lancé avec **`npm run start:e2e`** (ou équivalent avec **`--foretmap-e2e-no-rate-limit`**) et, si vous servez le build prod, un **`dist/`** à jour.

**Ne pas** lancer seulement **`npx playwright test …`** si un **`npm start`** « normal » occupe déjà le port : Playwright peut réutiliser ce serveur **sans** bypass → échecs **429** ou code périmé.

**CI** : le workflow démarre le serveur avec **`npm run start:e2e`**, puis exécute **`npm run test:e2e`** avec **`E2E_BASE_URL`** (pas de **`webServer`** Playwright quand **`CI=true`**).

Vous pouvez cibler une autre URL avec **`E2E_BASE_URL`**.

**Visite / mascotte** : scénario dédié **`e2e/visit-mascot.spec.js`** (seed API prof sur la carte **n3** via **`e2e/fixtures/visit-api.fixture.js`**, clics en % sur **`.visit-map-fit-layer`**, `prefers-reduced-motion`, sélection mascotte OLU spritesheet et contrôle des comportements en preview prof/admin). Voir aussi skills **foretmap-e2e**, **foretmap-mascot-catalog** et **`docs/VISIT_MAP_GEOMETRY.md`**.

### Nettoyage local des artefacts de tests

Pour éviter l'accumulation locale après plusieurs runs:

```bash
# Nettoie les sorties e2e/Playwright (rapports, resultats, logs de demarrage)
npm run clean:tests

# Nettoie les rapports de charge JSON horodates
npm run clean:load

# Nettoyage global local (tests + charge)
npm run clean:local
```

Variantes pratiques avant execution Playwright:

```bash
npm run test:e2e:clean
npm run test:e2e:headed:clean
```

Ces commandes n'affectent pas la politique de versionnage de **`dist/`**.

### Nettoyage comptes e2e et clones de tâches récurrentes

Les scénarios créent des élèves reconnaissables (**prénom `E2E…`**, **email `e2e%@example.com`**, **pseudo `e2e%`**). Le job serveur duplique les tâches validées avec récurrence en conservant **`parent_task_id`**.

| Commande | Effet |
|----------|--------|
| **`npm run db:cleanup:dev:dry`** | Affiche ce qui serait supprimé (aucune écriture). |
| **`npm run db:cleanup:dev`** | Supprime ces élèves avec la même logique que **`DELETE /api/students/:id`** (assignations, statuts de tâches, forum, commentaires contextuels, RBAC, tokens, avatar disque), puis supprime les tâches dont **`parent_task_id`** est non nul (clones de récurrence). |

Options supplémentaires (passer après `--`) :

- **`--no-recurring-spawns`** : ne pas supprimer les tâches avec **`parent_task_id`**.
- **`--include-node-test-students`** : supprime aussi les comptes résiduels des tests Node (**nom `Task` + prénom `St` + chiffres**, **nom `Student` + prénom `Del` + chiffres**) — **réservé à une base de dev**.

## 5quinquies. Tests de montée en charge (Artillery)

Le scénario de charge est défini dans `load/artillery.yml` et cible par défaut `http://127.0.0.1:3000`.

Pré-requis :
- serveur API lancé (`npm run dev` ou `npm run start`) ;
- base MySQL accessible (si vous testez `/api/health/db`, `/api/zones`, `/api/plants`).

Exécution standard (profil normal, génère `load/reports/normal-<timestamp>.json` et met à jour `load/report.json`) :

```bash
npm run test:load
```

Profils disponibles :

```bash
npm run test:load:light
npm run test:load:normal
npm run test:load:stress
```

Repères (ordre de grandeur) :
- `light` : montée jusqu'à ~8 utilisateurs virtuels/s, sessions plus longues (navigation + pauses).
- `normal` : montée jusqu'à ~20 utilisateurs virtuels/s, palier prolongé pour charge soutenue.
- `stress` : montée jusqu'à ~40 utilisateurs virtuels/s, palier long pour pousser la concurrence.

Exécution automatisée des 3 profils (light -> normal -> stress) :

```bash
npm run test:load:all
```

Génération d'un résumé Markdown du dernier run (`load/report-summary.md`) :

```bash
npm run test:load:report
```

Utilisation d'une URL différente :

```bash
BASE_URL=http://localhost:3000 npm run test:load
```

Bypass du rate limit pour un run de charge contrôlé :
- côté serveur : définir `LOAD_TEST_SECRET` ;
- côté client (Artillery) : utiliser la même valeur `LOAD_TEST_SECRET`.

Exemple :

```bash
LOAD_TEST_SECRET=mon_secret_long npm run dev
```

Dans un second terminal :

```bash
LOAD_TEST_SECRET=mon_secret_long npm run test:load
```

Sans `LOAD_TEST_SECRET`, aucun bypass n'est actif et le limiteur `/api/*` peut renvoyer des `429` pendant les paliers élevés.

**Profil `10vu` (~10 utilisateurs / une IP, rate limit réel)** : scénario `load/artillery-10vu.yml` — pas d’en-tête `X-ForetMap-Load-Test`, phases avec `maxVusers: 10`, lectures API type navigation (health, version, zones, plants) et pauses « think ». Utile pour estimer **429** et latences quand toute la classe partage la même IP (Wi‑Fi). Démarrer le serveur normalement (`npm start` ou `npm run dev`, **sans** `LOAD_TEST_SECRET` si vous voulez mesurer le plafond applicatif tel quel), puis :

```bash
npm run test:load:10vu
```

Rapport JSON : même mécanisme que les autres profils (`load/reports/…`, copie vers `load/report.json`). Résumé Markdown : `npm run test:load:report load/report.json load/reports/10vu-summary.md`.

**Smoke Socket.IO (polling, comme en prod)** : plusieurs clients **`socket.io-client`** en parallèle pour estimer le trafic **`/socket.io`** (long-poll + pings) et, en option, un **burst REST** `GET /api/tasks` par client après connexion (simule le refetch après notification temps réel).

Prérequis : serveur lancé ; un **JWT** valide (copie depuis le stockage session navigateur après connexion enseignant ou n3beur, ou outil équivalent).

```bash
set FORETMAP_SOCKETIO_LOAD_JWT=eyJhbGciOi...
npm run test:load:socketio-smoke
```

Variables utiles : `FORETMAP_SOCKETIO_LOAD_CLIENTS` (défaut 5), `FORETMAP_SOCKETIO_LOAD_DURATION_MS` (défaut 30000), `FORETMAP_SOCKETIO_LOAD_MAP_ID` (défaut `foret`), `FORETMAP_SOCKETIO_PATH` (défaut `/socket.io`), `BASE_URL` / `FORETMAP_SOCKETIO_LOAD_BASE_URL`. Pour enchaîner un **GET /api/tasks** par client après connexion : `set FORETMAP_SOCKETIO_LOAD_REST_BURST=1`.

Voir aussi **`docs/EXPLOITATION.md`** (section temps réel / Passenger) et **`docs/EVOLUTION.md`** (critères de décision hébergement).

Après `npm run test:load:all`, vous obtenez aussi :
- `load/reports/light-summary.md`
- `load/reports/normal-summary.md`
- `load/reports/stress-summary.md`

## 6. Vérifier l’environnement local

```bash
npm run check:local
```

Vérifie la présence de `.env`, des variables requises et la connexion MySQL (si Docker est démarré).

## 7. Vérifications rapides (smoke)

Avec le serveur lancé :

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/health/db
```

## 8. Arrêter MariaDB (Docker)

```bash
npm run docker:down
```

Les données persistent dans le volume Docker jusqu’à `docker compose down -v`.

## 9. Préparer un bundle de déploiement complet (sans npm serveur)

Pour produire en local un package prêt à être extrait en production (avec `dist/` et `node_modules` prod). Le script npm appelle **`node scripts/prepare-runtime-deploy.js`** (Linux / macOS / Windows, sans dépendre de `powershell` dans le shell).

```bash
npm run deploy:prepare:runtime
```

Version rapide (si `dist/` et `node_modules` sont déjà à jour) :

```bash
npm run deploy:prepare:runtime:fast
```

Sur Windows uniquement, variante historique **robocopy** : `npm run deploy:prepare:runtime:ps` (ou `:fast:ps`).

Le script produit d’abord un **dossier de staging** : `deploy/runtime/foretmap-runtime-YYYYMMDD-HHMMSS/` (même contenu que ce qui irait en prod : sources, `dist/`, `node_modules` après prune). Tu peux **uploader ce dossier tel quel** (`rsync`, SFTP récursif, etc.) vers le répertoire de l’app sur le serveur — **le ZIP est optionnel** ; il sert surtout à un seul fichier à transférer ou à archiver une livraison.

Si les outils le permettent, un **ZIP** est aussi créé dans `deploy/` : `foretmap-runtime-YYYYMMDD-HHMMSS.zip` (commande **`zip`**, sinon **`tar -a`**, sinon **PowerShell** sous Windows). Si aucune archive n’est générée, le dossier `deploy/runtime/…` reste la source de vérité pour un envoi manuel ou une compression locale.
