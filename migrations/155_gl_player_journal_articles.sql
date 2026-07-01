-- Refonte du carnet personnel GL en « articles ».
-- Chaque article = un titre optionnel + un texte markdown et/ou des médias
-- (un article « média seul » a un corps vide et une ou plusieurs illustrations).
-- On repart de zéro : l'ancien modèle mono-document (un seul body_markdown par
-- joueur) est remplacé par un modèle multi-articles. Les tables mono-document
-- sont supprimées (contenu non repris, cf. décision produit).

DROP TABLE IF EXISTS gl_player_journal_assets;
DROP TABLE IF EXISTS gl_player_journals;

CREATE TABLE IF NOT EXISTS gl_player_journal_articles (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  player_id INT UNSIGNED NOT NULL,
  title VARCHAR(255) DEFAULT NULL,
  body_markdown MEDIUMTEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_gl_pja_player (player_id, created_at),
  CONSTRAINT fk_gl_pja_player FOREIGN KEY (player_id) REFERENCES gl_players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_player_journal_article_assets (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  article_id INT UNSIGNED NOT NULL,
  player_id INT UNSIGNED NOT NULL,
  asset_path VARCHAR(512) NOT NULL,
  mime_type VARCHAR(64) DEFAULT NULL,
  byte_size INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_gl_pjaa_article (article_id),
  INDEX idx_gl_pjaa_player (player_id),
  CONSTRAINT fk_gl_pjaa_article FOREIGN KEY (article_id) REFERENCES gl_player_journal_articles(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_pjaa_player FOREIGN KEY (player_id) REFERENCES gl_players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
