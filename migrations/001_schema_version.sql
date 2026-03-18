-- Table de suivi des versions de schéma (migrations)
-- Une seule ligne : version = dernier numéro de migration appliqué
CREATE TABLE IF NOT EXISTS schema_version (
  version INT UNSIGNED NOT NULL PRIMARY KEY
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO schema_version (version) VALUES (0);
