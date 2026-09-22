-- Réalignement des profils du 22/09/2026 — mise en code d'un correctif appliqué à la main.
--
-- POURQUOI CETTE MIGRATION
-- ------------------------
-- Le script d'exploitation `2026-09-22_roles_realignement.sql` a été passé directement sur la
-- base de production : rang de « Personnel » relevé, matrice de « Prof de classe » revue,
-- `admin.roles.manage` retiré à « n3boss ». Rien de tout cela ne vivait dans le code, si bien
-- que **toute base neuve** — CI, poste de développement, réinstallation — repartait sur
-- l'ancien modèle : `personnel` au rang 50, `prof_classe` avec `teacher.access`. Deux modèles
-- de droits qui divergent silencieusement, c'est la panne qu'on ne reproduit jamais en local.
--
-- Cette migration rejoue le script d'exploitation, et `lib/rbac.js` (SYSTEM_ROLES,
-- ROLE_PERMISSION_MATRIX) a été aligné dans le même lot. Elle ne touche **pas** aux comptes :
-- le passage des 148 personnels de `user_type = 'student'` à `'teacher'` porte sur des lignes
-- nominatives qui n'existent que sur la base de production, et qu'une migration n'a pas à
-- deviner (cf. `docs/reference/foretmap/comptes-roles-et-groupes.md`).
--
-- RANG DE « PERSONNEL » : 50 → 320
-- Le profil effectif d'un compte est « le plus élevé l'emporte » entre le profil attribué et
-- le profil par défaut de ses groupes actifs (`lib/effectiveRole.js`). À 50, un personnel
-- rattaché à un groupe classe se voyait conférer le palier n3beur du groupe et **perdait sa
-- qualité de personnel** — donc `staff_plan.access` et l'entrée sur proflyautey. À 320, il la
-- garde. Aucune capacité n'est gagnée au passage : le seul seuil de rang du code est 400
-- (`N3BEUR_RANK_EXCLUSIVE_MAX` — vue globale sur les comptes et les groupes), et l'exclusion
-- de l'échelle n3beur se décide sur le slug (`NON_N3BEUR_SYSTEM_ROLE_SLUGS`), pas sur le rang.
--
-- `rbac_seeded_permissions` (migration 241) MÉMORISE « cette permission a déjà été proposée à
-- ce profil ». Chaque retrait ci-dessous y est donc inscrit : sans cela, le semis de
-- `ensureDefaultRolesAndPermissions` reposerait la permission au prochain démarrage, et le
-- retrait ne tiendrait pas. Symétriquement, chaque ajout y est inscrit pour que le semis ne
-- le repropose pas après un retrait volontaire ultérieur.
--
-- Idempotente : UPDATE convergents, DELETE par clé, INSERT IGNORE.

-- ---------------------------------------------------------------------------------------
-- 1. Rang du profil « Personnel »
-- ---------------------------------------------------------------------------------------
UPDATE roles SET `rank` = 320 WHERE slug = 'personnel' AND is_system = 1 AND `rank` <> 320;

-- ---------------------------------------------------------------------------------------
-- 2. « Prof de classe » : retraits
--    teacher.access      — interface de type apprenant, pas de barre haute n3boss ;
--    observations.read.all / stats.read.all / stats.export — périmètre borné aux groupes.
-- ---------------------------------------------------------------------------------------
DELETE rp FROM role_permissions rp
  INNER JOIN roles r ON r.id = rp.role_id
 WHERE r.slug = 'prof_classe'
   AND rp.permission_key IN (
     'teacher.access', 'observations.read.all', 'stats.read.all', 'stats.export'
   );

INSERT IGNORE INTO rbac_seeded_permissions (role_id, permission_key)
SELECT r.id, k.permission_key
  FROM roles r
  CROSS JOIN (
    SELECT 'teacher.access' AS permission_key
    UNION ALL SELECT 'observations.read.all'
    UNION ALL SELECT 'stats.read.all'
    UNION ALL SELECT 'stats.export'
  ) k
 WHERE r.slug = 'prof_classe';

-- ---------------------------------------------------------------------------------------
-- 3. « Prof de classe » : ajouts (droits de l'apprenant sur les tâches)
--
--    Inertes en l'état : `task_assignments` est centrée sur l'élève (`student_id`, lectures
--    filtrées sur `user_type = 'student'`), et un compte enseignant ne peut donc pas encore
--    prendre ni rendre une tâche. Ils sont posés pour que la matrice du code décrive la base
--    de production ; l'ouverture effective est un lot distinct.
-- ---------------------------------------------------------------------------------------
INSERT IGNORE INTO role_permissions (role_id, permission_key)
SELECT r.id, k.permission_key
  FROM roles r
  CROSS JOIN (
    SELECT 'tasks.propose' AS permission_key
    UNION ALL SELECT 'tasks.assign_self'
    UNION ALL SELECT 'tasks.unassign_self'
    UNION ALL SELECT 'tasks.done_self'
  ) k
 WHERE r.slug = 'prof_classe';

INSERT IGNORE INTO rbac_seeded_permissions (role_id, permission_key)
SELECT r.id, k.permission_key
  FROM roles r
  CROSS JOIN (
    SELECT 'tasks.propose' AS permission_key
    UNION ALL SELECT 'tasks.assign_self'
    UNION ALL SELECT 'tasks.unassign_self'
    UNION ALL SELECT 'tasks.done_self'
  ) k
 WHERE r.slug = 'prof_classe';

-- ---------------------------------------------------------------------------------------
-- 4. « n3boss » : retrait de `admin.roles.manage`
--    Éditer les profils RBAC et leurs permissions reste à l'administrateur. La clé n'est pas
--    dans `ROLE_PERMISSION_MATRIX.prof`, donc le semis ne la reposera pas ; la ligne
--    `rbac_seeded_permissions` est écrite quand même, pour que le retrait survive à un futur
--    élargissement de la matrice.
-- ---------------------------------------------------------------------------------------
DELETE rp FROM role_permissions rp
  INNER JOIN roles r ON r.id = rp.role_id
 WHERE r.slug = 'prof' AND rp.permission_key = 'admin.roles.manage';

INSERT IGNORE INTO rbac_seeded_permissions (role_id, permission_key)
SELECT r.id, 'admin.roles.manage' FROM roles r WHERE r.slug = 'prof';
