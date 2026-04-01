---
name: foretmap-project
description: Donne le contexte du projet ForetMap (forêt comestible, Lycée Lyautey). À utiliser quand on travaille sur l'application ForetMap, l'API Express, la base MySQL, le frontend React, les zones, tâches, plantes, élèves, auth ou mode prof.
---

# Contexte projet ForetMap

## Quand utiliser ce skill

- Développement de fonctionnalités, correction de bugs, maintenance courante.
- Compréhension de la base de code (architecture, fichiers clés, rôles utilisateur).
- Toute tâche touchant l'API, le frontend ou la base de données.

## Quand ne pas l'utiliser

- Refactoring majeur, évolution d'architecture ou de sécurité : préférer le skill **foretmap-evolution**.
- Logs, diagnostics prod, MCP, `X-Request-Id` : préférer le skill **foretmap-observability**.
- Mise à jour du versionnage ou release : préférer le skill **foretmap-versioning**.
- Modifications de schéma ou de migrations BDD : préférer le skill **foretmap-database**.

## Rôle de l'application

- **Élèves :** Connexion/inscription (prénom, nom, mot de passe), consultation de la carte des zones, prise de tâches, marquer une tâche comme faite (commentaire/image), voir ses stats.
- **Professeurs :** Accès via PIN (mode prof, auth JWT côté serveur) pour gérer zones, plantes, tâches, voir les stats de tous les élèves, valider les tâches faites, supprimer un élève (avec cascade sur assignments/logs et recalcul des statuts de tâches).

## Stack

- **Backend :** Node.js, Express, MySQL (mysql2, pool). Fichiers : `server.js` (montage des routeurs), `database.js` (pool, schéma, seed), `routes/` (dont `task-projects`, `tutorials`, `settings`, `rbac`, `forum`), `middleware/requireTeacher.js` (JWT). Auth élèves : bcrypt, session en localStorage. Auth prof : PIN vérifié côté serveur, JWT.
- **Frontend :** React 18 + Vite. Entrée dans `index.vite.html`, bootstrap dans `src/main.jsx`, application modulaire dans `src/` (composants/hooks/services), build servi depuis `dist/` en production.
- **Utilitaires :** `lib/logger.js` (Pino, `redact`), `lib/env.js`, `lib/uploads.js`, `lib/routeLog.js` (`logRouteError`, `requestId`), `lib/requestId.js`, `lib/httpRequestLog.js` (`FORETMAP_HTTP_LOG`), `lib/logMetrics.js` (métriques diagnostics), `lib/helpers.js`.
- **Tests :** backend avec `node --test` + supertest dans `tests/` ; e2e Playwright dans `e2e/` via **`npm run test:e2e`** (serveur **`npm run start:e2e`**, bypass rate limit). Détail : skill **foretmap-e2e**.

## Points d'attention

- Requêtes SQL toujours paramétrées (`?`). Mots de passe hashés bcrypt. Réponses API en JSON avec `error` en cas d'erreur.
- Comptes supprimés : l'API renvoie 401 avec `{ error: '...', deleted: true }` ; le front doit déconnecter et afficher un toast.
- Utiliser le logger Pino (`lib/logger.js`) plutôt que `console.log/error`.
- Évolutions (sécurité, architecture, tests) : voir [docs/EVOLUTION.md](docs/EVOLUTION.md) à la racine du projet.

## Fichiers clés

| Fichier | Rôle |
|---------|------|
| `server.js` | Montage des routeurs `/api/*`, CORS, static, fallback SPA, routes de santé |
| `database.js` | Pool MySQL, `initDatabase()`, schéma, seed |
| `routes/*.js` | Routeurs (zones, plants, tasks, auth, stats, students, map, observations, audit) |
| `middleware/requireTeacher.js` | Middleware JWT pour les routes professeur |
| `lib/logger.js` | Logger Pino (`redact` sensibles) |
| `lib/helpers.js` | Fonctions métier partagées (`getTaskWithAssignments`, `studentStats`) |
| `lib/routeLog.js` | `logRouteError` (erreurs 500 + `requestId`) |
| `lib/requestId.js` | En-tête `X-Request-Id` |
| `lib/httpRequestLog.js` | Logs fin de requête HTTP (`FORETMAP_HTTP_LOG`) |
| `lib/logMetrics.js` | Métriques pour `/api/admin/diagnostics` |
| `lib/env.js` | Validation des variables d'environnement |
| `lib/uploads.js` | Gestion des fichiers uploadés |
| `index.vite.html` | Point d'entrée HTML de l'application Vite |
| `src/main.jsx` | Bootstrap React et montage de l'app |
| `src/components/`, `src/hooks/`, `src/services/` | Modules UI, logique locale et accès API |
| `tests/` | Tests backend (auth, API, statuts tâches, suppression élève) |
| `e2e/` | Tests UI Playwright (smoke et scénarios complets élève/prof) |

## Voir aussi

- Règles Cursor : `.cursor/rules/foretmap-conventions.mdc`, `foretmap-backend.mdc`, `foretmap-frontend.mdc`
- Observabilité / MCP : skill **foretmap-observability**, `docs/MCP_FORETMAP_CURSOR.md`
- Feuille de route : [docs/EVOLUTION.md](docs/EVOLUTION.md)
