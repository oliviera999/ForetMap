# Journal des versions

Ce fichier suit les principes de [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).
Le numéro de version suit [Semantic Versioning](https://semver.org/lang/fr/) (MAJEUR.MINEUR.CORRECTIF).

## [Non publié]

_(aucun changement en cours)_

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
