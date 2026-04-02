# API ForetMap

Base URL : `/api` (ex. `http://localhost:3000/api`).

Réponses JSON. En cas d’erreur : `{ "error": "message" }` avec statut HTTP adapté (4xx/5xx).

---

## Santé

| Méthode | URL | Description |
|--------|-----|-------------|
| GET | `/api/health` | Santé sans BDD |
| GET | `/api/health/db` | Ping MySQL : `200` si OK, `503` si base indisponible |
| GET | `/health` | Alias |

---

## Observabilité (logs / corrélation)

- **Réponse** : toutes les requêtes reçoivent un en-tête **`X-Request-Id`** (UUID ou valeur client si format sûr, 8–128 caractères `[a-zA-Z0-9._-]`). À utiliser pour relier une erreur côté client aux lignes Pino / au tampon admin.
- **Variables** :
  - **`FORETMAP_HTTP_LOG`** : `off` (défaut hors prod et en `NODE_ENV=test`), `minimal` (défaut **production** : log `warn` des **5xx** et des requêtes lentes), `full` (une ligne `info`/`warn` par requête `/api/*` suivie — peut saturer le tampon).
  - **`FORETMAP_HTTP_SLOW_MS`** : seuil « lent » en ms pour le mode `minimal` (défaut **8000**).
  - **`FORETMAP_RATE_LIMIT_LOG_SAMPLE`** : probabilité **0–1** de journaliser un **429** rate limit (défaut **0.01**), avec **IP tronquée** (pas d’adresse complète dans les logs).

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
| GET | `/api/admin/diagnostics` | **Instantané d’exploitation** (sans secrets dans la réponse) : champs ci-dessus + **`metrics`** (`httpRequests`, `http5xx`, `http4xx`, `httpSlow`, `routeErrors`, `rateLimit429Samples`, `recentHttp5xx` : derniers 5xx avec `requestId`, `method`, `path`, `statusCode`, `at`). |

Le tampon est dimensionné par **`LOG_BUFFER_MAX_LINES`** (défaut 2000, plafond 5000). Les logs antérieurs au démarrage du process ne sont pas disponibles ici (voir aussi les logs du panel hébergeur / stdout).

### En-tête optionnel de test de charge (rate limit)

Pour les environnements de test (local/staging), le rate limiter global et auth peut être contourné si les deux conditions suivantes sont réunies :

1. la variable d'environnement `LOAD_TEST_SECRET` est définie côté serveur ;
2. la requête envoie le header `X-ForetMap-Load-Test: <meme_secret>`.

Sans `LOAD_TEST_SECRET`, le comportement reste inchangé : le rate limiting s'applique normalement à toutes les requêtes.

Le plafond global sur **`/api/*`** (hors bypass ci-dessus) est de **900 requêtes par minute par adresse IP** par défaut, configurable avec **`FORETMAP_API_RATE_LIMIT_PER_MIN`** (entier entre 60 et 20000). Objectif : limiter les abus tout en évitant des **429** lorsque plusieurs utilisateurs ou onglets passent par la **même IP publique** (ex. Wi‑Fi établissement).

Pour valider ce comportement en local (plusieurs utilisateurs virtuels, **une seule IP source** côté serveur, rate limit **actif**), utiliser le profil Artillery **`10vu`** : fichier `load/artillery-10vu.yml`, commande **`npm run test:load:10vu`** (voir aussi `docs/LOCAL_DEV.md`).

### Mode Playwright / e2e (rate limit)

Pour les campagnes **Playwright** et un serveur de dev dédié aux e2e, le rate limiting global et auth peut être désactivé si **l’une** des conditions suivantes est remplie côté process Node du serveur :

1. variable d’environnement **`E2E_DISABLE_RATE_LIMIT=1`** (peut être insuffisante seule sur certains environnements Windows selon la chaîne `npm`) ;
2. **recommandé** : démarrage avec l’argument **`--foretmap-e2e-no-rate-limit`** (script npm **`npm run start:e2e`**), qui force en interne le même bypass.

Réservé aux environnements de **développement / CI** ; ne pas utiliser en production.

---

## Temps réel (Socket.IO)

