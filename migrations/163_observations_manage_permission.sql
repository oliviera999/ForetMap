-- =====================================================================
-- ForetMap — Permission dédiée de gestion (suppression) des observations.
--
-- Sépare lecture et écriture : la suppression d'un carnet d'observations était
-- gardée par une permission de LECTURE (observations.read.*). On introduit
-- observations.manage.all / observations.manage.group.
--
-- Idempotent :
--  - insère les clés de permission (INSERT IGNORE) ;
--  - accorde manage.all à tout rôle disposant déjà de read.all, et manage.group
--    à tout rôle disposant de read.group (même requires_elevation que la lecture),
--    afin qu'aucun rôle (système ou personnalisé) ne perde la capacité de suppression.
-- =====================================================================

INSERT IGNORE INTO permissions (`key`, label, description) VALUES
  ('observations.manage.all', 'Gestion observations globales', 'Supprimer toutes les observations'),
  ('observations.manage.group', 'Gestion observations par groupe', 'Supprimer les observations du périmètre de groupe');

INSERT IGNORE INTO role_permissions (role_id, permission_key, requires_elevation)
SELECT rp.role_id, 'observations.manage.all', rp.requires_elevation
  FROM role_permissions rp
 WHERE rp.permission_key = 'observations.read.all';

INSERT IGNORE INTO role_permissions (role_id, permission_key, requires_elevation)
SELECT rp.role_id, 'observations.manage.group', rp.requires_elevation
  FROM role_permissions rp
 WHERE rp.permission_key = 'observations.read.group';
