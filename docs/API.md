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
| GET | `/api/admin/logs` | Dernières lignes des logs applicatifs (Pino) depuis un **tampon mémoire** (`?lines=200` par défaut, max 5000). Réponse JSON : `entries` (tableau de chaînes), `bufferLines`, `bufferMax`. |

Le tampon est dimensionné par **`LOG_BUFFER_MAX_LINES`** (défaut 2000, plafond 5000). Les logs antérieurs au démarrage du process ne sont pas disponibles ici (voir aussi les logs du panel hébergeur / stdout).

---

## Temps réel (Socket.IO)

Connexion Socket.IO (transport **polling** actuellement forcé côté client) sur le **même hôte** que l’API, chemin `/socket.io`.

- **CORS** : en production, même règle que l’API (`FRONTEND_ORIGIN` si défini).
- **Rôle** : notifier les clients qu’une ressource a changé ; les données à jour restent à charger via les routes REST (`GET /api/tasks`, etc.).
- **Auth socket** : token JWT requis (transmis dans le handshake Socket.IO).
- **Rooms** : souscription de domaine (`tasks`, `students`, `garden`) + souscription carte via `subscribe:map` (payload `{ mapId }`).
- **Client** : le frontend se connecte pour élève/prof authentifié ; en cas d’échec, le rafraîchissement périodique reste actif (cadence adaptative).

Événements émis par le serveur (payload JSON, toujours avec un champ `ts` — horodatage) :

| Événement | Quand | Champs utiles (exemples) |
|-----------|--------|---------------------------|
| `tasks:changed` | Création / modification / suppression de tâche, assignation, désassignation, marquer fait, validation, suppression d’un log | `reason`, `taskId`, `mapId` |
| `students:changed` | Inscription d’un élève, suppression d’un élève | `reason`, `studentId` |
| `garden:changed` | Zones, photos de zone, biodiversité, marqueurs carte | `reason`, `zoneId`, `plantId`, `markerId`, `mapId`… |
| `collective:changed` | Activation/reset/mise à jour/réconciliation d’une session collectif | `reason`, `contextType`, `contextId`, `sessionId`, `version` |
| `forum:changed` | Création de sujet, réponse, suppression de message, verrouillage, signalement | `reason`, `threadId`, `postId` |
| `context-comments:changed` | Création/suppression/signalement d’un commentaire contextuel | `reason`, `contextType`, `contextId`, `commentId` |

---

## Auth

| Méthode | URL | Body | Description |
|--------|-----|------|-------------|
| POST | `/api/auth/register` | `{ firstName, lastName, password, pseudo?, email?, description? }` | Créer un compte élève (profil RBAC par défaut : `visiteur`) |
| POST | `/api/auth/login` | `{ identifier, password }` | Connexion élève (pseudo ou email) |
| GET | `/api/auth/me` | — | Retourne le contexte d’auth courant (`role`, `permissions`, `elevated`) |
| PATCH | `/api/auth/me/profile` | `{ pseudo?, email?, description?, affiliation?, avatarData?, removeAvatar?, currentPassword }` | Mettre à jour son profil utilisateur connecté (élève, prof, admin local) |
| POST | `/api/auth/elevate` | `{ pin }` | Élévation de session via PIN du profil |
| POST | `/api/auth/forgot-password` | `{ email }` | Déclencher un email de réinitialisation élève (réponse neutre) |
| POST | `/api/auth/reset-password` | `{ token, password }` | Réinitialiser le mot de passe élève |
| POST | `/api/auth/teacher` | `{ pin }` | Compatibilité historique : élévation PIN (ou mode secours admin) |
| POST | `/api/auth/teacher/login` | `{ email, password }` | Connexion prof email/mot de passe → `{ token }` (JWT) |
| POST | `/api/auth/teacher/forgot-password` | `{ email }` | Déclencher un email de réinitialisation prof (réponse neutre) |
| POST | `/api/auth/teacher/reset-password` | `{ token, password }` | Réinitialiser le mot de passe prof |

