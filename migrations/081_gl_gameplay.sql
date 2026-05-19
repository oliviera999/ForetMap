CREATE TABLE IF NOT EXISTS gl_chapters (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(96) NOT NULL,
  title VARCHAR(180) NOT NULL,
  biome VARCHAR(120) DEFAULT NULL,
  map_image_url VARCHAR(512) DEFAULT NULL,
  story_markdown LONGTEXT DEFAULT NULL,
  biotope_markdown LONGTEXT DEFAULT NULL,
  biocenose_markdown LONGTEXT DEFAULT NULL,
  order_index INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_gl_chapters_slug (slug),
  INDEX idx_gl_chapters_order (order_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_chapter_markers (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  chapter_id INT UNSIGNED NOT NULL,
  x_pct DOUBLE NOT NULL,
  y_pct DOUBLE NOT NULL,
  event_type VARCHAR(64) DEFAULT NULL,
  label VARCHAR(180) NOT NULL,
  description TEXT DEFAULT NULL,
  order_index INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_gl_chapter_markers_chapter (chapter_id, order_index),
  CONSTRAINT fk_gl_chapter_markers_chapter FOREIGN KEY (chapter_id) REFERENCES gl_chapters(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_games (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  class_id INT UNSIGNED NOT NULL,
  chapter_id INT UNSIGNED NOT NULL,
  name VARCHAR(180) NOT NULL,
  status ENUM('draft', 'live', 'paused', 'ended') NOT NULL DEFAULT 'draft',
  created_by VARCHAR(64) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_gl_games_class (class_id),
  INDEX idx_gl_games_chapter (chapter_id),
  INDEX idx_gl_games_status (status),
  CONSTRAINT fk_gl_games_class FOREIGN KEY (class_id) REFERENCES gl_classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_games_chapter FOREIGN KEY (chapter_id) REFERENCES gl_chapters(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_teams (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  game_id INT UNSIGNED NOT NULL,
  name VARCHAR(140) NOT NULL,
  type ENUM('gnome', 'unicorn') NOT NULL,
  mascot_id VARCHAR(120) DEFAULT NULL,
  position_marker_id INT UNSIGNED DEFAULT NULL,
  color VARCHAR(32) DEFAULT '#22c55e',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_gl_teams_game (game_id),
  INDEX idx_gl_teams_position_marker (position_marker_id),
  CONSTRAINT fk_gl_teams_game FOREIGN KEY (game_id) REFERENCES gl_games(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_teams_marker FOREIGN KEY (position_marker_id) REFERENCES gl_chapter_markers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_team_members (
  game_id INT UNSIGNED NOT NULL,
  team_id INT UNSIGNED NOT NULL,
  player_id INT UNSIGNED NOT NULL,
  joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (game_id, player_id),
  INDEX idx_gl_team_members_team (team_id),
  CONSTRAINT fk_gl_team_members_game FOREIGN KEY (game_id) REFERENCES gl_games(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_team_members_team FOREIGN KEY (team_id) REFERENCES gl_teams(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_team_members_player FOREIGN KEY (player_id) REFERENCES gl_players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_game_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  game_id INT UNSIGNED NOT NULL,
  team_id INT UNSIGNED DEFAULT NULL,
  actor_type ENUM('mj', 'team', 'system') NOT NULL DEFAULT 'system',
  actor_id VARCHAR(64) DEFAULT NULL,
  event_type VARCHAR(64) NOT NULL,
  payload_json LONGTEXT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_gl_game_events_game (game_id, id),
  INDEX idx_gl_game_events_team (team_id, id),
  CONSTRAINT fk_gl_game_events_game FOREIGN KEY (game_id) REFERENCES gl_games(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_game_events_team FOREIGN KEY (team_id) REFERENCES gl_teams(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_mascot_assignments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  game_id INT UNSIGNED NOT NULL,
  team_id INT UNSIGNED NOT NULL,
  mascot_id VARCHAR(120) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_gl_mascot_assignments_game_team (game_id, team_id),
  INDEX idx_gl_mascot_assignments_mascot (mascot_id),
  CONSTRAINT fk_gl_mascot_assignments_game FOREIGN KEY (game_id) REFERENCES gl_games(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_mascot_assignments_team FOREIGN KEY (team_id) REFERENCES gl_teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE gl_players
  ADD CONSTRAINT fk_gl_players_team FOREIGN KEY (team_id) REFERENCES gl_teams(id) ON DELETE SET NULL;

INSERT INTO gl_chapters (slug, title, biome, map_image_url, story_markdown, biotope_markdown, biocenose_markdown, order_index, created_at, updated_at)
VALUES
  (
    'foret-magique',
    'Chapitre 1 — La forêt magique',
    'forêt tempérée',
    '/maps/map-foret.svg',
    'Les équipes traversent la forêt magique et découvrent les premiers indices du récit.',
    'Le biotope est une forêt tempérée riche en micro-habitats : clairières, sous-bois, lisières.',
    'La biocénose rassemble plantes, insectes, oiseaux et micro-organismes liés à ce biome.',
    10,
    NOW(),
    NOW()
  )
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  biome = VALUES(biome),
  map_image_url = VALUES(map_image_url),
  story_markdown = VALUES(story_markdown),
  biotope_markdown = VALUES(biotope_markdown),
  biocenose_markdown = VALUES(biocenose_markdown),
  updated_at = NOW();

INSERT INTO gl_chapter_markers (chapter_id, x_pct, y_pct, event_type, label, description, order_index, created_at)
SELECT c.id, 20, 25, 'start', 'Départ', 'La classe démarre son aventure.', 10, NOW()
  FROM gl_chapters c
 WHERE c.slug = 'foret-magique'
   AND NOT EXISTS (
     SELECT 1 FROM gl_chapter_markers m WHERE m.chapter_id = c.id AND m.label = 'Départ'
   );

INSERT INTO gl_chapter_markers (chapter_id, x_pct, y_pct, event_type, label, description, order_index, created_at)
SELECT c.id, 55, 45, 'quiz', 'Carrefour des espèces', 'Observation d''espèces du biome.', 20, NOW()
  FROM gl_chapters c
 WHERE c.slug = 'foret-magique'
   AND NOT EXISTS (
     SELECT 1 FROM gl_chapter_markers m WHERE m.chapter_id = c.id AND m.label = 'Carrefour des espèces'
   );

INSERT INTO gl_chapter_markers (chapter_id, x_pct, y_pct, event_type, label, description, order_index, created_at)
SELECT c.id, 82, 65, 'story', 'Portail final', 'Fin du chapitre.', 30, NOW()
  FROM gl_chapters c
 WHERE c.slug = 'foret-magique'
   AND NOT EXISTS (
     SELECT 1 FROM gl_chapter_markers m WHERE m.chapter_id = c.id AND m.label = 'Portail final'
   );