Connexion Socket.IO (transport **polling** actuellement forcé côté client) sur le **même hôte** que l’API, chemin `/socket.io`.

- **CORS** : en production, même règle que l’API (`FRONTEND_ORIGIN` si défini).
- **Rôle** : notifier les clients qu’une ressource a changé ; les données à jour restent à charger via les routes REST (`GET /api/tasks`, etc.).
- **Auth socket** : token JWT requis (transmis dans le handshake Socket.IO).
- **Rooms** : souscription de domaine (`tasks`, `students`, `garden`) + souscription carte via `subscribe:map` (payload `{ mapId }`).
- **Client** : le frontend se connecte pour n3beur/n3boss authentifié ; en cas d’échec, le rafraîchissement périodique reste actif (cadence adaptative).

**Robustesse (comportement attendu)** :

- **JWT** : connexion refusée si token absent, invalide ou expiré (`connect_error` côté client).
- **Tâches par carte** : la plupart des `tasks:changed` métier incluent un `mapId` ; seuls les clients dans la salle **`map:<mapId>`** (handshake `auth.mapId` et/ou événement **`subscribe:map`**) reçoivent l’événement. Sans souscription à la bonne carte, l’utilisateur s’appuie sur le **polling** REST (voir hook temps réel / `App.jsx`).
- **Diffusion domaine** : certains cas (ex. import bulk) émettent `tasks:changed` **sans** `mapId` → cible la salle **`domain:tasks`** (tous les sockets authentifiés abonnés à ce domaine).
- **Tests d’intégration** (sans navigateur) : [`tests/realtime.test.js`](../tests/realtime.test.js) — auth, filtrage par carte, `subscribe:map`, repli `domain:tasks`.

Événements émis par le serveur (payload JSON, toujours avec un champ `ts` — horodatage) :

| Événement | Quand | Champs utiles (exemples) |
|-----------|--------|---------------------------|
| `tasks:changed` | Création / modification / suppression de tâche, assignation, désassignation, marquer fait, validation, suppression d’un log | `reason`, `taskId`, `mapId` |
| `students:changed` | Inscription d’un n3beur, suppression d’un n3beur | `reason`, `studentId` |
| `garden:changed` | Zones, photos de zone, biodiversité, marqueurs carte | `reason`, `zoneId`, `plantId`, `markerId`, `mapId`… |
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

**`GET /api/auth/me`** — pour un compte **n3beur** authentifié (`auth.userType === 'student'`), la réponse peut inclure **`taskEnrollment`** (plafond d’auto-inscriptions actives) :

- `maxActiveAssignments` : plafond effectif (entier 0–99, `0` = pas de limite) : si le profil principal du n3beur a une valeur `roles.max_concurrent_tasks` non `NULL`, elle s’applique ; sinon le réglage global `tasks.student_max_active_assignments` est utilisé.
- `currentActiveAssignments` : nombre d’assignations sur des tâches dont le statut n’est pas `validated` (toutes cartes).
- `atLimit` : `true` si `maxActiveAssignments > 0` et `currentActiveAssignments >= maxActiveAssignments`.
- `forumParticipate` : `true` si le profil principal du n3beur (`roles.forum_participate`) autorise la **participation** au forum ; `false` = accès **lecture seule** sur les routes forum autorisées (voir ci-dessous). Absent pour les n3boss.
- `contextCommentParticipate` : `true` si le profil principal (`roles.context_comment_participate`) autorise la **publication** sur les commentaires contextuels (tâches, projets, zones), réagir, signaler et supprimer les siens ; `false` = **lecture seule** sur `GET /api/context-comments`. Absent pour les n3boss.
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
| `stats.export` | Export stats | Exporter les stats n3beurs en CSV |
| `students.import` | Import n3beurs | Importer des n3beurs via CSV/XLSX |
| `students.delete` | Suppression n3beur | Supprimer un compte n3beur |
| `tasks.manage` | Gestion tâches | Créer/éditer/supprimer les tâches |
| `tasks.validate` | Validation tâches | Valider une tâche (tous statuts sauf déjà validée) |
| `tasks.propose` | Proposition de tâches | Proposer de nouvelles tâches |
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

