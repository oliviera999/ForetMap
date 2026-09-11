-- Profil système « Prof de classe » + permission media.manage (lot RBAC sept. 2026).
-- Idempotent. La matrice de permissions de `prof_classe` est semée par
-- `ensureDefaultRolesAndPermissions` (profil encore vide) après insertion du catalogue.

INSERT IGNORE INTO roles (slug, display_name, emoji, min_done_tasks, display_order, `rank`, is_system)
VALUES ('prof_classe', 'Prof de classe', NULL, NULL, 25, 350, 1);

INSERT IGNORE INTO permissions (`key`, label, description)
VALUES (
  'media.manage',
  'Gestion médiathèque',
  'Téléverser et supprimer des médias dans la médiathèque partagée'
);

INSERT IGNORE INTO role_permissions (role_id, permission_key)
SELECT r.id, 'media.manage'
  FROM roles r
 WHERE r.slug IN ('admin', 'prof')
   AND EXISTS (SELECT 1 FROM permissions p WHERE p.`key` = 'media.manage');
