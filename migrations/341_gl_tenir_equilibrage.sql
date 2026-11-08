-- =====================================================================
-- 341 — G&L « Tenir à deux » : équilibrage E1 à E5 (bilan du 7 novembre 2026).
--
-- - E1 : bonus du dé gris `{1:3, 2:4, 3:5, 4:6}` (seul le plateau 1 ralentit) ; la valeur n'est
--   changée que si elle vaut encore l'ancien défaut `{1:4, 2:4, 3:5, 4:6}` ;
-- - E2 à E5 : nouveaux réglages `gameplay.tenir_*` posés en simples défauts ;
-- - E4 : `gl_game_team_reserves` (réserve de la caravane : surplus au plafond, par équipe et par
--   partie, dans la ressource du peuple) et extension du grand livre `gl_resource_ledger`
--   (`kind` bourse | réserve, `team_id`, `player_id` facultatif, causes `reserve_entree`,
--   `reserve_sortie`, `reserve_seuil`) : la somme du livre vaut les bourses PLUS les réserves ;
-- - E2 : `gl_game_chasse_empreintes.reparation` (fouille de réparation d'une équipe gnome).
--
-- Idempotente : UPDATE conditionnel, INSERT IGNORE, CREATE TABLE IF NOT EXISTS, ADD / MODIFY
-- COLUMN gardés par INFORMATION_SCHEMA. Aucun DROP, aucune suppression de donnée.
-- =====================================================================

-- E1 — seulement si le MJ n'a pas touché la valeur.
UPDATE gl_settings
   SET value_json = '{"1":3,"2":4,"3":5,"4":6}', updated_at = NOW()
 WHERE `key` = 'gameplay.tenir_voile_bonus_par_plateau'
   AND REPLACE(REPLACE(value_json, ' ', ''), CHAR(10), '') = '{"1":4,"2":4,"3":5,"4":6}';

-- E2 à E5 — simples défauts (ne touchent pas une valeur déjà posée par le MJ).
INSERT IGNORE INTO gl_settings (`key`, value_json, updated_by, updated_at) VALUES
  ('gameplay.tenir_fouilles_reparation_gnome', '1', NULL, NOW()),
  ('gameplay.tenir_palissement_rang_plancher', '8', NULL, NOW()),
  ('gameplay.tenir_surplus_reserve', 'true', NULL, NOW()),
  ('gameplay.tenir_olu_bourse_pleine', 'true', NULL, NOW());

-- E4 — réserve de la caravane (par équipe et par partie).
CREATE TABLE IF NOT EXISTS gl_game_team_reserves (
  game_id INT UNSIGNED NOT NULL,
  team_id INT UNSIGNED NOT NULL,
  reserve_health INT NOT NULL DEFAULT 0,
  reserve_power INT NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (game_id, team_id),
  CONSTRAINT fk_gl_game_team_reserves_game FOREIGN KEY (game_id) REFERENCES gl_games(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_game_team_reserves_team FOREIGN KEY (team_id) REFERENCES gl_teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- E4 — grand livre : mouvements de réserve.
SET @fm341 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gl_resource_ledger' AND COLUMN_NAME = 'kind');
SET @sql = IF(@fm341 = 0, "ALTER TABLE gl_resource_ledger ADD COLUMN kind ENUM('bourse','reserve') NOT NULL DEFAULT 'bourse' AFTER player_id", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fm341 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gl_resource_ledger' AND COLUMN_NAME = 'team_id');
SET @sql = IF(@fm341 = 0, 'ALTER TABLE gl_resource_ledger ADD COLUMN team_id INT UNSIGNED NULL AFTER kind, ADD KEY idx_gl_resource_ledger_team (game_id, team_id, id)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- `player_id` facultatif : un mouvement de réserve (sortie vers le pot, remise à zéro au Seuil)
-- n'appartient à aucun élève.
SET @fm341 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gl_resource_ledger' AND COLUMN_NAME = 'player_id' AND IS_NULLABLE = 'NO');
SET @sql = IF(@fm341 = 1, 'ALTER TABLE gl_resource_ledger MODIFY COLUMN player_id INT UNSIGNED NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fm341 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gl_resource_ledger' AND COLUMN_NAME = 'cause' AND COLUMN_TYPE LIKE '%reserve_entree%');
SET @sql = IF(@fm341 = 0, "ALTER TABLE gl_resource_ledger MODIFY COLUMN cause ENUM('page_tenue','trame','case_positive','case_souffle','carnet_complet','sort_pot','echange','don','parure','chapardeur','nid','heritage','reparation','geste_prof','migration','case_plateau','feuillet','defaut','reserve_entree','reserve_sortie','reserve_seuil') NOT NULL DEFAULT 'geste_prof'", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- E2 — fouille de réparation (équipe gnome, page pâlie seulement).
SET @fm341 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gl_game_chasse_empreintes' AND COLUMN_NAME = 'reparation');
SET @sql = IF(@fm341 = 0, 'ALTER TABLE gl_game_chasse_empreintes ADD COLUMN reparation TINYINT(1) NOT NULL DEFAULT 0 AFTER verdict', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