### Profils système (droits par défaut)

Les profils sont entièrement paramétrables ; ce tableau documente les **valeurs initiales** livrées par l’application.

| Profil | Droits par défaut |
|--------|-------------------|
| `admin` | `teacher.access`, `admin.roles.manage` (PIN), `admin.users.assign_roles` (PIN), `users.create` (PIN), `admin.settings.read` (PIN), `admin.settings.write` (PIN), `admin.settings.secrets.write` (PIN), `stats.read.all`, `stats.export` (PIN), `students.import` (PIN), `students.delete` (PIN), `tasks.manage` (PIN), `tasks.validate` (PIN), `tasks.propose`, `tasks.assign_self`, `tasks.unassign_self`, `tasks.done_self`, `zones.manage` (PIN), `map.manage_markers` (PIN), `plants.manage` (PIN), `tutorials.manage` (PIN), `visit.manage` (PIN), `audit.read` (PIN), `observations.read.all` (PIN) |
| `prof` | `teacher.access`, `stats.read.all`, `stats.export` (PIN), `students.import` (PIN), `students.delete` (PIN), `users.create` (PIN), `tasks.manage` (PIN), `tasks.validate` (PIN), `tasks.propose`, `tasks.assign_self`, `tasks.unassign_self`, `tasks.done_self`, `zones.manage` (PIN), `map.manage_markers` (PIN), `plants.manage` (PIN), `tutorials.manage` (PIN), `visit.manage` (PIN), `audit.read` (PIN), `observations.read.all` (PIN) |
| `eleve_chevronne` | `tasks.propose` (PIN), `tasks.assign_self`, `tasks.unassign_self`, `tasks.done_self` |
| `eleve_avance` | `tasks.propose`, `tasks.assign_self`, `tasks.unassign_self`, `tasks.done_self` |
| `eleve_novice` | `tasks.assign_self`, `tasks.unassign_self`, `tasks.done_self` |
| `visiteur` | Lecture seule (aucune permission d’action par défaut) |

---

## Paramètres admin (GUI)

Ces routes sont destinées à la console admin et exigent un token avec permissions
`admin.settings.read` / `admin.settings.write` / `admin.settings.secrets.write` + élévation PIN.

| Méthode | URL | Description |
|--------|-----|-------------|
| GET | `/api/settings/public` | Réglages publics consommés par l’UI (accueil, modules, cartes par défaut) |
| GET | `/api/settings/admin` | Liste complète des réglages + métadonnées + cartes |
| PUT | `/api/settings/admin/:key` | Mettre à jour un réglage (`{ value }`) |
| PUT | `/api/settings/admin/maps/:id` | Mettre à jour une carte (label, ordre, activation, URL image, padding) |
| POST | `/api/settings/admin/maps/:id/image` | Upload image de plan (`{ image_data }`) |
| GET | `/api/settings/admin/system/logs` | Lecture des logs applicatifs via GUI |
| GET | `/api/settings/admin/system/oauth-debug` | Diagnostic runtime OAuth (sans secrets) |
| POST | `/api/settings/admin/system/restart` | Redémarrage applicatif contrôlé |

Progression n3beurs :
- pilotée directement par les profils `eleve_*` via `roles.min_done_tasks`, `roles.emoji` et `roles.display_order`.
- les anciens réglages `progression.student_role_min_done_*` ne sont plus utilisés.

Tâches / inscriptions n3beurs :
- `tasks.student_max_active_assignments` (entier 0–99, défaut `0`) : plafond **par défaut** du nombre de tâches **actives** (assignations dont la tâche associée n’est pas en statut `validated`) auxquelles un n3beur peut **s’auto-inscrire** via `POST /api/tasks/:id/assign`. `0` = pas de limite par défaut. Si le profil principal a `roles.max_concurrent_tasks` non `NULL`, cette valeur remplace le réglage global pour les utilisateurs de ce profil (`0` sur le profil = pas de limite pour eux). Les affectations effectuées par un n3boss ne sont pas soumises à ce plafond.

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

---

## Zones

