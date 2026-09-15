-- 245_user_tracking.sql
-- Suivi admin : journal d'activité légère + passage identifié multi-produits.
-- Présence live = Socket.IO + last_seen (pas de table dédiée).
-- Invités / visite sans compte : hors de ces tables (usage_counters anonymes seulement).

CREATE TABLE IF NOT EXISTS user_activity_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(64) DEFAULT NULL COMMENT 'users.id canonique ; NULL si non résolu',
  user_type VARCHAR(16) DEFAULT NULL,
  product VARCHAR(16) NOT NULL,
  action VARCHAR(64) NOT NULL,
  key_norm VARCHAR(64) DEFAULT NULL,
  occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_activity_occurred (occurred_at),
  INDEX idx_user_activity_user (user_id, occurred_at),
  INDEX idx_user_activity_product_action (product, action, occurred_at),
  CONSTRAINT fk_user_activity_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_product_visits (
  user_id VARCHAR(64) NOT NULL,
  product VARCHAR(16) NOT NULL,
  first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  open_count INT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, product),
  INDEX idx_user_product_visits_product_last (product, last_seen_at),
  CONSTRAINT fk_user_product_visits_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
