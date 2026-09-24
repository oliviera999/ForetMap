-- Forum G&L : parité avec le forum ForetMap (noyau serveur commun lib/shared/forumCore.js).
--
-- Sujets : épinglage et date du dernier message (tri par activité, recalculé à la
-- suppression d'un message). Messages : images jointes et marqueur « modifié ».
-- Réactions et signalements : tables calquées sur forum_post_reactions / forum_reports,
-- avec des identifiants de message entiers (AUTO_INCREMENT côté G&L).
--
-- Idempotente : les ALTER déjà appliqués sont tolérés (ER_DUP_FIELDNAME / ER_DUP_KEYNAME).

ALTER TABLE gl_forum_threads ADD COLUMN is_pinned TINYINT(1) NOT NULL DEFAULT 0 AFTER is_locked;
ALTER TABLE gl_forum_threads ADD COLUMN last_post_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER updated_at;
ALTER TABLE gl_forum_threads ADD INDEX idx_gl_forum_threads_pinned_last (is_deleted, is_pinned, last_post_at);

UPDATE gl_forum_threads t
   SET t.last_post_at = COALESCE(
         (SELECT MAX(p.created_at) FROM gl_forum_posts p WHERE p.thread_id = t.id AND p.is_deleted = 0),
         t.created_at
       );

ALTER TABLE gl_forum_posts ADD COLUMN image_paths_json TEXT NULL DEFAULT NULL AFTER body;
ALTER TABLE gl_forum_posts ADD COLUMN edited_at DATETIME NULL DEFAULT NULL AFTER is_deleted;

CREATE TABLE IF NOT EXISTS gl_forum_post_reactions (
  post_id INT UNSIGNED NOT NULL,
  reactor_user_type VARCHAR(40) NOT NULL,
  reactor_user_id VARCHAR(64) NOT NULL,
  emoji VARCHAR(16) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, reactor_user_type, reactor_user_id, emoji),
  INDEX idx_gl_forum_post_reactions_post (post_id, created_at),
  CONSTRAINT fk_gl_forum_post_reactions_post FOREIGN KEY (post_id) REFERENCES gl_forum_posts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_forum_reports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  post_id INT UNSIGNED NOT NULL,
  reporter_user_type VARCHAR(40) NOT NULL,
  reporter_user_id VARCHAR(64) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'open',
  resolved_at DATETIME NULL DEFAULT NULL,
  resolved_by_user_type VARCHAR(40) NULL DEFAULT NULL,
  resolved_by_user_id VARCHAR(64) NULL DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_gl_forum_reports_post (post_id, created_at),
  INDEX idx_gl_forum_reports_status (status, created_at),
  CONSTRAINT fk_gl_forum_reports_post FOREIGN KEY (post_id) REFERENCES gl_forum_posts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