| Méthode | URL | n3boss | Description |
|--------|-----|------|-------------|
| GET | `/api/zones` | non | Liste des zones |
| GET | `/api/zones/:id` | non | Détail zone |
| PUT | `/api/zones/:id` | oui | Modifier zone |
| POST | `/api/zones` | oui | Créer zone |
| DELETE | `/api/zones/:id` | oui | Supprimer zone |
| GET | `/api/zones/:id/photos` | non | Liste des photos (méta) |
| GET | `/api/zones/:id/photos/:pid/data` | non | Données image (fichier disque) |
| POST | `/api/zones/:id/photos` | oui | Ajouter photo (`image_data` base64, `caption`) |
| DELETE | `/api/zones/:id/photos/:pid` | oui | Supprimer photo |

- Le champ `name` peut commencer par un **emoji de zone** : préfixe (séquence emoji) suivi d’un **espace** puis le libellé ; l’UI carte accepte tout pictogramme collé ou choisi dans la grille.

---

## Carte (marqueurs)

| Méthode | URL | n3boss | Description |
|--------|-----|------|-------------|
| GET | `/api/map/markers` | non | Liste des repères |
| POST | `/api/map/markers` | oui | Créer repère |
| PUT | `/api/map/markers/:id` | oui | Modifier repère |
| DELETE | `/api/map/markers/:id` | oui | Supprimer repère |

- Corps JSON : notamment `emoji` (pictogramme du repère). Valeur **tronquée à 16 caractères** côté serveur si besoin (colonne `map_markers.emoji`).

---

## Visite guidée

| Méthode | URL | n3boss | Description |
|--------|-----|------|-------------|
| GET | `/api/visit/content?map_id=foret` | non | Contenus publics de visite (zones, repères, médias, tutoriels actifs) |
| GET | `/api/visit/progress?student_id=:id` | non | Progression des cibles vues (n3beur connecté ou anonyme via cookie signé) |
| POST | `/api/visit/seen` | non | Marquer/démarquer une cible vue (`{ target_type, target_id, seen, student_id? }`) |
| GET | `/api/visit/stats` | oui | KPI de visite (sessions, complétion, breakdown n3beur/anonyme) |
| POST | `/api/visit/zones` | oui | Créer une zone de visite |
| PUT | `/api/visit/zones/:id` | oui | Modifier une zone de visite |
| DELETE | `/api/visit/zones/:id` | oui | Supprimer une zone de visite |
| POST | `/api/visit/markers` | oui | Créer un repère de visite |
| PUT | `/api/visit/markers/:id` | oui | Modifier un repère de visite |
| DELETE | `/api/visit/markers/:id` | oui | Supprimer un repère de visite |
| POST | `/api/visit/media` | oui | Ajouter un média sur une cible de visite |
| PUT | `/api/visit/media/:id` | oui | Modifier un média de visite |
| DELETE | `/api/visit/media/:id` | oui | Supprimer un média de visite |
| PUT | `/api/visit/tutorials` | oui | Définir la sélection des tutoriels affichés en visite |
| GET | `/api/visit/sync/options?map_id=foret` | oui | Récupérer les zones/repères disponibles côté carte et côté visite pour import sélectif |
| POST | `/api/visit/sync` | oui | Import sélectif bidirectionnel (`{ map_id, direction: "map_to_visit" \| "visit_to_map", zone_ids, marker_ids }`) |

Contraintes importantes :

- `direction=map_to_visit` : copie/synchronise les zones et repères de la carte vers la visite.
- `direction=visit_to_map` : copie/synchronise les zones et repères de la visite vers la carte.
- L’import est **sélectif** (listes `zone_ids` / `marker_ids`) et en **upsert** (pas de doublon si l’ID existe déjà).
- Les routes de gestion (`/zones`, `/markers`, `/media`, `/tutorials`, `/sync/*`) exigent la permission n3boss `visit.manage` (session élevée).

---

## Biodiversité (`/api/plants`)

