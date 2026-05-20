CREATE TABLE IF NOT EXISTS gl_tutorials (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(120) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body_markdown LONGTEXT NOT NULL,
  chapter_id INT UNSIGNED DEFAULT NULL,
  marker_id INT UNSIGNED DEFAULT NULL,
  order_index INT NOT NULL DEFAULT 0,
  is_published TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_gl_tutorials_slug (slug),
  INDEX idx_gl_tutorials_chapter (chapter_id),
  CONSTRAINT fk_gl_tutorials_chapter FOREIGN KEY (chapter_id) REFERENCES gl_chapters(id) ON DELETE SET NULL,
  CONSTRAINT fk_gl_tutorials_marker FOREIGN KEY (marker_id) REFERENCES gl_chapter_markers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_tutorial_reads (
  tutorial_id INT UNSIGNED NOT NULL,
  reader_user_type VARCHAR(40) NOT NULL,
  reader_user_id VARCHAR(64) NOT NULL,
  read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tutorial_id, reader_user_type, reader_user_id),
  CONSTRAINT fk_gl_tutorial_reads_tutorial FOREIGN KEY (tutorial_id) REFERENCES gl_tutorials(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
