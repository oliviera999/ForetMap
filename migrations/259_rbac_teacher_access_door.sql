-- Rétablit `teacher.access` sur les profils système d'enseignants (lot « prof de classe
-- bloqué à la connexion »). Idempotent.
--
-- Pourquoi. Un compte `user_type = 'teacher'` n'a pas de fiche n3beur : `teacher.access`
-- est le seul droit auquel la session cliente pouvait se raccrocher. Le catalogue
-- présente pourtant cette permission sous le libellé « Accès interface n3boss », ce qui
-- invite à la décocher sur « Prof de classe » — profil qui, par conception, n'a PAS la
-- barre haute n3boss. Depuis la migration 241 les révocations sont durables : la case
-- décochée une fois ne revenait plus au redémarrage, et tous les profs de classe
-- restaient sur l'écran de connexion, sans message, en connexion classique comme en
-- OAuth Google.
--
-- La console refuse désormais ce retrait (`teacherAccessLockError`, PUT
-- /api/rbac/profiles/:id/permissions) ; cette migration répare les bases déjà touchées.
-- `rbac_seeded_permissions` est complété en même temps pour rester cohérent avec le
-- semis de `ensureDefaultRolesAndPermissions`.

INSERT IGNORE INTO permissions (`key`, label, description)
VALUES ('teacher.access', 'Accès interface n3boss', 'Permet d’ouvrir l’interface n3boss');

INSERT IGNORE INTO role_permissions (role_id, permission_key)
SELECT r.id, 'teacher.access'
  FROM roles r
 WHERE r.slug IN ('admin', 'prof', 'prof_classe');

INSERT IGNORE INTO rbac_seeded_permissions (role_id, permission_key)
SELECT r.id, 'teacher.access'
  FROM roles r
 WHERE r.slug IN ('admin', 'prof', 'prof_classe');