| Méthode | URL | n3boss | Description |
|--------|-----|------|-------------|
| GET | `/api/plants` | non | Liste des entrées biodiversité |
| POST | `/api/plants` | oui | Créer une entrée biodiversité |
| PUT | `/api/plants/:id` | oui | Modifier une entrée biodiversité |
| DELETE | `/api/plants/:id` | oui | Supprimer une entrée biodiversité |
| POST | `/api/plants/:id/photo-upload` | oui | Uploader une photo locale pour un champ `photo*` |
| POST | `/api/plants/import` | oui | Importer des fiches biodiversité (CSV/XLSX/Google Sheet) |

`GET /api/plants` renvoie les champs historiques (`id`, `name`, `emoji`, `description`) et les champs de biodiversité:
`second_name`, `scientific_name`, `group_1`, `group_2`, `group_3`, `habitat`, `photo`, `nutrition`,
`agroecosystem_category`, `longevity`, `remark_1`, `remark_2`, `remark_3`, `reproduction`, `size`,
`sources`, `ideal_temperature_c`, `optimal_ph`, `ecosystem_role`, `geographic_origin`, `human_utility`,
`harvest_part`, `planting_recommendations`, `preferred_nutrients`, `photo_species`, `photo_leaf`,
`photo_flower`, `photo_fruit`, `photo_harvest_part`.

`POST /api/plants` et `PUT /api/plants/:id` acceptent ces mêmes champs en JSON. Les champs texte vides
des métadonnées biodiversité sont normalisés en `null`.

`POST /api/plants/:id/photo-upload` (n3boss):

- Body: `{ field, imageData }`
- `field` doit être l'un des champs photo (`photo`, `photo_species`, `photo_leaf`, `photo_flower`, `photo_fruit`, `photo_harvest_part`)
- `imageData` doit être une Data URL image (png/jpg/webp/gif/bmp/avif)
- Réponse: `{ field, url, plant }`

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

---

## Tâches

| Méthode | URL | n3boss | Description |
|--------|-----|------|-------------|
| GET | `/api/tasks` | non | Liste des tâches (avec assignments) |
| GET | `/api/tasks/:id` | non | Détail tâche |
| POST | `/api/tasks` | oui | Créer tâche |
| PUT | `/api/tasks/:id` | oui\* | Modifier tâche |
| DELETE | `/api/tasks/:id` | oui | Supprimer tâche |
| POST | `/api/tasks/:id/assign` | non | S’assigner (n3beur) |
| POST | `/api/tasks/:id/unassign` | non | Se désassigner |
| POST | `/api/tasks/:id/done` | non | Marquer comme fait (commentaire/image) |
| GET | `/api/tasks/:id/logs` | non | Logs de la tâche |
| GET | `/api/tasks/:id/logs/:logId/image` | non | Image d’un log (fichier disque) |
| POST | `/api/tasks/:id/validate` | oui | Valider la tâche (depuis n’importe quel statut sauf `validated`) |

\* Un n3beur peut aussi modifier **sa propre proposition** (statut `proposed`, préfixe de description `Proposition n3beur:`) ; les champs sensibles (`status`, `project_id`, `tutorial_ids`, `recurrence`, `completion_mode`) restent réservés aux profils avec `tasks.manage`.

Contraintes principales :

- Statuts tâche supportés : `available`, `in_progress`, `done`, `validated`, `proposed`, `on_hold`.
- Modes de validation supportés (`completion_mode`) : `single_done` (défaut), `all_assignees_done`.
- Statuts projet supportés : `active`, `on_hold` (retourné dans `project_status` sur les payloads de tâche).
- Champ optionnel `start_date` (`YYYY-MM-DD`) sur les tâches ; tant que la date n’est pas atteinte, la tâche est considérée en attente (`is_before_start_date: true` dans les payloads).
- Si une tâche est `on_hold` **ou** si son projet est `on_hold`, `POST /api/tasks/:id/assign` renvoie `400` (inscription n3beur bloquée).
- Si `start_date` est dans le futur, `POST /api/tasks/:id/assign` renvoie aussi `400` (inscription n3beur bloquée jusqu’à la date de départ).
- Si le **plafond effectif** (profil `roles.max_concurrent_tasks` si défini, sinon réglage `tasks.student_max_active_assignments`) est strictement positif et que l’action est une **auto-inscription n3beur**, le serveur compte les assignations actives (tâches non `validated`) : au-delà de la limite, réponse **`400`** avec `code: "TASK_ENROLLMENT_LIMIT"`, `maxActiveAssignments`, `currentActiveAssignments` et un message d’erreur explicite.
- `POST /api/tasks` et `PUT /api/tasks/:id` acceptent `completion_mode` pour les profils autorisés.
- Les payloads tâche exposent `completion_mode`, `assignees_total_count` et `assignees_done_count`.
- `POST /api/tasks/:id/done` :
  - en `single_done`, la tâche passe en `done` dès la déclaration de fin ;
  - en `all_assignees_done`, chaque assigné valide individuellement, puis la tâche passe en `done` uniquement quand tous les assignés ont terminé.
