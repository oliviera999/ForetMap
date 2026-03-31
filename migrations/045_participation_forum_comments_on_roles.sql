-- Participation forum et commentaires contextuels : par profil RBAC (roles), plus par colonnes users.
ALTER TABLE roles
  ADD COLUMN forum_participate TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE roles
  ADD COLUMN context_comment_participate TINYINT(1) NOT NULL DEFAULT 1;

-- Reprendre les réglages les plus restrictifs observés par profil principal n3beur (MIN).
UPDATE roles r
INNER JOIN (
  SELECT ur.role_id AS rid, MIN(COALESCE(u.forum_participate, 1)) AS fp
    FROM user_roles ur
    INNER JOIN users u ON u.id = ur.user_id AND u.user_type = 'student'
   WHERE ur.is_primary = 1
   GROUP BY ur.role_id
) x ON x.rid = r.id
SET r.forum_participate = x.fp;

UPDATE roles r
INNER JOIN (
  SELECT ur.role_id AS rid, MIN(COALESCE(u.context_comment_participate, 1)) AS cp
    FROM user_roles ur
    INNER JOIN users u ON u.id = ur.user_id AND u.user_type = 'student'
   WHERE ur.is_primary = 1
   GROUP BY ur.role_id
) x ON x.rid = r.id
SET r.context_comment_participate = x.cp;

ALTER TABLE users DROP COLUMN forum_participate;
ALTER TABLE users DROP COLUMN context_comment_participate;
