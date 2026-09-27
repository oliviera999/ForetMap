-- =====================================================================
-- Retraits de schéma, temps 3 : les deux candidats sans aucune dépendance de code.
-- Audit du 25/09/2026, § 3.5 (plans en trois temps) et § 2.3 (piste C, ligne « Retraits »).
--
-- 1) Vue `v_visit_coverage` (migration 269). Créée pour s'aligner sur un export de
--    référence ; aucun code applicatif ne l'a jamais lue (recherche dans routes/, lib/,
--    src/, scripts/ : seul le test de la migration 269 la citait). Suppression simple.
--    Retour arrière : rejouer migrations/269_visit_coverage_statut_short.sql.
--
-- 2) `sync_conflicts.kind` : la valeur `both_changed` (migration 219) n'est écrite par aucun
--    code (la synchronisation Moodle ne produit que `member_added_on_mirror`,
--    `member_removed_on_mirror` et `name_changed`). Elle est retirée de l'ENUM **seulement si
--    aucune ligne ne la porte** ; sinon la migration ne fait rien (contrôle :
--    SELECT COUNT(*) FROM sync_conflicts WHERE kind = 'both_changed' → 0).
--
-- PAS dans cette migration (conditions de passage non remplies, ou T1/T2 livrés dans le même
-- lot et pas encore éprouvés en production) : `quiz_question_species` et
-- `quiz_question_tutorials` (conditions écrites dans la migration 300 : un cycle de
-- production en 301 sans retour arrière, export des deux tables, accord pour la ligne
-- `SYNC_IGNORED_TABLES_RE` de database.js partagée avec G&L), `zones.current_plant`,
-- `map_markers.plant_name`, `zones.stage`, `zone_history`, `observation_logs`,
-- `quiz_questions.difficulte_label`, colonnes photo / `second_name` / `remark_*` de `plants`.
-- Leurs contrôles de passage sont listés dans docs/RUNBOOK_RETRAITS_T3.md.
--
-- Idempotente : DROP VIEW IF EXISTS ; ENUM modifié une seule fois (garde sur la définition
-- courante de la colonne). Aucune table `gl_*`.
-- =====================================================================

DROP VIEW IF EXISTS v_visit_coverage;

SET @fm302_enum_has_both_changed = (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name = 'sync_conflicts'
     AND column_name = 'kind'
     AND column_type LIKE '%''both\_changed''%'
);
SET @sql = IF(
  @fm302_enum_has_both_changed > 0,
  'SELECT COUNT(*) INTO @fm302_both_changed_rows FROM sync_conflicts WHERE kind = ''both_changed''',
  'SET @fm302_both_changed_rows = 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  @fm302_enum_has_both_changed > 0 AND @fm302_both_changed_rows = 0,
  'ALTER TABLE sync_conflicts MODIFY kind ENUM(''member_added_on_mirror'',''member_removed_on_mirror'',''name_changed'') NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
