# Journal R1 — élèves référents automatiques (branche `feat/referents-eleves-auto`)

> Supprimé au dernier commit avant « Ready for review » ; son contenu passe dans la PR.

## Reconnaissance (21/11/2026)

- `main` v1.260.0 ; **`integration/college` déjà fusionné** (PR #732) avec `378_college_socle.sql`.
  → R1 prend **`379_task_referents_auto.sql`** (premier numéro libre ; écart au prompt : 378 prévu).
- PR ouvertes : aucune (21/11).
- Points d'accroche retenus :
  - écriture des référents : `setTaskReferents` → `replaceTaskJoinRows` (DELETE + INSERT) : la
    colonne `source` serait perdue à chaque PUT → lot 4 : réécriture différentielle des référents ;
  - clonage : `spawnSingleRecurringTask` recopie les jonctions à la main (lot 9) ;
  - occurrence active d'une série = non validée, non archivée (le clone n'est créé qu'à la
    validation de l'occurrence courante) ;
  - progression : `countValidatedAssignmentsForStudent` compte des **lignes d'inscription**
    (`COUNT(*)`), pas des tâches distinctes ; la requête partagée renvoie donc une ligne par
    inscription créditée, et le moteur compte les tâches distinctes par série (écart mineur,
    sans effet tant qu'il n'y a pas d'inscription double sur une même tâche) ;
  - `syncProgressionForValidatedTask` et `lib/stats/statsReadModel.js` recopient aussi le
    critère : hors périmètre (rbac : seule `countValidatedAssignmentsForStudent`) → dette signalée ;
  - préférences de notification : par **catégorie** côté client (`KIND_META`,
    `src/utils/notificationTargets.js`) → les deux évènements rangés en catégorie « tâches » ;
  - fusion de comptes : clés étrangères découvertes dans `INFORMATION_SCHEMA` + `UPDATE IGNORE`
    → les vetos suivent sans code (clé étrangère `user_id` CASCADE) ;
  - purge / suppression de compte : `task_referents` n'est purgé que par cascade → vetos idem ;
  - déclencheur « modification d'un réglage » : un seul chemin d'écriture, `setSetting`
    (`lib/settings.js`) → crochet de 3 lignes (fichier hors liste du périmètre, écart noté) ;
  - panneau de réglages : générique (section `tasks` de `settingsAdminMeta.js`).

## Lots

- [x] Lot 1 — migration `task_referents_auto` + `tests/task-referents-auto-migration.test.js`
      (deux rejeux sur base fraîche : OK).
- [x] Lot 9 (partie 1) — `lib/tasks/progressionCredit.js` (`progressionCreditedAssignmentsQuery`),
      `countValidatedAssignmentsForStudent` = `COUNT(*)` dessus (caractérisation
      `tests/progression-credit-characterization.test.js`) ; `writeTaskJoinRows` /
      `setTaskReferentLinks` / `getTaskReferentLinks` (chargeur unique) dans `taskQueries.js`, clonage
      branché dessus (`tests/recurring-tasks-joins-characterization.test.js`) ; `setTaskReferents`
      devient différentiel (préserve `source`, nouveaux liens `manual` + `added_at`, renvoie
      ajouts / retraits) — avance du lot 4.
- [x] Lot 2 — 7 réglages `tasks.student_referent_*` (bornes : `lib/tasks/referentBounds.js`,
      `MAX_TASK_REFERENTS` déplacé) ; libellés `settingsAdminMeta.js` (section `tasks`, panneau
      générique) ; `tests/student-referents-settings.test.js`.
- [x] Lot 3 — moteur `lib/tasks/studentReferents.js` (plan / application / déclencheurs, verrou
      de processus), crochets `lib/tasks/studentReferentHooks.js` (validation PUT et POST /validate,
      clonage, réglage `tasks.student_referent_*` via `setSetting`, membres du groupe via
      `lib/groupMembers.js`), job quotidien `student_referents_sync` (+ `cron.js`, `run_cron`) ;
      jeu fictif `tests/helpers/studentReferentsFixture.js`, `tests/student-referents-plan.test.js`
      (15 tests). Choix : plan toujours calculé sur toutes les séries (plafonds globaux), un
      déclencheur ciblé n'applique que les entrées de sa série.
- [x] Lot 4 — clonage (source + date recopiées), `setTaskReferents` différentiel, refus par
      série au PUT (`writeTaskReferents`), `source` dans `referents_linked` ;
      `tests/task-referents.test.js` étendu (3 tests).
- [x] Lot 5 — `scripts/student-referents-sync.js` (simulation par défaut, surcharges de
      simulation, `--adopt-existing`, `--apply` exige la fonction activée et refuse les surcharges),
      liste blanche `student_referents_sync`, action `foretmap_tasks student_referents`,
      `tests/student-referents-script.test.js`. Correctif : config déjà résolue relue par le plan.
      **Vérification lecture seule prod (21/11, anonymisée)** : groupe `moodle-26-n3` actif ; plan
      au seuil 2 = élève A : 9 séries, élève B : 2, élève C : 1 (12 couples) ; liens élève
      existants sur séries actives : 12, tous dans le groupe, tous dans le plan → 0 ajout,
      0 retrait (aucun lien `auto` en prod), 12 adoptables.
- [x] Lot 7 — `lib/tasks/studentReferentNotifications.js` : `task_referent_granted` (élève,
      clé anti-doublon par série), `task_referent_granted_manager` et `task_referent_removed_manager`
      (comptes `tasks.manage`, sous `notify_managers`) ; catégorie « tâches » (`KIND_META`) ;
      `tests/notifications-events.test.js` (+1), `tests-ui/utils/notificationTargets.test.js` (+1).
      Écart : troisième évènement pour le retrait (le prompt n'en nomme que deux).
- [x] Lot 8 — export (`taches_referent_refus`), conservation (`ACCOUNT_LIFETIME_TABLES`),
      fusion et suppression par clé étrangère ; `tests/student-referents-privacy.test.js`.
- [x] Lot 6 — serveur : `filterReferentsForViewer` (référents élèves selon
      `tasks.assignees_visibility`, adultes toujours visibles, `referents_hidden_count`), branché sur
      liste et détail ; comptes `tasks.manage` exemptés (le formulaire ne reçoit jamais de liste
      tronquée) ; interface : pastille « auto » et confirmation en ligne du retrait dans
      `TaskFormReferentsField`, pastille « élève » et nombre masqué dans `TaskTileCard`, feuille
      `src/components/tasks/task-referents.css` ; tests `tests/student-referents-visibility.test.js`,
      `tests-ui` (sélecteur +5, tuile +3).
- [ ] Lot 10 — documentation
- [ ] Lot 9 (reste)

Prochaine action : lot 10 (documentation), puis reste du lot 9 (commentaire d'écart creditedTasks, code mort).
