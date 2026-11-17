-- =====================================================================
-- 359 — G&L ensemble unifié, PR 1a, étape 1.4 : questions de case (M9).
--
-- - `gameplay.tenir_questions_difficulte_max_par_plateau` ({1: 2, 2: 3, 3: 3, 4: 3}) : plafond de
--   difficulté du tirage d'une case par plateau ;
-- - `gameplay.tenir_questions_spirale` (20, en pour cent) : à partir du plateau 2, une question
--   sur cinq vient d'un biome déjà traversé ;
-- - les `difficulteMax` portés par les cases question des plateaux 1 à 4 (chapitres 3 à 6) sont
--   retirés : en mode tenir, le plafond du plateau les remplace.
-- Le lot 2 des questions vives (`VQCM0041` à `VQCM0080`) arrive par le catalogue
-- `data/gl/tenir/questions-vives.json` (synchronisation par empreinte).
--
-- Chapitres des plateaux 1 à 4 désignés par leur slug de production (`tropiques-africains`,
-- `aride-chaud`, `tempere-atlantique`, `eurasie-continentale`) : une base de test, dont les
-- identifiants 3 à 6 portent des chapitres de fixtures, n'est jamais touchée.
-- Idempotente : INSERT IGNORE ; UPDATE gardé par le type de la valeur (un entier).
-- =====================================================================

INSERT IGNORE INTO gl_settings (`key`, value_json, updated_by, updated_at) VALUES
  ('gameplay.tenir_questions_difficulte_max_par_plateau', '{"1":2,"2":3,"3":3,"4":3}', NULL, NOW()),
  ('gameplay.tenir_questions_spirale', '20', NULL, NOW());

UPDATE gl_chapter_markers
   SET event_config_json = JSON_SET(event_config_json, '$.question.pool.difficulteMax', NULL)
 WHERE chapter_id IN (SELECT id FROM gl_chapters WHERE slug IN ('tropiques-africains', 'aride-chaud', 'tempere-atlantique', 'eurasie-continentale'))
   AND JSON_TYPE(JSON_EXTRACT(event_config_json, '$.question.pool.difficulteMax')) = 'INTEGER';
