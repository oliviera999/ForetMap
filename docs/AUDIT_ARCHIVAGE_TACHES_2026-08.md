# Audit du système d'archivage des tâches (août 2026)

> **Statut : audit, puis exécution partielle.** Le relevé (§1 à §6) a été établi en lisant le
> code ; les correctifs décidés dans la foulée sont appliqués dans le même lot et signalés
> **✅ corrigé** au fil du texte. Ce qui reste ouvert est listé en **§7** avec la raison.
> Périmètre : le mécanisme d'archivage **ForetMap** de bout en bout — colonnes
> (`migrations/169_tasks_and_projects_archived_at.sql`), API
> (`routes/tasks.js`, `routes/task-projects.js`, `routes/tasks/assignments.js`),
> job quotidien (`lib/autoArchive.js`, `server.js`), lecture (`lib/taskRouteHelpers.js`),
> et affichage (`src/App.jsx`, `src/utils/taskArchive.js`, `src/utils/taskSectioning.js`,
> `src/components/tasks-views.jsx`). GL est hors périmètre (archivage distinct).
> Chaque constat porte sa référence `fichier:ligne` et, quand il est reproductible, le
> scénario exact qui le déclenche.

---

## 1. En une page

**Le mécanisme est bien conçu.** L'archivage est un _soft-delete_ horodaté (`archived_at`),
réversible, qui ne touche ni au statut, ni aux comptes rendus, ni aux liaisons. Trois
décisions le mettent au-dessus de la moyenne :

- **Le marqueur de cascade** (`archived_via_project`) plutôt qu'un rapprochement par
  horodatage. Désarchiver un projet ne restaure que les tâches archivées **par ce geste-là** ;
  une tâche rangée à la main auparavant reste rangée. Deux archivages dans la même seconde
  n'entrent pas en collision — c'est exactement le piège que la colonne évite
  (`migrations/169_…sql:11-14`).
- **La portée d'archivage forcée à `active` hors permission `tasks.manage`**
  (`routes/tasks.js:293-295`, `routes/task-projects.js:294-296`) : un élève ne peut pas
  demander à voir les archives, même en forgeant `?archived=all`. Un test le fige
  (`tests/tasks-archive.test.js:143`).
- **Le périmètre volontairement étroit du job automatique** : uniquement les éléments
  **validés**. Une tâche en cours, en attente ou jamais commencée n'est jamais archivée
  automatiquement, si vieille soit-elle (`lib/autoArchive.js:50-70`).

Et le rayonnement de l'archivage a déjà été traité : quota d'inscriptions, récurrence,
duplication de projet et complétion de projet excluent tous les archives
(`tests/archivage-effets.test.js`, `lib/syncTaskProjectCompletion.js:27`).

**Quatre défauts existent malgré tout**, dont deux font disparaître du travail de l'écran.

1. **Une tâche « Urgent ! » validée ne rejoignait jamais « ✅ Validées »** : elle restait
   piégée dans l'encart urgence, à jamais. Ce n'est pas un défaut d'archivage à proprement
   parler, mais c'est le point de départ de cet audit. **§2 — ✅ corrigé**
2. **Archiver un projet sans cascade rendait ses tâches actives invisibles** : plus dans le
   bloc projet (le projet a quitté la liste), et dans aucune section (leur statut effectif
   ne correspond à rien de rendu). C'est le seul chemin par lequel l'archivage fait perdre
   du travail de vue. **§3 — ✅ corrigé**
3. **Une tâche importée en statut « validée » n'était jamais archivable automatiquement** :
   l'import n'écrivait pas `validated_at`, et le job ignore les lignes sans cette date. Fuite
   permanente. **§4 — ✅ corrigé**
4. **L'API acceptait encore les actions élève sur une tâche archivée** : s'inscrire, marquer
   terminée. Combiné au fait que le quota d'inscriptions ignore les archives, cela ouvrait un
   contournement du plafond. **§5 — ✅ corrigé**

