-- Éléments du site importés dans le carnet personnel du joueur.
-- Un import référence une ressource « apprise » (espèce, glossaire, tutoriel, feuillet,
-- glossaire lore, page de contenu, écosystème/biome) et fige un titre pour l'affichage.
-- Les imports s'affichent dans le carnet en ordre chronologique, mêlés aux articles.

CREATE TABLE IF NOT EXISTS gl_player_journal_imports (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  player_id INT UNSIGNED NOT NULL,
  resource_type VARCHAR(32) NOT NULL,
  resource_ref VARCHAR(64) NOT NULL,
  title VARCHAR(255) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_gl_pji_resource (player_id, resource_type, resource_ref),
  INDEX idx_gl_pji_player (player_id, created_at),
  CONSTRAINT fk_gl_pji_player FOREIGN KEY (player_id) REFERENCES gl_players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
