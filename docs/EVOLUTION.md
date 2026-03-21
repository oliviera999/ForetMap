# Évolution du code ForetMap — Recommandations

Ce document s’appuie sur l’audit du projet pour proposer un plan d’évolution **sans changer le comportement actuel** jusqu’à ce que chaque étape soit décidée et implémentée. Il sert de feuille de route pour la sécurité, l’architecture, les données et la maintenabilité.

---

## 1. Sécurité (priorité haute)

### 1.1 Protéger l’API côté serveur

**Constat :** Toutes les routes sont publiques. Le rôle « professeur » n’existe que côté client (variable d’état après saisie du PIN).

**Évolution proposée :**

- Introduire un **middleware d’authentification** pour les routes réservées au professeur :
  - Exemples : `GET /api/stats/all`, `DELETE /api/students/:id`, `POST/DELETE /api/zones`, `POST/DELETE /api/plants`, `POST/PUT/DELETE /api/tasks`, `POST /api/tasks/:id/validate`, etc.
- Vérifier le **PIN professeur côté serveur** (variable d’environnement `TEACHER_PIN` ou hash en base) et émettre un **token** (JWT ou cookie de session) après validation.
- Les requêtes « prof » devront envoyer ce token (header ou cookie) ; le middleware rejettera avec 401/403 si absent ou invalide.

**Fichiers concernés :** `server.js` (nouveau middleware, nouvelles routes auth), éventuellement `database.js` si stockage du PIN en base.

### 1.2 Supprimer le PIN du frontend

**Constat :** Dans `public/index.html` (ligne ~1836), `const CORRECT = '1234'` est visible dans le code source.

**Évolution proposée :**

- Ne plus comparer le PIN dans le client. Le client envoie le PIN à un endpoint dédié (ex. `POST /api/auth/teacher`) ; le serveur vérifie et renvoie un token en cas de succès.
- Supprimer toute constante ou logique de vérification du PIN dans `index.html`.

**Fichiers concernés :** `public/index.html` (composant `PinModal`), `server.js` (nouvel endpoint + vérification serveur).

### 1.3 Restreindre CORS en production

**Constat :** `app.use(cors());` autorise toute origine.

**Évolution proposée :**

- En production, utiliser `cors({ origin: process.env.FRONTEND_ORIGIN || '...' })` pour n’accepter que l’origine du frontend.
- Garder un comportement permissif en développement (ex. si `NODE_ENV !== 'production'`).

**Fichiers concernés :** `server.js`.

---

## 2. Architecture et maintenabilité

### 2.1 Découper le backend en modules

**Constat :** Toute la logique API est dans `server.js` (zones, photos, marqueurs, plantes, tâches, auth, stats, students).

**Évolution proposée :**

- Créer des modules de routes, par exemple :
  - `routes/zones.js` — CRUD zones, photos
  - `routes/plants.js` — CRUD plantes
  - `routes/tasks.js` — CRUD tâches, assign, done, validate, unassign, logs
  - `routes/auth.js` — register, login, teacher login
  - `routes/stats.js` — stats élève, stats tous
  - `routes/students.js` — register (last_seen), delete
  - `routes/map.js` — marqueurs carte
- Dans `server.js`, monter ces routeurs sur `/api/...` et conserver uniquement la config Express (CORS, body, static, fallback SPA).

**Fichiers concernés :** nouveau dossier `routes/`, `server.js`.

### 2.2 Frontend : build et découpage

**Statut (2026-03) :** migration effectuée vers **Vite** : sources dans `src/` (React modulaire), styles dans `src/index.css`, client **Socket.IO** npm (plus de CDN), build `npm run build` → **`dist/`**. En production, Express sert `dist/` lorsque `NODE_ENV=production` et que `dist/index.html` est présent ; `public/` conserve les assets statiques (`sw.js`, etc.) copiés au build. `public/index.html` est une page d’information si le build est absent.

**Pistes d’amélioration continues :** découper davantage `src/components/foretmap-views.jsx` en fichiers par domaine ; CSS modules ou organisation par feature si le besoin apparaît.

### 2.3 Tests

**Constat :** Aucun test unitaire ou e2e.

**Évolution proposée :**

- Ajouter un runner de tests (Jest ou Node built-in) pour le backend.
- Tester en priorité :
  - Auth (register, login, rejet mot de passe incorrect).
  - Recalcul des statuts de tâches après assign / unassign / suppression élève.
  - Suppression d’un élève (cascade assignments/logs, statuts des tâches).
- Optionnel : tests e2e (Cypress ou Playwright) sur le parcours élève (login, prise de tâche, marquer fait).