- `POST /api/tasks/:id/validate` : possible sans que la tâche soit `done` ; **400** uniquement si elle est déjà `validated`. Les liaisons **zones / repères** sont retirées, comme pour un passage à `validated` via `PUT`.
- Les commentaires contextuels restent possibles sur les tâches/projets (`/api/context-comments`).

---

## Projets de tâches (`/api/task-projects`)

Regroupe plusieurs tâches sous un même projet (carte, titre, description, statut). Les liaisons **zones / repères / tutoriels** décrivent où et avec quelles ressources pédagogiques le projet s’inscrit sur la carte.

| Méthode | URL | n3boss | Description |
|--------|-----|--------|-------------|
| GET | `/api/task-projects` | non | Liste des projets (`?map_id=` optionnel pour filtrer par carte) |
| POST | `/api/task-projects` | oui (`tasks.manage` + élévation) | Créer un projet |
| PUT | `/api/task-projects/:id` | oui | Modifier un projet |
| DELETE | `/api/task-projects/:id` | oui | Supprimer le projet (`project_id` des tâches liées repassent à `NULL`) |

**Corps JSON (création / mise à jour)** — champs usuels :

- `map_id` (obligatoire à la création), `title`, `description` (texte libre, optionnel),
- `status` : `active` (défaut) ou `on_hold` (inscriptions n3beurs fermées pour les tâches du projet, comme aujourd’hui),
- `zone_ids` : tableau d’identifiants de **zones** (`zones.id`) — toutes doivent appartenir à `map_id` du projet,
- `marker_ids` : tableau d’identifiants de **repères** (`map_markers.id`) — même carte,
- `tutorial_ids` : tableau d’identifiants numériques de **tutoriels** actifs (`tutorials.id`).

À la **mise à jour**, si `zone_ids`, `marker_ids` ou `tutorial_ids` sont absents du corps, les liaisons existantes sont conservées ; s’ils sont présents (y compris tableaux vides), ils remplacent la liste correspondante.

**Réponse** : chaque projet inclut `zone_ids`, `marker_ids`, `tutorial_ids` et les tableaux enrichis `zones_linked`, `markers_linked`, `tutorials_linked` (même forme que sur les payloads de tâches), ainsi que `map_label`.

---

## Forum global

Toutes les routes forum exigent un utilisateur connecté (`Authorization: Bearer <token>`), n3beur ou n3boss.
Le profil `visiteur` est refusé (`403`) pour éviter l’exposition d’identités d’autres utilisateurs.
Si le réglage public `ui.modules.forum_enabled` est à `false`, toutes les routes forum renvoient `503` avec `{ error: 'Forum désactivé' }` (après authentification réussie).

**Participation par profil n3beur** : la colonne `roles.forum_participate` (défaut `1`) sur le **profil principal** pilote si le n3beur peut agir sur le forum. Si `0`, le n3beur reste autorisé en **lecture** sur `GET /api/forum/threads` et `GET /api/forum/threads/:id` ; les routes `POST` (sujet, réponse, réaction, signalement) et `DELETE` sur un message sont refusées avec **`403`** et `code: "FORUM_READ_ONLY"`. Les n3boss (`user_type` enseignant) ne sont pas soumis à ce filtre.

