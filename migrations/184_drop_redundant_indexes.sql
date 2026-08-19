-- =====================================================================
-- ForetMap — Suppression de 14 index strictement redondants.
--
-- Chaque index listé ici est le PRÉFIXE EXACT d'un autre index de la même table :
-- InnoDB peut déjà servir toutes ses lectures (et l'intégrité référentielle des clés
-- étrangères qui s'appuient dessus) avec l'index englobant, dont il est la tête. Ils
-- n'accélèrent donc rien, et coûtent une écriture supplémentaire à chaque INSERT /
-- UPDATE / DELETE, plus leur place sur disque.
--
-- Relevé et vérifié dans docs/AUDIT_BDD_2026-08.md §5.6 (annexe B). Le 15e cas de
-- l'annexe, `visit_mascot_sprite_library.idx_visit_mascot_sprite_lib_map`, est déjà
-- traité par la migration 176 (colonne `map_id` supprimée) : il n'est pas repris ici.
--
-- Les trois index portés par sql/schema_foretmap.sql (task_assignments, group_scopes,
-- zone_history) en ont AUSSI été retirés dans le même lot : sans cela ils seraient
-- recréés au démarrage suivant, avant que cette migration ne soit rejouable
-- (voir docs/AUDIT_BDD_2026-08.md §3.3 et lib/legacySchemaCleanup.js).
--
-- Aucun changement de comportement, aucune donnée touchée.
-- Idempotent (DROP INDEX IF EXISTS ; errno 1091 toléré par le runner).
-- =====================================================================

-- ForetMap
ALTER TABLE task_assignments DROP INDEX IF EXISTS idx_task_assignments_task_id;
-- ⊂ uq_task_assignments_task_student (task_id, student_id)
ALTER TABLE zone_history DROP INDEX IF EXISTS idx_zone_history_zone_id;
-- ⊂ idx_zone_history_zone_harvested (zone_id, harvested_at)
ALTER TABLE group_scopes DROP INDEX IF EXISTS idx_group_scopes_group;
-- ⊂ uq_group_scopes_triplet (group_id, map_id, project_id)
ALTER TABLE species_interactions DROP INDEX IF EXISTS idx_si_from;
-- ⊂ uq_interaction (from_plant_id, to_plant_id, interaction_type)
ALTER TABLE quiz_questions DROP INDEX IF EXISTS idx_quiz_cat;
-- ⊂ uq_quiz_cat_num (categorie_slug, numero_dans_categorie)
ALTER TABLE resource_question_links DROP INDEX IF EXISTS idx_rql_resource;
-- ⊂ uq_rql_resource_question (resource_type, resource_ref, question_code)

-- Gnomes & Licornes
ALTER TABLE gl_species_interactions DROP INDEX IF EXISTS idx_gl_si_from;
-- ⊂ uq_gl_interaction (from_species_id, to_species_id, interaction_type)
ALTER TABLE gl_game_rounds DROP INDEX IF EXISTS idx_gl_game_rounds_game;
-- ⊂ uq_gl_game_rounds_game_round (game_id, round_number)
ALTER TABLE gl_glossary_term_relations DROP INDEX IF EXISTS idx_gl_glossary_relations_from;
-- ⊂ PRIMARY (from_code, to_code)
ALTER TABLE gl_lore_glossary_relations DROP INDEX IF EXISTS idx_gl_lore_glossary_rel_from;
-- ⊂ PRIMARY (from_code, to_code)
ALTER TABLE gl_lore_plateaux DROP INDEX IF EXISTS idx_gl_lore_plateaux_number;
-- ⊂ uq_gl_lore_plateaux_num_zone (plateau_number, zone_label)
ALTER TABLE gl_market_trade_side_feuillets DROP INDEX IF EXISTS idx_gl_market_trade_side_feuillets_trade;
-- ⊂ PRIMARY (trade_id, player_id, feuillet_code)
ALTER TABLE gl_qcm_questions DROP INDEX IF EXISTS idx_gl_qcm_biome_cat;
-- ⊂ uq_gl_qcm_biome_cat_num (biome_slug, categorie_slug, numero_dans_categorie)
ALTER TABLE gl_qcm_lore_questions DROP INDEX IF EXISTS idx_gl_qcm_lore_chap_cat;
-- ⊂ uq_gl_qcm_lore_chap_cat_num (chapitre_slug, categorie_slug, numero_dans_categorie)
