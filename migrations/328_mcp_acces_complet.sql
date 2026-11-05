-- =====================================================================
-- Connecteur Claude — accès complet, ouvert par défaut, paramétrable (docs/MCP.md § 4 et § 13).
--
-- Permissions RBAC semées :
--   `mcp.ops`            — outil `foretmap_ops` (tâches planifiées, migrations, redémarrage,
--                          sauvegarde, rétention, caches) : admin seulement ;
--   `notifications.send` — `POST /api/notifications/send` (notification à un compte, à un
--                          groupe ou à tous) : admin et n3boss (prof).
--
-- Aucune ligne `app_settings` : les défauts des réglages `mcp.*` vivent dans le registre
-- (`lib/settings/mcp.js`).
--
-- IDEMPOTENCE : INSERT IGNORE seulement. Aucune donnée existante réécrite.
-- Retour arrière :
--   DELETE FROM role_permissions WHERE permission_key IN ('mcp.ops','notifications.send');
--   DELETE FROM rbac_seeded_permissions WHERE permission_key IN ('mcp.ops','notifications.send');
--   DELETE FROM permissions WHERE `key` IN ('mcp.ops','notifications.send');
-- =====================================================================

INSERT IGNORE INTO permissions (`key`, label, description) VALUES
  ('mcp.ops', 'Exploitation (MCP)', 'Piloter l’exploitation par le connecteur MCP : tâches planifiées, migrations, redémarrage, sauvegarde, rétention, caches'),
  ('notifications.send', 'Envoi de notifications', 'Envoyer une notification à un compte, à un groupe ou à tous');

INSERT IGNORE INTO role_permissions (role_id, permission_key)
SELECT r.id, 'mcp.ops' FROM roles r WHERE r.slug = 'admin';

INSERT IGNORE INTO rbac_seeded_permissions (role_id, permission_key)
SELECT r.id, 'mcp.ops' FROM roles r WHERE r.slug = 'admin';

INSERT IGNORE INTO role_permissions (role_id, permission_key)
SELECT r.id, 'notifications.send' FROM roles r WHERE r.slug IN ('admin', 'prof');

INSERT IGNORE INTO rbac_seeded_permissions (role_id, permission_key)
SELECT r.id, 'notifications.send' FROM roles r WHERE r.slug IN ('admin', 'prof');
