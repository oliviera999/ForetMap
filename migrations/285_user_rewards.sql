-- Badges génériques (ludification) : un badge obtenu une seule fois par utilisateur.
-- `source_type` / `source_ref` : origine (ex. 'pedago_session' + id de séance) — réutilisable
-- pour d'autres sources (tâches, observations) sans changer le schéma.
-- Idempotent.

CREATE TABLE IF NOT EXISTS user_rewards (
  user_id VARCHAR(64) NOT NULL,
  reward_key VARCHAR(64) NOT NULL,
  source_type VARCHAR(32) DEFAULT NULL,
  source_ref VARCHAR(64) DEFAULT NULL,
  awarded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, reward_key),
  INDEX idx_user_rewards_key (reward_key),
  CONSTRAINT fk_user_rewards_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
