# Audit — mécaniques d'échéance (ForetMap, septembre 2026)

Inventaire et vérification de **tout ce qui dépend d'une date** côté tâches / projets :
saisie, affichage, notifications, récurrence, archivage automatique. Les points corrigés
dans le même lot sont marqués **[corrigé]** ; les autres sont des constats documentés
(aucun changement de comportement métier n'a été fait sans demande).

## 1. Les champs de date

| Champ                                   | Table           | Type        | Sens                                                 |
| --------------------------------------- | --------------- | ----------- | ---------------------------------------------------- |
| `tasks.start_date`                      | `tasks`         | VARCHAR(32) | Date de départ : avant elle, inscription refusée     |
| `tasks.due_date`                        | `tasks`         | VARCHAR(32) | Date limite : affichage « Dans N jours / En retard » |
| `tasks.validated_at`                    | `tasks`         | DATETIME    | Horodatage de validation — référence archivage auto  |
| `tasks.recurrence_spawned_for_due_date` | `tasks`         | VARCHAR     | Anti-doublon de la duplication récurrente            |
| `task_projects.finished_at`             | `task_projects` | DATETIME    | Validation du projet — référence archivage auto      |
| `*.archived_at`                         | les deux        | DATETIME    | Soft-delete (archivage)                              |

Les deux dates de tâche sont des **dates nues** (`YYYY-MM-DD`), pas des instants : le
formulaire les saisit en `<input type="date">`. Elles sont donc à interpréter dans le
calendrier de l'utilisateur, jamais en UTC.

## 2. Affichage de l'échéance (front)

`daysUntil` (`src/utils/badges.jsx`) alimente la puce 📅 de la tuile, le bandeau
« Échéances proches » et les notifications.

- **[corrigé]** La fonction soustrayait deux **instants** : `new Date('2026-09-02')` est
  parsée à minuit **UTC**, comparée à l'heure locale. À l'est de Greenwich, une tâche due
  le jour même s'affichait « Demain » entre minuit et le décalage horaire (2 h l'été à
  Paris). Elle compare désormais des **jours de calendrier locaux**
  (`Math.round` pour absorber les jours de 23/25 h aux changements d'heure) et renvoie
  `null` sur une valeur illisible au lieu d'un `NaN` affiché.
- Bandeau élève « Échéances proches » (`studentUrgentDueTasks`) : fenêtre **J-2 → J+3**,
  hors tâches validées / terminées / en attente / de projet clos. Une tâche en retard de
  plus de 2 jours en sort — c'est **voulu** (le bandeau signale l'imminent, pas l'arriéré),
  mais cela mérite d'être connu.

## 3. Notifications d'échéance (élève)

`useNotificationCenter` compte, sur les tâches assignées `available`/`in_progress` de la
carte active : « Échéance proche » (J0/J+1) et « Tâches en retard » (< J0).

- **[corrigé]** La clé de dédoublonnage contenait le **compte**
  (`student-deadline-overdue-2`) : chaque variation créait un item supplémentaire, et
  **aucun n'était jamais refermé**. Le centre gardait « 2 tâches en retard » sept jours
  (durée de rétention du `localStorage`) après leur validation. Les deux avis sont
  désormais des **règles d'état** — clé stable + `resolveNotificationsByKey` dès que la
  condition retombe — comme « Serveur indisponible ».
- **[corrigé]** Le comptage utilisait `Math.floor` sur un écart en millisecondes, là où la
  puce utilisait `Math.ceil` : une tâche due **aujourd'hui** était annoncée « en retard »
  dès minuit alors que sa tuile affichait « Aujourd'hui ». Les deux passent par `daysUntil`.
- Le cooldown de dédoublonnage (10 min) reste en vigueur : le libellé peut retarder d'un
  cycle l'affichage d'un nouveau compte. Acceptable, et sans rapport avec l'empilement.

## 4. Date de départ (`start_date`)

`isTaskBeforeStartDate` existe en double, front (`src/utils/taskListHelpers.js`) et back
(`lib/taskRouteHelpers.js`), avec la même règle : `start_date > aujourd'hui` ⇒ statut
effectif `on_hold`, inscription refusée (`routes/tasks/assignments.js`). Le serveur reste
l'autorité, le front n'anticipe que l'affichage.

- **Constat** : « aujourd'hui » est lu côté serveur dans le fuseau du **process Node**,
  sans normalisation. Si le process tourne en UTC et l'utilisateur à Paris, la bascule de
  jour diverge de 1 à 2 h — une tâche démarrant aujourd'hui peut être refusée en tout
  début de nuit. À rapprocher de la récurrence, qui, elle, lit explicitement un fuseau
  (`FORETMAP_RECURRENCE_TZ`, défaut `Europe/Paris`). Uniformiser demanderait soit de fixer
  `TZ=Europe/Paris` sur le process, soit d'étendre `FORETMAP_RECURRENCE_TZ` à ce calcul.

## 5. Récurrence (`lib/recurringTasks.js`)

Duplication d'une tâche `weekly` / `biweekly` / `monthly` **validée** dont l'échéance est
atteinte. Conditions cumulées, reprises à l'identique dans la relecture verrouillée
(`SELECT … FOR UPDATE`) qui referme la course entre deux instances :

- `recurrence` dans la liste blanche, `due_date` non vide et `<= aujourd'hui` ;
- `status = 'validated'` ;
- `archived_at IS NULL` — archiver une récurrente **l'arrête** ;
- `recurrence_spawned_for_due_date <> due_date` — anti-doublon.

Nouvelle échéance = échéance + 7 / 14 jours ou + 1 mois (dernier jour du mois borné :
31 janvier → 28/29 février). Nouvelle date de départ = ancienne avancée du même pas, à
défaut la date de création avancée, dans tous les cas **plafonnée à la nouvelle échéance**.

- **Constat** : `parseISODateOnly` n'accepte **que** `YYYY-MM-DD`. Une `due_date` d'un
  autre format (possible, voir §7) fait échouer la récurrence **en silence** — la tâche ne
  réapparaît jamais, sans trace dans les logs.

## 6. Archivage automatique (`lib/autoArchive.js`) et job quotidien

- Tâches `status='validated'` avec `validated_at` antérieur à la date-butoir ; projets
  `status='validated'` avec `finished_at` antérieur. Délai réglable
  (`tasks.auto_archive_after_days`, défaut **120 j**, bornes 7–3650), activable
  (`tasks.auto_archive_enabled`). Les projets `completed` (statut automatique, réversible)
  sont **hors périmètre** — vérifié conforme au commentaire du module.
- `validated_at` est posé sur **chaque** entrée dans `validated` (PUT, POST /validate,
  import) ; `finished_at` sur `POST /task-projects/:id/validate`. Le PUT générique ne peut
  pas écrire `validated` (`PROJECT_STATUSES_API_WRITE` = `active` | `on_hold`) : il n'y a
  donc pas de chemin laissant un projet validé sans `finished_at`.
- **Constat mineur** : la date-butoir est calculée en JS et transmise comme `Date`, tandis
  que `validated_at` est écrit par `NOW()` (fuseau du serveur MySQL). Le pool n'impose pas
  d'option `timezone`, donc le formatage suit le fuseau du process Node. Un écart de
  fuseau décale la butoir de quelques heures — sans effet pratique sur un délai de 120 j.
- **Constat** : les deux jobs quotidiens tournent sur un `setInterval(24 h)` calé sur le
  **démarrage du process** (+ 45–165 s de jitter), pas sur une heure d'horloge. L'heure
  d'exécution dérive donc à chaque redémarrage. Sans conséquence fonctionnelle (les deux
  traitements sont idempotents), mais l'exécution n'est pas prévisible à l'heure près.

