CREATE TABLE IF NOT EXISTS forum_post_reactions (
  post_id VARCHAR(64) NOT NULL,
  reactor_user_type VARCHAR(16) NOT NULL,
  reactor_user_id VARCHAR(64) NOT NULL,
  emoji VARCHAR(16) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, reactor_user_type, reactor_user_id, emoji),
  INDEX idx_forum_post_reactions_post (post_id, created_at),
  INDEX idx_forum_post_reactions_reactor (reactor_user_type, reactor_user_id, created_at),
  CONSTRAINT fk_forum_post_reactions_post FOREIGN KEY (post_id) REFERENCES forum_posts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS context_comment_reactions (
  comment_id VARCHAR(64) NOT NULL,
  reactor_user_type VARCHAR(16) NOT NULL,
  reactor_user_id VARCHAR(64) NOT NULL,
  emoji VARCHAR(16) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (comment_id, reactor_user_type, reactor_user_id, emoji),
  INDEX idx_context_comment_reactions_comment (comment_id, created_at),
  INDEX idx_context_comment_reactions_reactor (reactor_user_type, reactor_user_id, created_at),
  CONSTRAINT fk_context_comment_reactions_comment FOREIGN KEY (comment_id) REFERENCES context_comments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
