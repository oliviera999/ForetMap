-- « Prof de classe » : retrait des droits d'édition de contenus et des droits de tâches.
--
-- POURQUOI CETTE MIGRATION
-- ------------------------
-- La migration 277 avait posé sur `prof_classe` `id_keys.manage` et les quatre droits de
-- l'apprenant sur les tâches (`tasks.propose`, `tasks.assign_self`, `tasks.unassign_self`,
-- `tasks.done_self`). La référence fonctionnelle (docs/reference/foretmap/comptes-roles-et-
-- groupes.md, « Deux métiers d'enseignant ») exclut pourtant pour ce profil toute charge de
-- tâches et toute édition de contenus ; `id_keys.manage` ouvrait l'édition des clés
-- d'identification, communes à tout l'établissement (audit du 29/09/2026,
-- docs/AUDIT_PROF_CLASSE_2026-09-29.md).
--
-- `lib/rbac.js` (ROLE_PERMISSION_MATRIX.prof_classe) est aligné dans le même lot. Chaque
-- retrait est inscrit dans `rbac_seeded_permissions` (migration 241) : sans cela, le semis de
-- `ensureDefaultRolesAndPermissions` reposerait la permission si elle revenait un jour dans la
-- matrice, et le retrait ne tiendrait pas.
--
-- Idempotente : DELETE par clé, INSERT IGNORE.

DELETE rp FROM role_permissions rp
  INNER JOIN roles r ON r.id = rp.role_id
 WHERE r.slug = 'prof_classe'
   AND rp.permission_key IN (
     'id_keys.manage', 'tasks.propose', 'tasks.assign_self', 'tasks.unassign_self',
     'tasks.done_self'
   );

INSERT IGNORE INTO rbac_seeded_permissions (role_id, permission_key)
SELECT r.id, k.permission_key
  FROM roles r
  CROSS JOIN (
    SELECT 'id_keys.manage' AS permission_key
    UNION ALL SELECT 'tasks.propose'
    UNION ALL SELECT 'tasks.assign_self'
    UNION ALL SELECT 'tasks.unassign_self'
    UNION ALL SELECT 'tasks.done_self'
  ) k
 WHERE r.slug = 'prof_classe';
