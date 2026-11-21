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
- [ ] Lot 2 — réglages
- [ ] Lot 3 — moteur
- [ ] Lot 4 — clonage et services
- [ ] Lot 5 — script de reprise, MCP, vérification lecture seule
- [ ] Lot 7 — notifications
- [ ] Lot 8 — données personnelles
- [ ] Lot 6 — interface
- [ ] Lot 10 — documentation
- [ ] Lot 9 (reste)

Prochaine action : lot 2 (réglages).
