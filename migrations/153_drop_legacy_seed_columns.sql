-- =====================================================================
-- ForetMap — Suppression de colonnes legacy/seed-only jamais exploitées.
--
-- Ces colonnes ne sont LUES ni ÉCRITES par aucun chemin runtime (vérifié par
-- grep exhaustif src/ lib/ routes/ scripts/ tests/) :
--   * tasks.recurrence_end : vestige de la migration 005 ; la récurrence réelle
--     passe par recurrence_spawned_for_due_date / recurrence_template_*
--     (lib/recurringTasks.js). 0 valeur non-NULL dans le parc.
--   * quiz_questions.photo_species_id / photo_source / photo_licence_url /
--     photo_sujet : colonnes seed-only de la migration 128 ; l'affichage et
--     l'import s'appuient uniquement sur photo_url / photo_credit / photo_licence
--     / photo_legende (conservées). photo_sujet duplique photo_legende sur les
--     14 lignes seedées ; photo_licence_url est 100 % NULL.
--
-- ATTENTION : ne vise QUE la table ForetMap quiz_questions. Les colonnes
-- homonymes photo_licence_url / photo_sujet des tables GL (gl_qcm_questions,
-- gl_species_catalog) sont activement utilisées — NE PAS y toucher.
--
-- Idempotent via la tolérance errno 1091 du runner (database.js) : chaque DROP
-- est une instruction séparée (comme migrations 129/130), donc un objet déjà
-- absent est ignoré sans bloquer les suivants. Ordre load-bearing : la FK puis
-- l'index sur photo_species_id AVANT la colonne (InnoDB).
-- Rollback : réimport du dump de référence ou re-ADD COLUMN manuel.
-- =====================================================================

ALTER TABLE tasks DROP COLUMN recurrence_end;

ALTER TABLE quiz_questions DROP FOREIGN KEY fk_quiz_photo_sp;
ALTER TABLE quiz_questions DROP INDEX idx_quiz_photo_sp;
ALTER TABLE quiz_questions DROP COLUMN photo_species_id;
ALTER TABLE quiz_questions DROP COLUMN photo_source;
ALTER TABLE quiz_questions DROP COLUMN photo_licence_url;
ALTER TABLE quiz_questions DROP COLUMN photo_sujet;
