-- =====================================================================
-- G&L « Tenir à deux », lot 3 (défis de la Trame), étape 3.3 — données de partie.
--
-- 1. `gl_trame_defis` : un défi en cours ou réussi, pour un élève (`mode = individuel`) ou pour
--    une équipe (`mode = equipe`, `player_id` NULL). `porteur` (`p<playerId>` ou `e<teamId>`)
--    rend l'unicité exprimable : un seul défi par porteur, type et unité dans une partie.
--    `revision` porte la sauvegarde stricte (409 `edit_conflict` si elle est dépassée).
-- 2. `gl_trame_reussites` : une ligne par élève et par unité réussie (en mode équipe, une par
--    membre présent). Elle porte la page de veillée reçue (`page_feuillet_code`) et sa semaine
--    ISO : compteur des pages par semaine, point de regard, badges, suivi du prof.
-- 3. Réglages : `tenir_defis`, `tenir_defis_par_peuple`, `tenir_defis_pages_par_semaine`,
--    `tenir_defis_mode_equipe`.
--
-- Aucune ressource n'est jamais créée par un défi. Idempotente. Aucun DROP.
-- =====================================================================

CREATE TABLE IF NOT EXISTS gl_trame_defis (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  game_id INT UNSIGNED NOT NULL,
  player_id INT UNSIGNED NULL,
  team_id INT UNSIGNED NOT NULL,
  porteur VARCHAR(24) NOT NULL,
  type ENUM('retisser','reparer','alteree','fils') NOT NULL,
  unite VARCHAR(64) NOT NULL,
  mode ENUM('individuel','equipe') NOT NULL DEFAULT 'individuel',
  etat_json LONGTEXT NULL,
  statut ENUM('en_cours','reussi') NOT NULL DEFAULT 'en_cours',
  revision INT UNSIGNED NOT NULL DEFAULT 0,
  indices_utilises INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  reussi_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_gl_trame_defis_porteur (game_id, porteur, type, unite),
  KEY idx_gl_trame_defis_team (game_id, team_id),
  CONSTRAINT fk_gl_trame_defis_game FOREIGN KEY (game_id) REFERENCES gl_games(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_trame_defis_team FOREIGN KEY (team_id) REFERENCES gl_teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_trame_reussites (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  game_id INT UNSIGNED NOT NULL,
  player_id INT UNSIGNED NOT NULL,
  team_id INT UNSIGNED NULL,
  type ENUM('retisser','reparer','alteree','fils') NOT NULL,
  unite VARCHAR(64) NOT NULL,
  defi_id INT UNSIGNED NULL,
  mode ENUM('individuel','equipe') NOT NULL DEFAULT 'individuel',
  page_feuillet_code VARCHAR(64) NULL,
  semaine_iso CHAR(8) NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_gl_trame_reussites (game_id, player_id, type, unite),
  KEY idx_gl_trame_reussites_player (player_id, type),
  KEY idx_gl_trame_reussites_semaine (player_id, semaine_iso),
  CONSTRAINT fk_gl_trame_reussites_game FOREIGN KEY (game_id) REFERENCES gl_games(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO gl_settings (`key`, value_json, updated_by, updated_at) VALUES
  ('gameplay.tenir_defis', 'true', NULL, NOW()),
  ('gameplay.tenir_defis_par_peuple', 'true', NULL, NOW()),
  ('gameplay.tenir_defis_pages_par_semaine', '2', NULL, NOW()),
  ('gameplay.tenir_defis_mode_equipe', 'true', NULL, NOW());
