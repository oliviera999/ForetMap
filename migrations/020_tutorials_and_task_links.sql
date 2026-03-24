-- Tutoriels + association optionnelle avec les tâches
CREATE TABLE IF NOT EXISTS tutorials (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(190) NOT NULL,
  type VARCHAR(16) NOT NULL DEFAULT 'html',
  summary TEXT DEFAULT NULL,
  html_content LONGTEXT DEFAULT NULL,
  source_url TEXT DEFAULT NULL,
  source_file_path VARCHAR(512) DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT UNSIGNED DEFAULT 0,
  created_at VARCHAR(32) DEFAULT NULL,
  updated_at VARCHAR(32) DEFAULT NULL,
  UNIQUE KEY uq_tutorials_slug (slug),
  INDEX idx_tutorials_type (type),
  INDEX idx_tutorials_active_sort (is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_tutorials (
  task_id VARCHAR(64) NOT NULL,
  tutorial_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (task_id, tutorial_id),
  INDEX idx_task_tutorials_tutorial (tutorial_id),
  CONSTRAINT fk_task_tutorials_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_task_tutorials_tutorial FOREIGN KEY (tutorial_id) REFERENCES tutorials(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO tutorials
  (title, slug, type, summary, source_file_path, sort_order, created_at, updated_at)
VALUES
  ('Arrosage au potager', 'arrosage-potager', 'html', 'Tutoriel pratique pour bien arroser au potager.', '/tutos/fiche-arrosage-punk.html', 1, NOW(), NOW()),
  ('Désherbage doux', 'desherbage-doux', 'html', 'Méthodes de désherbage respectueuses du sol vivant.', '/tutos/fiche-desherbage-punk.html', 2, NOW(), NOW()),
  ('Jardin N3', 'jardin-n3', 'html', 'Repères et bonnes pratiques sur la zone N3.', '/tutos/fiche-jardin-punk-n3.html', 3, NOW(), NOW()),
  ('Rempotage', 'rempotage', 'html', 'Tutoriel pas à pas pour le rempotage.', '/tutos/fiche-rempotage-punk.html', 4, NOW(), NOW());

UPDATE schema_version SET version = 20;
