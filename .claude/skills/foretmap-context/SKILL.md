---
name: foretmap-context
description: Contexte et architecture du projet ForetMap (forêt comestible, Lycée Lyautey) — backend Express/MySQL, frontend React/Vite, rôles élève/prof, fichiers clés. À utiliser pour toute tâche touchant l'API, le frontend ou la base, et pour se repérer dans la base de code.
---

# Contexte projet ForetMap

## Rôles

- **Élèves** : inscription/connexion (bcrypt, session localStorage), carte des zones, prise de
  tâches, marquer une tâche faite (commentaire/image), stats.
- **Professeurs** : mode prof via PIN → JWT côté serveur ; gèrent zones, plantes, tâches, élèves
  (suppression avec cascade assignments/logs + recalcul des statuts), valident les tâches.

## Stack & architecture

- **Backend** : Node + Express + MySQL (`mysql2` pool). `server.js` (montage routeurs, CORS,
  static, SPA fallback, routes santé), `database.js` (pool, `initDatabase()`, schéma, seed),
  `routes/*.js`, `middleware/requireTeacher.js` (JWT prof).
- **Frontend** : React 19 + Vite. `index.vite.html` → `src/main.jsx` ; modules dans
  `src/components/`, `src/hooks/`, `src/services/`. Build servi depuis `dist/` en prod.
- **GL** : sous-produit isolé (host `gl.*`, API `/api/gl/*`) → skill `foretmap-gl`.
- **Utilitaires** `lib/` : `logger.js` (Pino + redact), `helpers.js`
  (`getTaskWithAssignments`, `studentStats`), `routeLog.js` (`logRouteError`), `requestId.js`,
  `httpRequestLog.js`, `logMetrics.js`, `env.js`, `uploads.js`, `speciesAutofill*.js`.

## Points d'attention

- SQL paramétré (`?`) ; bcrypt ; logger Pino (pas de `console`).
- Réponses API JSON ; 401 + `{ deleted: true }` → front déconnecte + toast.
- Servir `dist/` en prod si présent, sinon `public/` ; ne pas casser l'ordre du fallback SPA.
- Ne pas modifier le comportement métier sans demande explicite ; évolutions → `docs/EVOLUTION.md`.

## Voir aussi

- Règles : `.cursor/rules/foretmap-conventions.mdc`, `foretmap-backend.mdc`, `foretmap-frontend.mdc`
- Skills : `foretmap-database`, `foretmap-testing`, `foretmap-gl`, `foretmap-observability`
- Docs : `docs/LOCAL_DEV.md`, `docs/API.md`, `docs/EVOLUTION.md`