Routes protégées « prof » : header `Authorization: Bearer <token>`.

---

## RBAC (admin)

Toutes les routes RBAC exigent un token admin avec élévation PIN active.

| Méthode | URL | Description |
|--------|-----|-------------|
| GET | `/api/rbac/profiles` | Liste des profils + permissions |
| POST | `/api/rbac/profiles` | Créer un profil |
| PATCH | `/api/rbac/profiles/:id` | Renommer/ajuster rang d’un profil |
| PUT | `/api/rbac/profiles/:id/permissions` | Remplacer les permissions d’un profil |
| PUT | `/api/rbac/profiles/:id/pin` | Changer le PIN d’un profil |
| GET | `/api/rbac/users` | Liste utilisateurs et profil attribué |
| PUT | `/api/rbac/users/:userType/:userId/role` | Attribuer le profil principal d’un utilisateur |

### Droits paramétrables (catalogue)

Ces droits sont assignables depuis la console **Profils & utilisateurs**.

| Clé permission | Libellé | Description |
|--------|-----|-------------|
| `teacher.access` | Accès interface professeur | Permet d’ouvrir l’interface professeur |
| `admin.roles.manage` | Gestion des profils RBAC | Créer/renommer profils, permissions et PIN |
| `admin.users.assign_roles` | Attribution des profils | Attribuer/retraiter un profil aux utilisateurs |
| `users.create` | Création unitaire utilisateurs | Créer un utilisateur unitaire (élève/prof/admin selon droits) |
| `admin.settings.read` | Lecture paramètres admin | Consulter la console de réglages |
| `admin.settings.write` | Édition paramètres admin | Modifier les réglages non secrets |
| `admin.settings.secrets.write` | Actions admin critiques | Exécuter les actions critiques (restart, secrets) |
| `stats.read.all` | Lecture stats globales | Consulter les stats de tous les élèves |
| `stats.export` | Export stats | Exporter les stats élèves en CSV |
| `students.import` | Import élèves | Importer des élèves via CSV/XLSX |
| `students.delete` | Suppression élève | Supprimer un compte élève |
| `tasks.manage` | Gestion tâches | Créer/éditer/supprimer les tâches |
| `tasks.validate` | Validation tâches | Valider les tâches terminées |
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

Réglages de progression élèves (scope enseignant/admin) :
- `progression.student_role_min_done_eleve_avance`
- `progression.student_role_min_done_eleve_chevronne`
- Contrainte : le seuil `eleve_chevronne` doit être strictement supérieur à `eleve_avance`.

---

## Zones

| Méthode | URL | Prof | Description |
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

---

## Carte (marqueurs)

| Méthode | URL | Prof | Description |
|--------|-----|------|-------------|
| GET | `/api/map/markers` | non | Liste des repères |
| POST | `/api/map/markers` | oui | Créer repère |
| PUT | `/api/map/markers/:id` | oui | Modifier repère |
| DELETE | `/api/map/markers/:id` | oui | Supprimer repère |

---

## Visite guidée

| Méthode | URL | Prof | Description |
|--------|-----|------|-------------|
| GET | `/api/visit/content?map_id=foret` | non | Contenus publics de visite (zones, repères, médias, tutoriels actifs) |
| GET | `/api/visit/progress?student_id=:id` | non | Progression des cibles vues (élève connecté ou anonyme via cookie signé) |
| POST | `/api/visit/seen` | non | Marquer/démarquer une cible vue (`{ target_type, target_id, seen, student_id? }`) |
| GET | `/api/visit/stats` | oui | KPI de visite (sessions, complétion, breakdown élève/anonyme) |
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
- Les routes de gestion (`/zones`, `/markers`, `/media`, `/tutorials`, `/sync/*`) exigent la permission prof `visit.manage` (session élevée).

---

## Biodiversité (`/api/plants`)

| Méthode | URL | Prof | Description |
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

`POST /api/plants/:id/photo-upload` (prof):

