# Audit bugs et incohérences ForetMap

Date: 2026-03-24

## 1) Objectif et périmètre

Ce document consolide:

- l'audit photo existant ([docs/AUDIT_PHOTOS_BIODIVERSITE.md](c:/projets_code/ForetMap/docs/AUDIT_PHOTOS_BIODIVERSITE.md), risques `R1` a `R8`),
- les incohérences backend/frontend/docs observées sur l'API, l'auth, le temps reel et la documentation interne.

Perimetre examine:

- API Express: [server.js](c:/projets_code/ForetMap/server.js), [routes/](c:/projets_code/ForetMap/routes/)
- Frontend React: [src/App.jsx](c:/projets_code/ForetMap/src/App.jsx), [src/components/](c:/projets_code/ForetMap/src/components/)
- Doc API: [docs/API.md](c:/projets_code/ForetMap/docs/API.md)
- Regles Cursor: [.cursor/rules/foretmap-frontend.mdc](c:/projets_code/ForetMap/.cursor/rules/foretmap-frontend.mdc)

## 2) Inventaire rapide des routes par profil

- Routes strictement prof (`requireTeacher`): creation/modification/suppression zones, marqueurs, plantes, validation/suppression logs de taches, stats globales, audit.
- Routes publiques ou semi-publiques: lecture carte/zones/plantes/taches, operations eleve sur taches (`assign`, `done`), et observations eleve.
- Point d'attention majeur: certaines routes eleves reposent encore sur un `studentId` fourni par le client (pas de session serveur eleve).

## 3) Matrice unique des constats (fusion globale)

| ID | Zone | Gravite | Fichiers | Constat | Action proposee |
|---|---|---|---|---|---|
| R1 | Photos zones | Haute | [routes/zones.js](c:/projets_code/ForetMap/routes/zones.js) | Suppression d'une zone: suppression SQL des `zone_photos` sans purge explicite des fichiers disque. | Supprimer les fichiers associes avant `DELETE FROM zone_photos` en suppression de zone. |
| R2 | Upload images | Haute | [lib/uploads.js](c:/projets_code/ForetMap/lib/uploads.js), [routes/zones.js](c:/projets_code/ForetMap/routes/zones.js), [routes/tasks.js](c:/projets_code/ForetMap/routes/tasks.js), [routes/observations.js](c:/projets_code/ForetMap/routes/observations.js) | Ecriture base64 sans validation stricte MIME/magic bytes/taille decodee. | Ajouter validation serveur unifiee avant ecriture disque. |
| R3 | Confidentialite images | Haute | [routes/zones.js](c:/projets_code/ForetMap/routes/zones.js), [routes/tasks.js](c:/projets_code/ForetMap/routes/tasks.js), [routes/observations.js](c:/projets_code/ForetMap/routes/observations.js) | Routes image `GET` ouvertes, accessibles sans auth applicative. | Definir politique d'acces par type de media (public/prof/eleve proprietaire). |
| R4 | Performance upload | Moyenne | [server.js](c:/projets_code/ForetMap/server.js), [src/components/tasks-views.jsx](c:/projets_code/ForetMap/src/components/tasks-views.jsx), [src/components/foretmap-views.jsx](c:/projets_code/ForetMap/src/components/foretmap-views.jsx) | Pipeline base64 JSON (10MB) couteux en CPU/memoire. | Cibler `multipart/form-data` ou uploads signes (phase suivante). |
| R5 | Cohesion frontend image | Moyenne | [src/components/tasks-views.jsx](c:/projets_code/ForetMap/src/components/tasks-views.jsx), [src/utils/image.js](c:/projets_code/ForetMap/src/utils/image.js) | Compression image dupliquee (log tache vs helper mutualise). | Unifier la compression image dans un helper commun. |
| R6 | Gouvernance URLs externes plantes | Moyenne | [routes/plants.js](c:/projets_code/ForetMap/routes/plants.js) | Validation HTTPS presente, mais pas d'allowlist ni controle de disponibilite des liens. | Ajouter regles domaine + verif periodique des liens. |
| R7 | Moderation photos eleves | Moyenne | [routes/observations.js](c:/projets_code/ForetMap/routes/observations.js) | Pas de workflow `pending/approved/rejected` pour observations. | Decider si moderation explicite est requise pedagogiquement. |
| R8 | Exposition media | Basse | [server.js](c:/projets_code/ForetMap/server.js), [routes/zones.js](c:/projets_code/ForetMap/routes/zones.js), [routes/tasks.js](c:/projets_code/ForetMap/routes/tasks.js), [routes/observations.js](c:/projets_code/ForetMap/routes/observations.js) | Double exposition (`/uploads` statique + endpoints `sendFile`). | Harmoniser la strategie de distribution des medias. |
| B1 | Auth observations | Haute | [routes/observations.js](c:/projets_code/ForetMap/routes/observations.js) | `DELETE /api/observations/:id` non protege alors que le commentaire annonce "prof ou eleve proprietaire". | Ajouter controle d'autorisation explicite (prof ou proprietaire verifie). |
| B2 | IDOR observations | Haute | [routes/observations.js](c:/projets_code/ForetMap/routes/observations.js) | `GET /api/observations/student/:studentId` est ouvert: lecture possible du carnet d'un autre eleve si ID connu. | Restreindre la lecture a l'eleve courant ou au prof. |
| B3 | Usurpation potentielle eleve | Haute | [routes/observations.js](c:/projets_code/ForetMap/routes/observations.js), [routes/tasks.js](c:/projets_code/ForetMap/routes/tasks.js), [src/App.jsx](c:/projets_code/ForetMap/src/App.jsx) | Plusieurs actions eleves se basent sur `studentId` dans le body, sans session serveur eleve. | Trancher entre "reseau de confiance" documente ou authentification eleve cote serveur. |
| B4 | Tâches unassign élève | Résolu | [routes/tasks.js](c:/projets_code/ForetMap/routes/tasks.js), [docs/API.md](c:/projets_code/ForetMap/docs/API.md) | `POST /api/tasks/:id/unassign` exigeait le JWT prof alors que l’UI élève et la doc indiquaient le contraire. | Code aligné sur `assign` (pas de `requireTeacher`). |
| B5 | Temps reel incomplet (observations) | Moyenne | [routes/observations.js](c:/projets_code/ForetMap/routes/observations.js), [lib/realtime.js](c:/projets_code/ForetMap/lib/realtime.js), [src/hooks/useForetmapRealtime.js](c:/projets_code/ForetMap/src/hooks/useForetmapRealtime.js) | Creation/suppression observations sans evenement Socket.IO dedie. | Emettre un evenement observations (ou etendre `students:changed`) et gerer le rafraichissement client. |
| B6 | Incoherence regle interne frontend | Basse | [.cursor/rules/foretmap-frontend.mdc](c:/projets_code/ForetMap/.cursor/rules/foretmap-frontend.mdc), [src/main.jsx](c:/projets_code/ForetMap/src/main.jsx), [index.vite.html](c:/projets_code/ForetMap/index.vite.html) | Regle Cursor decrivait encore l'ancien mode UMD/public alors que Vite est actif. | Corrige dans ce lot: regle mise a jour sur la stack reelle. |
| B7 | Temps reel presence eleve | Basse | [routes/auth.js](c:/projets_code/ForetMap/routes/auth.js), [routes/students.js](c:/projets_code/ForetMap/routes/students.js), [lib/realtime.js](c:/projets_code/ForetMap/lib/realtime.js) | Mise a jour `last_seen` sans emission temps reel; stats prof possiblement stale jusqu'au prochain refresh. | Optionnel: emettre un evenement leger pour presence/derniere activite. |

