-- =====================================================================
-- Connecteur MCP — mode productivité (admin) : confirmation par code, permissions
-- d'écriture SQL et de bypass RGPD (docs/MCP.md § 13, docs/MCP_REGISTRE_TRAITEMENT.md § 9).
--
-- `mcp_confirmations` : codes à 6 chiffres (HMAC) pour les opérations sensibles
--   (DDL/DCL, UPDATE/DELETE sans WHERE, dépassement de plafond, tables d'autorisation).
--   Usage unique, expiration 10 min, liés au compte / outil / empreinte des arguments,
--   3 essais max. Aucune valeur nominative dans `summary` au-delà d'un résumé technique.
--
-- Permissions RBAC semées (admin seulement) :
--   `mcp.sql_execute`     — outil `foretmap_sql_execute` (désactivé par défaut :
--                           MCP_SQL_WRITE_ENABLED=false) ;
--   `mcp.privacy_bypass`  — outils nominatifs élèves + levée des seuils (désactivé par
--                           défaut ; exige aussi MCP_PRIVACY_BYPASS=true et un ACK daté).
--
-- IDEMPOTENCE : CREATE TABLE IF NOT EXISTS ; INSERT IGNORE. Aucune donnée existante réécrite.
-- Retour arrière :
--   DROP TABLE mcp_confirmations;
--   DELETE FROM role_permissions WHERE permission_key IN ('mcp.sql_execute','mcp.privacy_bypass');
--   DELETE FROM rbac_seeded_permissions WHERE permission_key IN ('mcp.sql_execute','mcp.privacy_bypass');
--   DELETE FROM permissions WHERE `key` IN ('mcp.sql_execute','mcp.privacy_bypass');
-- =====================================================================

CREATE TABLE IF NOT EXISTS mcp_confirmations (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  tool VARCHAR(64) NOT NULL COMMENT 'Nom de l’outil MCP qui a demandé la confirmation',
  args_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'sha256 des arguments (hors confirmation_*)',
  code_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'HMAC-SHA256 du code à 6 chiffres',
  summary VARCHAR(1000) NOT NULL COMMENT 'Résumé lisible (technique, sans valeur nominative)',
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('pending','consumed','expired','locked') NOT NULL DEFAULT 'pending',
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_mcp_confirmations_user (user_id, status, expires_at),
  INDEX idx_mcp_confirmations_expires (status, expires_at),
  CONSTRAINT fk_mcp_confirmations_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO permissions (`key`, label, description) VALUES
  ('mcp.sql_execute', 'SQL en écriture (MCP)', 'Exécuter une instruction SQL d’écriture par le connecteur MCP (outil désactivé par défaut)'),
  ('mcp.privacy_bypass', 'Bypass RGPD (MCP)', 'Consulter des données nominatives d’élèves par le connecteur MCP (désactivé par défaut, exige un accusé de réception)');

INSERT IGNORE INTO role_permissions (role_id, permission_key)
SELECT r.id, p.k FROM roles r
  JOIN (SELECT 'mcp.sql_execute' AS k UNION ALL SELECT 'mcp.privacy_bypass') p
 WHERE r.slug = 'admin';

INSERT IGNORE INTO rbac_seeded_permissions (role_id, permission_key)
SELECT r.id, p.k FROM roles r
  JOIN (SELECT 'mcp.sql_execute' AS k UNION ALL SELECT 'mcp.privacy_bypass') p
 WHERE r.slug = 'admin';
