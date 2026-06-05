-- Carnet de Sélène (feuillets lore) + glossaire narratif GL

CREATE TABLE IF NOT EXISTS gl_lore_plateaux (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  plateau_number TINYINT UNSIGNED NOT NULL,
  zone_label VARCHAR(120) NOT NULL,
  visage_label VARCHAR(120) DEFAULT NULL,
  biomes_slugs TEXT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_gl_lore_plateaux_num_zone (plateau_number, zone_label),
  INDEX idx_gl_lore_plateaux_number (plateau_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_lore_feuillets (
  feuillet_code VARCHAR(64) NOT NULL PRIMARY KEY,
  legacy_id INT DEFAULT NULL,
  type ENUM('copiste', 'message', 'feuillet', 'reponse', 'scene', 'vierge') NOT NULL DEFAULT 'feuillet',
  liasse VARCHAR(32) DEFAULT NULL,
  titre VARCHAR(255) DEFAULT NULL,
  incipit TEXT DEFAULT NULL,
  biome_slug VARCHAR(64) DEFAULT NULL,
  plateau_number TINYINT UNSIGNED DEFAULT NULL,
  zone_label VARCHAR(120) DEFAULT NULL,
  visage_label VARCHAR(120) DEFAULT NULL,
  kingdom_zone_id INT UNSIGNED DEFAULT NULL,
  ordre_voyage INT NOT NULL DEFAULT 0,
  ordre_liasse INT NOT NULL DEFAULT 0,
  ordre_recit INT NOT NULL DEFAULT 0,
  mode_apparition ENUM(
    'cover', 'preface', 'insert', 'boite', 'band', 'marginalia', 'pole', 'biome',
    'corbeau', 'ancre_biome', 'carnet_route', 'scene', 'cloture'
  ) NOT NULL DEFAULT 'boite',
  usage_note VARCHAR(120) DEFAULT NULL,
  lisibilite VARCHAR(32) DEFAULT NULL,
  effacement VARCHAR(32) NOT NULL DEFAULT 'non',
  vierge TINYINT(1) NOT NULL DEFAULT 0,
  vitesse_effacement VARCHAR(32) DEFAULT NULL,
  repalissement VARCHAR(32) DEFAULT NULL,
  tenir VARCHAR(64) DEFAULT NULL,
  cout_gemme INT NOT NULL DEFAULT 0,
  gain_coeur INT NOT NULL DEFAULT 0,
  themes TEXT DEFAULT NULL,
  ancrage_scientifique TEXT DEFAULT NULL,
  references_scientifiques TEXT DEFAULT NULL,
  lien_qcm_biome VARCHAR(120) DEFAULT NULL,
  signature VARCHAR(120) DEFAULT NULL,
  idee_cle TEXT DEFAULT NULL,
  contexte TEXT DEFAULT NULL,
  texte_accessible LONGTEXT DEFAULT NULL,
  texte LONGTEXT DEFAULT NULL,
  statut VARCHAR(32) NOT NULL DEFAULT 'actif',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_gl_lore_feuillets_biome (biome_slug),
  INDEX idx_gl_lore_feuillets_plateau (plateau_number, zone_label),
  INDEX idx_gl_lore_feuillets_kingdom_zone (kingdom_zone_id),
  INDEX idx_gl_lore_feuillets_ordre_voyage (ordre_voyage),
  INDEX idx_gl_lore_feuillets_mode (mode_apparition),
  INDEX idx_gl_lore_feuillets_statut (statut),
  CONSTRAINT fk_gl_lore_feuillets_biome FOREIGN KEY (biome_slug) REFERENCES gl_biomes(slug) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_gl_lore_feuillets_kingdom_zone FOREIGN KEY (kingdom_zone_id) REFERENCES gl_kingdom_zones(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_lore_glossary_terms (
  lore_code VARCHAR(16) NOT NULL PRIMARY KEY,
  terme VARCHAR(120) NOT NULL,
  variantes VARCHAR(255) DEFAULT NULL,
  categorie VARCHAR(64) NOT NULL,
  niveau ENUM('cle', 'recit', 'secret') NOT NULL DEFAULT 'recit',
  definition_courte VARCHAR(255) DEFAULT NULL,
  definition_complete TEXT DEFAULT NULL,
  role_recit TEXT DEFAULT NULL,
  correspondance_reelle TEXT DEFAULT NULL,
  chapitre_scope VARCHAR(32) NOT NULL DEFAULT 'tous',
  source VARCHAR(120) DEFAULT NULL,
  statut VARCHAR(32) NOT NULL DEFAULT 'actif',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_gl_lore_glossary_terme (terme),
  INDEX idx_gl_lore_glossary_categorie (categorie),
  INDEX idx_gl_lore_glossary_niveau (niveau),
  INDEX idx_gl_lore_glossary_chapitre (chapitre_scope)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_lore_glossary_relations (
  from_code VARCHAR(16) NOT NULL,
  to_code VARCHAR(16) NOT NULL,
  PRIMARY KEY (from_code, to_code),
  INDEX idx_gl_lore_glossary_rel_from (from_code),
  CONSTRAINT fk_gl_lore_glossary_rel_from FOREIGN KEY (from_code) REFERENCES gl_lore_glossary_terms(lore_code) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_gl_lore_glossary_rel_to FOREIGN KEY (to_code) REFERENCES gl_lore_glossary_terms(lore_code) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_game_feuillet_states (
  game_id INT UNSIGNED NOT NULL,
  team_id INT UNSIGNED NOT NULL,
  feuillet_code VARCHAR(64) NOT NULL,
  status ENUM('locked', 'discovered', 'read', 'held', 'effaced') NOT NULL DEFAULT 'locked',
  effacement_pct TINYINT UNSIGNED NOT NULL DEFAULT 0,
  unlocked_via ENUM('zone', 'manual', 'story', 'gemme') DEFAULT NULL,
  kingdom_zone_id INT UNSIGNED DEFAULT NULL,
  discovered_at DATETIME DEFAULT NULL,
  read_at DATETIME DEFAULT NULL,
  held_at DATETIME DEFAULT NULL,
  effaced_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (game_id, team_id, feuillet_code),
  INDEX idx_gl_game_feuillet_states_status (game_id, team_id, status),
  CONSTRAINT fk_gl_game_feuillet_states_game FOREIGN KEY (game_id) REFERENCES gl_games(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_game_feuillet_states_team FOREIGN KEY (team_id) REFERENCES gl_teams(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_game_feuillet_states_feuillet FOREIGN KEY (feuillet_code) REFERENCES gl_lore_feuillets(feuillet_code) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE gl_games
  ADD COLUMN lore_feuillet_retrigger ENUM('every_arrival', 'once_per_team', 'once_per_game') DEFAULT NULL
    AFTER zone_content_retrigger,
  ADD COLUMN lore_effacement_enabled TINYINT(1) DEFAULT NULL
    AFTER lore_feuillet_retrigger,
  ADD COLUMN lore_gemme_costs_enabled TINYINT(1) DEFAULT NULL
    AFTER lore_effacement_enabled,
  ADD COLUMN lore_heart_rewards_enabled TINYINT(1) DEFAULT NULL
    AFTER lore_gemme_costs_enabled;

INSERT INTO gl_settings (`key`, value_json, updated_by, updated_at)
VALUES
  ('modules.lore_carnet_enabled', 'true', NULL, NOW()),
  ('modules.lore_glossary_enabled', 'true', NULL, NOW()),
  ('gameplay.lore_feuillet_retrigger', '"once_per_team"', NULL, NOW()),
  ('gameplay.lore_effacement_enabled', 'true', NULL, NOW()),
  ('gameplay.lore_gemme_costs_enabled', 'true', NULL, NOW()),
  ('gameplay.lore_heart_rewards_enabled', 'true', NULL, NOW()),
  ('gameplay.lore_spoiler_max_level', '"recit"', NULL, NOW())
ON DUPLICATE KEY UPDATE updated_at = updated_at;
