-- Durcissement admin prod: garantit le rôle admin pour l'identité canonique "oliviera9"

UPDATE user_roles ur
JOIN teachers t ON t.id = ur.user_id
SET ur.is_primary = 0
WHERE ur.user_type = 'teacher'
  AND LOWER(SUBSTRING_INDEX(COALESCE(t.email, ''), '@', 1)) = 'oliviera9';

INSERT INTO user_roles (user_type, user_id, role_id, is_primary)
SELECT 'teacher', t.id, r.id, 1
FROM teachers t
JOIN roles r ON r.slug = 'admin'
WHERE LOWER(SUBSTRING_INDEX(COALESCE(t.email, ''), '@', 1)) = 'oliviera9'
ON DUPLICATE KEY UPDATE is_primary = 1;

UPDATE schema_version SET version = 28;
