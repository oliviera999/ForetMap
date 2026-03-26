CREATE TABLE IF NOT EXISTS forum_threads (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  author_user_type VARCHAR(16) NOT NULL,
  author_user_id VARCHAR(64) NOT NULL,
  is_locked TINYINT(1) NOT NULL DEFAULT 0,
  is_pinned TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_post_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_forum_threads_last_post (is_pinned, last_post_at, created_at),
  INDEX idx_forum_threads_author (author_user_type, author_user_id, created_at)
);

CREATE TABLE IF NOT EXISTS forum_posts (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  thread_id VARCHAR(64) NOT NULL,
  body TEXT NOT NULL,
  author_user_type VARCHAR(16) NOT NULL,
  author_user_id VARCHAR(64) NOT NULL,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_forum_posts_thread_created (thread_id, created_at),
  INDEX idx_forum_posts_author (author_user_type, author_user_id, created_at),
  CONSTRAINT fk_forum_posts_thread FOREIGN KEY (thread_id) REFERENCES forum_threads(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS forum_reports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  post_id VARCHAR(64) NOT NULL,
  reporter_user_type VARCHAR(16) NOT NULL,
  reporter_user_id VARCHAR(64) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'open',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_forum_reports_post (post_id, created_at),
  INDEX idx_forum_reports_status (status, created_at),
  INDEX idx_forum_reports_reporter (reporter_user_type, reporter_user_id, created_at),
  CONSTRAINT fk_forum_reports_post FOREIGN KEY (post_id) REFERENCES forum_posts(id) ON DELETE CASCADE
);
