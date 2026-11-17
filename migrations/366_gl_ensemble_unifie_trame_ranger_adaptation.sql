-- =====================================================================
-- 366 — G&L ensemble unifié, PR 2, étape 2.5 : trois défis de la Trame de plus (M21).
--
-- « Le bon rôle » et « Le bon pays » (type `ranger`, catalogue `trame-ranger.json`) et « Les fils
-- de l'adaptation » (type `adaptation`, catalogue `trame-adaptations.json`), ouverts aux deux
-- peuples, sans nouvel écran.
--
-- 1. Catalogues : `gl_trame_ranger_familles`, `gl_trame_ranger_jeux`, `gl_trame_ranger_cartes`,
--    `gl_trame_adaptation_jeux`, `gl_trame_adaptation_cartes`, `gl_trame_adaptation_liens`.
--    Contenu du fichier, jamais de donnée de partie ni d'élève.
-- 2. Deux types de plus dans `gl_trame_defis.type` et `gl_trame_reussites.type`.
--
-- Idempotente : CREATE TABLE IF NOT EXISTS ; un MODIFY d'ENUM rejoué laisse la colonne telle
-- quelle. Aucun DROP.
-- =====================================================================

CREATE TABLE IF NOT EXISTS gl_trame_ranger_familles (
  famille VARCHAR(16) NOT NULL,
  nom VARCHAR(160) NOT NULL,
  consigne VARCHAR(500) NOT NULL,
  categories_json TEXT NULL,
  ordre SMALLINT NOT NULL DEFAULT 0,
  actif TINYINT(1) NOT NULL DEFAULT 1,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (famille)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_trame_ranger_jeux (
  code VARCHAR(64) NOT NULL,
  famille VARCHAR(16) NOT NULL,
  unite VARCHAR(64) NOT NULL,
  plateau TINYINT UNSIGNED NOT NULL,
  biome VARCHAR(64) NULL,
  titre VARCHAR(160) NOT NULL,
  bilan VARCHAR(500) NULL,
  categories_json TEXT NULL,
  ordre SMALLINT NOT NULL DEFAULT 0,
  actif TINYINT(1) NOT NULL DEFAULT 1,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (code),
  UNIQUE KEY uq_gl_trame_ranger_jeux_unite (famille, unite),
  KEY idx_gl_trame_ranger_jeux_plateau (plateau, actif)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_trame_ranger_cartes (
  jeu_code VARCHAR(64) NOT NULL,
  code VARCHAR(32) NOT NULL,
  nom VARCHAR(160) NOT NULL,
  indice VARCHAR(255) NULL,
  categorie VARCHAR(64) NOT NULL,
  pourquoi VARCHAR(500) NOT NULL,
  generique TINYINT(1) NOT NULL DEFAULT 0,
  ordre SMALLINT NOT NULL DEFAULT 0,
  PRIMARY KEY (jeu_code, code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_trame_adaptation_jeux (
  biome VARCHAR(64) NOT NULL,
  plateau TINYINT UNSIGNED NOT NULL,
  titre VARCHAR(160) NOT NULL,
  note TEXT NULL,
  ordre SMALLINT NOT NULL DEFAULT 0,
  actif TINYINT(1) NOT NULL DEFAULT 1,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (biome),
  KEY idx_gl_trame_adaptation_jeux_plateau (plateau, actif)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_trame_adaptation_cartes (
  biome VARCHAR(64) NOT NULL,
  code VARCHAR(8) NOT NULL,
  texte VARCHAR(255) NOT NULL,
  ordre SMALLINT NOT NULL DEFAULT 0,
  PRIMARY KEY (biome, code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_trame_adaptation_liens (
  biome VARCHAR(64) NOT NULL,
  de_code VARCHAR(8) NOT NULL,
  vers_code VARCHAR(8) NOT NULL,
  PRIMARY KEY (biome, de_code, vers_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE gl_trame_defis
  MODIFY COLUMN type ENUM('retisser','reparer','alteree','fils','ranger','adaptation') NOT NULL;

ALTER TABLE gl_trame_reussites
  MODIFY COLUMN type ENUM('retisser','reparer','alteree','fils','ranger','adaptation') NOT NULL;