Enfin, deux points ne sont **pas** des défauts mais méritent d'être écrits noir sur blanc,
parce qu'ils surprennent : la progression des élèves compte les tâches archivées (**§6.1**),
et la planification du job quotidien dépend de la longévité du processus (**§6.2**).

---

## 2. La tâche urgente validée qui ne rejoint pas « Validées »

**Constat.** La section « 🚨 Urgent ! » retenait **toutes** les tâches d'importance
« absolue », sans regarder leur statut, puis les **retirait** de toutes les autres sections :

```js
// src/components/tasks-views.jsx (avant)
const urgentCategoryTasks   = allFiltered.filter(isTaskUrgentCategory)…
const allFilteredWithoutUrgent = allFiltered.filter((t) => !isTaskUrgentCategory(t));
```

Une tâche urgente validée restait donc affichée sous « 🚨 Urgent ! » — avec son bandeau
d'urgence — et n'apparaissait ni dans « ✅ Validées » (professeur) ni dans
« ✅ Récemment validées » (élève). L'encart urgence se remplissait de travail terminé, et le
signal « ce qui reste à faire d'urgent » se diluait à chaque validation.

**Reproduction.** Créer une tâche avec « Degré d'importance = Urgent ! », la valider,
recharger l'écran Tâches. La tâche reste sous « 🚨 Urgent ! ».

**Correctif.** Un nouveau prédicat `isTaskUrgentPending`
(`src/utils/taskSectioning.js`) : une tâche n'alimente l'encart urgence que si son statut
effectif n'est **pas** terminal (`validated`, `project_validated`). Les statuts `done` et
`proposed` restent dans l'encart : ils attendent encore une décision du professeur, donc
une action. Une fois validée, la tâche redescend simplement dans la section de son statut,
comme n'importe quelle autre.

**Couverture.** `tests-ui/utils/taskSectioning.test.js` — trois cas
(`isTaskUrgentPending` garde les tâches vivantes, écarte les validées directement **et** via
projet, reste faux hors urgence).

---

## 3. Les tâches rendues invisibles par l'archivage d'un projet

**Constat — le plus sérieux du lot.** `taskEffectiveStatus` renvoie `project_completed` /
`project_validated` dès que le projet porteur est terminé ou validé
(`src/utils/taskListHelpers.js:63-79`). Or ces deux valeurs ne correspondent à **aucune
section rendue** : la vue Tâches ne consomme que six seaux
(`available`, `inProgress`, `done`, `validated`, `proposed`, `onHold`), tandis que
`partitionTasksByEffectiveStatus` en produisait huit — les deux derniers, `projectCompletedTasks`
et `projectValidatedTasks`, n'étaient lus par personne.

Tant que la tâche s'affiche dans le bloc de son projet, c'est sans conséquence. Mais
`regularFiltered` contient précisément les tâches dont le projet **n'est pas affiché**
(`src/components/tasks-views.jsx:539-546`). Ces tâches-là tombaient donc dans un seau que
rien ne rendait : **disparues de l'écran**, sans message ni compteur.

**Deux chemins y mènent, tous deux via l'archivage :**

| Chemin      | Geste                                                                                                | Résultat                                                                     |
| ----------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Manuel      | Archiver un projet **validé** avec `cascade: false` (`routes/task-projects.js:465`)                  | Le projet quitte la liste active, ses tâches restent actives — et invisibles |
| Automatique | Le job archive un projet validé ancien **sans cascade**, par conception (`lib/autoArchive.js:62-64`) | Idem, sans qu'aucun humain n'ait rien fait                                   |

Le second est le plus gênant : au bout de 120 jours, des tâches encore à faire pouvaient
s'évaporer de l'écran toutes seules. La vue « 📦 Archivés » présente le symétrique : une
tâche archivée dont le projet est validé mais **non** archivé y était invisible elle aussi.

