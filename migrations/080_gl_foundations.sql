CREATE TABLE IF NOT EXISTS gl_admins (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) DEFAULT NULL,
  google_sub VARCHAR(255) DEFAULT NULL,
  role ENUM('admin', 'mj') NOT NULL DEFAULT 'admin',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_seen DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_gl_admins_email (email),
  UNIQUE KEY uq_gl_admins_google_sub (google_sub)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_classes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  school VARCHAR(180) DEFAULT NULL,
  created_by INT UNSIGNED DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_gl_classes_active (is_active),
  CONSTRAINT fk_gl_classes_admin FOREIGN KEY (created_by) REFERENCES gl_admins(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_players (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  class_id INT UNSIGNED NOT NULL,
  team_id INT UNSIGNED DEFAULT NULL,
  pseudo VARCHAR(120) NOT NULL,
  pin_hash VARCHAR(255) NOT NULL,
  linked_foretmap_user_id VARCHAR(64) DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_seen DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_gl_players_pseudo (pseudo),
  INDEX idx_gl_players_class (class_id),
  INDEX idx_gl_players_team (team_id),
  CONSTRAINT fk_gl_players_class FOREIGN KEY (class_id) REFERENCES gl_classes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_settings (
  `key` VARCHAR(191) NOT NULL PRIMARY KEY,
  value_json LONGTEXT NOT NULL,
  updated_by VARCHAR(64) DEFAULT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_content_pages (
  slug VARCHAR(80) NOT NULL PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  body_markdown LONGTEXT NOT NULL,
  updated_by VARCHAR(64) DEFAULT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO gl_content_pages (slug, title, body_markdown, updated_by, updated_at)
VALUES
  (
    'world',
    'Le monde de Gnomes & Licornes',
    'Bienvenue dans **Gnomes & Licornes**, un univers fantastique et écologique.\n\nChaque équipe parcourt des biomes, découvre des espèces et contribue à protéger les équilibres du vivant.',
    'seed',
    NOW()
  ),
  (
    'rules',
    'Les règles du jeu',
    '## Règles essentielles\n\n1. Le Maître du Jeu (MJ) pilote la partie.\n2. Chaque équipe agit à son tour.\n3. Les décisions se prennent en équipe.\n4. Le respect des autres équipes est obligatoire.',
    'seed',
    NOW()
  ),
  (
    'spells',
    'Le grimoire des sortilèges',
    'Les sortilèges apparaîtront progressivement au fil des chapitres.\n\nChaque sortilège aura un effet sur la progression, la découverte d''espèces ou l''histoire.',
    'seed',
    NOW()
  )
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  body_markdown = VALUES(body_markdown),
  updated_by = VALUES(updated_by),
  updated_at = NOW();

INSERT INTO gl_settings (`key`, value_json, updated_by, updated_at)
VALUES
  ('platform.title', '"Gnomes & Licornes"', 'seed', NOW()),
  ('platform.subtitle', '"L aventure commence ici"', 'seed', NOW()),
  ('platform.allow_player_link_foretmap', 'false', 'seed', NOW())
ON DUPLICATE KEY UPDATE
  value_json = VALUES(value_json),
  updated_by = VALUES(updated_by),
  updated_at = NOW();
