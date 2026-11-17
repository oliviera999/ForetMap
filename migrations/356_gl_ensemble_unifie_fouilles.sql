-- =====================================================================
-- 356 — G&L ensemble unifié, PR 1a, étape 1.1 : fouilles (M2, 17 novembre 2026).
--
-- - `gl_game_chasse_pages` : qui a révélé la zone et à quel tour (`revelee_par_team_id`,
--   `revelee_round`) — seule une fouille licorne « pas encore » (ou la Lanterne) révèle ;
-- - `gameplay.tenir_fouilles_par_tour` devient un entier (2, pour les deux peuples) : une
--   ancienne valeur objet `{gnome, unicorn}` est remplacée ;
-- - `gameplay.tenir_fouilles_sous_voile` (1) remplace `tenir_fouille_sous_voile` (enum) ;
-- - la fouille de réparation en plus (`tenir_fouilles_reparation_gnome`) disparaît.
--
-- Idempotente : ADD COLUMN IF NOT EXISTS, UPDATE gardé par la forme objet, INSERT IGNORE,
-- DELETE de clés que plus aucun registre ne lit (une valeur restée en base serait ignorée).
-- =====================================================================

ALTER TABLE gl_game_chasse_pages
  ADD COLUMN IF NOT EXISTS revelee_par_team_id INT UNSIGNED NULL DEFAULT NULL AFTER etat,
  ADD COLUMN IF NOT EXISTS revelee_round INT NULL DEFAULT NULL AFTER revelee_par_team_id;

UPDATE gl_settings SET value_json = '2', updated_at = NOW()
 WHERE `key` = 'gameplay.tenir_fouilles_par_tour' AND value_json LIKE '{%';

INSERT IGNORE INTO gl_settings (`key`, value_json, updated_by, updated_at) VALUES
  ('gameplay.tenir_fouilles_par_tour', '2', NULL, NOW()),
  ('gameplay.tenir_fouilles_sous_voile', '1', NULL, NOW());

DELETE FROM gl_settings
 WHERE `key` IN ('gameplay.tenir_fouille_sous_voile', 'gameplay.tenir_fouilles_reparation_gnome');
