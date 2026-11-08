-- Gnomes & Licornes — badges individuels sur le moteur commun (docs/REWARDS_ENGINE.md § 5).
-- Même forme que `user_rewards` (migrations 285 et 329) : une ligne par palier ou par badge
-- décerné, clé primaire (joueur, clé), jamais de retrait. Propriétaire : `gl_players.id`.
-- `gl_player_badges` (migration 333) devient une table héritée, en lecture seule
-- (`scripts/gl-rewards-backfill.js` la convertit) ; elle n'est pas supprimée ici.
-- Idempotent.

CREATE TABLE IF NOT EXISTS gl_player_rewards (
  player_id INT UNSIGNED NOT NULL,
  reward_key VARCHAR(64) NOT NULL,
  source_type VARCHAR(32) DEFAULT NULL,
  source_ref VARCHAR(64) DEFAULT NULL,
  awarded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  awarded_by_user_id VARCHAR(64) DEFAULT NULL,
  note VARCHAR(280) DEFAULT NULL,
  seen_at DATETIME DEFAULT NULL,
  PRIMARY KEY (player_id, reward_key),
  INDEX idx_gl_player_rewards_key (reward_key),
  CONSTRAINT fk_gl_player_rewards_player FOREIGN KEY (player_id)
    REFERENCES gl_players (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
