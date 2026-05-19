# Gnomes & Licornes — Architecture

Ce document décrit l'architecture du second mode **Gnomes & Licornes** (GL) dans la codebase ForetMap.

## Objectif

- Garder un seul dépôt et un seul serveur Node.
- Servir deux produits séparés :
  - `foretmap.olution.info` (ForetMap historique)
  - `gl.olution.info` (Gnomes & Licornes)
- Isoler les sessions, permissions et données GL sans modifier le métier ForetMap.

## Routage produit

- La résolution de produit se fait via `lib/productResolver.js`.
- Source de vérité :
  - `req.hostname` (`gl.*` => produit `gl`)
  - surcharge possible via header `X-Foretmap-Product` (tests/e2e).
- Fallback SPA :
  - ForetMap => `dist/index.vite.html`
  - GL => `dist/gl.html`

## Build frontend

- `vite.config.js` expose trois entrées :
  - `main` (`index.vite.html`)
  - `mascotPackTool` (`mascot-pack-tool.html`)
  - `gl` (`gl.html`)
- Le mode GL est implémenté sous `src/gl/`.

## API GL

Préfixe : `/api/gl`

- Auth : `routes/gl/auth.js`
- Contenus éditoriaux : `routes/gl/content.js`
- Gameplay : `routes/gl/games.js`
- Admin GL : `routes/gl/admin.js`

Les endpoints GL exigent un JWT avec claim `product = "gl"`.

## Isolation de sécurité

- Guard serveur global : un token GL est refusé sur les routes `/api/*` ForetMap.
- Auth GL dédiée via `middleware/requireGlAuth.js`.
- Permissions GL dédiées (`gl.*`) enregistrées dans RBAC (`lib/rbac.js`).
- CORS multi-origines :
  - `FRONTEND_ORIGINS` (CSV) prioritaire
  - fallback `FRONTEND_ORIGIN` (legacy)

## Base de données

Tables GL préfixées `gl_` :

- Fondations (`migrations/080_gl_foundations.sql`)
  - `gl_admins`
  - `gl_classes`
  - `gl_players`
  - `gl_settings`
  - `gl_content_pages`
- Gameplay (`migrations/081_gl_gameplay.sql`)
  - `gl_chapters`
  - `gl_chapter_markers`
  - `gl_games`
  - `gl_teams`
  - `gl_team_members`
  - `gl_game_events`
  - `gl_mascot_assignments`

## Temps réel

- Socket.IO conserve le canal historique ForetMap.
- Ajout GL :
  - abonnement client `subscribe:gl-game`
  - room `gl:game:{id}`
  - émission serveur `gl:game:event` via `emitGlGameEvent()`

## Frontend GL (lot actuel)

- Shell : `src/gl/AppGL.jsx`
- Auth joueur (pseudo + PIN) et admin (Google idToken)
- Onglets joueur : Cartes, Biotope, Biocenose, Histoire, Monde, Sortileges, Regles
- Onglets admin : utilisateurs, reglages, mascottes, console MJ
- Réutilisation renderer mascotte via `VisitMapMascotRenderer`

## Variables d'environnement utiles

- `FRONTEND_ORIGINS`
- `GL_FRONTEND_ORIGIN`
- `GL_GOOGLE_OAUTH_CLIENT_ID`
- `GL_GOOGLE_OAUTH_ALLOWED_DOMAINS`
- `GL_GOOGLE_OAUTH_ALLOWED_EMAILS`
- `GL_PROD_BASE_URL`

## Vérification rapide

- Build : `npm run build` (doit générer `dist/gl.html`)
- API : `GET /api/gl/chapters`
- Santé : `npm run deploy:check:prod` (check ForetMap + GL si `GL_PROD_BASE_URL`)