| Méthode | URL | Description |
|--------|-----|-------------|
| GET | `/api/forum/threads?page=1&page_size=20` | Liste paginée des sujets (tri : épinglés puis activité récente) |
| POST | `/api/forum/threads` | Créer un sujet + premier message (`{ title, body }`) |
| GET | `/api/forum/threads/:id?page=1&page_size=50` | Détail d’un sujet + messages paginés |
| POST | `/api/forum/threads/:id/posts` | Ajouter une réponse (`{ body }`) |
| POST | `/api/forum/posts/:id/reactions` | Toggle d’une réaction emoji (`{ emoji }`) |
| POST | `/api/forum/posts/:id/report` | Signaler un message (`{ reason }`) |
| PATCH | `/api/forum/threads/:id/lock` | Verrouiller/déverrouiller un sujet (`{ locked }`, n3boss/admin) |
| DELETE | `/api/forum/posts/:id` | Supprimer un message (auteur ou n3boss/admin) |

Contraintes principales :

- Validation serveur des longueurs (titre/message/motif).
- Anti-abus V1 : cooldown par utilisateur sur création de sujet/réponse.
- Réactions emoji supportées : issues du réglage public `ui.reactions.allowed_emojis` (fallback défaut `👍 ❤️ 😂 😮 😢 😡 🔥 👏`).
- `POST /api/forum/posts/:id/reactions` fonctionne en **toggle** (ajoute puis retire sur second clic).
- `GET /api/forum/threads/:id` inclut `posts[].reactions` (agrégat par emoji + `reacted_by_me`).
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

| Méthode | URL | Description |
|--------|-----|-------------|
| GET | `/api/context-comments?contextType=task|project|zone&contextId=:id&page=1&page_size=20` | Liste paginée des commentaires d’un contexte |
| POST | `/api/context-comments` | Créer un commentaire (`{ contextType, contextId, body }`) |
| POST | `/api/context-comments/:id/reactions` | Toggle d’une réaction emoji (`{ emoji }`) |
| DELETE | `/api/context-comments/:id` | Supprimer un commentaire (auteur ou n3boss/admin) |
| POST | `/api/context-comments/:id/report` | Signaler un commentaire (`{ reason }`) |

Contraintes principales :

- Validation serveur de `contextType` et de l’existence du contexte ciblé.
- Validation longueur message/motif de signalement.
- Anti-abus V1 : cooldown par utilisateur sur publication.
- Réactions emoji supportées : issues du réglage public `ui.reactions.allowed_emojis` (fallback défaut `👍 ❤️ 😂 😮 😢 😡 🔥 👏`).
- `POST /api/context-comments/:id/reactions` fonctionne en **toggle**.
- `GET /api/context-comments` inclut `items[].reactions` (agrégat par emoji + `reacted_by_me`).
- Suppression logique (`is_deleted`) ; le contenu est masqué côté lecture.
- `409` sur signalement dupliqué (même utilisateur, même commentaire, signalement déjà ouvert).

---

## Stats

| Méthode | URL | n3boss | Description |
|--------|-----|------|-------------|
| GET | `/api/stats/me/:studentId` | non | Stats de l’utilisateur ciblé (propriétaire ou permission `stats.read.all`) ; pour n3boss/admin sans activités n3beur, compteurs à `0` |
| GET | `/api/stats/all` | oui | Stats de tous les n3beurs (inclut `pseudo`, `description`, `avatar_path`, `progression.roleEmoji`, n’expose pas `email`) |

`GET /api/stats/me/:studentId` renvoie aussi `progression` pour les n3beurs :
- `progression.thresholds` : seuils actifs par profil (clés dynamiques selon les profils `eleve_*`)
- `progression.steps` : paliers affichables (min + label + emoji + ordre d’affichage)
- `progression.roleSlug` / `progression.roleDisplayName` : profil principal actuel après synchronisation.

---

## n3beurs (comptes `student`)

| Méthode | URL | n3boss | Description |
|--------|-----|------|-------------|
| POST | `/api/students/register` | non | Rafraîchir last_seen (`{ studentId }`) |
| PATCH | `/api/students/:id/profile` | non | Mettre à jour son profil (`{ pseudo?, email?, description?, avatarData?, removeAvatar?, currentPassword }`) |
| DELETE | `/api/students/:id` | oui | Supprimer un n3beur (cascade) |

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