**Correctif.** Un helper `taskSectionStatus` (`src/utils/taskSectioning.js`) : pour une
tâche affichée **hors** bloc projet, on recalcule le statut effectif **projet mis de côté**,
ce qui la range sur son statut propre. Les règles restantes (date de départ non atteinte →
`on_hold`) continuent de s'appliquer. `partitionTasksByEffectiveStatus` s'appuie désormais
dessus et ne produit plus que les six seaux réellement rendus — les deux seaux morts sont
retirés.

**Couverture.** `tests-ui/utils/taskSectioning.test.js` — un test vérifie le reclassement,
un autre qu'**aucune tâche ne se perd** (somme des seaux = taille de l'entrée).

---

## 4. La tâche importée « validée » qui n'est jamais archivée

**Constat.** Le job automatique n'archive que les lignes dont `validated_at` est renseigné
(`lib/autoArchive.js:53-57`) — c'est la référence de délai, et c'est la bonne conception.
Deux chemins la posaient : `POST /api/tasks/:id/validate` (`routes/tasks.js:1182`) et
`PUT /api/tasks/:id` passant en `validated` (`routes/tasks.js:983`).

**L'import ne la posait pas.** `POST /api/tasks/import` accepte pourtant `validated` comme
statut (`lib/tasks/taskImport.js:22-27`) et l'écrivait tel quel, `validated_at` restant NULL
(`lib/tasks/taskImport.js:591`). Une reprise d'historique — le cas d'usage typique de
l'import : verser un carnet de tâches déjà faites — produisait donc des tâches validées
**définitivement inéligibles** à l'archivage automatique. Elles encombrent les listes à vie,
sans que rien ne le signale.

**Correctif.** L'INSERT d'import écrit `validated_at` quand le statut importé est
`validated`. Les lignes déjà importées avant ce correctif restent à NULL : elles se
rattraperont d'elles-mêmes à la première (re)validation, ou peuvent être archivées à la main.

**Couverture.** `tests/tasks-archive.test.js` — une tâche importée en `validated` porte bien
`validated_at`, et le job la range une fois le délai dépassé.

---

## 5. Les actions élève encore acceptées sur une tâche archivée

**Constat.** « Une tâche archivée est une tâche retirée du jeu » — c'est la règle affichée
partout dans le code (`routes/task-projects.js:646-649`) et dans la doc de référence. Trois
routes ne la faisaient pas respecter :

| Route                              | Vérifiait                               | Ne vérifiait pas |
| ---------------------------------- | --------------------------------------- | ---------------- |
| `POST /api/tasks/:id/assign`       | statut, projet, date de départ, plafond | `archived_at`    |
| `POST /api/tasks/:id/assign-group` | statut validé                           | `archived_at`    |
| `POST /api/tasks/:id/done`         | mode de complétion, identité            | `archived_at`    |

La tâche ayant disparu des listes, le chemin normal est fermé — mais **un client resté
ouvert garde son id**, et l'inscription passait. Le détail qui rend cela plus qu'anecdotique :
le plafond de tâches actives par élève **ne compte que les tâches non archivées**
(`tests/archivage-effets.test.js`). Une inscription sur une tâche archivée échappait donc au
plafond, ce qui en fait un contournement, pas seulement une incohérence d'affichage.

**Correctif.** Les trois routes refusent désormais une tâche archivée (400, message explicite).
Le retrait (`unassign`) reste volontairement autorisé : rien ne justifie de piéger un élève
sur une tâche rangée.

**Couverture.** `tests/tasks-archive.test.js` — les trois routes répondent 400 et **aucune
écriture** n'a lieu (ni inscription créée, ni `done_at` posé).

---

## 6. Deux comportements corrects mais surprenants

### 6.1 La progression compte les tâches archivées — et c'est voulu

`countValidatedAssignmentsForStudent` (`lib/rbac.js:592-600`) et les statistiques
(`routes/stats.js:43-53`, `routes/stats.js:183-191`) joignent `tasks` **sans** filtre
`archived_at`. Une tâche validée puis archivée continue donc de compter dans les paliers de
l'élève et dans ses statistiques.