- Body: `{ field, imageData }`
- `field` doit être l'un des champs photo (`photo`, `photo_species`, `photo_leaf`, `photo_flower`, `photo_fruit`, `photo_harvest_part`)
- `imageData` doit être une Data URL image (png/jpg/webp/gif/bmp/avif)
- Réponse: `{ field, url, plant }`

`POST /api/plants/import` (prof):

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

| Méthode | URL | Prof | Description |
|--------|-----|------|-------------|
| GET | `/api/tasks` | non | Liste des tâches (avec assignments) |
| GET | `/api/tasks/:id` | non | Détail tâche |
| POST | `/api/tasks` | oui | Créer tâche |
| PUT | `/api/tasks/:id` | oui | Modifier tâche |
| DELETE | `/api/tasks/:id` | oui | Supprimer tâche |
| POST | `/api/tasks/:id/assign` | non | S’assigner (élève) |
| POST | `/api/tasks/:id/unassign` | non | Se désassigner |
| POST | `/api/tasks/:id/done` | non | Marquer comme fait (commentaire/image) |
| GET | `/api/tasks/:id/logs` | non | Logs de la tâche |
| GET | `/api/tasks/:id/logs/:logId/image` | non | Image d’un log (fichier disque) |
| POST | `/api/tasks/:id/validate` | oui | Valider la tâche |

---

## Session collectif

Routes réservées aux profils ayant `teacher.access` + `stats.read.all`.

| Méthode | URL | Prof | Description |
|--------|-----|------|-------------|
| GET | `/api/collective/session?contextType=map|project&contextId=:id` | oui | Lire l’état de session collectif |
| PUT | `/api/collective/session` | oui | Activer/désactiver une session de contexte |
| PUT | `/api/collective/session/attendance` | oui | Marquer un élève présent/absent dans la session |
| PUT | `/api/collective/session/tasks` | oui | Ajouter/retirer une tâche de la session |
| PUT | `/api/collective/session/students` | oui | Ajouter/retirer un élève de la session |
| PUT | `/api/collective/session/attendance/bulk` | oui | Marquer plusieurs élèves présents/absents (lot) |
| PUT | `/api/collective/session/tasks/bulk` | oui | Ajouter/retirer plusieurs tâches de la session (lot) |
| PUT | `/api/collective/session/students/bulk` | oui | Ajouter/retirer plusieurs élèves de la session (lot) |
| POST | `/api/collective/session/reset` | oui | Réinitialiser la session (sélections + absences) |

Contrat d’écriture (PUT/POST) :

- `expectedVersion` (entier `>= 0`) est **obligatoire**.
- Le serveur compare `expectedVersion` à `session.version`.
- En cas d’écart, réponse `409`:
  - `error: "Session collectif modifiée ailleurs"`
  - `expected_version`, `current_version`
  - `current` : état courant complet de la session.

Contrats bulk (PUT `/bulk`) :

- `studentIds` / `taskIds` : tableau d’identifiants (doublons ignorés, max 300 éléments traités).
- `selected` (tasks/students) ou `absent` (attendance) : booléen d’action.
- Réponse : état de session standard + objet `bulk` (`requested`, `applied`, `invalid`, et selon route `out_of_context` ou `not_selected`).

---

## Forum global

Toutes les routes forum exigent un utilisateur connecté (`Authorization: Bearer <token>`), élève ou prof.
Le profil `visiteur` est refusé (`403`) pour éviter l’exposition d’identités d’autres utilisateurs.

| Méthode | URL | Description |
|--------|-----|-------------|
| GET | `/api/forum/threads?page=1&page_size=20` | Liste paginée des sujets (tri : épinglés puis activité récente) |
| POST | `/api/forum/threads` | Créer un sujet + premier message (`{ title, body }`) |
| GET | `/api/forum/threads/:id?page=1&page_size=50` | Détail d’un sujet + messages paginés |
| POST | `/api/forum/threads/:id/posts` | Ajouter une réponse (`{ body }`) |
| POST | `/api/forum/posts/:id/report` | Signaler un message (`{ reason }`) |
| PATCH | `/api/forum/threads/:id/lock` | Verrouiller/déverrouiller un sujet (`{ locked }`, prof/admin) |
| DELETE | `/api/forum/posts/:id` | Supprimer un message (auteur ou prof/admin) |

