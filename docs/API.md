# API ForetMap

Base URL : `/api` (ex. `http://localhost:3000/api`).

Réponses JSON. En cas d’erreur : `{ "error": "message" }` avec statut HTTP adapté (4xx/5xx).

---

## Santé

| Méthode | URL | Description |
|--------|-----|-------------|
| GET | `/api/health` | Santé sans BDD |
| GET | `/api/health/db` | Ping MySQL : `200` si OK, `503` si base indisponible |
| GET | `/api/ready` | **Readiness** : `200` si l’init BDD a réussi **et** un ping MySQL actuel OK ; `503` pendant le boot, si l’init a échoué ou si MySQL ne répond pas (sonde LB / orchestrateur) |
| GET | `/api/version` | Version SemVer de l’app : JSON `{ "version": "<semver>" }` (lecture de `package.json` à chaque requête ; en cas d’échec de lecture, repli sur la version chargée au démarrage du process). Utilisé par les scripts de contrôle post-déploiement (`npm run deploy:check:prod`, etc.) |
| GET | `/health` | Alias |

---

## Gnomes & Licornes (`/api/gl`)

Le mode GL est isolé par JWT avec claim `product: "gl"` et routes dédiées.
La matrice de couverture des tests GL est documentée dans `docs/GL_TESTS.md`.

### Auth GL

| Méthode | URL | Body | Description |
|--------|-----|------|-------------|
| POST | `/api/gl/auth/login` | `{ pseudo, password }` (compat legacy `{ pseudo, pin }`) | Connexion joueur GL (`gl_players.password_hash`) |
| POST | `/api/gl/auth/staff/login` | `{ identifier, password }` | Connexion MJ/Admin via compte **ForetMap** (enseignant). Les **admins ForetMap** (rôle RBAC `admin`) sont synchronisés automatiquement dans `gl_admins`. Les comptes MJ déjà enregistrés dans `gl_admins` (rôle `mj`) sont aussi acceptés. Refus `403` pour un élève ForetMap (onglet joueur requis). |
| GET | `/api/gl/auth/google/start` | Query `mode=player` ou `mode=staff` (défaut `staff`) | Redirection OAuth Google (cookie `gl_oauth_mode`). Callback : `/api/gl/auth/google/callback` → `gl.html#oauth=…` (`type: gl_player` ou `gl_staff`) ou `#oauth_error=…&oauth_mode=…` |
| POST | `/api/gl/auth/google` | `{ idToken, mode?: 'player'|'staff' }` | Connexion via Google ID token : **joueur** si `mode=player` (compte `gl_players` avec `email` ou lien élève ForetMap) ; **MJ/Admin** sinon (mêmes règles que `staff/login`) |
| GET | `/api/gl/auth/config` | — | Libellés écran connexion + flags (`title`, `subtitle`, `allowGoogleStaff`, `allowGooglePlayer`, `allowPlayerLinkForetmap`, `modules`) |
| GET | `/api/gl/auth/me` | — | Profil courant GL (`auth`, `profile`) enrichi (avatar, description, liaison ForetMap) |
| PATCH | `/api/gl/auth/me/profile` | `{ currentPassword, pseudo?, email?, description?, displayName?, avatarData?, removeAvatar? }` | Mise à jour self-service du profil GL (joueur ou staff), avec validation du mot de passe actuel et réémission de session (`authToken`, `auth`) |
| POST | `/api/gl/auth/change-password` | `{ currentPassword, newPassword }` (compat legacy `pin`/`password`) | Changement mot de passe joueur GL (`password_must_reset=0`) |
| POST | `/api/gl/auth/staff/change-password` | `{ currentPassword, newPassword }` | Changement du mot de passe ForetMap lié au compte MJ/Admin GL |
| POST | `/api/gl/auth/link-foretmap` | `{ identifier, password }` | Joueur GL : lie le compte à un élève ForetMap (si `allowPlayerLinkForetmap=true`) |
| DELETE | `/api/gl/auth/link-foretmap` | `{ currentPassword }` | Joueur GL : retire la liaison ForetMap (si activée) |

### Contenus éditoriaux GL

| Méthode | URL | Body | Permission |
|--------|-----|------|------------|
| GET | `/api/gl/content/:slug` | — | `gl.read` |
| PUT | `/api/gl/content/:slug` | `{ title, bodyMarkdown }` | `gl.content.manage` |

Slugs livrés en seed : `world`, `rules`, `spells`.

Import éditorial WordPress : `npm run gl:import:wp` (`--dry-run` par défaut, `--apply` pour UPSERT BDD).

