-- Notifications adressées à un compte précis (centre de notifications ForetMap).
-- `target_*` décrit l'élément à ouvrir au clic (tâche, lieu, fil du forum, réglages) ;
-- `dedupe_key` empêche de répéter le même avis au même compte (rappels d'échéance).
-- Idempotent.

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  kind VARCHAR(48) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body VARCHAR(500) DEFAULT NULL,
  target_type VARCHAR(16) DEFAULT NULL,
  target_id VARCHAR(64) DEFAULT NULL,
  map_id VARCHAR(64) DEFAULT NULL,
  target_extra_json VARCHAR(500) DEFAULT NULL,
  actor_user_id VARCHAR(64) DEFAULT NULL,
  dedupe_key VARCHAR(120) DEFAULT NULL,
  read_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notifications_user_read (user_id, read_at, created_at),
  INDEX idx_notifications_created (created_at),
  UNIQUE KEY uq_notifications_user_dedupe (user_id, dedupe_key),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
