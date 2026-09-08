-- Composition automatique des équipes GL (lot v3, docs/GL_EQUIPES_AUTO_CONCEPTION.md § 6) :
-- verrous MJ sur des paires de joueurs d'une classe.
--   kind = 'together' : ces deux joueurs doivent être dans la même équipe
--   kind = 'apart'    : ces deux joueurs ne doivent jamais être dans la même équipe
-- La paire est stockée ordonnée (player_low_id < player_high_id) : une seule ligne par paire.
-- Contrainte dure du moteur (coût ~infini) ; jamais exposée aux joueurs.

CREATE TABLE IF NOT EXISTS gl_class_pairing_locks (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  class_id INT UNSIGNED NOT NULL,
  player_low_id INT UNSIGNED NOT NULL,
  player_high_id INT UNSIGNED NOT NULL,
  kind ENUM('together', 'apart') NOT NULL,
  created_by VARCHAR(64) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_gl_class_pairing_locks_pair (class_id, player_low_id, player_high_id),
  INDEX idx_gl_class_pairing_locks_class (class_id, kind),
  CONSTRAINT fk_gl_class_pairing_locks_class FOREIGN KEY (class_id)
    REFERENCES gl_classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_class_pairing_locks_low FOREIGN KEY (player_low_id)
    REFERENCES gl_players(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_class_pairing_locks_high FOREIGN KEY (player_high_id)
    REFERENCES gl_players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
