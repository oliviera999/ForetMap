-- =====================================================================
-- ForetMap — Intégrité RBAC : purge des orphelins puis pose des clés étrangères.
--
-- Constat (audit docs/AUDIT_BDD_2026-08.md §4.2 et §4.3), mesuré sur l'export du
-- 18/08/2026 :
--   * `user_roles` et `password_reset_tokens` désignent un utilisateur par le couple
--     (user_type, user_id) SANS contrainte : un compte supprimé y laissait un rôle
--     primaire ET un jeton de réinitialisation de mot de passe non consommé. Le jeton
--     observé avait expiré, mais rien ne garantissait qu'il l'aurait été.
--     `lib/studentDeletion.js` purge pourtant correctement les deux tables : l'orphelin
--     prouve qu'un AUTRE chemin de suppression a existé. Un helper applicatif ne peut pas
--     donner cette garantie ; une clé étrangère, si.
--   * deux attributions croisent les populations : un compte élève portait le rôle `prof`,
--     un compte enseignant le rôle `eleve_novice`. Non primaires, donc sans effet sur les
--     droits (`getPrimaryRoleForUser` filtre `is_primary = 1`) — mais
--     `repairDuplicatePrimaryRoles()` départage les primaires en double par `rank DESC` :
--     ce compte élève aurait été promu `prof` (rang 400) le jour où il se retrouverait
--     avec deux primaires.
--
-- Les deux colonnes `user_type` restent en place : elles sont lues partout et documentent
-- la population. La clé étrangère porte sur `user_id` seul — `users.id` est la clé
-- primaire, c'est suffisant pour garantir l'existence du compte.
--
-- Périmètre du nettoyage §4.3 : UNIQUEMENT les attributions NON primaires qui croisent
-- les populations. On ne touche pas aux rôles multiples légitimes d'un même côté (un
-- enseignant peut porter `admin`, `prof` et un profil maison et basculer de l'un à
-- l'autre), ni à aucune ligne `is_primary = 1` — la retirer laisserait un compte sans rôle.
--
-- Idempotent : DELETE sans effet au rejeu, ADD CONSTRAINT toléré en double (errno 1826).
-- =====================================================================

-- 1) Orphelins : attributions et jetons de comptes qui n'existent plus.
DELETE ur FROM user_roles ur
  LEFT JOIN users u ON u.id = ur.user_id
 WHERE u.id IS NULL;

DELETE t FROM password_reset_tokens t
  LEFT JOIN users u ON u.id = t.user_id
 WHERE u.id IS NULL;

-- 2) Attributions non primaires croisant les populations (§4.3).
DELETE ur FROM user_roles ur
  INNER JOIN roles r ON r.id = ur.role_id
 WHERE ur.is_primary = 0
   AND ur.user_type = 'student'
   AND r.slug IN ('admin', 'prof', 'gl_admin', 'gl_mj');

DELETE ur FROM user_roles ur
  INNER JOIN roles r ON r.id = ur.role_id
 WHERE ur.is_primary = 0
   AND ur.user_type = 'teacher'
   AND r.slug LIKE 'eleve\_%';

-- 3) Index dédiés : `user_id` n'est en tête d'aucun index existant
--    (PRIMARY porte (user_type, user_id, role_id)). Sans eux, InnoDB en créerait un
--    automatiquement, au nom illisible, pour porter la clé étrangère.
CREATE INDEX idx_user_roles_user ON user_roles (user_id);
CREATE INDEX idx_password_reset_user ON password_reset_tokens (user_id);

-- 4) Clés étrangères.
ALTER TABLE user_roles
  ADD CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;

ALTER TABLE password_reset_tokens
  ADD CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
