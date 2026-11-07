-- =====================================================================
-- 334 — G&L « Tenir à deux » v2 : correctifs de la simulation du 7 novembre 2026 (schéma).
--
-- - `gl_chasse_zones.especes_json` : codes `gl_species` (1 à 3) liés à chaque zone, pour les
--   pistes de veillée (`pisteTx` cherche d'abord ici, puis retombe sur le lien du feuillet) ;
-- - `gl_tenir_olu_lignes.plateaux_json` : plateaux où une ligne (erreur du jour) est tirable,
--   NULL = tous ;
-- - `gl_game_rounds.dernier_jet_json` : dernier jet du tour (`{ teamId, eventId }`), fenêtre
--   « après le jet » de Progression et Relance ;
-- - `gl_resource_ledger` : grand livre des bourses (une seule fonction écrit
--   `gl_players.health_points / power_points`, `lib/glBourses.js`).
--
-- Les catalogues `data/gl/tenir/*.json` ne sont plus semés par migration : `lib/glTenirSync.js`
-- les charge au démarrage (empreinte par fichier dans `gl_settings`).
--
-- Idempotente : ADD COLUMN gardé par INFORMATION_SCHEMA, CREATE TABLE IF NOT EXISTS. Aucun DROP.
-- =====================================================================

SET @fm334 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gl_chasse_zones' AND COLUMN_NAME = 'especes_json');
SET @sql = IF(@fm334 = 0, 'ALTER TABLE gl_chasse_zones ADD COLUMN especes_json LONGTEXT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fm334 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gl_tenir_olu_lignes' AND COLUMN_NAME = 'plateaux_json');
SET @sql = IF(@fm334 = 0, 'ALTER TABLE gl_tenir_olu_lignes ADD COLUMN plateaux_json LONGTEXT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fm334 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gl_game_rounds' AND COLUMN_NAME = 'dernier_jet_json');
SET @sql = IF(@fm334 = 0, 'ALTER TABLE gl_game_rounds ADD COLUMN dernier_jet_json LONGTEXT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------
-- Grand livre des ressources : un mouvement par joueur et par cause, soldes après coup.
-- Privé comme les bourses (jamais servi aux élèves d'une autre équipe ni à la projection).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gl_resource_ledger (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  game_id INT UNSIGNED NULL,
  player_id INT UNSIGNED NOT NULL,
  delta_health INT NOT NULL DEFAULT 0,
  delta_power INT NOT NULL DEFAULT 0,
  solde_health_apres INT NOT NULL DEFAULT 0,
  solde_power_apres INT NOT NULL DEFAULT 0,
  cause ENUM('page_tenue','trame','case_positive','case_souffle','carnet_complet','sort_pot','echange','don','parure','chapardeur','nid','heritage','reparation','geste_prof','migration','case_plateau','feuillet','defaut') NOT NULL DEFAULT 'geste_prof',
  event_id INT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_gl_resource_ledger_game (game_id, id),
  KEY idx_gl_resource_ledger_player (player_id, id),
  CONSTRAINT fk_gl_resource_ledger_player FOREIGN KEY (player_id) REFERENCES gl_players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Empreintes des catalogues : absentes = première synchronisation au prochain démarrage.
INSERT INTO gl_settings (`key`, value_json, updated_by, updated_at)
VALUES ('content.tenir_catalogues_hash', '{}', NULL, NOW())
ON DUPLICATE KEY UPDATE updated_at = updated_at;