**Fichiers concernés :** nouveau dossier `tests/` ou `__tests__/`, `package.json` (scripts test, devDependencies).

---

## 3. Données et performance

### 3.1 Images : éviter le base64 en base

**Constat :** `zone_photos.image_data` et `task_logs.image_data` stockent du base64 ; la base peut devenir lourde.

**Évolution proposée :**

- Stocker les fichiers sur disque (dossier dédié, ex. `uploads/`) ou sur un stockage objet.
- En base, ne garder que le chemin ou l’URL (colonne `image_path` ou `image_url`).
- Adapter les routes qui renvoient l’image (ex. servir le fichier depuis le disque ou rediriger vers l’URL).
- En parallèle, limiter taille et/ou nombre d’images par zone/tâche si besoin.

**Fichiers concernés :** `server.js` (routes zones/tasks), `database.js` (schéma, migration éventuelle).

### 3.2 Migrations de schéma

**Constat :** Colonnes ajoutées via `try { db.exec('ALTER TABLE...'); } catch(e) {}` ; migration « plan réel du jardin » destructive (vide tout si un `id` de zone commence par `zone-`).

**Évolution proposée :**

- Documenter clairement la migration destructive dans `database.js` ou dans ce document (déjà partiellement fait ici).
- À terme : introduire une table `schema_version` et des scripts de migration versionnés (ex. `migrations/001_add_xxx.sql`) pour éviter les migrations implicites au démarrage.

**Fichiers concernés :** `database.js`, éventuellement `docs/EVOLUTION.md` ou README.

---

## 4. Configuration et déploiement

### 4.1 Lockfile et reproductibilité

**Constat :** Pas de `package-lock.json` (ou équivalent).

**Évolution proposée :**

- Générer un lockfile (`npm install` une fois, puis committer `package-lock.json`).
- Utiliser ce lockfile en CI et en production (`npm ci`).

**Fichiers concernés :** racine du projet, `.gitignore` (ne pas ignorer le lockfile).

### 4.2 Script de développement

**Constat :** Le script `dev` est identique à `start` ; pas de rechargement à chaud.

**Évolution proposée :**

- Ajouter `nodemon` en devDependency et un script du type `"dev": "nodemon server.js"` pour recharger le serveur à chaque modification.

**Fichiers concernés :** `package.json`.

### 4.3 Débogage, logs et IDE (réalisé)

**Mis en œuvre :**

- **Pino** (`lib/logger.js`) : variable `LOG_LEVEL` documentée dans `.env.example` ; avertissements prod (`lib/env.js`) et uploads (`lib/uploads.js`) passent par le logger.
- **Routes API** : chaque `catch` de réponse 500 appelle `logRouteError` (`lib/routeLog.js`) pour tracer `err`, `path`, `method`.
- **Migrations** (`database.js`) : échecs SQL inattendus en `warn` ; erreurs « déjà appliquées » (errno MySQL 1050, 1060, 1061) en `debug` ; lecture `schema_version` absente en `debug` / `warn` selon le cas.
- **Scripts** : `npm run debug`, `npm run debug:dev` ; **`.vscode/launch.json`** : lancement avec inspect, attachement au process, exécution des tests `node --test`.
- **Frontend** : réduction des `catch` / `.catch` silencieux sur les appels API (journal `console.error` préfixé `[ForetMap]`, toast pour l’échec du chargement des stats prof).
- **Build Vite** : `build.sourcemap: true` pour faciliter le diagnostic sur le bundle.

**Bonnes pratiques :** ne pas laisser de `catch` vides sur les appels réseau ; en production, collecter les logs stdout (hébergeur) pour exploiter les traces Pino.

---

## 5. Ordre suggéré des actions

| Ordre | Action | Priorité |
|-------|--------|----------|
| 1 | Auth serveur (PIN + token) et protection des routes prof | Haute |
| 2 | Supprimer le PIN du frontend, appeler l’API auth | Haute |
| 3 | CORS restreint en production | Moyenne |
| 4 | Lockfile + script `dev` avec nodemon | Moyenne |
| 5 | Découpage du backend en routes | Moyenne |
| 6 | Images sur disque (ou URL) au lieu de base64 | Moyenne |
| 7 | Tests (auth, statuts tâches, suppression élève) | Basse |
| 8 | Migration React + Vite (frontend) | Basse |
| 9 | Migrations de schéma versionnées | Basse |

---

## Versionnage applicatif (en place)

Release SemVer + `CHANGELOG.md` + scripts `bump:*` / `release:*` — voir [VERSIONING.md](VERSIONING.md).

Ce document peut être mis à jour au fur et à mesure que des évolutions sont réalisées ou que de nouvelles recommandations émergent.
