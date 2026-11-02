-- =====================================================================
-- Connecteur MCP distant (`/mcp`) : serveur d'autorisation OAuth intégré et plans d'écriture.
--
-- `mcp_oauth_clients`   : clients enregistrés par DCR (RFC 7591) ou mémorisés après lecture
--                         d'un document CIMD (client_id = URL https du document). Jamais de
--                         secret : Claude s'enregistre en client public (PKCE seul).
-- `mcp_oauth_auth_codes`: codes d'autorisation, **hachés** (sha256), usage unique (~60 s),
--                         liés au client, à la redirect_uri, au défi PKCE S256 et au compte.
-- `mcp_oauth_tokens`    : jetons d'accès (~1 h) et de rafraîchissement (~30 j), **hachés**.
--                         `family_id` relie les rotations successives d'un même consentement :
--                         la réutilisation d'un refresh déjà tourné révoque toute la famille.
-- `mcp_content_plans`   : plans d'écriture de contenu (patron plan → apply) avec expiration,
--                         empreinte de l'état « avant » et migration SQL équivalente générée.
--
-- Données personnelles : seul l'identifiant du compte (`user_id`) est conservé, avec une clé
-- étrangère `ON DELETE CASCADE` vers `users` — supprimer un compte supprime ses jetons et
-- plans. Aucune adresse, aucun nom, aucune IP. Durées : voir docs/MCP_REGISTRE_TRAITEMENT.md.
--
-- Permissions RBAC semées : `mcp.use` (admin, prof), `mcp.write` (admin seulement),
-- `mcp.sql` (admin seulement, outil désactivé par défaut par MCP_SQL_ENABLED=false).
-- `rbac_seeded_permissions` est complété en même temps, comme la migration 259, pour qu'une
-- révocation faite plus tard par un admin reste durable.
--
-- IDEMPOTENCE : CREATE TABLE IF NOT EXISTS ; INSERT IGNORE. Aucune donnée existante réécrite.
-- Retour arrière : DROP TABLE mcp_content_plans; DROP TABLE mcp_oauth_tokens;
--   DROP TABLE mcp_oauth_auth_codes; DROP TABLE mcp_oauth_clients;
--   DELETE FROM role_permissions WHERE permission_key IN ('mcp.use','mcp.write','mcp.sql');
--   DELETE FROM rbac_seeded_permissions WHERE permission_key IN ('mcp.use','mcp.write','mcp.sql');
--   DELETE FROM permissions WHERE `key` IN ('mcp.use','mcp.write','mcp.sql');
-- =====================================================================

CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
  client_id VARCHAR(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL PRIMARY KEY COMMENT 'Identifiant opaque (DCR) ou URL https du document CIMD',
  kind ENUM('dcr','cimd') NOT NULL,
  client_name VARCHAR(255) DEFAULT NULL,
  client_uri VARCHAR(512) DEFAULT NULL,
  redirect_uris_json TEXT NOT NULL,
  grant_types_json VARCHAR(255) NOT NULL DEFAULT '["authorization_code","refresh_token"]',
  scope VARCHAR(255) DEFAULT NULL,
  metadata_fetched_at DATETIME DEFAULT NULL COMMENT 'CIMD : dernière lecture du document',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_used_at DATETIME DEFAULT NULL,
  INDEX idx_mcp_oauth_clients_kind (kind, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mcp_oauth_auth_codes (
  code_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY COMMENT 'sha256 hexadécimal du code',
  client_id VARCHAR(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  redirect_uri VARCHAR(1024) NOT NULL,
  code_challenge VARCHAR(128) NOT NULL,
  scope VARCHAR(255) NOT NULL,
  resource VARCHAR(512) DEFAULT NULL,
  family_id CHAR(36) DEFAULT NULL COMMENT 'Famille de jetons émise à l’échange (révoquée si le code est rejoué)',
  expires_at DATETIME NOT NULL,
  used_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_mcp_oauth_codes_expires (expires_at),
  CONSTRAINT fk_mcp_oauth_codes_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mcp_oauth_tokens (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY COMMENT 'sha256 hexadécimal du jeton',
  kind ENUM('access','refresh') NOT NULL,
  family_id CHAR(36) NOT NULL COMMENT 'Consentement d’origine : partagé par toutes les rotations',
  client_id VARCHAR(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  scope VARCHAR(255) NOT NULL,
  resource VARCHAR(512) DEFAULT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME DEFAULT NULL,
  rotated_at DATETIME DEFAULT NULL COMMENT 'Refresh déjà échangé : toute réutilisation révoque la famille',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME DEFAULT NULL,
  INDEX idx_mcp_oauth_tokens_family (family_id),
  INDEX idx_mcp_oauth_tokens_user (user_id),
  INDEX idx_mcp_oauth_tokens_expires (expires_at),
  CONSTRAINT fk_mcp_oauth_tokens_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mcp_content_plans (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  operations_json MEDIUMTEXT NOT NULL COMMENT 'Opérations bornées (liste blanche lib/mcp/write)',
  before_hash CHAR(64) NOT NULL COMMENT 'Empreinte de l’état lu au moment du plan',
  diff_json MEDIUMTEXT NOT NULL,
  migration_sql MEDIUMTEXT NOT NULL,
  rollback_sql MEDIUMTEXT NOT NULL,
  status ENUM('planned','applied','expired','conflict') NOT NULL DEFAULT 'planned',
  expires_at DATETIME NOT NULL,
  applied_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_mcp_content_plans_expires (status, expires_at),
  CONSTRAINT fk_mcp_content_plans_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO permissions (`key`, label, description) VALUES
  ('mcp.use', 'Connecteur Claude (MCP)', 'Connecter Claude au site et lire le contenu pédagogique par le connecteur MCP'),
  ('mcp.write', 'Écriture par le connecteur MCP', 'Préparer et appliquer des corrections de contenu par le connecteur MCP (plan puis application)'),
  ('mcp.sql', 'Requêtes SQL par le connecteur MCP', 'Lancer des requêtes SELECT bornées sur les tables de contenu (outil désactivé par défaut)');

INSERT IGNORE INTO role_permissions (role_id, permission_key)
SELECT r.id, 'mcp.use' FROM roles r WHERE r.slug IN ('admin', 'prof');

INSERT IGNORE INTO role_permissions (role_id, permission_key)
SELECT r.id, p.k FROM roles r
  JOIN (SELECT 'mcp.write' AS k UNION ALL SELECT 'mcp.sql') p
 WHERE r.slug = 'admin';

INSERT IGNORE INTO rbac_seeded_permissions (role_id, permission_key)
SELECT r.id, 'mcp.use' FROM roles r WHERE r.slug IN ('admin', 'prof');

INSERT IGNORE INTO rbac_seeded_permissions (role_id, permission_key)
SELECT r.id, p.k FROM roles r
  JOIN (SELECT 'mcp.write' AS k UNION ALL SELECT 'mcp.sql') p
 WHERE r.slug = 'admin';
