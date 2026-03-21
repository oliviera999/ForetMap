# Développement local complet (avant déploiement)

Environnement aligné sur la CI : **MySQL 8**, deux bases (`foretmap_local` pour l’app, `foretmap_test` pour les tests). **N’utilisez pas** les identifiants o2switch ici.

## Prérequis

- Node.js 18 ou 20
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows / macOS / Linux)

## 1. Démarrer MySQL

À la racine du projet :

```bash
npm run docker:up
# ou : docker compose up -d
```

Attendre que le conteneur soit **healthy** (10–40 s la première fois). Vérifier :

```bash
docker compose ps
```

**Port 3306 déjà utilisé** (MySQL local, XAMPP, etc.) : dans `docker-compose.yml`, remplacez `3306:3306` par `3307:3306`, puis dans `.env` mettez `DB_PORT=3307`. Recréez le conteneur si besoin : `docker compose down -v` puis `docker compose up -d` (le `-v` supprime le volume : perte des données du conteneur).

## 2. Configuration

```bash
cp env.local.example .env
```

Le mot de passe root Docker est **`foretmap_local_root`** (déjà cohérent avec `env.local.example`). Ajustez `DB_PORT` si vous avez changé le mapping de port.

## 3. Dépendances et base de données

```bash
npm install
npm run db:init
```

Cela applique le schéma et le seed sur **`foretmap_local`**.

### Optionnel — migrer les images legacy base64 vers disque

```bash
# Simulation
npm run db:migrate:images:dry

# Migration réelle (conserve image_data pour compat)
npm run db:migrate:images
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

## 8. Arrêter MySQL

```bash
npm run docker:down
```

Les données persistent dans le volume Docker jusqu’à `docker compose down -v`.