**C'est la bonne décision**, et il faut la garder : le contraire signifierait qu'un
professeur qui range de vieilles tâches **rétrograde** les élèves qui les avaient faites.
L'archivage range une liste ; il n'efface pas un travail accompli. Le constat est ici pour
qu'on ne « corrige » pas ce qui n'est pas cassé — aucune modification apportée.

### 6.2 Le job quotidien dépend de la longévité du processus

`scheduleRecurringTaskSpawn` (`server.js:551-578`) programme un premier passage après un
délai de dispersion (45–165 s), puis un `setInterval` de 24 h. En hébergement mutualisé, où
le processus est recyclé régulièrement, l'intervalle de 24 h n'est presque jamais atteint :
en pratique le job tourne **au démarrage**, pas « une fois par jour ».

Ce n'est pas grave pour l'archivage — le critère est un **seuil de date**, pas un compteur :
un passage manqué est simplement rattrapé au suivant, sans dérive ni double archivage. À ne
pas confondre avec les tâches récurrentes, portées par le même minuteur, où un passage manqué
a des conséquences. Aucune modification apportée ; c'est un constat d'exploitation, à traiter
(si besoin) par un cron externe appelant le même job.

---

## 7. Ce qui reste ouvert

| #   | Constat                                                                                                                                                                                                                                        | Pourquoi laissé en l'état                                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7.1 | Une tâche archivée par cascade dont le **projet est ensuite supprimé** garde `archived_via_project = 1` et perd son `project_id` (FK `ON DELETE SET NULL`, `sql/schema_foretmap.sql:175`). Plus aucun désarchivage de projet ne la restaurera. | Sans conséquence pratique : le désarchivage individuel fonctionne toujours, et la tâche reste visible sous « 📦 Archivés ».                                                                 |
| 7.2 | `POST /api/task-projects/:id/reorder` inclut les tâches archivées dans l'ordre du projet (`routes/tasks.js:429-436`).                                                                                                                          | Purement cosmétique : les archives ne sont pas rendues dans le bloc projet.                                                                                                                 |
| 7.3 | Une tâche urgente **proposée** est extraite de « 💡 Propositions » vers l'encart urgence.                                                                                                                                                      | Comportement possiblement voulu (une proposition urgente mérite d'être vue) ; changer cela relève d'une décision produit, pas d'un correctif.                                               |
| 7.4 | Les tâches importées **avant** ce lot en statut `validated` gardent `validated_at` NULL.                                                                                                                                                       | Une migration de rattrapage poserait une date de validation fictive sur des lignes dont on ignore l'historique réel. Le rattrapage naturel (revalidation, archivage manuel) est préférable. |

---

## 8. Récapitulatif des modifications de ce lot

| Fichier                                                     | Modification                                                                                                          |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `src/utils/taskSectioning.js`                               | `isTaskUrgentPending` (§2) ; `taskSectionStatus` + partition sur six seaux (§3)                                       |
| `src/components/tasks-views.jsx`                            | L'encart urgence filtre sur `isTaskUrgentPending` (§2)                                                                |
| `lib/tasks/taskImport.js`                                   | `validated_at` posé pour une tâche importée validée (§4)                                                              |
| `routes/tasks/assignments.js`                               | Refus des actions `assign` / `assign-group` / `done` sur une tâche archivée (§5)                                      |
| `sql/schema_foretmap.sql`                                   | `idx_tasks_validated_at` déclaré au même endroit que `idx_tasks_archived_at` (il n'existait que via la migration 169) |
| `tests-ui/utils/taskSectioning.test.js`                     | Couverture §2 et §3                                                                                                   |
| `tests/tasks-archive.test.js`                               | Couverture §4 et §5                                                                                                   |
| `docs/reference/foretmap/taches-tutoriels-et-validation.md` | Comportement visible : encart urgence, actions refusées sur une archive                                               |
