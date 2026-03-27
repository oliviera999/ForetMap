-- Alignement du catalogue RBAC et des profils système par défaut.
-- Idempotent: INSERT IGNORE pour préserver les personnalisations existantes.

INSERT IGNORE INTO permissions (`key`, label, description) VALUES
  ('teacher.access', 'Accès interface professeur', 'Permet d’ouvrir l’interface professeur'),
  ('admin.roles.manage', 'Gestion des profils RBAC', 'Créer/renommer profils, permissions et PIN'),
  ('admin.users.assign_roles', 'Attribution des profils', 'Attribuer/retraiter un profil aux utilisateurs'),
  ('users.create', 'Création unitaire utilisateurs', 'Créer un utilisateur unitaire (élève/prof/admin selon droits)'),
  ('admin.settings.read', 'Lecture paramètres admin', 'Consulter la console de réglages'),
  ('admin.settings.write', 'Édition paramètres admin', 'Modifier les réglages non secrets'),
  ('admin.settings.secrets.write', 'Actions admin critiques', 'Exécuter les actions critiques (restart, secrets)'),
  ('stats.read.all', 'Lecture stats globales', 'Consulter les stats de tous les élèves'),
  ('stats.export', 'Export stats', 'Exporter les stats élèves en CSV'),
  ('students.import', 'Import élèves', 'Importer des élèves via CSV/XLSX'),
  ('students.delete', 'Suppression élève', 'Supprimer un compte élève'),
  ('tasks.manage', 'Gestion tâches', 'Créer/éditer/supprimer les tâches'),
  ('tasks.validate', 'Validation tâches', 'Valider les tâches terminées'),
  ('tasks.propose', 'Proposition de tâches', 'Proposer de nouvelles tâches'),
  ('tasks.assign_self', 'Prise en charge tâche', 'S’assigner à une tâche'),
  ('tasks.unassign_self', 'Retrait de tâche', 'Se retirer d’une tâche'),
  ('tasks.done_self', 'Soumission de tâche', 'Marquer une tâche comme faite'),
  ('zones.manage', 'Gestion zones', 'Créer/éditer/supprimer zones et photos'),
  ('map.manage_markers', 'Gestion repères', 'Créer/éditer/supprimer repères'),
  ('plants.manage', 'Gestion biodiversité', 'Créer/éditer/supprimer/importer plantes'),
  ('tutorials.manage', 'Gestion tutoriels', 'Créer/éditer/supprimer tutoriels'),
  ('visit.manage', 'Gestion visite', 'Gérer la carte de visite publique'),
  ('audit.read', 'Lecture audit', 'Consulter le journal d’audit'),
  ('observations.read.all', 'Lecture observations globales', 'Consulter toutes les observations');

INSERT IGNORE INTO role_permissions (role_id, permission_key, requires_elevation)
SELECT r.id, p.permission_key, p.requires_elevation
FROM (
  SELECT 'admin' AS role_slug, 'teacher.access' AS permission_key, 0 AS requires_elevation UNION ALL
  SELECT 'admin','admin.roles.manage',1 UNION ALL
  SELECT 'admin','admin.users.assign_roles',1 UNION ALL
  SELECT 'admin','users.create',1 UNION ALL
  SELECT 'admin','admin.settings.read',1 UNION ALL
  SELECT 'admin','admin.settings.write',1 UNION ALL
  SELECT 'admin','admin.settings.secrets.write',1 UNION ALL
  SELECT 'admin','stats.read.all',0 UNION ALL
  SELECT 'admin','stats.export',1 UNION ALL
  SELECT 'admin','students.import',1 UNION ALL
  SELECT 'admin','students.delete',1 UNION ALL
  SELECT 'admin','tasks.manage',1 UNION ALL
  SELECT 'admin','tasks.validate',1 UNION ALL
  SELECT 'admin','tasks.propose',0 UNION ALL
  SELECT 'admin','tasks.assign_self',0 UNION ALL
  SELECT 'admin','tasks.unassign_self',0 UNION ALL
  SELECT 'admin','tasks.done_self',0 UNION ALL
  SELECT 'admin','zones.manage',1 UNION ALL
  SELECT 'admin','map.manage_markers',1 UNION ALL
  SELECT 'admin','plants.manage',1 UNION ALL
  SELECT 'admin','tutorials.manage',1 UNION ALL
  SELECT 'admin','visit.manage',1 UNION ALL
  SELECT 'admin','audit.read',1 UNION ALL
  SELECT 'admin','observations.read.all',1 UNION ALL

  SELECT 'prof','teacher.access',0 UNION ALL
  SELECT 'prof','stats.read.all',0 UNION ALL
  SELECT 'prof','stats.export',1 UNION ALL
  SELECT 'prof','students.import',1 UNION ALL
  SELECT 'prof','students.delete',1 UNION ALL
  SELECT 'prof','users.create',1 UNION ALL
  SELECT 'prof','tasks.manage',1 UNION ALL
  SELECT 'prof','tasks.validate',1 UNION ALL
  SELECT 'prof','tasks.propose',0 UNION ALL
  SELECT 'prof','tasks.assign_self',0 UNION ALL
  SELECT 'prof','tasks.unassign_self',0 UNION ALL
  SELECT 'prof','tasks.done_self',0 UNION ALL
  SELECT 'prof','zones.manage',1 UNION ALL
  SELECT 'prof','map.manage_markers',1 UNION ALL
  SELECT 'prof','plants.manage',1 UNION ALL
  SELECT 'prof','tutorials.manage',1 UNION ALL
  SELECT 'prof','visit.manage',1 UNION ALL
  SELECT 'prof','audit.read',1 UNION ALL
  SELECT 'prof','observations.read.all',1 UNION ALL

  SELECT 'eleve_chevronne','tasks.propose',1 UNION ALL
  SELECT 'eleve_chevronne','tasks.assign_self',0 UNION ALL
  SELECT 'eleve_chevronne','tasks.unassign_self',0 UNION ALL
  SELECT 'eleve_chevronne','tasks.done_self',0 UNION ALL

  SELECT 'eleve_avance','tasks.propose',0 UNION ALL
  SELECT 'eleve_avance','tasks.assign_self',0 UNION ALL
  SELECT 'eleve_avance','tasks.unassign_self',0 UNION ALL
  SELECT 'eleve_avance','tasks.done_self',0 UNION ALL

  SELECT 'eleve_novice','tasks.assign_self',0 UNION ALL
  SELECT 'eleve_novice','tasks.unassign_self',0 UNION ALL
  SELECT 'eleve_novice','tasks.done_self',0
) p
JOIN roles r ON r.slug = p.role_slug;
