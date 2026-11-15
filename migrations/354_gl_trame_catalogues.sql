-- =====================================================================
-- G&L « Tenir à deux », lot 3 (défis de la Trame), étape 3.1 — catalogues.
--
-- Trois fichiers de `data/gl/tenir/` deviennent des tables de contenu (aucune donnée d'élève,
-- aucune table `gl_game_*`) :
-- 1. `trame-reseaux.json`  → `gl_trame_reseaux`, `gl_trame_cartes`, `gl_trame_liens`
--    (huit réseaux trophiques, 12 cartes chacun ; flèche = « est mangé par ») ;
-- 2. `trame-fils.json`     → `gl_trame_fils_cartes`, `gl_trame_fils_liens`
--    (causes → effets, par plateau ; le titre du plateau est porté par ses cartes) ;
-- 3. `trame-reparer.json`  → `gl_trame_mesures`, `gl_trame_reparer_especes`,
--    `gl_trame_reparer_a_classer` (la leçon du plateau est portée par ses lignes à classer).
--
-- Idempotente : CREATE TABLE IF NOT EXISTS. Aucun DROP.
-- =====================================================================

CREATE TABLE IF NOT EXISTS gl_trame_reseaux (
  biome VARCHAR(64) NOT NULL,
  plateau TINYINT UNSIGNED NOT NULL,
  nom VARCHAR(160) NOT NULL,
  note TEXT NULL,
  scenarios_json TEXT NULL,
  ordre SMALLINT NOT NULL DEFAULT 0,
  actif TINYINT(1) NOT NULL DEFAULT 1,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (biome),
  KEY idx_gl_trame_reseaux_plateau (plateau, actif)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_trame_cartes (
  biome VARCHAR(64) NOT NULL,
  code VARCHAR(16) NOT NULL,
  nom VARCHAR(160) NOT NULL,
  role ENUM('producteur','consommateur','decomposeur') NOT NULL,
  precision_texte VARCHAR(255) NULL,
  generique TINYINT(1) NOT NULL DEFAULT 0,
  regime VARCHAR(32) NULL,
  ordre SMALLINT NOT NULL DEFAULT 0,
  PRIMARY KEY (biome, code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_trame_liens (
  biome VARCHAR(64) NOT NULL,
  de_code VARCHAR(16) NOT NULL,
  vers_code VARCHAR(16) NOT NULL,
  nature ENUM('accepte','a_discuter') NOT NULL DEFAULT 'accepte',
  pourquoi VARCHAR(500) NULL,
  PRIMARY KEY (biome, de_code, vers_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_trame_fils_cartes (
  plateau TINYINT UNSIGNED NOT NULL,
  code VARCHAR(8) NOT NULL,
  texte VARCHAR(255) NOT NULL,
  chapitre_titre VARCHAR(160) NULL,
  chapitre_note TEXT NULL,
  ordre SMALLINT NOT NULL DEFAULT 0,
  PRIMARY KEY (plateau, code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_trame_fils_liens (
  plateau TINYINT UNSIGNED NOT NULL,
  de_code VARCHAR(8) NOT NULL,
  vers_code VARCHAR(8) NOT NULL,
  PRIMARY KEY (plateau, de_code, vers_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_trame_mesures (
  code VARCHAR(8) NOT NULL,
  texte VARCHAR(255) NOT NULL,
  ordre SMALLINT NOT NULL DEFAULT 0,
  actif TINYINT(1) NOT NULL DEFAULT 1,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_trame_reparer_especes (
  plateau TINYINT UNSIGNED NOT NULL,
  species_code VARCHAR(16) NOT NULL,
  menace VARCHAR(500) NOT NULL,
  mesures_json TEXT NOT NULL,
  ordre SMALLINT NOT NULL DEFAULT 0,
  PRIMARY KEY (plateau, species_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_trame_reparer_a_classer (
  plateau TINYINT UNSIGNED NOT NULL,
  species_code VARCHAR(16) NOT NULL,
  categorie ENUM('en_danger','fragile','pas_menace') NOT NULL,
  lecon TEXT NULL,
  ordre SMALLINT NOT NULL DEFAULT 0,
  PRIMARY KEY (plateau, species_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
