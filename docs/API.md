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

## Auth

| Méthode | URL | Body | Description |
|--------|-----|------|-------------|
| POST | `/api/auth/register` | `{ firstName, lastName, password }` | Créer un compte élève |
| POST | `/api/auth/login` | `{ firstName, lastName, password }` | Connexion élève |
| POST | `/api/auth/teacher` | `{ pin }` | Connexion prof → `{ token }` (JWT) |

Routes protégées « prof » : header `Authorization: Bearer <token>`.

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
| GET | `/api/zones/:id/photos/:pid/data` | non | Données image (fichier ou `{ image_data }`) |
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

## Plantes

| Méthode | URL | Prof | Description |
|--------|-----|------|-------------|
| GET | `/api/plants` | non | Liste des plantes |
| POST | `/api/plants` | oui | Créer plante |
| PUT | `/api/plants/:id` | oui | Modifier plante |
| DELETE | `/api/plants/:id` | oui | Supprimer plante |

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
| GET | `/api/tasks/:id/logs/:logId/image` | non | Image d’un log (fichier ou JSON) |
| POST | `/api/tasks/:id/validate` | oui | Valider la tâche |

---

## Stats

| Méthode | URL | Prof | Description |
|--------|-----|------|-------------|
| GET | `/api/stats/me/:studentId` | non | Stats d’un élève |
| GET | `/api/stats/all` | oui | Stats de tous les élèves |

---

## Élèves

| Méthode | URL | Prof | Description |
|--------|-----|------|-------------|
| POST | `/api/students/register` | non | Rafraîchir last_seen (`{ studentId }`) |
| DELETE | `/api/students/:id` | oui | Supprimer un élève (cascade) |

---

## Codes d’erreur

- **401** : Non authentifié ou token invalide ; possible `{ error, deleted: true }` si compte supprimé.
- **403** : Accès refusé.
- **404** : Ressource introuvable.
- **409** : Conflit (ex. compte déjà existant).
- **503** : Mode prof non configuré (`TEACHER_PIN` manquant).

---

## Accessibilité (a11y)

Recommandations pour les évolutions frontend : labels sur tous les champs de formulaire, focus visible sur les modales (PIN, tâche), contraste suffisant (variables CSS existantes), navigation clavier pour les actions principales.
