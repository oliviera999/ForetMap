-- Référentiel « permission déjà proposée à ce profil » (lot RBAC sept. 2026). Idempotent.
--
-- Pourquoi. La migration 231 est arrivée avec une garde dans
-- `ensureDefaultRolesAndPermissions` : la matrice n'était semée que si le profil n'avait
-- ENCORE AUCUNE permission, pour qu'une révocation admin survive aux redémarrages.
-- L'intention est juste, le critère ne l'est pas : sur une base neuve, les migrations
-- `025`, `034`, `163`, `219` et `231` ont déjà inséré une partie de `role_permissions`
-- avant que le semis ne tourne. Le compteur est donc > 0, la matrice entière est sautée,
-- et toute permission qui ne vit que dans `ROLE_PERMISSION_MATRIX` n'est jamais posée.
-- Mesuré sur base neuve : `admin` perdait `forum.group.moderate`, `tours.manage` et les
-- variantes `.group` ; `prof` perdait en plus `groups.read`, `groups.manage` et
-- `tasks.assign.group`. Plus personne ne pouvait modérer le forum
-- (`requirePermission('forum.group.moderate')` sur le verrouillage de sujet).
--
-- Le critère correct n'est pas « ce profil a-t-il des permissions ? » mais « CETTE
-- permission a-t-elle déjà été proposée à CE profil ? ». Cette table le mémorise, ce qui
-- distingue enfin « révoqué par un admin » de « jamais accordé ».
--
-- Reprise. On y verse les permissions actuellement accordées :
--   * base existante — semée avant la garde, donc matrice complète : tout est marqué comme
--     proposé, rien n'est ré-accordé, et les révocations faites ensuite restent durables ;
--   * base neuve — seules les lignes des migrations sont marquées ; le semis accorde puis
--     enregistre le reste de la matrice au prochain passage.

CREATE TABLE IF NOT EXISTS rbac_seeded_permissions (
  role_id INT UNSIGNED NOT NULL,
  permission_key VARCHAR(120) NOT NULL,
  seeded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (role_id, permission_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO rbac_seeded_permissions (role_id, permission_key)
SELECT rp.role_id, rp.permission_key FROM role_permissions rp;
