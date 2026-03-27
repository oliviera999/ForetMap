CREATE TABLE IF NOT EXISTS context_comments (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  context_type VARCHAR(16) NOT NULL,
  context_id VARCHAR(64) NOT NULL,
  body TEXT NOT NULL,
  author_user_type VARCHAR(16) NOT NULL,
  author_user_id VARCHAR(64) NOT NULL,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_context_comments_context_created (context_type, context_id, created_at),
  INDEX idx_context_comments_author (author_user_type, author_user_id, created_at),
  INDEX idx_context_comments_deleted (context_type, context_id, is_deleted, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS context_comment_reports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  comment_id VARCHAR(64) NOT NULL,
  reporter_user_type VARCHAR(16) NOT NULL,
  reporter_user_id VARCHAR(64) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'open',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_context_comment_reports_comment (comment_id, created_at),
  INDEX idx_context_comment_reports_status (status, created_at),
  INDEX idx_context_comment_reports_reporter (reporter_user_type, reporter_user_id, created_at),
  CONSTRAINT fk_context_comment_reports_comment FOREIGN KEY (comment_id) REFERENCES context_comments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