## 4) Cartographie cycle de vie `image_path` / suppression

### 4.1 `zone_photos`

- Creation: insertion SQL puis ecriture disque (`saveBase64ToDisk`) puis update `image_path`.
- Suppression unitaire: suppression fichier (`deleteFile`) puis suppression SQL.
- Suppression de zone: suppression SQL en masse sans purge explicite des fichiers (cf. `R1`).

### 4.2 `task_logs`

- Creation image: insertion log puis ecriture disque puis update `image_path`.
- Suppression log unitaire (prof): suppression fichier puis suppression SQL.
- Suppression tache: suppression SQL des logs/assignments/tache sans purge explicite des fichiers de logs.

### 4.3 `observation_logs`

- Creation image: insertion observation puis ecriture disque puis update `image_path`.
- Suppression observation: suppression fichier puis suppression SQL.
- Controle d'acces insuffisant sur la suppression (cf. `B1`).

### 4.4 `students.avatar_path`

- Mise a jour profil: ecriture nouvel avatar puis suppression ancien fichier si besoin.
- Suppression avatar: suppression fichier puis nullification `avatar_path`.
- Suppression eleve: suppression SQL de l'eleve sans purge explicite du repertoire avatar.

## 5) Mutations sans emission temps reel

Mutations metier detectees sans `emitTasksChanged`, `emitGardenChanged` ou `emitStudentsChanged`:

1. `POST /api/observations` (creation observation)
2. `DELETE /api/observations/:id` (suppression observation)
3. Mises a jour de `last_seen` (`/api/auth/login`, `/api/students/register`) si l'on considere la presence comme evenement temps reel utile.

Impact UX:

- Carnet d'observations non synchronise en multi-clients sans refresh manuel.
- Tableau prof potentiellement en retard sur la presence eleve.

## 6) Priorisation recommandee

1. **Securite immediate**: `B1`, `B2`, `B3`, puis `R1`.
2. **Coherence fonctionnelle**: ~~`B4`~~, `B5`.
3. **Durcissement media**: `R2`, `R3`, `R4`, `R5`, `R8`.
4. **Qualite outillage/docs**: `B6` (deja corrige), puis `R6`, `R7`, `B7`.