## 7. Validation des dates à l'écriture

- `POST /api/tasks` et `PUT /api/tasks/:id` insèrent `start_date` et `due_date`
  **telles quelles** (`due_date || null`), sans contrôle de format. La colonne étant un
  `VARCHAR(32)`, toute chaîne courte est acceptée. En pratique le formulaire envoie un
  `<input type="date">`, mais un appel direct à l'API peut poser une valeur qui casse
  silencieusement la récurrence (§5). L'import tableur, lui, **valide** le format
  (« Date limite invalide » / « Date de départ invalide »).
- **Aucune cohérence `due_date >= start_date`** n'est vérifiée, ni à l'API ni à l'import :
  une tâche peut être due avant d'avoir commencé. Elle apparaît alors « en attente » et
  « en retard » simultanément.
- Ce sont des durcissements possibles ; ils changeraient des réponses d'API et n'ont pas
  été appliqués ici.

## 8. Tri par échéance

`taskImportanceOrderBySql` (back) et `compareTasksByImportanceThenDueDate` (front) trient
par ordre manuel, puis importance, puis `due_date` croissante. Les deux placent les tâches
**sans échéance en tête** à importance égale (`NULL`/`''` triés avant les dates). Front et
back sont **cohérents entre eux** ; c'est un choix d'affichage, signalé ici seulement parce
qu'il surprend (on attendrait plutôt les échéances les plus proches d'abord).

## 9. Autres échéances de l'application (hors tâches)

Vérifiées comme cohérentes, sans anomalie relevée :

- **Verrou de re-tentative** du conditionnement « marquer comme acquis »
  (`lib/learningGatingCooldown.js`) : `locked_until` en DATETIME comparé au `NOW()` serveur,
  avec une sentinelle `1970-01-01` pour distinguer une ligne de **comptage** d'un vrai
  verrou (piège déjà documenté et corrigé dans le module).
- **Réinitialisation de mot de passe** (`lib/passwordReset.js`) et durée de vie des JWT :
  échéances portées par le serveur, sans dépendance au calendrier de l'utilisateur.

## 10. Ce qui n'a pas pu être rejoué ici

Les tests backend (`npm test`) exigent MySQL/MariaDB ; l'environnement de développement de
cet audit n'en disposait pas (`ECONNREFUSED 127.0.0.1:3306`). Les vérifications ci-dessus
sont des lectures de code, complétées par les tests UI (`npm run test:ui`, au vert) et par
les nouveaux cas `tests-ui/utils/daysUntil.test.js` et « échéances n3beur » de
`tests-ui/hooks/useNotificationCenter.test.jsx`.
