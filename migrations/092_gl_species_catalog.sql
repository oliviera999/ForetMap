-- Catalogue espèces G&L (biomes + fiches par biome)

CREATE TABLE IF NOT EXISTS gl_biomes (
  slug VARCHAR(64) NOT NULL PRIMARY KEY,
  nom VARCHAR(180) NOT NULL,
  order_index INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_gl_biomes_order (order_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_species (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  species_code VARCHAR(16) NOT NULL,
  biome_slug VARCHAR(64) NOT NULL,
  type ENUM('faune', 'flore') NOT NULL,
  nom_commun VARCHAR(255) NOT NULL,
  nom_scientifique VARCHAR(255) DEFAULT NULL,
  groupe VARCHAR(120) DEFAULT NULL,
  famille VARCHAR(120) DEFAULT NULL,
  statut_iucn VARCHAR(120) DEFAULT NULL,
  endemique VARCHAR(120) DEFAULT NULL,
  role_ecologique TEXT DEFAULT NULL,
  adaptations_cles TEXT DEFAULT NULL,
  taille_adulte VARCHAR(120) DEFAULT NULL,
  poids_adulte VARCHAR(120) DEFAULT NULL,
  regime_alimentaire TEXT DEFAULT NULL,
  longevite VARCHAR(120) DEFAULT NULL,
  reproduction TEXT DEFAULT NULL,
  observation_terrain TEXT DEFAULT NULL,
  description_courte TEXT DEFAULT NULL,
  anecdote TEXT DEFAULT NULL,
  present_dans_qcm VARCHAR(255) DEFAULT NULL,
  wikipedia_title VARCHAR(255) DEFAULT NULL,
  wikipedia_url VARCHAR(512) DEFAULT NULL,
  photo_url VARCHAR(512) DEFAULT NULL,
  photo_credit VARCHAR(512) DEFAULT NULL,
  photo_licence VARCHAR(120) DEFAULT NULL,
  photo_licence_url VARCHAR(512) DEFAULT NULL,
  statut VARCHAR(32) NOT NULL DEFAULT 'actif',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_gl_species_code (species_code),
  INDEX idx_gl_species_biome_type_groupe (biome_slug, type, groupe),
  INDEX idx_gl_species_nom_commun (nom_commun),
  CONSTRAINT fk_gl_species_biome FOREIGN KEY (biome_slug) REFERENCES gl_biomes(slug) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE gl_chapters
  ADD COLUMN biome_slug VARCHAR(64) DEFAULT NULL AFTER biome;

ALTER TABLE gl_chapters
  ADD INDEX idx_gl_chapters_biome_slug (biome_slug);

ALTER TABLE gl_chapters
  ADD CONSTRAINT fk_gl_chapters_biome FOREIGN KEY (biome_slug) REFERENCES gl_biomes(slug) ON UPDATE CASCADE ON DELETE SET NULL;

INSERT INTO gl_biomes (slug, nom, order_index, created_at, updated_at) VALUES
  ('sahara', 'Désert chaud (Sahara)', 10, NOW(), NOW()),
  ('jungle_afc', 'Jungle d''Afrique centrale', 20, NOW(), NOW()),
  ('toundra', 'Toundra arctique', 30, NOW(), NOW()),
  ('foret_caducifoliee', 'Forêt caducifoliée tempérée', 40, NOW(), NOW()),
  ('savane', 'Savane tropicale', 50, NOW(), NOW()),
  ('mangrove', 'Mangrove', 60, NOW(), NOW()),
  ('taiga', 'Taïga (forêt boréale)', 70, NOW(), NOW()),
  ('foret_mediterraneenne', 'Forêt méditerranéenne', 80, NOW(), NOW()),
  ('prairie_steppe', 'Prairie tempérée / Steppe', 90, NOW(), NOW()),
  ('desert_froid', 'Désert froid', 100, NOW(), NOW()),
  ('landes', 'Landes atlantiques', 110, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  nom = VALUES(nom),
  order_index = VALUES(order_index),
  updated_at = NOW();