Le script accepte également `--target=chapters` (Lot 2B) : seules les pages WP référencées dans `scripts/gl-import-wp.config.json` (clé `chapterMap`, slug WP → `{ slug, biome, mapImageUrl, orderIndex }` GL) sont importées, vers la table `gl_chapters` (le champ `story_markdown` est rempli depuis le contenu HTML converti ; `biotope_markdown` / `biocenose_markdown` restent à éditer ensuite via l'admin GL).

### Gameplay GL

| Méthode | URL | Body | Permission |
|--------|-----|------|------------|
| GET | `/api/gl/chapters` | — | `gl.read` |
| GET | `/api/gl/chapters/:slug` | — | `gl.read` (réponse `{ chapter, markers }`) |
| POST | `/api/gl/chapters/admin` | `{ slug, title, biome?, mapImageUrl?, storyMarkdown?, biotopeMarkdown?, biocenoseMarkdown?, orderIndex? }` | `gl.content.manage` (refus `409` si slug existant) |
| PUT | `/api/gl/chapters/admin/:id` | mise à jour partielle des mêmes champs | `gl.content.manage` |
| DELETE | `/api/gl/chapters/admin/:id` | — | `gl.content.manage` (refus `409` si partie liée) |
| POST | `/api/gl/chapters/admin/:id/markers` | `{ label, xPct, yPct, eventType?, description?, orderIndex? }` | `gl.content.manage` |
| PUT | `/api/gl/chapters/admin/markers/:markerId` | mise à jour partielle marker | `gl.content.manage` |
| DELETE | `/api/gl/chapters/admin/markers/:markerId` | — | `gl.content.manage` (détache les équipes positionnées sur ce marker via `ON DELETE SET NULL`) |
| GET | `/api/gl/gameplay-settings` | — | Auth GL (joueur ou admin) |
| POST | `/api/gl/games` | `{ classId, chapterId, name }` | `gl.game.manage` (refus `404` si `classId`/`chapterId` introuvable, `409` si la ressource est supprimée entre validation et insertion) |
| GET | `/api/gl/games` | `?classId=&status=` optionnels | `gl.game.manage` |
| GET | `/api/gl/games/:id` | — | `gl.read` (ou membre de la partie) |
| POST | `/api/gl/games/:id/teams` | `{ name, type, mascotId, color }` | `gl.team.manage` (refus `404` si partie introuvable) |
| PUT | `/api/gl/games/:id/teams/:teamId` | `{ name?, type?, mascotId?, color? }` | `gl.team.manage` |
| DELETE | `/api/gl/games/:id/teams/:teamId` | — | `gl.team.manage` (refus `409` si équipe avec membres) |
| POST | `/api/gl/games/:id/join-team` | `{ teamId }` | Joueur connecté GL |
| GET | `/api/gl/games/:id/roster` | — | `gl.players.manage` |
| POST | `/api/gl/games/:id/roster/assign` | `{ playerId, teamId }` | `gl.players.manage` |
| POST | `/api/gl/games/:id/roster/unassign` | `{ playerId }` | `gl.players.manage` |
| POST | `/api/gl/games/:id/events` | `{ teamId?, eventType, payload }` | `gl.event.emit` |
| POST | `/api/gl/games/:id/turn/next` | — | `gl.game.manage` (refus `409` si `gameplay.turns_enabled=false`) |
| POST | `/api/gl/games/:id/actions` | `{ actionType, payload }` | `gl.action.request` (joueur) (refus `409` si toggle off / hors tour) |
| POST | `/api/gl/games/:id/actions/:actionId/resolve` | `{ decision: "accepted"\|"refused", scoreDelta?, reason? }` | `gl.game.manage` |
| POST | `/api/gl/games/:id/start` | — | `gl.game.manage` |
| POST | `/api/gl/games/:id/pause` | — | `gl.game.manage` |
| POST | `/api/gl/games/:id/end` | — | `gl.game.manage` |
| DELETE | `/api/gl/games/:id` | — | `gl.game.manage` (autorisé uniquement pour `draft` / `ended`) |
| GET | `/api/gl/mascots` | `?gameId=` optionnel (renvoie aussi `assignments`) | Auth GL (joueur ou admin) |
| POST | `/api/gl/mascots/assign` | `{ gameId, teamId, mascotId }` | `gl.team.manage` (refus `404` mascotte inconnue, refus `409` mascotte déjà utilisée par une autre équipe de la même partie) |
| GET | `/api/gl/mascots/packs` | `?chapterId=` optionnel | `gl.content.manage` |
| POST | `/api/gl/mascots/packs` | `{ chapterId?, name, version?, payload }` | `gl.content.manage` (validation Zod) |
| PUT | `/api/gl/mascots/packs/:id` | `{ chapterId?, name?, version?, payload? }` | `gl.content.manage` |
| DELETE | `/api/gl/mascots/packs/:id` | — | `gl.content.manage` |
| GET | `/api/gl/mascots/packs/:id/assets` | — | `gl.content.manage` |
| POST | `/api/gl/mascots/packs/:id/assets` | `{ filename, mimeType?, dataBase64 }` | `gl.content.manage` |
| DELETE | `/api/gl/mascots/packs/:id/assets/:filename` | — | `gl.content.manage` |
| GET | `/api/gl/mascots/sprite-library` | `?chapterId=` optionnel | `gl.content.manage` |
| POST | `/api/gl/mascots/sprite-library` | `{ chapterId?, filename, mimeType?, dataBase64 }` | `gl.content.manage` |
| DELETE | `/api/gl/mascots/sprite-library/:id` | — | `gl.content.manage` |

Événements de partie stockés dans `gl_game_events` et diffusés en Socket.IO (`gl:game:event`, room `gl:game:{id}`).

**Types d'événements (`eventType`)** :
- `move` — déplacement d'une mascotte d'équipe sur un marker (`payload: { markerId, markerLabel? }`).
- `game_status` — changement de statut de partie (`payload: { status }`).
- `turn_change` — équipe dont c'est le tour (`payload: { teamId }`). Requiert `gameplay.turns_enabled=true`.
- `narration` — texte narratif diffusé en bandeau (`payload: { text }`). Requiert `gameplay.narration_enabled=true`.
- `score` — variation de score d'équipe (`payload: { delta, reason? }`). Met à jour `gl_team_scores`. Requiert `gameplay.scoring_enabled=true`.
- `action_request` — demande joueur (`payload: { actionRequestId, actionType, playerId, payload }`).
- `action_resolved` — décision MJ (`payload: { actionRequestId, decision, scoreDelta, reason }`).

**Toggles `gameplay.*`** persistés dans `gl_settings` (table `(key, value_json)`), modifiables via `PUT /api/gl/admin/settings/:key` (permission `gl.settings.manage`). Snapshot public (joueur + admin) exposé par `GET /api/gl/gameplay-settings` (réponse `{ settings: { turnsEnabled, narrationEnabled, playerActionsEnabled, scoringEnabled } }`). Cache mémoire 30 s côté serveur, invalidé à chaque PUT sur une clé `gameplay.*`.

### Administration GL

| Méthode | URL | Body | Permission |
|--------|-----|------|------------|
| GET | `/api/gl/admin/classes` | — | `gl.players.manage` |
| POST | `/api/gl/admin/classes` | `{ name, school }` | `gl.players.manage` |
| PUT | `/api/gl/admin/classes/:id` | `{ name?, school?, isActive? }` | `gl.players.manage` |
| DELETE | `/api/gl/admin/classes/:id` | — | `gl.players.manage` (refus `409` si joueurs actifs ou parties non terminées) |
| GET | `/api/gl/admin/players` | `?classId=` optionnel | `gl.players.manage` |
| POST | `/api/gl/admin/players` | `{ classId, firstName, lastName, pseudo, password?, passwordMustReset? }` | `gl.players.manage` |
| PUT | `/api/gl/admin/players/:id` | `{ firstName?, lastName?, pseudo?, classId?, isActive? }` | `gl.players.manage` |
| DELETE | `/api/gl/admin/players/:id` | — | `gl.players.manage` (refus `409` si partie active liée) |
| POST | `/api/gl/admin/players/:id/reset-password` | `{ password }` | `gl.players.manage` |
| POST | `/api/gl/admin/players/:id/reset-pin` | `{ pin }` (alias compat) | `gl.players.manage` |
| GET | `/api/gl/admin/players/import/template` | `?format=csv|xlsx` | `gl.players.manage` |
| POST | `/api/gl/admin/players/import` | `{ fileName, fileDataBase64, dryRun }` | `gl.players.manage` |
| GET | `/api/gl/admin/players/export` | `?classId=` optionnel | `gl.players.manage` |
| GET | `/api/gl/admin/settings` | — | `gl.settings.manage` |
| PUT | `/api/gl/admin/settings/:key` | `{ value }` | `gl.settings.manage` |
| GET | `/api/gl/admin/content` | — | `gl.content.manage` |

### Permissions RBAC GL ajoutées

- `gl.read`
- `gl.content.manage`
- `gl.players.manage`
- `gl.game.manage`
- `gl.team.manage`
- `gl.event.emit`
- `gl.mascot.position`
- `gl.settings.manage`
- `gl.action.request`

### Modules GL activables (`modules.*`)

Drapeaux booléens lus via `GET /api/gl/auth/config` (champ `modules`) et persistés
dans `gl_settings` :

- `modules.mascot_packs_enabled`
- `modules.context_comments_enabled`
- `modules.forum_enabled`
- `modules.notifications_enabled`
- `modules.tutorials_enabled`
- `modules.help_enabled`
- `modules.journal_enabled`
- `modules.kingdom_map_enabled`

Modifiables via `PUT /api/gl/admin/settings/:key` (validation booléenne stricte,
permission `gl.settings.manage`).

### Modules collaboration / pédagogie GL

| Méthode | URL | Body | Permission |
|--------|-----|------|------------|
| GET | `/api/gl/context-comments?contextType=&contextId=` | — | Auth GL |
| POST | `/api/gl/context-comments` | `{ contextType, contextId, body }` | Auth GL |
| DELETE | `/api/gl/context-comments/:id` | — | Auteur ou `gl_admin` |
| GET | `/api/gl/forum/threads` | — | Auth GL |
| POST | `/api/gl/forum/threads` | `{ title, body }` | Auth GL |
| GET | `/api/gl/forum/threads/:id` | — | Auth GL |
| POST | `/api/gl/forum/threads/:id/posts` | `{ body }` | Auth GL (refus 409 si verrouillé sauf `gl_admin`) |
| PATCH | `/api/gl/forum/threads/:id/lock` | `{ locked }` | `gl_admin` |
| DELETE | `/api/gl/forum/posts/:id` | — | Auteur ou `gl_admin` |
| GET | `/api/gl/tutorials` | `?chapterId=` optionnel | Auth GL |
| GET | `/api/gl/tutorials/me/read-ids` | — | Auth GL |
| GET | `/api/gl/tutorials/:idOrSlug` | — | Auth GL |
| POST | `/api/gl/tutorials/:id/read` | — | Auth GL |
| POST | `/api/gl/tutorials` | `{ slug, title, bodyMarkdown, chapterId?, markerId?, orderIndex?, isPublished? }` | `gl.content.manage` |
| PUT | `/api/gl/tutorials/:id` | mise à jour partielle | `gl.content.manage` |
| DELETE | `/api/gl/tutorials/:id` | — | `gl.content.manage` |
| GET | `/api/gl/journal/games/:id` | `?teamId=&limit=` | Auth GL |
| GET | `/api/gl/kingdom-map/zones?chapterId=` | — | Auth GL |
| POST | `/api/gl/kingdom-map/zones` | `{ chapterId, label, description?, color?, points: [{x,y}…] }` | `gl.content.manage` |
| PUT | `/api/gl/kingdom-map/zones/:id` | mise à jour partielle | `gl.content.manage` |
| DELETE | `/api/gl/kingdom-map/zones/:id` | — | `gl.content.manage` |

### Diagnostics GL (admin)

`GET /api/admin/diagnostics` (header `X-Deploy-Secret`) inclut désormais une
section `gl` :

```json
{
  "gl": {
    "ok": true,
    "gamesByStatus": { "draft": 1, "live": 2 },
    "activePlayers": 42,
    "recentEventTypes": [{ "eventType": "move", "count": 12 }],
    "mascotPackCount": 3
  }
}
```

Outils MCP exposés (`scripts/mcp-foretmap-diagnostics.mjs`) :

- `gl_public_health` (sans secret) — `/api/health`, `/api/version`,
  `/api/gl/chapters` (200/401 attendus).
- `gl_diagnostics` (secret requis) — sous-section `gl` de
  `/api/admin/diagnostics`.

---

## Observabilité (logs / corrélation)

- **Réponse** : toutes les requêtes reçoivent un en-tête **`X-Request-Id`** (UUID ou valeur client si format sûr, 8–128 caractères `[a-zA-Z0-9._-]`). À utiliser pour relier une erreur côté client aux lignes Pino / au tampon admin.
- **Variables** :
  - **`FORETMAP_HTTP_LOG`** : `off` (défaut hors prod et en `NODE_ENV=test`), `minimal` (défaut **production** : log `warn` des **5xx** et des requêtes lentes), `full` (une ligne `info`/`warn` par requête `/api/*` suivie — peut saturer le tampon).
  - **`FORETMAP_HTTP_SLOW_MS`** : seuil « lent » en ms pour le mode `minimal` (défaut **8000**).
  - **`FORETMAP_RATE_LIMIT_LOG_SAMPLE`** : probabilité **0–1** de journaliser un **429** rate limit (défaut **0.01**), avec **IP tronquée** (pas d’adresse complète dans les logs).
  - **`FORETMAP_DB_CONNECTION_LIMIT`** : taille du pool **mysql2** côté app (1–100, défaut **30**) ; à caler sur **`max_connections`** et la charge réelle de l’hébergeur.

---

## Diagnostic public (site)

Ces endpoints exposent un inventaire des problèmes techniques potentiels déjà identifiés.
Ils sont utiles pour l’exploitation, la QA et le suivi des correctifs.

| Méthode | URL | Description |
|--------|-----|-------------|
| GET | `/api/site-issues` | Retourne le rapport en **Markdown** (`text/markdown`) |
| GET | `/api/site-issues.json` | Retourne le rapport en **JSON** (`application/json`) |

Sources de référence :

- `docs/SITE_ISSUES.md`
- `docs/SITE_ISSUES.json`
- audits détaillés : `docs/AUDIT_BUGS_INCOHERENCES.md`, `docs/AUDIT_PHOTOS_BIODIVERSITE.md`

---

## Administration (secret `DEPLOY_SECRET`)

Nécessite la variable d’environnement **`DEPLOY_SECRET`** et le header **`X-Deploy-Secret: <valeur>`** (éviter de passer le secret en query string en prod : risque dans les journaux d’accès).

| Méthode | URL | Description |
|--------|-----|-------------|
| POST | `/api/admin/restart` | Redémarre le processus Node (body JSON `{ "secret" }` ou header) |
| GET | `/api/admin/logs` | Dernières lignes des logs applicatifs (Pino) depuis un **tampon mémoire** (`?lines=200` par défaut, max 5000). Réponse JSON : `entries` (tableau de chaînes), `bufferLines`, `bufferMax`. En local : secret dans `.env` via **`DEPLOY_SECRET`**, **`FORETMAP_DEPLOY_CHECK_SECRET`** ou **`FORETMAP_DEPLOY_SECRET`** (même valeur que la prod). Scripts : **`npm run prod:admin-tail`** (résumé + tampon), **`npm run prod:admin-diagnostics`** (JSON complet diagnostics), **`npm run prod:remote-debug`** (check post-déploiement puis tail). **User-Agent** dédiés + pause pour limiter les **429**. |
| GET | `/api/admin/diagnostics` | **Instantané d’exploitation** (sans secrets dans la réponse) : champs ci-dessus + **`metrics`** (`httpRequests`, `http5xx`, `http4xx`, **`http429`** : compteur exact des réponses 429, `httpSlow`, `routeErrors`, `rateLimit429Samples` : échantillon logs rate limit global, **`recentHttp5xx`**, **`recentHttp429`** : derniers 429 avec `requestId`, `method`, `path`, `at`) + **`runtimeProcess`** (`pid`, `cluster.isWorker` / `cluster.workerId`, `envHints.nodeAppInstance`, `envHints.passengerAppEnv`) : décrit **le processus qui répond** ; le nombre d’instances Passenger/PM2 se lit au **panneau hébergeur** (voir **`docs/EXPLOITATION.md`**, temps réel). + **`visitMascotHint`** : `{ maps: [{ map_id, visitZonesInPublicApi, visitZonesTotalRows, visitMarkersInPublicApi, visitMarkersTotalRows, visitTutorialsForContentApi, mascotWouldRenderHint }], error? }` — agrégats alignés sur le public **`GET /api/visit/content`** (diagnostic mascotte ; **`docs/VISIT_MAP_GEOMETRY.md`**). + **`mascotPackLibProbe`** : `{ roots, candidatesCount, libMirrorOk }` — présence des fichiers **`lib/visit-pack/*`** pour la validation **POST/PUT** `/api/visit/mascot-packs` (**`docs/EXPLOITATION.md`** si `libMirrorOk` est false). |
| GET | `/api/admin/oauth-debug` | Diagnostic OAuth **sans secrets** : résolution des URLs (origine front, redirect Google), présence des variables client id/secret (booléens uniquement), en-têtes **`X-Forwarded-*`** et hôte/protocole vus par le process. **Même** contrôle d’accès que les autres routes admin ci-dessus : header **`X-Deploy-Secret`** = **`DEPLOY_SECRET`**. Pour la console réglages (JWT prof + droits), voir **`GET /api/settings/admin/system/oauth-debug`** (champs supplémentaires **`allowedDomains`**, **`allowedEmails`**). |

Le tampon est dimensionné par **`LOG_BUFFER_MAX_LINES`** (défaut 2000, plafond 5000). Les logs antérieurs au démarrage du process ne sont pas disponibles ici (voir aussi les logs du panel hébergeur / stdout).

### En-tête optionnel de test de charge (rate limit)

Pour les environnements de test (local/staging), le rate limiter global et auth peut être contourné si les deux conditions suivantes sont réunies :

1. la variable d'environnement `LOAD_TEST_SECRET` est définie côté serveur ;
2. la requête envoie le header `X-ForetMap-Load-Test: <meme_secret>`.

Sans `LOAD_TEST_SECRET`, le comportement reste inchangé : le rate limiting s'applique normalement à toutes les requêtes.

### Client HTTP (SPA)

Les requêtes **`GET`** sans corps émises par **`api()`** (`src/services/api.js`) réessayent automatiquement jusqu’à **4** tentatives (backoff avec jitter) en cas de réponse **502**, **503**, **504** ou d’échec réseau typique (`TypeError`, ex. *Failed to fetch*), afin d’absorber de courtes indisponibilités proxy / hébergeur. Les autres méthodes HTTP et les réponses **429** ne sont pas réessayées automatiquement.

Le plafond global sur **`/api/*`** (hors bypass ci-dessus) est de **1200 requêtes par minute par adresse IP** par défaut, configurable avec **`FORETMAP_API_RATE_LIMIT_PER_MIN`** (entier entre 60 et 20000). Objectif : limiter les abus tout en évitant des **429** lorsque plusieurs utilisateurs ou onglets passent par la **même IP publique** (ex. Wi‑Fi établissement).

**Proxy inverse (IP client)** : en **`NODE_ENV=production`**, Express active **`trust proxy`** (défaut **1** hop) pour que **`req.ip`** et le rate limit reflètent l’IP du client derrière nginx / Passenger. Surcharges : **`FORETMAP_TRUST_PROXY`** = nombre de hops, nom de sous-réseau, ou **`false`** pour désactiver. Sans confiance proxy adaptée, tous les clients peuvent partager l’IP du frontal (429 groupés ou contournement inversé).

Pour valider ce comportement en local (plusieurs utilisateurs virtuels, **une seule IP source** côté serveur, rate limit **actif**), utiliser le profil Artillery **`10vu`** : fichier `load/artillery-10vu.yml`, commande **`npm run test:load:10vu`** (voir aussi `docs/LOCAL_DEV.md`).

### Mode Playwright / e2e (rate limit)

Pour les campagnes **Playwright** et un serveur de dev dédié aux e2e, le rate limiting global et auth peut être désactivé si **l’une** des conditions suivantes est remplie côté process Node du serveur :

1. variable d’environnement **`E2E_DISABLE_RATE_LIMIT=1`** (peut être insuffisante seule sur certains environnements Windows selon la chaîne `npm`) ;
2. **recommandé** : démarrage avec l’argument **`--foretmap-e2e-no-rate-limit`** (script npm **`npm run start:e2e`**), qui force en interne le même bypass.

Réservé aux environnements de **développement / CI** ; ne pas utiliser en production.

---

## Cartes

| Méthode | URL | Description |
|--------|-----|-------------|
| GET | `/api/maps` | Liste des cartes configurées, triées (`sort_order`, `id`). Retourne les champs `id`, `label`, `map_image_url`, `sort_order`, `is_active`, `updated_at`, `frame_padding_px`. Utilisé par toutes les vues carte/tâches/visite ; la logique client filtre ensuite selon l’affiliation et le mode (élève, n3boss, visite). |

Notes :

- Le backend n’impose pas de plafond à 2 cartes : le contrat est compatible **N cartes**.
- Le paramètre `is_active` permet de masquer une carte côté UI sans la supprimer de la base.
- Les routes admin associées (création/mise à jour) sont documentées dans la section **Réglages admin**.

---

## Temps réel (Socket.IO)

Connexion Socket.IO en transport **polling uniquement** côté client (compatibilité proxy TLS / mutualisé ; pas de WebSocket) sur le **même hôte** que l’API, chemin `/socket.io`.

- **Authentification** : JWT via **`handshake.auth.token`** ou en-tête **`Authorization: Bearer`**. Le jeton en **query string** (`?token=`) est **désactivé en production** (fuite possible dans logs proxy) ; réservé aux tests (**`NODE_ENV=test`**, **`E2E_DISABLE_RATE_LIMIT=1`**) ou **`FORETMAP_SOCKET_QUERY_TOKEN=1`**.
- **Client (Engine.IO)** : **`transports: ['polling']`** et **`upgrade: false`** pour interdire toute tentative WebSocket (évite des erreurs **« reserved bits »** si un proxy renvoie du trafic non conforme sur le chemin WS).
- **Serveur (Engine.IO)** : transports **`polling`** puis **`websocket`** (WS pour tests / outils) ; **`allowUpgrades: false`** (pas d’upgrade polling→WS, aligné navigateurs prod) ; **`pingInterval` 20 s** / **`pingTimeout` 60 s** (heartbeat un peu plus fréquent, tolérance réseau mobile et proxy).
- **CORS** : en production, même règle que l’API (`FRONTEND_ORIGIN` si défini).
- **Rôle** : notifier les clients qu’une ressource a changé ; les données à jour restent à charger via les routes REST (`GET /api/tasks`, etc.). Côté client, refetch **débouncé** : ~**220 ms** pour les tâches, ~**400 ms** pour le jardin (zones / plantes / repères) — compromis fraîcheur vs rafales HTTP.
- **Auth socket** : token JWT requis (transmis dans le handshake Socket.IO).
- **Rooms** : souscription de domaine (`tasks`, `students`, `garden`) + souscription carte via `subscribe:map` (payload `{ mapId }`).
- **Client** : le frontend se connecte pour n3beur/n3boss authentifié ; en cas d’échec, le rafraîchissement périodique reste actif (cadence adaptative).

**Robustesse (comportement attendu)** :

- **JWT** : connexion refusée si token absent, invalide ou expiré (`connect_error` côté client).
- **Tâches par carte** : la plupart des `tasks:changed` métier incluent un `mapId` ; seuls les clients dans la salle **`map:<mapId>`** (handshake `auth.mapId` et/ou événement **`subscribe:map`**) reçoivent l’événement. Sans souscription à la bonne carte, l’utilisateur s’appuie sur le **polling** REST (voir hook temps réel / `App.jsx`).
- **Diffusion domaine** : certains cas rares émettent `tasks:changed` **sans** `mapId` → cible la salle **`domain:tasks`** (tous les sockets authentifiés abonnés à ce domaine). L’**import CSV projets/tâches**, la **suppression d’élève** (tâches impactées) et les **CRUD tutoriels** (tâches liées) émettent en priorité **une émission par `mapId`** concerné ; sans liaison tâche, **une seule** émission domaine (comportement inchangé pour les tutoriels sans lien).
- **Tests d’intégration** (sans navigateur) : [`tests/realtime.test.js`](../tests/realtime.test.js) — auth, filtrage par carte, `subscribe:map`, repli `domain:tasks`.
- **Smoke charge locale** (plusieurs clients polling + option burst REST) : **`npm run test:load:socketio-smoke`** — voir **`docs/LOCAL_DEV.md`**.

Événements émis par le serveur (payload JSON, toujours avec un champ `ts` — horodatage) :

| Événement | Quand | Champs utiles (exemples) |
|-----------|--------|---------------------------|
| `tasks:changed` | Création / modification / suppression de tâche, assignation, désassignation, marquer fait, validation, suppression d’un log | `reason`, `taskId`, `mapId` |
| `students:changed` | Inscription d’un n3beur, suppression d’un n3beur | `reason`, `studentId` |
| `garden:changed` | Zones, photos de zone, biodiversité, marqueurs carte | `reason`, `zoneId`, `plantId`, `markerId`, `mapId`… — côté client, pour certaines raisons (**zone** / **repère** sans toucher au catalogue plantes), le refetch peut **omettre** `GET /api/plants` et ne relire que **zones + repères** de la carte active (voir `useForetmapRealtime.js`) ; si plusieurs événements arrivent dans la fenêtre de debounce, **un seul** événement « plantes requises » suffit à déclencher le refetch complet. |
| `forum:changed` | Création de sujet, réponse, suppression de message, verrouillage, signalement | `reason`, `threadId`, `postId` |
| `context-comments:changed` | Création/suppression/signalement d’un commentaire contextuel | `reason`, `contextType`, `contextId`, `commentId` |

---

## Auth

| Méthode | URL | Body | Description |
|--------|-----|------|-------------|
| POST | `/api/auth/register` | `{ firstName, lastName, password, pseudo?, email?, description? }` | Créer un compte n3beur (profil RBAC par défaut : `visiteur`) |
| POST | `/api/auth/login` | `{ identifier, password }` | Connexion n3beur (pseudo ou email) |
| GET | `/api/auth/me` | — | Retourne le contexte d’auth courant (`auth` : `userType`, permissions, `elevated`, `nativePrivileged`, etc.) ; **`nativePrivileged`** : `true` pour les slugs système `admin`/`prof` et pour un **enseignant** dont le profil principal a le rang du n3boss (≥ 400) et la permission `teacher.access` (ex. **duplicata** du profil n3boss), ce qui aligne le comportement « sans PIN » sur celui du slug `prof`. En **prise de contrôle admin**, `auth` inclut **`impersonating`: true** et **`impersonatedBy`** (`userType`, `userId`, `canonicalUserId` du compte administrateur réel). Peut inclure **`refreshedToken`** (JWT) si le profil RBAC effectif en base ne correspond plus au jeton (ex. progression auto après tâches validées) ; le client doit remplacer le jeton stocké ; le jeton régénéré **conserve** les champs d’impersonation si la session était en prise de contrôle. Pour un **n3beur**, peut inclure une seule fois **`autoProfilePromotion`** après une montée de palier automatique (voir détail ci-dessous). |
| PATCH | `/api/auth/me/profile` | `{ pseudo?, email?, description?, affiliation?, avatarData?, removeAvatar?, currentPassword }` | Mettre à jour son profil utilisateur connecté (n3beur, n3boss, admin local) |
| POST | `/api/auth/elevate` | `{ pin }` | Élévation de session via PIN du profil ; pour un **n3beur** (`userType: student`), le JWT élevé inclut aussi les permissions effectives du rôle **`prof`** (atelier / mode n3boss temporaire), en plus du rôle primaire inchangé côté identité |
| POST | `/api/auth/forgot-password` | `{ email }` | Déclencher un email de réinitialisation n3beur (réponse neutre) |
| POST | `/api/auth/reset-password` | `{ token, password }` | Réinitialiser le mot de passe n3beur |
| POST | `/api/auth/teacher` | `{ pin }` | Compatibilité historique : élévation PIN (ou mode secours admin) |
| POST | `/api/auth/teacher/login` | `{ email, password }` | Connexion n3boss email/mot de passe → `{ token }` (JWT) |
| POST | `/api/auth/teacher/forgot-password` | `{ email }` | Déclencher un email de réinitialisation n3boss (réponse neutre) |
| POST | `/api/auth/teacher/reset-password` | `{ token, password }` | Réinitialiser le mot de passe n3boss |
| POST | `/api/auth/admin/impersonate` | `{ userType: 'student' \| 'teacher', userId }` | **Admin** avec permission **`admin.impersonate`** : émet un JWT dont l’identité effective est le compte cible ; le jeton contient l’acteur (`impersonating`, `actorUserType`, `actorUserId`, `actorCanonicalUserId`). **`userId`** : chaîne (ex. UUID n3beur, identifiant enseignant). Réponse : **`authToken`**, **`auth`** (exposé), **`profile`** (ligne `users` sans `password_hash`). Impossible si une prise de contrôle est déjà active ou si la cible est soi-même. |
| POST | `/api/auth/admin/impersonate/stop` | — | Met fin à la prise de contrôle : nouveau **`authToken`** / **`auth`** pour le compte administrateur identifié dans le jeton (acteur). Requiert un jeton en mode impersonation. |

Routes protégées « n3boss » : header `Authorization: Bearer <token>`.

**Durées de vie des JWT** : configurables par les réglages admin (portée enseignant) **`security.jwt_ttl_base_seconds`** (session standard, défaut **5 400** s = 1 h 30) et **`security.jwt_ttl_elevated_seconds`** (session après élévation PIN, défaut **5 400** s) ; plages min/max imposées par le serveur. S’appliquent à toutes les émissions de jeton (connexion, élévation, OAuth, rafraîchissement `refreshedToken`, impersonation).

**`GET /api/auth/me`** — pour un compte **n3beur** authentifié (`auth.userType === 'student'`), la réponse peut inclure **`taskEnrollment`** (plafond d’auto-inscriptions actives) :

- `maxActiveAssignments` : plafond effectif (entier 0–99, `0` = pas de limite) : si le profil principal du n3beur a une valeur `roles.max_concurrent_tasks` non `NULL`, elle s’applique ; sinon le réglage global `tasks.student_max_active_assignments` est utilisé.
- `currentActiveAssignments` : nombre d’assignations sur des tâches dont le statut n’est pas `validated` (toutes cartes) ; **exception** : pour une tâche en `completion_mode` **`all_assignees_done`**, l’assignation du n3beur n’est plus comptée dès que **`done_at`** est renseigné sur sa ligne `task_assignments` (part individuelle terminée, sans attendre les autres ni la validation n3boss de la tâche).
- `atLimit` : `true` si `maxActiveAssignments > 0` et `currentActiveAssignments >= maxActiveAssignments`.
- `forumParticipate` : `true` si le profil principal du n3beur (`roles.forum_participate`) autorise la **participation** au forum ; `false` = accès **lecture seule** sur les routes forum autorisées (voir ci-dessous). Absent pour les n3boss.
- `contextCommentParticipate` : `true` si le profil principal (`roles.context_comment_participate`) autorise la **publication** sur les commentaires contextuels (tâches, projets, zones, repères, biodiversité, tutoriels), réagir, signaler et supprimer les siens ; `false` = **lecture seule** sur `GET /api/context-comments`. Absent pour les n3boss.
- **`refreshedToken`** (chaîne) : présent si le JWT doit être régénéré pour refléter le profil courant en base (sans changer l’état « élevé » / PIN du jeton) ; à enregistrer comme `Authorization: Bearer` pour les appels suivants.
- **`autoProfilePromotion`** (objet, **consommé** à la première réponse qui l’inclut) : affichage côté client après progression automatique par tâches validées. Champs : `kind` (`progression`), `roleSlug`, `roleDisplayName`, `roleEmoji` (optionnel), `validatedTaskCount` (nombre de tâches validées pris en compte pour la sync), `highlights` (tableau de courtes phrases décrivant les droits sans PIN, forum / commentaires contextuels, plafond d’inscriptions actives le cas échéant).

---

## RBAC (admin)

Les routes RBAC exigent les permissions indiquées ; l’**élévation PIN** n’est pas requise pour les comptes **admin**/**prof** natifs ni pour les enseignants **`nativePrivileged`** (voir `GET /api/auth/me`).

| Méthode | URL | Description |
|--------|-----|-------------|
| GET | `/api/rbac/profiles` | Objet `{ roles, progressionByValidatedTasksEnabled }` : liste des profils (chacun avec `permissions`, `catalog`, et pour chaque ligne `roles` : `forum_participate` / `context_comment_participate` / `max_concurrent_tasks` lorsque présents en base), et indicateur du réglage global de progression automatique |
| PATCH | `/api/rbac/progression-by-validated-tasks` | Activer ou désactiver la montée de niveau automatique des profils élèves selon les tâches validées (`{ enabled: boolean }`, même permission que la gestion des profils, élévation PIN si requise) |
| POST | `/api/rbac/profiles` | Créer un profil (`slug`, `display_name`, `rank`, `display_order`, `emoji?`, `min_done_tasks?`, `max_concurrent_tasks?`) — `max_concurrent_tasks` réservé aux mêmes profils n3beur que pour le PATCH (voir ci-dessous). **Slugs interdits** (réservés système) : `admin`, `prof`, `visiteur`, `eleve_novice`, `eleve_avance`, `eleve_chevronne` → **400** avec message explicite ; le **nom affiché** peut être libre (ex. « Admin délégué » avec le slug `admin_delegue`) |
| POST | `/api/rbac/profiles/:id/duplicate` | Dupliquer un profil : copie `rank`, `emoji`, `min_done_tasks`, `display_order`, `forum_participate`, `context_comment_participate`, `max_concurrent_tasks` et toutes les entrées de permissions ; le **PIN** du profil source n’est **pas** copié (à définir sur le nouveau profil via `PUT .../pin`). Corps JSON : `slug` (obligatoire, unique), `display_name` (optionnel ; défaut : nom affiché du source suivi de « (copie) »). **Mêmes slugs réservés** que pour `POST /api/rbac/profiles` → **400** si le `slug` demandé est réservé |
| PATCH | `/api/rbac/profiles/:id` | Modifier un profil (`display_name`, `rank`, `display_order`, `emoji`, `min_done_tasks`) ; pour un **palier n3beur** (slug `eleve_*`, ou autre slug avec `rank` strictement inférieur à celui du profil n3boss — 400 —, hors `admin`, `prof`, `visiteur`), on peut aussi envoyer `forum_participate` et/ou `context_comment_participate` (booléens ou 0/1) — alias acceptés : `forumParticipate`, `contextCommentParticipate` — participation forum et commentaires contextuels pour **tous** les n3beurs ayant ce profil principal ; même périmètre pour **`max_concurrent_tasks`** (alias `maxConcurrentTasks`) : entier 0–99 (`0` = pas de limite pour ce profil), ou `null` / chaîne vide pour **hériter** du réglage global `tasks.student_max_active_assignments` |
| PUT | `/api/rbac/profiles/:id/permissions` | Remplacer les permissions d’un profil |
| PUT | `/api/rbac/profiles/:id/pin` | Changer le PIN d’un profil |
| GET | `/api/rbac/users` | Liste utilisateurs et profil attribué : `display_name`, `first_name`, `last_name`, `pseudo`, `email`, `description`, `affiliation` (n3beurs), `role_id`, `role_slug`, `role_display_name` ; pour les n3beurs, `forum_participate` et `context_comment_participate` reflètent le **profil principal** (`roles`) |
| GET | `/api/rbac/users/:userType/:userId` | Détail d’un compte (même forme qu’un élément de la liste) pour préremplir l’édition ; `userType` : `teacher`, `student` ou alias `user` |
| PATCH | `/api/rbac/users/:userType/:userId` | Mettre à jour un compte (`teacher` ou `student`, ou alias `user` comme pour `PUT …/role`) : champs optionnels `first_name`, `last_name`, `pseudo`, `email`, `description`, `affiliation` (n3beurs uniquement), `password` (non vide = nouveau mot de passe). Même permission et élévation que l’attribution de profils (`admin.users.assign_roles`). Un compte dont le profil principal est **admin** ne peut être modifié que par un acteur au profil **admin**. Changement de prénom/nom n3beur : mise à jour des lignes `task_assignments` et `task_logs` liées par `student_id` |
| PUT | `/api/rbac/users/:userType/:userId/role` | Attribuer le profil principal d’un utilisateur |

### Droits paramétrables (catalogue)

Ces droits sont assignables depuis la console **Profils & utilisateurs**.

| Clé permission | Libellé | Description |
|--------|-----|-------------|
| `teacher.access` | Accès interface n3boss | Permet d’ouvrir l’interface n3boss |
| `admin.roles.manage` | Gestion des profils RBAC | Créer/renommer profils, permissions et PIN |
| `admin.users.assign_roles` | Attribution des profils | Attribuer/retraiter un profil aux utilisateurs ; modifier les données de compte via `PATCH /api/rbac/users/...` |
| `admin.impersonate` | Prise de contrôle utilisateur | Se connecter en tant qu’un autre compte `student` ou `teacher` (`POST /api/auth/admin/impersonate`) |
| `users.create` | Création unitaire utilisateurs | Créer un utilisateur unitaire (n3beur/n3boss/admin selon droits) |
| `admin.settings.read` | Lecture paramètres admin | Consulter la console de réglages |
| `admin.settings.write` | Édition paramètres admin | Modifier les réglages non secrets |
| `admin.settings.secrets.write` | Actions admin critiques | Exécuter les actions critiques (restart, secrets) |
| `stats.read.all` | Lecture stats globales | Consulter les stats de tous les n3beurs |
| `stats.read.group` | Lecture stats par groupe | Consulter les stats dans le périmètre de groupe |
| `stats.export` | Export stats | Exporter les stats n3beurs en CSV |
| `groups.read` | Lecture groupes utilisateurs | Consulter les groupes et sous-groupes |
| `groups.manage` | Gestion groupes utilisateurs | Créer/éditer/supprimer les groupes, membres et scopes |
| `students.import` | Import n3beurs | Importer des n3beurs via CSV/XLSX |
| `students.delete` | Suppression n3beur | Supprimer un compte n3beur |
| `tasks.manage` | Gestion tâches | Créer/éditer/supprimer les tâches |
| `tasks.validate` | Validation tâches | Valider une tâche (tous statuts sauf déjà validée) |
| `tasks.propose` | Proposition de tâches | Proposer de nouvelles tâches |
| `tasks.assign.group` | Affectation groupe de tâches | Assigner en masse les membres d’un groupe |
| `tasks.assign_self` | Prise en charge tâche | S’assigner à une tâche |
| `tasks.unassign_self` | Retrait de tâche | Se retirer d’une tâche |
| `tasks.done_self` | Soumission de tâche | Marquer une tâche comme faite |
| `zones.manage` | Gestion zones | Créer/éditer/supprimer zones et photos |
| `map.manage_markers` | Gestion repères | Créer/éditer/supprimer repères |
| `plants.manage` | Gestion biodiversité | Créer/éditer/supprimer/importer plantes |
| `tutorials.manage` | Gestion tutoriels | Créer/éditer/supprimer tutoriels |
| `visit.manage` | Gestion visite | Gérer la carte de visite publique |
| `audit.read` | Lecture audit | Consulter le journal d’audit |
| `observations.read.all` | Lecture observations globales | Consulter toutes les observations |
| `observations.read.group` | Lecture observations par groupe | Consulter les observations du périmètre de groupe |
| `forum.group.moderate` | Modération forum par groupe | Modérer les fils/messages dans les groupes accessibles |

### Profils système (droits par défaut)

Les profils sont entièrement paramétrables ; ce tableau documente les **valeurs initiales** livrées par l’application.

| Profil | Droits par défaut |
|--------|-------------------|
| `admin` | `teacher.access`, `admin.roles.manage` (PIN), `admin.users.assign_roles` (PIN), `users.create` (PIN), `admin.settings.read` (PIN), `admin.settings.write` (PIN), `admin.settings.secrets.write` (PIN), `groups.read`, `groups.manage` (PIN), `stats.read.all`, `stats.read.group`, `stats.export` (PIN), `students.import` (PIN), `students.delete` (PIN), `tasks.manage` (PIN), `tasks.validate` (PIN), `tasks.propose`, `tasks.assign.group` (PIN), `tasks.assign_self`, `tasks.unassign_self`, `tasks.done_self`, `zones.manage` (PIN), `map.manage_markers` (PIN), `plants.manage` (PIN), `tutorials.manage` (PIN), `visit.manage` (PIN), `audit.read` (PIN), `observations.read.all` (PIN), `observations.read.group`, `forum.group.moderate` |
| `prof` | `teacher.access`, `groups.read`, `groups.manage` (PIN), `stats.read.all`, `stats.read.group`, `stats.export` (PIN), `students.import` (PIN), `students.delete` (PIN), `users.create` (PIN), `tasks.manage` (PIN), `tasks.validate` (PIN), `tasks.propose`, `tasks.assign.group` (PIN), `tasks.assign_self`, `tasks.unassign_self`, `tasks.done_self`, `zones.manage` (PIN), `map.manage_markers` (PIN), `plants.manage` (PIN), `tutorials.manage` (PIN), `visit.manage` (PIN), `audit.read` (PIN), `observations.read.all` (PIN), `observations.read.group`, `forum.group.moderate` |
| `eleve_chevronne` | `tasks.propose` (PIN), `tasks.assign_self`, `tasks.unassign_self`, `tasks.done_self` |
| `eleve_avance` | `tasks.propose`, `tasks.assign_self`, `tasks.unassign_self`, `tasks.done_self` |
| `eleve_novice` | `tasks.assign_self`, `tasks.unassign_self`, `tasks.done_self` |
| `visiteur` | Lecture seule (aucune permission d’action par défaut) |

---

## Paramètres admin (GUI)

Ces routes sont destinées à la console admin et exigent un token avec permissions
`admin.settings.read` / `admin.settings.write` / `admin.settings.secrets.write` + élévation PIN (sauf profils **admin** / **prof** natifs, élévation non requise comme pour le reste du panneau).

| Méthode | URL | Description |
|--------|-----|-------------|
| GET | `/api/settings/public` | Réglages publics consommés par l’UI (accueil, modules, cartes par défaut) |
| GET | `/api/settings/admin` | Liste complète des réglages + métadonnées + cartes |
| PUT | `/api/settings/admin/:key` | Mettre à jour un réglage (`{ value }`) |
| POST | `/api/settings/admin/maps` | Créer une carte (`{ id, label, sort_order?, map_image_url?, is_active? }`) — `id` : slug minuscules/chiffres/tirets (1–31 caractères), réservé `both` interdit |
| PUT | `/api/settings/admin/maps/:id` | Mettre à jour une carte (label, ordre, activation, URL image, padding) |
| POST | `/api/settings/admin/maps/:id/image` | Upload image de plan (`{ image_data }`) |
| GET | `/api/settings/admin/system/logs` | Lecture des logs applicatifs via GUI |
| GET | `/api/settings/admin/system/oauth-debug` | Diagnostic runtime OAuth (sans secrets) : **`admin.settings.read`** + élévation PIN ; JSON avec **`allowedDomains`** / **`allowedEmails`** (restrictions Google). **Doublon fonctionnel** (autre périmètre d’accès) : **`GET /api/admin/oauth-debug`** avec **`X-Deploy-Secret`** — voir section **Administration (secret `DEPLOY_SECRET`)**. |
| GET | `/api/settings/admin/system/species-autofill-providers-test` | Auto-test minimal **Pl@ntNet** (GET `/v2/quota`, clé + connectivité) et **OpenAI** (GET `v1/models?limit=1`) avec les variables d’environnement du processus ; réponse JSON `{ ok, plantnet, openai }` sans aucune clé. Par fournisseur : `configuredForAutofill`, `keyPresent`, `moduleFlagOn`, `tested`, `ok`, `httpStatus`, `latencyMs`, `message` / `error`. |
| POST | `/api/settings/admin/system/restart` | Redémarrage applicatif contrôlé |

Progression n3beurs :
- pilotée directement par les profils `eleve_*` via `roles.min_done_tasks`, `roles.emoji` et `roles.display_order`.
- les anciens réglages `progression.student_role_min_done_*` ne sont plus utilisés.

Tâches / inscriptions n3beurs :
- `tasks.student_max_active_assignments` (entier 0–99, défaut `0`) : plafond **par défaut** du nombre de tâches **actives** (assignations dont la tâche associée n’est pas en statut `validated`, **hors** tâches `all_assignees_done` où le n3beur a déjà une part terminée avec `done_at`) auxquelles un n3beur peut **s’auto-inscrire** via `POST /api/tasks/:id/assign`. `0` = pas de limite par défaut. Si le profil principal a `roles.max_concurrent_tasks` non `NULL`, cette valeur remplace le réglage global pour les utilisateurs de ce profil (`0` sur le profil = pas de limite pour eux). Les affectations effectuées par un n3boss ne sont pas soumises à ce plafond.
- `tasks.recurring_automation_enabled` (booléen, défaut `true`) : active/désactive la duplication **automatique** des tâches récurrentes par le job quotidien (`lib/recurringTasks.js`). Utile pour suspendre la création de clones pendant les vacances. Le mode manuel `npm run tasks:spawn-recurring` (force) reste disponible pour le rattrapage.

Réglage public de réactions :
- `ui.reactions.allowed_emojis` (chaîne, emojis séparés par espaces ou virgules).
- Valeur par défaut : `👍 ❤️ 😂 😮 😢 😡 🔥 👏`.

Affichage carte (zones SVG + repères sur l’onglet Carte), réglages publics `ui.map.*` :
- `emoji_label_center_gap` (entier 6–32, défaut `14`) : distance entre les **centres** de l’emoji et du libellé, multipliée par `inv` (inverse du zoom), identique pour zones et repères.
- `overlay_emoji_size_percent` (entier 70–150, défaut `100`) : échelle des emojis zones et repères.
- `overlay_label_size_percent` (entier 70–150, défaut `100`) : échelle des noms affichés sous les repères (et sous les emojis des zones).

Contenus éditables du site (micro-CMS texte brut) :
- Namespace `content.*` dans les réglages publics, éditable via `PUT /api/settings/admin/:key`.
- Objectif : modifier des textes UI sans redéploiement (accueil/auth, visite, à-propos, messages globaux).
- Format : texte brut uniquement (pas de HTML/Markdown côté API).
- Validation serveur : contraintes `maxLength` par clé ; si dépassé, la route renvoie `400`.
- Fallback frontend : en cas de valeur vide/absente, l’UI conserve un texte de secours local.
- Exemples de clés : `content.auth.title`, `content.visit.subtitle`, `content.about.help_body`, `content.app.loader`.

Aides contextuelles (public) :
- `ui.help.show_context_hints` (booléen, défaut `true`) : affiche/masque les mini-astuces sur Carte, Tâches et Visite.
- `ui.help.pulse_unseen_panels` (booléen, défaut `true`) : active l’animation du bouton `?` tant que l’aide de la section n’a pas été marquée comme vue.
- `content.help.hint_prefix` (chaîne, défaut `Astuce :`) : préfixe affiché devant les mini-astuces.
- `content.help.map_quick_tip`, `content.help.tasks_quick_tip`, `content.help.visit_quick_tip` (chaînes) : textes des mini-astuces par écran.
- `content.help.panel_title_prefix` (chaîne, défaut `💡`) : préfixe du titre des panneaux d’aide `?`.
- `content.help.panel_close_cta` et `content.help.panel_dismiss_cta` (chaînes) : libellés des actions “Fermer” / “Ne plus afficher” des panneaux d’aide.

---

## Zones

| Méthode | URL | n3boss | Description |
|--------|-----|------|-------------|
| GET | `/api/zones` | non | Liste des zones |
| GET | `/api/zones/:id` | non | Détail zone |
| PUT | `/api/zones/:id` | oui | Modifier zone |
| POST | `/api/zones` | oui | Créer zone |
| DELETE | `/api/zones/:id` | oui | Supprimer zone |
| GET | `/api/zones/:id/photos` | non | Liste des photos (méta, tri `sort_order` croissant) |
| GET | `/api/zones/:id/photos/:pid/data` | non (token requis) | Données image : **`302`** vers **`/uploads/zones/...`** si le chemin disque est au format public ; sinon `sendFile` direct |
| POST | `/api/zones/:id/photos` | oui | Ajouter photo (`image_data` base64, `caption`) |
| PUT | `/api/zones/:id/photos/reorder` | oui | Réordonner : corps JSON **`photo_ids`** (ou **`ordered_ids`**) = tableau des `id` dans le nouvel ordre (exactement toutes les photos de la zone) |
| DELETE | `/api/zones/:id/photos/:pid` | oui | Supprimer photo |

- **`GET /api/zones/:id/photos`** : chaque entrée inclut **`image_url`** (URL **`/uploads/zones/{id}/{photoId}.jpg`** pour les fichiers créés par l’API — pas de passage par `/api` pour le chargement navigateur) et **`thumb_url`** (`*.thumb.jpg`, **absent** ou `null` si la vignette n’existe pas, p. ex. module **`sharp`** indisponible sur l’hôte). Le champ **`image_path`** (relatif à `uploads/`) reste exposé.
- Le champ `name` peut commencer par un **emoji de zone** : préfixe (séquence emoji) suivi d’un **espace** puis le libellé ; l’UI carte permet de choisir l’emoji dans une grille ou de coller un pictogramme.
- **`POST /api/zones`** : corps JSON `name`, `points` (≥ 3 sommets `{ xp, yp }` en pourcentage de l’image), `map_id` ; optionnellement `color`, **`living_beings`** (tableau de noms du catalogue, ordre conservé), `current_plant` (colonne legacy, ignorée en persistance si `living_beings` est non vide — alors `current_plant` est stocké vide), `stage`, **`description`** (texte, chaîne vide si absent).
- **`GET /api/zones`** et **`GET /api/zones/:id`** : chaque zone expose **`living_beings_list`** (tableau dérivé de `living_beings` JSON, ordre conservé). La colonne brute `living_beings` n’est pas renvoyée. **`current_plant`** reste en réponse pour compatibilité mais est vide dès qu’au moins un être vivant est listé dans `living_beings_list`.
- **`PUT /api/zones/:id`** : si le corps contient au moins une des clés **`visit_subtitle`**, **`visit_short_description`**, **`visit_details_title`**, **`visit_details_text`**, **`visit_body_json`** (ou alias **`visit_editorial_blocks`**), une ligne **`visit_zones`** est créée ou mise à jour pour ce même `id` (textes visite alignés sur le mode visite), sans modifier `is_active` / `sort_order` d’une ligne déjà présente.
- **Historique cultures** (`zone_history`) : si le corps contient **`living_beings`**, une ligne est ajoutée lorsque l’ancienne valeur de **`current_plant`** en base était non vide et **n’apparaît plus** dans la nouvelle liste (être vivant retiré). Si seul **`current_plant`** est modifié dans le corps (sans `living_beings`), le comportement historique reste aligné sur le changement explicite de ce champ.

---

## Carte (marqueurs)

| Méthode | URL | n3boss | Description |
|--------|-----|------|-------------|
| GET | `/api/map/markers` | non | Liste des repères |
| POST | `/api/map/markers` | oui | Créer repère |
| PUT | `/api/map/markers/:id` | oui | Modifier repère |
| DELETE | `/api/map/markers/:id` | oui | Supprimer repère |
| GET | `/api/map/markers/:id/photos` | non | Liste des photos du repère (méta + **`image_url`**, **`thumb_url`**, tri `sort_order` croissant) — mêmes principes que les photos zone |
| GET | `/api/map/markers/:id/photos/:pid/data` | non (token requis) | Fichier image : **`302`** vers **`/uploads/markers/...`** si chemin public ; sinon `sendFile` |
| POST | `/api/map/markers/:id/photos` | oui | Ajouter photo (`image_data` base64, `caption`) — même principe que les zones |
| PUT | `/api/map/markers/:id/photos/reorder` | oui | Réordonner : corps JSON **`photo_ids`** (ou **`ordered_ids`**) = tableau des `id` dans le nouvel ordre (exactement toutes les photos du repère) |
| DELETE | `/api/map/markers/:id/photos/:pid` | oui | Supprimer photo |

- Corps JSON : notamment `emoji` (pictogramme du repère). Valeur **tronquée à 16 caractères** côté serveur si besoin (colonne `map_markers.emoji`). **`living_beings`** : tableau de noms (ordre conservé) ; **`plant_name`** est une colonne legacy laissée **vide** dès que la liste est non vide (comme **`current_plant`** pour les zones).
- **`GET /api/map/markers`** : chaque repère inclut **`living_beings_list`** (même principe que les zones ; **`plant_name`** vide si la liste est non vide) et, si une ligne existe dans `visit_markers` avec le même `id`, **`visit_subtitle`**, **`visit_short_description`**, **`visit_details_title`**, **`visit_details_text`**, **`visit_body_json`** (sinon `null` pour ces champs visite).
- **`POST`** / **`PUT /api/map/markers/:id`** : si le corps contient au moins une des clés **`visit_subtitle`**, **`visit_short_description`**, **`visit_details_title`**, **`visit_details_text`**, **`visit_body_json`** (ou alias **`visit_editorial_blocks`**), une ligne **`visit_markers`** est créée ou mise à jour pour ce même `id`, sans modifier `is_active` / `sort_order` d’une ligne déjà présente.

---

## Visite guidée

| Méthode | URL | n3boss | Description |
|--------|-----|------|-------------|
| GET | `/api/visit/content?map_id=foret` | non | Contenus publics de visite (zones, repères, médias du plan, tutoriels actifs **pour ce plan**) ; inclut **`mascot_packs`** : packs `sprite_cut` **publiés** pour cette carte (`{ catalog_id, label, pack }` chacun — voir **`docs/MASCOT_PACK.md`**) |
| GET | `/api/visit/mascot-packs?map_id=foret` | oui | Liste tous les packs mascotte (brouillons + publiés) pour la carte + `allowed_catalog_ids` (modèles de base autorisés côté serveur) — **`visit.manage`** + élévation PIN |
| POST | `/api/visit/mascot-packs` | oui | Créer un pack : `{ map_id, pack?, label?, is_published?, clone_from_pack_id?, clone_from_catalog_id? }` — sans `pack` ni clone : brouillon **v2** complet (Renard 2 sous `/assets/mascots/renard2-cut/frames/`). **`clone_from_pack_id`** (UUID, même `map_id`) : copie JSON + fichiers uploadés vers un nouveau pack. **`clone_from_catalog_id`** : accepte toutes les mascottes catalogue connues du serveur ; en cas d’ID invalide, **400** avec `allowed_catalog_ids`. |
| GET | `/api/visit/mascot-sprite-library/:mapId/assets` | oui | Liste PNG partagés par carte — **`visit.manage`** + élévation |
| GET | `/api/visit/mascot-sprite-library/:mapId/assets/:filename` | non | Image PNG si une ligne bibliothèque existe pour ce couple (`map_id`, `filename`). **Aucune** vérification de rôle sur cette URL : la protection repose sur le fait que seuls les profs peuvent **créer** des entrées bibliothèque et sur la discrétion des URLs référencées dans les packs publiés. |
| POST | `/api/visit/mascot-sprite-library/:mapId/assets` | oui | Upload PNG : `{ filename, image_data }` — **`uploads/visit_mascot_sprite_library/{map_id}/`** ; le pack peut utiliser **`framesBase`** = `/api/visit/mascot-sprite-library/{mapId}/assets/` |
| DELETE | `/api/visit/mascot-sprite-library/:mapId/assets/:filename` | oui | Supprime l’entrée et le fichier |
| PUT | `/api/visit/mascot-packs/:id` | oui | Mettre à jour `label`, `pack`, `is_published` (corps : `map_id` requis, identique à la ligne) |
| DELETE | `/api/visit/mascot-packs/:id` | oui | Supprime le pack et le dossier **`uploads/visit_mascot_packs/{id}/`** |
| GET | `/api/visit/mascot-packs/:id/assets` | oui | Liste les PNG uploadés du pack : `{ pack_id, assets: [{ filename, url }] }` — **`visit.manage`** + élévation PIN |
| GET | `/api/visit/mascot-assets` | oui | Inventaire global des assets mascotte du site : catalogue statique (`public/assets/mascots`), assets uploadés par pack, bibliothèques par carte. Réponse `{ assets, counts }` avec `source` (`public`/`pack`/`library`) |
| GET | `/api/visit/mascot-packs/:packId/assets/:filename` | oui | Fichier PNG du pack. **JWT obligatoire** (middleware `authenticate`) : sans jeton valide → **401**. Pack **publié** (`is_published`) → tout utilisateur **authentifié** peut lire l’asset. Pack **brouillon** → **`visit.manage`** + élévation PIN requises, sinon **403**. |
| POST | `/api/visit/mascot-packs/:id/assets` | oui | Upload PNG : `{ filename, image_data }` (base64 / data URL) — fichier sous **`uploads/visit_mascot_packs/{id}/`** ; le JSON du pack peut référencer **`framesBase`** = `/api/visit/mascot-packs/{id}/assets/` |
| DELETE | `/api/visit/mascot-packs/:id/assets/:filename` | oui | Supprime un fichier uploadé du pack |
| GET | `/api/visit/progress` | non | Progression des cibles vues : mode **student** si `Authorization: Bearer` = jeton **élève** (l’identité est tirée du jeton ; le paramètre `student_id` est refusé sauf s’il correspond au même compte) ; sinon mode **anonymous** via cookie signé `anon_visit_token` (pas de `student_id` en query) |
| POST | `/api/visit/seen` | non | Marquer/démarquer une cible vue (`{ target_type, target_id, seen }`). Avec jeton **élève**, la progression est enregistrée pour ce compte uniquement (le corps ne doit pas contenir `student_id`, ou il doit être identique au compte du jeton). Sans jeton élève, enregistrement **anonyme** (cookie) ; tout `student_id` dans le corps sans jeton élève valide → **401** |
| GET | `/api/visit/stats` | oui | KPI de visite (sessions, complétion, breakdown n3beur/anonyme) |
| POST | `/api/visit/zones` | oui | Créer une zone de visite |
| PUT | `/api/visit/zones/:id` | oui | Modifier une zone de visite |
| DELETE | `/api/visit/zones/:id` | oui | Supprimer une zone de visite |
| POST | `/api/visit/markers` | oui | Créer un repère de visite |
| PUT | `/api/visit/markers/:id` | oui | Modifier un repère de visite |
| DELETE | `/api/visit/markers/:id` | oui | Supprimer un repère de visite |
| PUT | `/api/visit/media/reorder` | oui | Réordonner les médias d’une cible : `{ target_type: "zone"|"marker", target_id, ordered_ids }` (ou **`photo_ids`**) — tableau des `id` dans le nouvel ordre (exactement tous les médias de la cible) |
| GET | `/api/visit/media/:id/data` | non | Fichier image pour un média visite stocké sur disque (`image_path`) |
| POST | `/api/visit/media` | oui | Ajouter un média sur une cible de visite |
| PUT | `/api/visit/media/:id` | oui | Modifier un média de visite |
| DELETE | `/api/visit/media/:id` | oui | Supprimer un média de visite |
| PUT | `/api/visit/tutorials` | oui | Définir la sélection des tutoriels affichés en visite pour un plan : `{ map_id?, tutorial_ids }` (`map_id` défaut `foret`) — remplace uniquement les entrées de `visit_tutorials` pour cette carte |
| GET | `/api/visit/sync/options?map_id=foret` | oui | Récupérer les zones/repères disponibles côté carte et côté visite pour import sélectif |
| POST | `/api/visit/sync` | oui | Import sélectif bidirectionnel (`{ map_id, direction: "map_to_visit" \| "visit_to_map", zone_ids, marker_ids }`) |
| POST | `/api/visit/rebuild-from-map` | oui | Réaligner **toute** la visite du plan sur la carte : corps `{ map_id? }` (défaut `foret`). Supprime puis recrée les lignes **`visit_zones`** et **`visit_markers`** pour ce `map_id` à partir de **`zones`** / **`map_markers`** ; pour chaque **id** encore présent sur la carte, **réinjecte** sous-titre, textes de détails, `is_active`, `sort_order`, `created_at` et **conserve** les lignes **`visit_media`** (cibles inchangées). Retire médias + progression pour les cibles visite **sans** équivalent carte. Réponse : `{ ok, map_id, removed: { zones, markers }, imported: { zones, markers } }`. |

**Packs mascotte (validation serveur)** : les **POST** / **PUT** sur `/api/visit/mascot-packs` chargent la validation Zod (v1 et v2) depuis **`lib/visit-pack/`** (`mascotPack.js`, `visitMascotState.js`, `visitMascotInteractionEvents.js`, générés par **`npm run build`** ou **`npm run sync:visit-pack-lib`**). Sans miroir `lib/visit-pack/` complet **ou** sans dépendance runtime `zod`, l’API renvoie **503** avec `code: mascot_pack_module_unavailable` (diagnostic dans `details.reason`).

- **`clone_from_catalog_id`** : la liste des IDs acceptés est définie **côté serveur** (`routes/visit.js`, métadonnées catalogue / templates). Elle doit rester alignée avec le catalogue frontend **`src/utils/visitMascotCatalog.js`** (aperçu studio, libellés) ; en cas d’ID inconnu, la réponse **400** inclut **`allowed_catalog_ids`**.

Contraintes importantes :

- **`GET /api/visit/content`** : chaque zone renvoyée inclut **`description`** (texte de la table **`zones`**, jointure sur le même `id`) ; chaque repère inclut **`note`** (table **`map_markers`**, même principe). Ces champs sont **`null`** s’il n’y a pas de ligne carte correspondante ou si le texte est vide. Les zones et repères dont **`is_active`** est **explicitement** désactivé (`0`, `false`, chaîne `'0'`) sont exclus ; les autres valeurs « actives » (y compris variantes driver) restent listées.
- **Blocs éditoriaux (nouveau)** : `GET /api/visit/content` expose **`visit_editorial_blocks`** (tableau ordonné) pour chaque zone/repère. Si `visit_body_json` est présent en base, le serveur l’utilise en priorité ; sinon il génère un fallback compatible depuis `visit_short_description`, `visit_details_*` et `visit_media`.
- **Écriture blocs** : `POST/PUT /api/visit/zones(:id)` et `POST/PUT /api/visit/markers(:id)` acceptent **`visit_editorial_blocks`** (alias **`body_json`**) ; le serveur normalise et persiste dans `visit_zones.body_json` / `visit_markers.body_json`.
- **Schéma de bloc** : `paragraph` (`markdown`), `heading` (`text`, `level` 2..4), `image` (`media_ids` 1..2, `layout`, `size`, `align`, `caption` optionnel). Les `media_ids` doivent pointer vers des entrées de `visit_media` de la cible.
- **Photos galerie carte (visite)** : pour chaque zone / repère, **`map_lead_photo`** est la **première** entrée de la galerie carte (`zone_photos` / `marker_photos`, tri `sort_order` puis `id`, aligné sur les routes galerie carte) ou **`null`** ; **`map_extra_photos`** est le **tableau** des entrées suivantes, chacune au même format que **`map_lead_photo`** (`{ id, image_url, thumb_url?, caption }` — **`thumb_url`** optionnel comme sur **`GET /api/zones/:id/photos`**), **vide** s’il n’y a qu’une image ou aucune. Le client peut les afficher en tête du corps du bloc « Détails » visite (avant le texte `visit_details_text`).
- `direction=map_to_visit` : copie/synchronise les zones et repères de la carte vers la visite.
- **`POST /api/visit/rebuild-from-map`** : alternative à « tout supprimer à la main puis réimporter » : une seule opération atomique (transaction BDD) qui vide et recrée la couche visite du plan tout en **fusionnant** l’éditorial existant par **id** ; les fichiers image des cibles définitivement retirées sont effacés du disque **après** commit réussi.
- `direction=visit_to_map` : copie/synchronise les zones et repères de la visite vers la carte.
- L’import est **sélectif** (listes `zone_ids` / `marker_ids`) et en **upsert** (pas de doublon si l’ID existe déjà).
- Les routes de gestion (`/zones`, `/markers`, `/media`, `/tutorials`, `/sync/*`) exigent la permission n3boss `visit.manage` (session élevée).
- **Cookie visite anonyme** : variable optionnelle `VISIT_COOKIE_SECRET` (sinon repli sur `JWT_SECRET`, puis secret de dev hors production) — voir `.env.example`.
- **Prévisualisation prof** : en session « aperçu élève », le client n’envoie pas de jeton élève pour la visite ; la progression suit le parcours **anonyme** (cookie), pas le compte réel de l’élève prévisualisé.
- **Médias photos** : **`POST /api/visit/media`** accepte soit **`image_url`** (lien HTTPS ou chemin servi par l’app, ex. `/uploads/…`), soit **`image_data`** (JPEG base64 ou data URL, même principe que `POST /api/zones/:id/photos`). Les fichiers envoyés via `image_data` sont enregistrés sous `uploads/visit_media/{id}.jpg` ; la réponse et **`GET /api/visit/content`** exposent alors **`image_url`** = `/api/visit/media/:id/data`. Chaque nouveau média reçoit un **`sort_order`** en fin de liste (les listes dans **`GET /api/visit/content`** sont triées par `sort_order` puis `id`). **`PUT /api/visit/media/reorder`** met à jour l’ordre en une fois. **`PUT /api/visit/media/:id`** : avec **`image_data`**, remplace l’image locale ; avec **`image_url`** explicite, passe en média « URL uniquement » (fichier local précédent supprimé) ; sans les deux, met à jour **`caption`** / **`sort_order`** uniquement.

### Mascotte visite (client) — diagnostic rendu

La mascotte de visite est pilotée côté frontend (catalogue + renderer), mais son affichage dépend des données publiques renvoyées par `GET /api/visit/content`.

- **Visibilité côté scène** : attributs de `.visit-map-stage`
  - `data-visit-mascot-visibility` (`visible` / `hidden`)
  - `data-visit-mascot-reason` (ex. `no-public-content`, `mode-not-view`)
- **Shell mascotte** : attributs de `[data-mascot-id]`
  - `data-renderer` (`rive`, `spritesheet`, `sprite_cut`, `fallback-static`)
  - `data-mascot-state` (ex. `idle`, `walking`, `running`, `talk`, `inspect`, `map_read`, `celebrate`)
  - `data-mascot-shape` (silhouette fallback)
- **Rive** : `[data-rive-status]` (`loading`, `loaded`, `playing:<anim>`, `fallback-no-animation`, `error`)
- **Spritesheet** : `[data-spritesheet-status]` (`ready`, `fallback`)

Pour une mascotte spritesheet (ex. OLU), vérifier aussi l’asset statique servi par l’app (`/assets/mascots/olu/olu-spritesheet.png`) ; en cas d’échec de chargement, le renderer bascule en `fallback-static`.

---

## Tutoriels (`/api/tutorials`)

| Méthode | URL | n3boss | Description |
|--------|-----|------|-------------|
| GET | `/api/tutorials` | non | Liste des tutoriels **actifs**, triés par `sort_order` puis titre ; chaque entrée inclut `zone_ids`, `marker_ids`, `zones_linked`, `markers_linked` (carte principale), `linked_tasks_count` |
| GET | `/api/tutorials?include_inactive=1` | oui (`tutorials.manage`, prof/admin) | Liste incluant les tutoriels archivés (`is_active = 0`) |
| GET | `/api/tutorials/:id` | non | Détail (actif seulement pour le public) ; query `include_inactive=1`, `include_content=1` pour la gestion ; mêmes champs de liaison carte que la liste |
| GET | `/api/tutorials/me/read-ids` | JWT obligatoire | `{ "tutorial_ids": number[] }` — tutoriels que l’utilisateur connecté a **marqués comme lus** (engagement explicite) |
| POST | `/api/tutorials/:id/acknowledge-read` | JWT obligatoire | Corps **`{ "confirm": true }`** (obligatoire, sinon `400`). Accusé de lecture pour le tutoriel **actif** `:id` ; `200` : `{ "success", "tutorial_id", "acknowledged_at" }` ; `404` si absent ou inactif |
| GET | `/api/tutorials/:id/linked-tasks` | non | Tâches liées (`task_tutorials`) : `{ "tasks": [ … ] }` avec `id`, `title`, `status`, `map_id`, `map_label`, `location_hint` ; `?include_inactive=1` pour tutoriel archivé (gestionnaires) |
| POST | `/api/tutorials` | oui | Création (`title`, `type`, `summary`, contenu selon le type, `sort_order`, etc.) ; optionnel : `zone_ids`, `marker_ids` (identifiants zones/repères — **tous sur la même carte**). **Type `html`** : si seul `source_file_path` est fourni (chemin autorisé `/tutos/...` sur le serveur), le fichier est lu une fois et le HTML est stocké en `html_content` ; `source_file_path` est alors effacé (aligné sur l’édition « contenu en base »). |
| PUT | `/api/tutorials/:id` | oui | Mise à jour (dont `sort_order`, `is_active`, `zone_ids`, `marker_ids`). **Type `html`** : même règle que le POST si le résultat combiné n’a que `source_file_path` sans `html_content` — lecture fichier puis stockage en `html_content`, `source_file_path` effacé. |
| PUT | `/api/tutorials/reorder` | oui | Réordonnancement global : corps `{ tutorial_ids: number[] }` — doit lister **tous** les IDs de la table `tutorials` **exactement une fois**, dans l’ordre souhaité (positions 0, 1, 2…) |
| DELETE | `/api/tutorials/:id` | oui | Archive (passe `is_active` à 0) |
| GET | `/api/tutorials/:id/view` | non | Prévisualisation HTML (actifs) |
| GET | `/api/tutorials/:id/download/html` | non | Téléchargement HTML |
| GET | `/api/tutorials/:id/download/pdf` | non | Export PDF (contenu HTML) |

- **GET /api/tutorials/:id/view** : la réponse HTML inclut un script en fin de document qui intercepte les clics sur les liens en **target="_blank"** ou **target="_top"** et impose la navigation dans la **même frame** (utile pour l’affichage en iframe dans l’application, notamment les anciennes fiches HTML importées). **GET …/download/html** renvoie le document **sans** ce script.

---

## Biodiversité (`/api/plants`)

| Méthode | URL | n3boss | Description |
|--------|-----|------|-------------|
| GET | `/api/plants` | non | Liste des entrées biodiversité |
| GET | `/api/plants/autofill?q=...&hint_scientific=...&hint_name=...&sources=...` | oui | Pré-saisie assistée multi-sources (suggestions de champs + photos/licences, sans écriture BDD) ; paramètres `hint_*` et `sources` optionnels |
| POST | `/api/plants/plantnet-identify` | oui | Identification d’espèce par **images** (proxy Pl@ntNet `POST /v2/identify`, sans écriture BDD). Corps JSON : `{ "images": [ { "organ": "leaf", "imageData": "<data URL ou base64>" } ], "project"?: string, "nbResults"?: number, "lang"?: string }` — 1 à 5 images, mêmes organes que l’API Pl@ntNet (`auto`, `leaf`, `flower`, …). Réponse : `predictions[]` (`score`, `scientificName`, `scientificNameWithoutAuthor`, `commonNames`, `genus`, `family`), `bestMatch`, `version`, `remainingIdentificationRequests`, `attribution`. **503** si service indisponible. Nécessite `SPECIES_AUTOFILL_PLANTNET=1` et `PLANTNET_API_KEY` côté serveur. |
| GET | `/api/plants/me/discovered-ids` | JWT obligatoire | `{ "plant_ids": number[] }` — identifiants des fiches catalogue pour lesquelles l’utilisateur a au moins une **observation** enregistrée (engagement explicite) |
| GET | `/api/plants/me/observation-counts` | JWT obligatoire | Query **`plant_ids`** : liste d’IDs séparés par des virgules (ou espaces), entiers positifs, **max 200** (troncature silencieuse au-delà). Réponse `{ "counts": { "<id>": { "my_observation_count": number, "site_observation_count": number }, ... } }` — totaux pour l’utilisateur connecté et pour **tous** les utilisateurs sur chaque fiche demandée ; fiches sans ligne renvoient `0` / `0` |
| POST | `/api/plants` | oui | Créer une entrée biodiversité |
| PUT | `/api/plants/:id` | oui | Modifier une entrée biodiversité |
| DELETE | `/api/plants/:id` | oui | Supprimer une entrée biodiversité |
| POST | `/api/plants/:id/acknowledge-discovery` | JWT obligatoire | Corps **`{ "confirm": true }`** (obligatoire, sinon `400`). Enregistre une **observation** (engagement terrain + lecture de fiche) pour la fiche `:id` ; chaque appel ajoute une ligne (compteurs incrémentés). `200` : `{ "success", "plant_id", "observed_at", "my_observation_count", "site_observation_count" }` ; `404` si la fiche n’existe pas |
| POST | `/api/plants/:id/photo-upload` | oui | Uploader une photo locale pour un champ `photo*` |
| POST | `/api/plants/import` | oui | Importer des fiches biodiversité (CSV/XLSX/Google Sheet) |

`GET /api/plants` renvoie les champs historiques (`id`, `name`, `emoji`, `description`) et les champs de biodiversité:
`second_name`, `scientific_name`, `group_1`, `group_2`, `group_3`, `group_4`, `habitat`, `photo`, `nutrition`,
`agroecosystem_category`, `longevity`, `remark_1`, `remark_2`, `remark_3`, `reproduction`, `size`,
`sources`, `ideal_temperature_c`, `optimal_ph`, `ecosystem_role`, `geographic_origin`, `human_utility`,
`harvest_part`, `planting_recommendations`, `preferred_nutrients`, `photo_species`, `photo_leaf`,
`photo_flower`, `photo_fruit`, `photo_harvest_part`.

`POST /api/plants` et `PUT /api/plants/:id` acceptent ces mêmes champs en JSON. Les champs texte vides
des métadonnées biodiversité sont normalisés en `null`.

`POST /api/plants/:id/photo-upload` (n3boss):

- Body: `{ field, imageData, position? }`
- `field` doit être l'un des champs photo (`photo`, `photo_species`, `photo_leaf`, `photo_flower`, `photo_fruit`, `photo_harvest_part`)
- `imageData` doit être une Data URL image (png/jpg/webp/gif/bmp/avif)
- `position` optionnel (`"prepend"` ou `"append"`) fusionne l'URL uploadée avec les liens déjà présents dans le champ au lieu de les remplacer (utilisé par le flux Pl@ntNet)
- Réponse: `{ field, url, value, plant }`

`POST /api/plants/import` (n3boss):

- Body (source fichier):
  - `{ sourceType: "file", strategy, dryRun, fileName, fileDataBase64 }`
- Body (source Google Sheet):
  - `{ sourceType: "gsheet", strategy, dryRun, gsheetUrl }`
- Body (source standardisée optionnelle):
  - `{ sourceType: "rows", strategy, dryRun, rows: [...] }`

Stratégies:

- `upsert_name` : met à jour si `name` existe déjà, sinon crée.
- `insert_only` : crée uniquement les nouvelles entrées.
- `replace_all` : remplace entièrement le catalogue (bloqué si lignes invalides).

Réponse:

- `{ report }` avec:
  - `totals.received`, `totals.valid`, `totals.created`, `totals.updated`,
  - `totals.skipped_existing`, `totals.skipped_invalid`,
  - `preview` (aperçu des lignes valides),
  - `errors` (liste des erreurs ligne/champ).

`GET /api/plants/autofill?q=...` (n3boss):

- Route en lecture seule (aucune création/modification de fiche).
- Auth: permission `plants.manage` (élévation requise selon profil).
- Paramètres query:
  - `q` (obligatoire, 2 à 120 caractères) : nom courant ou scientifique recherché.
  - `hint_scientific` (optionnel, max 120 caractères) : nom scientifique déjà saisi dans le formulaire (améliore la graine taxonomique, Catalogue of Life, etc.).
  - `hint_name` (optionnel, max 120 caractères) : nom courant déjà saisi ; injecté dans le contexte OpenAI comme indice utilisateur.
  - `sources` (optionnel) : liste d’identifiants de sources **séparés par des virgules** (ex. `wikipedia,wikidata,gbif`) ; seuls les ids reconnus sont pris en compte, les autres sont **ignorés**. Valeurs reconnues : `wikipedia`, `wikidata`, `gbif`, `gbif_traits`, `inaturalist`, `catalogue_of_life`, `gbif_vernacular`, `wikipedia_en`, `wikipedia_heuristic`, `trefle`, `openai`. **Défaut** (paramètre absent, vide ou sans aucun id valide) : toutes les sources reconnues. Les extensions **Trefle** / **OpenAI** ne sont interrogées que si leur id figure dans la liste **et** que les variables d’environnement requises sont déjà activées (comportement inchangé si désactivées côté serveur). Les dépendances sont respectées côté agrégateur (ex. `gbif_traits` et `gbif_vernacular` seulement si `gbif` est autorisé et qu’un `usageKey` est disponible ; pas d’appel **Wikipedia EN** si **Wikipedia FR** est exclu).
- **Cache** : la clé de cache inclut `q`, les hints **et** la liste normalisée de `sources` (empreinte SHA-256 tronquée) : deux appels avec le même `q` mais des filtres de sources différents ne partagent pas la même entrée de cache.
- Réponse JSON:
  - `query`: requête normalisée,
  - `confidence`: score global `0..1`,
  - `fields`: objet de suggestions mappées vers les champs ForetMap (`name`, `scientific_name`, `group_*`, `description`, etc.),
  - `field_sources`: provenance par champ (source, confiance, alternatives éventuelles),
  - `photos`: tableau de propositions `{ field, url, license, credit, source_url, source, confidence }`,
  - `sources`: sources effectivement interrogées `{ source, confidence, source_url }`,
  - `warnings`: avertissements non bloquants (source indisponible, qualité des données, photos filtrées...).
- Comportement:
  - résultats agrégés depuis plusieurs sources externes publiques : **Wikipedia (FR)** avec repli **opensearch** ; **Wikidata** (dont **P366** / **P183** / **P9714** pour utilité, endémisme / aire d’occurrence, libellés via `wbgetentities`) ; **GBIF** (`species/match`, `usageKey`) ; **GBIF traits** (`/v1/species/{usageKey}` + `/descriptions`, source interne `gbif_traits`, confiance modérée : habit / zone / écologie textuels et avertissements de statut taxonomique) ; **Catalogue of Life** lorsqu’un nom scientifique est connu ; **iNaturalist** (recherche taxons, résumé Wikipedia, photo HTTPS, indices **extinction / statut de conservation** lorsque présents) ; **noms vernaculaires GBIF** (`/species/{usageKey}/vernacularNames`, langues `fra` / `fre` / `fr`) pour enrichir **`second_name`** ; **Wikipedia EN** (résumé) en secours si l’extrait FR est trop court ; **heuristiques** sur l’extrait FR (`wikipedia_heuristic`, faible confiance : température, pH, taille, longévité, indices culture / récolte / plantation) ;
  - le nom scientifique « graine » pour les requêtes secondaires privilégie **`hint_scientific`** (si forme binomiale plausible), puis **GBIF** puis **Wikidata** (meilleure désambiguïsation quand le nom vulgaire est ambigu) ;
  - avec un filtre **`sources`** restreint (sans GBIF/Wikidata/Wikipedia), le **contexte OpenAI** s’appuie tout de même sur **`q`**, **`hint_name`** et **`hint_scientific`** : le corps envoyé à OpenAI inclut le texte de recherche et les indices formulaire pour limiter les réponses vides lorsque les autres sources ne tournent pas ;
  - après fusion des sources, une passe **« trous uniquement »** : champs texte encore vides peuvent être complétés par une requête **OpenAI ciblée** (`openai_gap`, si `SPECIES_AUTOFILL_OPENAI=1`) sur les seules clés encore vides parmi les champs autorisés LLM, dans la limite du budget temps restant (sinon la passe est ignorée) ;
  - pour le champ **`description`**, la fusion applique un **ordre de priorité par source** (Wikidata / Wikipedia au-dessus d’iNaturalist ou GBIF) afin qu’une description courte mais fiable ne soit pas remplacée par un résumé périphérique plus long ;
  - extensions optionnelles (voir [`docs/SPECIES_AUTOFILL_EXTENSIONS.md`](SPECIES_AUTOFILL_EXTENSIONS.md)) : **Trefle**, **OpenAI** (complément LLM avec **contexte multi-sources** agrégé côté serveur si `SPECIES_AUTOFILL_OPENAI=1`) ; l’**identification par image Pl@ntNet** est exposée séparément via **`POST /api/plants/plantnet-identify`** (hors agrégateur `sources`) ;
  - cache mémoire TTL côté serveur pour limiter la latence et les quotas,
  - budget global d’agrégation côté serveur (ordre de grandeur **12 s** wall-clock, timeouts HTTP dynamiques et plafond par requête) afin de limiter les **503** renvoyés par les reverse proxies lorsque les sources externes sont lentes,
  - validation/filtrage des URLs photo avant retour.
- Limites connues:
  - des homonymies peuvent remonter des descriptions hors contexte botanique (ex. nom ambigu),
  - le score de confiance indique une tendance de qualité, pas une vérité scientifique.
  - les champs issus d’heuristiques ou de blocs GBIF « descriptions » restent **indicatifs** (langues mixtes, sources hétérogènes).
- Bonnes pratiques:
  - la pré-saisie est une **suggestion** : validation humaine nécessaire avant sauvegarde,
  - vérifier la cohérence taxonomique (`scientific_name`, `group_*`) avant publication,
  - vérifier la licence/crédit photo avant publication.

---

## Groupes / sous-groupes

Toutes les routes ci-dessous exigent un utilisateur connecté (`Authorization: Bearer <token>`).

| Méthode | URL | n3boss | Description |
|--------|-----|--------|-------------|
| GET | `/api/groups/options` | non | Liste compacte des groupes accessibles (id, nom, parent) pour les filtres UI |
| GET | `/api/groups` | oui (`groups.read` ou `groups.manage`) | Liste détaillée + arborescence + membres + scopes |
| POST | `/api/groups` | oui (`groups.manage`) | Créer un groupe |
| PATCH | `/api/groups/:id` | oui (`groups.manage`) | Mettre à jour nom/slug/type/parent/activation |
| DELETE | `/api/groups/:id` | oui (`groups.manage`) | Supprimer un groupe (les enfants sont détachés) |
| GET | `/api/groups/:id/members` | oui (`groups.read` ou périmètre groupe) | Lire les membres d’un groupe |
| PUT | `/api/groups/:id/members` | oui (`groups.manage`) | Remplacer membres (`member_user_ids`), responsables (`manager_user_ids`) et scopes (`scope_map_ids`, `scope_project_ids`) |

Contrat principal :
- `group_members.role_in_group` : `member` ou `manager`.
- `group_scopes` porte le périmètre map/projet par défaut du groupe (optionnel ; vide = non borné).
- Les filtres transverses utilisent `group_id` (et `subgroup_id` côté stats) pour les lectures ciblées.

---

## Tâches

| Méthode | URL | n3boss | Description |
|--------|-----|------|-------------|
| GET | `/api/tasks` | non | Liste des tâches (avec assignments) ; tri par **degré d’importance** puis date limite (voir ci-dessous) |
| GET | `/api/tasks/referent-candidates` | oui (`tasks.manage` + élévation, sauf profils **admin** / **prof** natifs) | Liste des utilisateurs **actifs** (enseignants puis n3beurs) pour le sélecteur « référents » en création/édition de tâche |
| GET | `/api/tasks/:id` | non | Détail tâche |
| GET | `/api/tasks/:id/image` | non | Fichier image illustrative (fallback) ; en pratique `image_url` pointe vers **`/uploads/tasks/…`** (fichier statique, même origine) |
| POST | `/api/tasks` | oui | Créer tâche |
| POST | `/api/tasks/reorder-project` | oui | Réordonner les tâches d’un projet (drag & drop prof/admin) |
| PUT | `/api/tasks/:id` | oui\* | Modifier tâche |
| DELETE | `/api/tasks/:id` | oui | Supprimer tâche |
| POST | `/api/tasks/:id/assign` | non | S’assigner (n3beur) |
| POST | `/api/tasks/:id/assign-group` | oui (`tasks.assign.group` + élévation) | Affecter en masse les n3beurs d’un groupe à une tâche |
| POST | `/api/tasks/:id/unassign` | non | Se désassigner |
| POST | `/api/tasks/:id/done` | non | Marquer comme fait (commentaire/image) |
| GET | `/api/tasks/:id/logs` | non | Logs de la tâche |
| GET | `/api/tasks/:id/logs/:logId/image` | non | Image d’un log (fichier disque) |
| POST | `/api/tasks/:id/validate` | oui | Valider la tâche (depuis n’importe quel statut sauf `validated`) |

\* Un n3beur peut aussi modifier **sa propre proposition** (statut `proposed`, préfixe de description `Proposition n3beur:`) ; les champs sensibles (`status`, `project_id`, `tutorial_ids`, `referent_user_ids`, `recurrence`, `completion_mode`) restent réservés aux profils avec `tasks.manage`.

**Photo illustrative (fiche tâche)** — `POST /api/tasks`, `POST /api/tasks/proposals`, `PUT /api/tasks/:id` :

- Corps JSON optionnel : `imageData` (data URL ou base64, **JPEG**, **PNG** ou **WebP**). Taille décodée max **4 Mo** ; signature binaire contrôlée côté serveur.
- `PUT` : `remove_task_image: true` supprime l’image existante (fichier disque + colonne).
- Les listes et le détail exposent `image_url` (`/uploads/tasks/<id>.<ext>` en temps normal, ou `/api/tasks/:id/image` en repli si le chemin disque est atypique) lorsqu’une image est enregistrée ; le chemin interne `image_path` n’est pas renvoyé.

Contraintes principales :

- Statuts tâche supportés : `available`, `in_progress`, `done`, `validated`, `proposed`, `on_hold`.
- Modes de validation supportés (`completion_mode`) : `single_done` (défaut), `all_assignees_done`.
- Niveaux de danger (`danger_level`) : optionnel ; valeurs `safe`, `potential_danger`, `dangerous`, `very_dangerous`. Si non renseigné, le champ vaut **`null`** en réponse (pas de niveau implicite). `POST /api/tasks`, `PUT /api/tasks/:id` et `POST /api/tasks/proposals` : champ omis, chaîne vide ou **`null`** → enregistrement **`null`** ; valeur invalide → **400**. Les n3beurs peuvent le modifier sur **leur** proposition (`proposed`) comme les autres champs non réservés au prof.
- Niveaux de difficulté (`difficulty_level`) : optionnel ; valeurs `easy`, `medium`, `hard`, `very_hard`. Mêmes règles que `danger_level` (`null` si non renseigné). Les clones **récurrents** reprennent les niveaux de la tâche source (y compris **`null`**).
- Degré d’importance (`importance_level`) : optionnel ; valeurs `not_important`, `low`, `medium`, `high`, `absolute`. Si non renseigné, **`null`** en réponse. `POST /api/tasks`, `PUT /api/tasks/:id` et `POST /api/tasks/proposals` : champ omis, chaîne vide ou **`null`** → enregistrement **`null`** ; valeur invalide → **400**. Les clones **récurrents** reprennent le même degré que la tâche source (y compris **`null`**).
- **Tri `GET /api/tasks`** : d’abord les tâches avec un `sort_order > 0` (ordre manuel prof/admin, croissant), puis les autres tâches avec un `importance_level` explicite (priorité décroissante `absolute` → `not_important`) ; dans chaque groupe, `due_date` croissante.
- **Réordonnancement projet** (`POST /api/tasks/reorder-project`) : payload `{ project_id, task_ids }` (tableau d’IDs tâche dans l’ordre souhaité). Contrat :
  - route réservée à `tasks.manage` (+ élévation selon profil) ;
  - `project_id` doit exister ;
  - les IDs transmis doivent appartenir au projet cible (sinon `400`) ;
  - les tâches non listées explicitement sont conservées en fin de projet, dans leur ordre courant.
- Statuts projet supportés : `active`, `on_hold`, `completed` (synchro automatique), `validated` (validation manuelle n3boss) — retournés dans `project_status` sur les payloads de tâche.
- Champ optionnel `start_date` (`YYYY-MM-DD`) sur les tâches ; tant que la date n’est pas atteinte, la tâche est considérée en attente (`is_before_start_date: true` dans les payloads).
- Si une tâche est `on_hold` **ou** si son projet est `on_hold`, `completed` ou `validated`, `POST /api/tasks/:id/assign` renvoie `400` (inscription n3beur bloquée ; messages dédiés pour projet terminé ou validé).
- Si `start_date` est dans le futur, `POST /api/tasks/:id/assign` renvoie aussi `400` (inscription n3beur bloquée jusqu’à la date de départ).
- Si le **plafond effectif** (profil `roles.max_concurrent_tasks` si défini, sinon réglage `tasks.student_max_active_assignments`) est strictement positif et que l’action est une **auto-inscription n3beur**, le serveur compte les assignations actives (tâches non `validated`, en excluant pour `all_assignees_done` les lignes où le n3beur a déjà `done_at`) : au-delà de la limite, réponse **`400`** avec `code: "TASK_ENROLLMENT_LIMIT"`, `maxActiveAssignments`, `currentActiveAssignments` et un message d’erreur explicite.
- `POST /api/tasks` et `PUT /api/tasks/:id` acceptent `completion_mode` pour les profils autorisés, et `danger_level` / `difficulty_level` / `importance_level` (prof + proposition n3beur sur les champs autorisés).
- `POST /api/tasks` et `PUT /api/tasks/:id` acceptent aussi `group_id` (optionnel) pour lier la tâche à un groupe pédagogique.
- **Référents** : `referent_user_ids` (tableau d’UUID utilisateurs, max **15**) — uniquement comptes **actifs** `teacher` ou `student`. Les réponses incluent `referent_user_ids` et `referents_linked` (`id`, `user_type`, `label` affichable, `role_slug` du profil RBAC primaire si présent). Pas d’adresse e-mail dans ces objets. Les clones **récurrents** héritent des mêmes référents que la tâche source.
- **Biodiversité** : `living_beings` (tableau de **noms** d’espèces, comme sur les zones et repères) — optionnel sur `POST /api/tasks`, `PUT /api/tasks/:id` et `POST /api/tasks/proposals`. Les réponses exposent `living_beings_list` (tableau de chaînes) ; la colonne brute `living_beings` (JSON en base) n’est pas renvoyée. Tableau vide ou omission côté écriture : enregistrement **`null`**. Les clones **récurrents** reprennent la même liste que la tâche source.
- Les payloads tâche exposent `completion_mode`, `danger_level`, `difficulty_level`, `importance_level`, `assignees_total_count` et `assignees_done_count`.
- `POST /api/tasks/:id/done` :
  - en `single_done`, la tâche passe en `done` dès la déclaration de fin ;
  - en `all_assignees_done`, chaque assigné valide individuellement, puis la tâche passe en `done` uniquement quand tous les assignés ont terminé.
  - **N3boss / validation** : avec en-tête `Authorization: Bearer <token>` et un profil disposant de `tasks.manage` **ou** de `tasks.validate` (même sans `tasks.manage`, par ex. rôle RBAC personnalisé), le corps peut cibler un assigné via `studentId` (UUID n3beur) ou couple `firstName` / `lastName` (comme pour l’affectation) : cela enregistre `done_at` sur **son** inscription pour une tâche en `all_assignees_done` (validation manuelle de la part d’un élève), sans commentaire ni image obligatoires. Même logique que lorsque l’élève appelle la route pour lui-même.
- `POST /api/tasks/:id/validate` : possible sans que la tâche soit `done` ; **400** uniquement si elle est déjà `validated`. Les liaisons **zones / repères** sont retirées, comme pour un passage à `validated` via `PUT`. Pour une tâche avec récurrence `weekly`, `biweekly` ou `monthly`, un **snapshot** des identifiants de zones et de repères est enregistré au moment de la **première** transition vers `validated` (`recurrence_template_zone_ids` et `recurrence_template_marker_ids`, texte JSON côté BDD) afin que le job de duplication des tâches récurrentes recrée les clones avec la même localisation. Même logique lors d’un passage à `validated` via `PUT` lorsque le statut précédent n’était pas déjà `validated`. Les payloads JSON de tâche peuvent exposer ces champs.
- Les commentaires contextuels restent possibles sur les tâches, projets, zones, repères, fiches biodiversité et tutoriels (`/api/context-comments`).

---

## Projets de tâches (`/api/task-projects`)

Regroupe plusieurs tâches sous un même projet (carte, titre, description, statut). Les liaisons **zones / repères / tutoriels** décrivent où et avec quelles ressources pédagogiques le projet s’inscrit sur la carte.

| Méthode | URL | n3boss | Description |
|--------|-----|--------|-------------|
| GET | `/api/task-projects` | non | Liste des projets (`?map_id=` optionnel pour filtrer par carte) |
| POST | `/api/task-projects` | oui (`tasks.manage` + élévation) | Créer un projet |
| PUT | `/api/task-projects/:id` | oui | Modifier un projet |
| POST | `/api/task-projects/:id/validate` | oui (`tasks.validate` + élévation) | Valider manuellement un projet (`status` → `validated`) |
| POST | `/api/task-projects/:id/duplicate` | oui (`tasks.manage` + élévation) | Dupliquer un projet et ses tâches structurelles (sans assignations ni journaux) |
| DELETE | `/api/task-projects/:id` | oui | Supprimer le projet (`project_id` des tâches liées repassent à `NULL`) |

**Corps JSON (création / mise à jour)** — champs usuels :

- `map_id` (obligatoire à la création), `title`, `description` (texte libre, optionnel),
- `status` (écriture API `POST`/`PUT`) : `active` (défaut) ou `on_hold` (inscriptions n3beurs fermées pour les tâches du projet). Le statut **`completed`** est **réservé au serveur** : il est appliqué automatiquement lorsque le projet comporte au moins une tâche et que **toutes** les tâches liées sont en `done` ou `validated` ; dès qu’une tâche redevient « en cours » (autre statut), le projet repasse en `active` (sauf `on_hold` ou `validated` définis manuellement, inchangés par cette synchro). Le statut **`validated`** est **réservé à la validation manuelle** via `POST /api/task-projects/:id/validate` (permission `tasks.validate`) : clôture explicite du projet par le n3boss, inscriptions fermées même si des tâches ne sont pas toutes terminées.
- **Duplication** (`POST /api/task-projects/:id/duplicate`) : corps optionnel `{ title?, map_id? }` (défaut : titre source + « (copie) », même carte). Crée un nouveau projet `active`, recopie les liaisons zones/repères/tutoriels du projet et, pour chaque tâche liée, les champs structurels (titre, description, dates, mode, niveaux, localisation N-N, tutoriels, ordre) avec statut initial **`available`**. Ne copie **pas** les assignations (`task_assignments`), journaux (`task_logs`) ni commentaires contextuels. Réponse `201` : `{ project, source_project_id, tasks_copied, task_ids }`.
- `zone_ids` : tableau d’identifiants de **zones** (`zones.id`) — toutes doivent appartenir à `map_id` du projet,
- `marker_ids` : tableau d’identifiants de **repères** (`map_markers.id`) — même carte,
- `tutorial_ids` : tableau d’identifiants numériques de **tutoriels** actifs (`tutorials.id`).

À la **mise à jour**, si `zone_ids`, `marker_ids` ou `tutorial_ids` sont absents du corps, les liaisons existantes sont conservées ; s’ils sont présents (y compris tableaux vides), ils remplacent la liste correspondante.

**Réponse** : chaque projet inclut `zone_ids`, `marker_ids`, `tutorial_ids` et les tableaux enrichis `zones_linked`, `markers_linked`, `tutorials_linked` (même forme que sur les payloads de tâches), ainsi que `map_label`.

---

## Texte enrichi (Markdown léger)

Plusieurs champs texte longs acceptent du **Markdown léger** côté client (saisie avec barre d’outils, rendu à l’affichage). L’API **ne transforme pas** le contenu : elle stocke et renvoie une **chaîne UTF-8** telle quelle.

**Sous-ensemble supporté à l’affichage** (sanitization HTML côté interface) : gras, italique, listes à puces / numérotées, liens `http`/`https` (ouverts dans un nouvel onglet, `rel="noopener noreferrer"`). Pas de HTML brut, scripts ni URLs `javascript:`.

**Champs concernés (exemples)** :

| Domaine | Champs |
|--------|--------|
| Forum | `body` des messages (`forum_posts`) |
| Commentaires contextuels | `body` (`context_comments`) |
| Tâches / projets | `description` (`tasks`, `task_projects`), `comment` des journaux de validation |
| Biodiversité | `description`, champs texte longs de fiche (`plants`), contenu des **observations** |
| Carte / visite | `description` (zones), `note` (repères), textes visite `visit_short_description`, `visit_details_text` |
| Comptes | `description` (profil n3beur / RBAC, max 300 caractères) |
| Tutoriels | `summary` (résumé ; le corps HTML `html_content` reste du HTML édité séparément) |

**Rétrocompatibilité** : les textes déjà enregistrés sans syntaxe Markdown s’affichent comme avant (retours à la ligne conservés).

**Sécurité** : la validation serveur reste limitée aux **longueurs** et règles métier existantes ; la neutralisation XSS est assurée au **rendu** interface (`src/utils/markdown.js`).

---

## Forum global

Toutes les routes forum exigent un utilisateur connecté (`Authorization: Bearer <token>`), n3beur ou n3boss.
Le profil `visiteur` est refusé (`403`) pour éviter l’exposition d’identités d’autres utilisateurs.
Si le réglage public `ui.modules.forum_enabled` est à `false`, toutes les routes forum renvoient `503` avec `{ error: 'Forum désactivé' }` (après authentification réussie).

**Participation par profil n3beur** : la colonne `roles.forum_participate` (défaut `1`) sur le **profil principal** pilote si le n3beur peut agir sur le forum. Si `0`, le n3beur reste autorisé en **lecture** sur `GET /api/forum/threads` et `GET /api/forum/threads/:id` ; les routes `POST` (sujet, réponse, réaction, signalement) et `DELETE` sur un message sont refusées avec **`403`** et `code: "FORUM_READ_ONLY"`. Les n3boss (`user_type` enseignant) ne sont pas soumis à ce filtre.

| Méthode | URL | Description |
|--------|-----|-------------|
| GET | `/api/forum/threads?page=1&page_size=20&group_id=:id` | Liste paginée des sujets (tri : épinglés puis activité récente), filtrable par groupe |
| POST | `/api/forum/threads` | Créer un sujet + premier message (`{ title, body?, images?, group_id? }`) |
| GET | `/api/forum/threads/:id?page=1&page_size=50` | Détail d’un sujet + messages paginés |
| POST | `/api/forum/threads/:id/posts` | Ajouter une réponse (`{ body?, images? }`) |
| POST | `/api/forum/posts/:id/reactions` | Toggle d’une réaction emoji (`{ emoji }`) |
| POST | `/api/forum/posts/:id/report` | Signaler un message (`{ reason }`) |
| PATCH | `/api/forum/threads/:id/lock` | Verrouiller/déverrouiller un sujet (`{ locked }`, n3boss/admin) |
| DELETE | `/api/forum/posts/:id` | Supprimer un message (auteur ou n3boss/admin) |

Contraintes principales :

- **Photos** : champ optionnel `images` (tableau de data URLs / base64 **JPEG, PNG ou WebP**), **maximum 3** fichiers, **sans plafond de taille par image** côté application (la borne globale reste la **limite du corps JSON** HTTP, par défaut **25 Mo** ; surcharge possible via variable d’environnement **`FORETMAP_JSON_BODY_LIMIT`**, ex. `50mb`). Fichiers stockés sous `uploads/forum-posts/<postId>/`. Les réponses incluent `posts[].image_urls` (chemins publics `/uploads/…`, tableau vide si aucune image). Si au moins une image est envoyée **sans** texte de message, le corps enregistré vaut littéralement `(Photo)` pour respecter la longueur minimale du message.
- Validation serveur des longueurs (titre/message/motif). Le corps `body` peut contenir du Markdown léger (voir section **Texte enrichi**).
- Anti-abus V1 : cooldown par utilisateur sur création de sujet/réponse.
- Réactions emoji supportées : issues du réglage public `ui.reactions.allowed_emojis` (fallback défaut `👍 ❤️ 😂 😮 😢 😡 🔥 👏`).
- `POST /api/forum/posts/:id/reactions` fonctionne en **toggle** (ajoute puis retire sur second clic).
- `GET /api/forum/threads/:id` inclut `posts[].reactions` (agrégat par emoji + `reacted_by_me`).
- Le thread transporte `group_id` (nullable) pour la visibilité scoped. Les comptes non globaux ne voient que leurs groupes accessibles.
- `409` sur réponse dans un sujet verrouillé.
- `409` sur signalement dupliqué (même utilisateur, même message, signalement déjà ouvert).

---

## Commentaires contextuels

Toutes les routes commentaires contextuels exigent un utilisateur connecté (`Authorization: Bearer <token>`), **n3beur** (profil autre que **visiteur**) ou **n3boss**.
Si le réglage public `ui.modules.context_comments_enabled` est à `false`, toutes les routes `/api/context-comments` renvoient `503` avec `{ error: 'Commentaires de contexte désactivés' }` (après authentification réussie).

**Profil visiteur** : toutes les routes `/api/context-comments` renvoient **`403`** (pas d’accès, y compris en lecture), avec un message du type « Accès refusé aux commentaires de contexte pour le profil visiteur » — comportement aligné sur le forum pour ce profil.

**Publication par profil n3beur** : la colonne `roles.context_comment_participate` (défaut `1`) sur le **profil principal** pilote si le n3beur peut créer des commentaires, réagir, signaler et supprimer les siens. Si `0`, le n3beur reste autorisé en **lecture** sur `GET /api/context-comments` ; `POST`, `DELETE` et réactions sont refusés avec **`403`** et `code: "CONTEXT_COMMENT_READ_ONLY"`. Les n3boss ne sont pas soumis à ce filtre.

Contexte supporté :

- `contextType=task` (tâche)
- `contextType=project` (projet de tâches)
- `contextType=zone` (zone de la carte)
- `contextType=marker` (repère `map_markers`)
- `contextType=plant` (fiche catalogue biodiversité / table `plants`, `contextId` = identifiant numérique)
- `contextType=tutorial` (tutoriel / table `tutorials`, `contextId` = identifiant numérique)

| Méthode | URL | Description |
|--------|-----|-------------|
| GET | `/api/context-comments?contextType=task|project|zone|marker|plant|tutorial&contextId=:id&page=1&page_size=20` | Liste paginée des commentaires d’un contexte |
| POST | `/api/context-comments` | Créer un commentaire (`{ contextType, contextId, body?, images? }`) |
| POST | `/api/context-comments/:id/reactions` | Toggle d’une réaction emoji (`{ emoji }`) |
| DELETE | `/api/context-comments/:id` | Supprimer un commentaire (auteur ou n3boss/admin) |
| POST | `/api/context-comments/:id/report` | Signaler un commentaire (`{ reason }`) |

Contraintes principales :

- **Photos** : champ optionnel `images` (même format que le forum : **max 3**, JPEG/PNG/WebP, **pas de limite de taille par image** côté appli — borne = corps JSON HTTP, voir forum / **`FORETMAP_JSON_BODY_LIMIT`**). Stockage sous `uploads/context-comments/<commentId>/`. Les réponses `GET` exposent `items[].image_urls` (`/uploads/…`). Texte seul, images seules ou texte + images : au moins un texte **ou** une image requis ; sans texte mais avec images, le corps enregistré vaut `(Photo)`. Le champ `body` peut contenir du Markdown léger (voir section **Texte enrichi**).
- Validation serveur de `contextType` et de l’existence du contexte ciblé.
- Validation longueur message/motif de signalement.
- Anti-abus V1 : cooldown par utilisateur sur publication.
- Réactions emoji supportées : issues du réglage public `ui.reactions.allowed_emojis` (fallback défaut `👍 ❤️ 😂 😮 😢 😡 🔥 👏`).
- `POST /api/context-comments/:id/reactions` fonctionne en **toggle**.
- `GET /api/context-comments` inclut `items[].reactions` (agrégat par emoji + `reacted_by_me`).
- Suppression logique (`is_deleted`) ; le contenu est masqué côté lecture.
- `409` sur signalement dupliqué (même utilisateur, même commentaire, signalement déjà ouvert).

---

## Observations

Toutes les routes observations exigent un utilisateur connecté (`Authorization: Bearer <token>`).

| Méthode | URL | n3boss | Description |
|--------|-----|--------|-------------|
| GET | `/api/observations/student/:studentId` | non (token requis) | Carnet d’un n3beur : propriétaire ou n3boss (`observations.read.all` / `observations.read.group`) |
| GET | `/api/observations/all?group_id=:id` | oui (`observations.read.all` ou `observations.read.group`) | Liste globale (max 100), filtrable par périmètre groupe |
| POST | `/api/observations` | non (token requis) | Créer une observation (`content`, `zone_id?`, `imageData?`) |
| GET | `/api/observations/:id/image` | non (token requis) | Lire l’image liée (propriétaire ou n3boss selon périmètre) |
| DELETE | `/api/observations/:id` | non (token requis) | Supprimer une observation (propriétaire ou n3boss selon périmètre) |

Règles d’accès:
- **n3beur** : accès strict à ses propres observations (lecture / image / suppression).
- **n3boss** avec `observations.read.all` : accès global.
- **n3boss** avec `observations.read.group` : accès limité au périmètre groupe.

---

## Audit

| Méthode | URL | n3boss | Description |
|--------|-----|--------|-------------|
| GET | `/api/audit?limit=50` | oui (`audit.read` + élévation) | Journal d’audit (ordre décroissant, `limit` borné entre 1 et 200) |

---

## Stats

| Méthode | URL | n3boss | Description |
|--------|-----|------|-------------|
| GET | `/api/stats/me/:studentId` | non | Stats de l’utilisateur ciblé (propriétaire ou permission `stats.read.all`) ; pour n3boss/admin sans activités n3beur, compteurs tâches à `0` |
| GET | `/api/stats/all?group_id=:id&subgroup_id=:id` | oui (`stats.read.all` ou `stats.read.group`) | Agrégat : `{ students: [...], site: { ... } }` filtrable par groupe/sous-groupe |
| GET | `/api/stats/export?group_id=:id&subgroup_id=:id` | oui (`stats.export`) | Export CSV des n3beurs, filtrable par groupe/sous-groupe |

`GET /api/stats/me/:studentId` renvoie aussi `progression` pour les n3beurs :
- `progression.thresholds` : seuils actifs par profil (clés dynamiques selon les profils `eleve_*`)
- `progression.steps` : paliers affichables (min + label + emoji + ordre d’affichage)
- `progression.roleSlug` / `progression.roleDisplayName` : profil principal actuel après synchronisation.

Champ **`stats`** (tous les utilisateurs cibles, y compris non-élève) inclut en plus des tâches :
- `stats.plant_species_observed` : nombre d’**espèces distinctes** (fiches `plants`) avec au moins une ligne dans `user_plant_observation_events` pour cet utilisateur.
- `stats.plant_observation_events` : nombre total d’**observations** (confirmations « espèce observée » / fiches plantes), toutes espèces confondues.
- `stats.tutorials_read` : nombre de **tutoriels** distincts marqués lus (`user_tutorial_reads`).

Objet **`site`** (réponse `GET /api/stats/all` uniquement) :
- `site.plant_species_observed` : `COUNT(DISTINCT plant_id)` sur tout le site (espèces du catalogue ayant au moins une observation).
- `site.plant_observation_events` : nombre total d’événements d’observation fiche-plante sur le site.
- `site.tutorials_read` : nombre total de marquages « tutoriel lu » (une ligne par couple utilisateur × tutoriel).

---

## n3beurs (comptes `student`)

| Méthode | URL | n3boss | Description |
|--------|-----|------|-------------|
| GET | `/api/students/import/template` | oui (`students.import` + élévation) | Télécharger le modèle d’import CSV/XLSX |
| POST | `/api/students/import` | oui (`students.import` + élévation) | Import en lot (CSV/XLSX base64) |
| POST | `/api/students/register` | non | Rafraîchir last_seen (`{ studentId }`) |
| POST | `/api/students/:id/duplicate` | oui (`users.create` + élévation) | Dupliquer un compte n3beur |
| PATCH | `/api/students/:id/profile` | non (token élève propriétaire requis) | Mettre à jour son profil (`{ pseudo?, email?, description?, avatarData?, removeAvatar?, currentPassword }`) |
| DELETE | `/api/students/:id` | oui (`students.delete` + élévation) | Supprimer un n3beur (cascade) |

`avatarData` doit être une data URL image (`png`, `jpg/jpeg`, `webp`). Les fichiers sont stockés sous `uploads/students/...` et exposés via `/uploads/...`.

---

## Codes d’erreur

- **401** : Non authentifié ou token invalide ; possible `{ error, deleted: true }` si compte supprimé.
- **403** : Accès refusé.
- **404** : Ressource introuvable.
- **409** : Conflit (ex. compte déjà existant).
- **503** : Mode n3boss non configuré (`TEACHER_PIN` ou `JWT_SECRET` manquant en production).

---

## Accessibilité (a11y)

Recommandations pour les évolutions frontend : labels sur tous les champs de formulaire, focus visible sur les modales (PIN, tâche), contraste suffisant (variables CSS existantes), navigation clavier pour les actions principales.
