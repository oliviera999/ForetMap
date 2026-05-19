-- Module groupes/sous-groupes liés cartes/projets

CREATE TABLE IF NOT EXISTS `groups` (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  slug VARCHAR(96) NOT NULL,
  name VARCHAR(180) NOT NULL,
  description TEXT DEFAULT NULL,
  kind VARCHAR(32) NOT NULL DEFAULT 'class',
  parent_group_id VARCHAR(64) DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by VARCHAR(64) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_groups_slug (slug),
  INDEX idx_groups_parent (parent_group_id),
  INDEX idx_groups_kind_active (kind, is_active),
  CONSTRAINT fk_groups_parent FOREIGN KEY (parent_group_id) REFERENCES `groups`(id) ON DELETE SET NULL,
  CONSTRAINT fk_groups_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  user_type VARCHAR(16) NOT NULL,
  role_in_group VARCHAR(32) NOT NULL DEFAULT 'member',
  joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, user_id),
  INDEX idx_group_members_user (user_id, user_type),
  INDEX idx_group_members_group_role (group_id, role_in_group),
  CONSTRAINT fk_group_members_group FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE CASCADE,
  CONSTRAINT fk_group_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS group_scopes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  group_id VARCHAR(64) NOT NULL,
  map_id VARCHAR(32) DEFAULT NULL,
  project_id VARCHAR(64) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_group_scopes_group (group_id),
  INDEX idx_group_scopes_map (map_id),
  INDEX idx_group_scopes_project (project_id),
  UNIQUE KEY uq_group_scopes_triplet (group_id, map_id, project_id),
  CONSTRAINT fk_group_scopes_group FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE CASCADE,
  CONSTRAINT fk_group_scopes_map FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE,
  CONSTRAINT fk_group_scopes_project FOREIGN KEY (project_id) REFERENCES task_projects(id) ON DELETE CASCADE
);

ALTER TABLE tasks ADD COLUMN group_id VARCHAR(64) DEFAULT NULL;
ALTER TABLE tasks ADD INDEX idx_tasks_group_id (group_id);

ALTER TABLE forum_threads ADD COLUMN group_id VARCHAR(64) DEFAULT NULL;
ALTER TABLE forum_threads ADD INDEX idx_forum_threads_group (group_id, is_pinned, last_post_at);

ALTER TABLE observation_logs ADD COLUMN group_id VARCHAR(64) DEFAULT NULL;
ALTER TABLE observation_logs ADD INDEX idx_observation_logs_group (group_id);
