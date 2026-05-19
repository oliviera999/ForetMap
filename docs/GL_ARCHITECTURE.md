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

Ajouts phase post-fondation :

- `GET /api/gl/admin/content` : listing éditorial (slug, titre, mise à jour), réservé `gl.content.manage`.
- Édition inline des pages `world/rules/spells` via `GLContentPage` (PUT `/api/gl/content/:slug`).

Ajouts Lot 2A (gameplay paramétrable) :

- `GET /api/gl/gameplay-settings` : snapshot des toggles de gameplay (joueur + admin).
- `POST /api/gl/games/:id/turn/next` : avance le tour cyclique (refus `409` si `gameplay.turns_enabled=false`).
- `POST /api/gl/games/:id/actions` (joueur) + `POST /api/gl/games/:id/actions/:actionId/resolve` (MJ) : flux d'actions joueurs validées par le MJ.
- `POST /api/gl/games/:id/events` accepte deux nouveaux types : `narration` (texte diffusé) et `score` (delta + raison, persisté dans `gl_team_scores`).

Les endpoints GL exigent un JWT avec claim `product = "gl"`.

### Gameplay paramétrable (toggles `gl_settings`)

Chaque toggle est une clé dans `gl_settings` (modifiable via `PUT /api/gl/admin/settings/:key`, permission `gl.settings.manage`). Tous **désactivés par défaut** → comportement minimal (déplacement de mascotte uniquement, comme avant Lot 2A).

| Toggle (clé `gl_settings`) | Effet quand `true` |
|---|---|
| `gameplay.turns_enabled` | Active la rotation cyclique des équipes (`current_team_id` sur `gl_games`, événement `turn_change`). Les actions joueurs (si activées) ne sont autorisées que pour l'équipe du tour courant. |
| `gameplay.narration_enabled` | Le MJ peut envoyer un événement `narration` (texte affiché en bandeau temporaire chez les joueurs). |
| `gameplay.player_actions_enabled` | Les joueurs peuvent soumettre une demande d'action sur un marker via la modale carte ; insérée dans `gl_action_requests` (`status=pending`). |
| `gameplay.scoring_enabled` | Activation du tableau de scores par équipe (`gl_team_scores`) ; bonus possible à la résolution d'une action acceptée. |

Côté serveur : module `lib/glSettings.js` (cache mémoire 30 s, invalidé à chaque PUT `gameplay.*`). Côté client : `apiGL('/api/gl/gameplay-settings')` au login et au déclenchement de chaque event reçu côté MJ ; UI conditionnelle dans `GLGameMasterConsole` et `GLMapView`.

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
- Gameplay paramétrable (`migrations/082_gl_gameplay_settings.sql`)
  - `gl_games.current_team_id` (colonne) — équipe dont c'est le tour
  - `gl_team_scores` — score cumulé par équipe et par partie
  - `gl_action_requests` — demandes d'action joueurs (pending / accepted / refused)
  - Seed des toggles `gameplay.*` dans `gl_settings` (tous `false`)

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
- Onglet admin `Contenus` pour piloter les pages éditoriales.

## Migration de contenu WordPress

Source recommandée : API publique WordPress de `gl.olution.info`.

- Config : `scripts/gl-import-wp.config.json`
- Script : `scripts/gl-import-wp.js`
- Commande : `npm run gl:import:wp`

Modes disponibles :

- `--dry-run` (défaut) : export markdown dans `tmp/gl-wp-import/*.md`.
- `--apply` : UPSERT direct dans `gl_content_pages`.

Le mapping de slugs est configurable (ex. `le-monde-de-gnomes-et-licornes -> world`).

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