Contraintes principales :

- Validation serveur des longueurs (titre/message/motif).
- Anti-abus V1 : cooldown par utilisateur sur création de sujet/réponse.
- `409` sur réponse dans un sujet verrouillé.
- `409` sur signalement dupliqué (même utilisateur, même message, signalement déjà ouvert).

---

## Commentaires contextuels

Toutes les routes commentaires contextuels exigent un utilisateur connecté (`Authorization: Bearer <token>`), élève ou prof.

Contexte supporté :

- `contextType=task` (tâche)
- `contextType=project` (projet de tâches)
- `contextType=zone` (zone de la carte)

| Méthode | URL | Description |
|--------|-----|-------------|
| GET | `/api/context-comments?contextType=task|project|zone&contextId=:id&page=1&page_size=20` | Liste paginée des commentaires d’un contexte |
| POST | `/api/context-comments` | Créer un commentaire (`{ contextType, contextId, body }`) |
| DELETE | `/api/context-comments/:id` | Supprimer un commentaire (auteur ou prof/admin) |
| POST | `/api/context-comments/:id/report` | Signaler un commentaire (`{ reason }`) |

Contraintes principales :

- Validation serveur de `contextType` et de l’existence du contexte ciblé.
- Validation longueur message/motif de signalement.
- Anti-abus V1 : cooldown par utilisateur sur publication.
- Suppression logique (`is_deleted`) ; le contenu est masqué côté lecture.
- `409` sur signalement dupliqué (même utilisateur, même commentaire, signalement déjà ouvert).

---

## Stats

| Méthode | URL | Prof | Description |
|--------|-----|------|-------------|
| GET | `/api/stats/me/:studentId` | non | Stats de l’utilisateur ciblé (propriétaire ou permission `stats.read.all`) ; pour prof/admin sans activités élève, compteurs à `0` |
| GET | `/api/stats/all` | oui | Stats de tous les élèves (inclut `pseudo`, `description`, `avatar_path`, n’expose pas `email`) |

`GET /api/stats/me/:studentId` renvoie aussi `progression` pour les élèves :
- `progression.thresholds` : seuils actifs par profil (`eleve_novice`, `eleve_avance`, `eleve_chevronne`)
- `progression.steps` : paliers affichables (min + label de profil)
- `progression.roleSlug` / `progression.roleDisplayName` : profil principal actuel après synchronisation.

---

## Élèves

| Méthode | URL | Prof | Description |
|--------|-----|------|-------------|
| POST | `/api/students/register` | non | Rafraîchir last_seen (`{ studentId }`) |
| PATCH | `/api/students/:id/profile` | non | Mettre à jour son profil (`{ pseudo?, email?, description?, avatarData?, removeAvatar?, currentPassword }`) |
| DELETE | `/api/students/:id` | oui | Supprimer un élève (cascade) |

`avatarData` doit être une data URL image (`png`, `jpg/jpeg`, `webp`). Les fichiers sont stockés sous `uploads/students/...` et exposés via `/uploads/...`.

---

## Codes d’erreur

- **401** : Non authentifié ou token invalide ; possible `{ error, deleted: true }` si compte supprimé.
- **403** : Accès refusé.
- **404** : Ressource introuvable.
- **409** : Conflit (ex. compte déjà existant).
- **503** : Mode prof non configuré (`TEACHER_PIN` ou `JWT_SECRET` manquant en production).

---

## Accessibilité (a11y)

Recommandations pour les évolutions frontend : labels sur tous les champs de formulaire, focus visible sur les modales (PIN, tâche), contraste suffisant (variables CSS existantes), navigation clavier pour les actions principales.
