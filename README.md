# ForetMap

Application de gestion de la forêt comestible — **Lycée Lyautey**.

Les élèves peuvent consulter la carte des zones, s’inscrire à des tâches et marquer leur travail comme fait. Les professeurs gèrent les zones, les plantes, les tâches et les statistiques via un mode protégé par PIN.

**Version :** `package.json` (SemVer) · [CHANGELOG](CHANGELOG.md) · procédure : [docs/VERSIONING.md](docs/VERSIONING.md) (`bump:*` + commit + tag)

---

## Stack technique

| Couche      | Technologie |
|------------|-------------|
| Backend    | Node.js, Express |
| Base de données | **MySQL** (mysql2, pool promesses) — hébergement o2switch |
| Frontend   | React 18 (UMD via CDN), Babel standalone (transpilation dans le navigateur) |
| Auth élèves | bcrypt (hash des mots de passe), session en `localStorage` |

Fichiers principaux : `server.js` (API async), `database.js` (pool MySQL, helpers, seed), `sql/schema_foretmap.sql` (DDL), `public/index.html` (application React complète).

---

## Installation et démarrage

```bash
cd ForetMap
npm install
cp .env.example .env
# Éditer .env avec DB_HOST, DB_NAME, DB_USER, DB_PASS (MySQL)
npm run db:init   # applique le schéma + seed si tables vides
npm start
```

L’app est servie sur **http://localhost:3000** (ou le port défini par `process.env.PORT`).

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

Un fichier `.env` (copié depuis `.env.example`) est utilisé en local ; il est ignoré par Git. En production sur o2switch, configurer les variables dans l’interface « Setup Node.js App ».

---

## Migration SQLite → MySQL

Si vous partez d’un ancien fichier `foretmap.db` (SQLite) :

1. Appliquer le schéma MySQL : `npm run db:init` (ou exécuter `sql/schema_foretmap.sql` à la main).
2. Placer `foretmap.db` à la racine du projet (ou définir `SQLITE_PATH`).
3. Lancer la migration : `npm run migrate:sqlite-to-mysql`.

Le script vide les tables MySQL puis recopie toutes les données (zones, plantes, tâches, élèves, photos, etc.). Tester de préférence sur une copie de la BDD avant la prod.

---

## Déploiement o2switch (foretmap.olution.info)

1. **Créer l’application Node.js** dans cPanel : **Setup Node.js App** — choisir la version Node (18 ou 20), définir le répertoire du projet (ex. `foretmap` ou racine du domaine).

2. **Variables d’environnement** dans l’interface de l’app Node :  
   `DB_HOST=localhost`, `DB_NAME=oliviera_foretmap`, `DB_USER=oliviera_foretmap`, `DB_PASS=...`, `NODE_ENV=production`.

3. **Fichier d’entrée** : `server.js` (ou point d’entrée configuré dans Setup Node.js App).

4. **Déployer le code** : upload du dépôt (sans `.env`), puis sur le serveur :
   ```bash
   npm install --production
   ```

5. **Initialiser la BDD** (une fois) : exécuter le schéma puis éventuellement la migration :
   - En SSH, depuis le répertoire de l’app : `npm run db:init`
   - Si migration depuis SQLite : copier `foretmap.db` sur le serveur, puis `npm run migrate:sqlite-to-mysql` (après `npm install` pour avoir `better-sqlite3` en dev si nécessaire ; en prod on peut l’installer temporairement : `npm install better-sqlite3 --save-dev`).

6. **Sous-domaine** : pointer **foretmap.olution.info** vers l’application Node (domaine/addon dans cPanel, puis lier au répertoire de l’app Node).

7. **Redémarrer** l’app depuis l’interface Setup Node.js App après toute modification des variables ou du code.

### Redémarrage automatique après déploiement

Si vous définissez la variable d’environnement `DEPLOY_SECRET` (une chaîne secrète de votre choix), vous pouvez déclencher un redémarrage de l’app à distance après un `git pull` ou un déploiement. Le processus Node s’arrête proprement ; le gestionnaire de process (o2switch, PM2, systemd, etc.) le relance s’il est configuré pour cela.

Depuis votre script de déploiement ou en ligne de commande après un pull :

```bash
curl -X POST https://foretmap.olution.info/api/admin/restart \
  -H "X-Deploy-Secret: VOTRE_DEPLOY_SECRET"
```

Ou en JSON : `POST /api/admin/restart` avec body `{ "secret": "VOTRE_DEPLOY_SECRET" }`. En cas de succès, l’app répond puis s’arrête 1 seconde après ; le serveur doit être configuré pour relancer l’application automatiquement.

Référence : [FAQ o2switch – Node.js](https://faq.o2switch.fr/cpanel/logiciels/hebergement-nodejs-multi-version/).

---

## Structure du projet

```
ForetMap/
├── server.js          # Serveur Express, routes API async (zones, plants, tasks, auth, stats…)
├── database.js        # Pool MySQL (mysql2), helpers queryAll/queryOne/execute, init + seed
├── sql/
│   └── schema_foretmap.sql   # DDL MySQL (InnoDB, utf8mb4)
├── scripts/
│   └── migrate-sqlite-to-mysql.js   # Migration SQLite → MySQL
├── package.json
├── .env.example
├── README.md
├── docs/
│   └── EVOLUTION.md    # Recommandations d’évolution (audit)
├── .cursor/
│   ├── rules/          # Règles Cursor (conventions du projet)
│   └── skills/         # Skills Cursor (contexte ForetMap)
└── public/
    └── index.html      # Application React (carte, zones, tâches, auth, mode prof)
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
