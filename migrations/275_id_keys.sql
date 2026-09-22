-- Clés d'identification dichotomiques (lot 6).
-- id_keys → id_key_couplets → id_key_leads (chaque proposition mène soit au couplet
-- suivant, soit à une espèce : exactement une issue). Idempotent.

CREATE TABLE IF NOT EXISTS id_keys (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug VARCHAR(120) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT DEFAULT NULL,
  map_id VARCHAR(32) DEFAULT NULL COMMENT 'Clé propre à un site (NULL = générale)',
  scope_label VARCHAR(160) DEFAULT NULL COMMENT 'Ex. « Arbres du lycée », « Invertébrés du compost »',
  niveau ENUM('college','lycee') NOT NULL DEFAULT 'college',
  is_published TINYINT(1) NOT NULL DEFAULT 0,
  created_by VARCHAR(64) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_id_keys_slug (slug),
  CONSTRAINT fk_idkeys_map FOREIGN KEY (map_id) REFERENCES maps (id) ON DELETE SET NULL,
  CONSTRAINT fk_idkeys_user FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS id_key_couplets (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  key_id INT UNSIGNED NOT NULL,
  number SMALLINT UNSIGNED NOT NULL COMMENT 'Numéro du couplet dans la clé (1 = départ)',
  PRIMARY KEY (id),
  UNIQUE KEY uq_couplet (key_id, number),
  CONSTRAINT fk_couplet_key FOREIGN KEY (key_id) REFERENCES id_keys (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS id_key_leads (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  couplet_id INT UNSIGNED NOT NULL,
  sort_order TINYINT UNSIGNED NOT NULL DEFAULT 0,
  statement TEXT NOT NULL COMMENT 'Caractère observable (sans manipulation de la plante ou de l''animal)',
  image_url VARCHAR(1024) DEFAULT NULL,
  next_couplet_id INT UNSIGNED DEFAULT NULL COMMENT 'Couplet suivant, OU',
  plant_id INT UNSIGNED DEFAULT NULL COMMENT 'espèce atteinte (exactement un des deux renseigné)',
  PRIMARY KEY (id),
  KEY idx_leads_couplet (couplet_id),
  CONSTRAINT fk_lead_couplet FOREIGN KEY (couplet_id) REFERENCES id_key_couplets (id) ON DELETE CASCADE,
  CONSTRAINT fk_lead_next FOREIGN KEY (next_couplet_id) REFERENCES id_key_couplets (id) ON DELETE SET NULL,
  CONSTRAINT fk_lead_plant FOREIGN KEY (plant_id) REFERENCES plants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
