-- Audience des lieux, suite : restriction par **groupes** (classe, club, équipe) et
-- **héritage d'audience par catégorie**. Complète `236_location_audience_roles.sql` (rôles)
-- et `261_location_links.sql` (liens). Règles dans `lib/locationAudience.js`.
--
-- 1) GROUPES — chaque liste de rôles reçoit sa liste de groupes jumelle. L'audience
--    effective est l'**union** des deux : le lecteur passe s'il a le bon rôle OU s'il est
--    membre d'un des groupes. Les deux listes vides = public, comme avant. Les groupes
--    lisibles d'un lecteur sont déjà portés par la session (`req.auth.groupIds`,
--    `lib/groupScope.js` : appartenances directes + sous-groupes) — rien de nouveau à
--    charger par requête.
--    Pourquoi l'union et pas l'intersection : deux listes vides valent « public », donc
--    l'intersection rendrait tout lieu à rôles invisible dès qu'aucun groupe n'est coché.
--
-- 2) HÉRITAGE PAR CATÉGORIE — une catégorie peut porter son audience. Un lieu qui n'a
--    **aucune** audience propre hérite de l'union de celles de ses catégories qui en
--    déclarent une. Une catégorie sans audience reste neutre (elle n'ouvre ni ne ferme
--    rien), sans quoi ranger un lieu réservé dans une catégorie ordinaire le rendrait
--    public. Une audience posée sur le lieu l'emporte : le plus spécifique gagne.
--
-- Les colonnes sont ajoutées **aussi** sur `visit_zones` / `visit_markers` : la Visite porte
-- sa propre copie d'audience depuis la migration 240, et une colonne manquante y ferait
-- retomber le filtrage sur la seule liste de rôles.
--
-- Stockage : JSON en TEXT, comme les listes de rôles existantes (`serializeRoleSlugList`).
-- Pas de clé étrangère vers `groups` : la colonne est une liste, et un groupe supprimé doit
-- se comporter comme un groupe inconnu (audience qui ne matche plus), pas empêcher la
-- suppression. `lib/locationAudience.js` ignore les identifiants inconnus à la lecture.
--
-- Idempotent : ADD COLUMN IF NOT EXISTS.

ALTER TABLE zones
  ADD COLUMN IF NOT EXISTS visible_group_ids TEXT NULL DEFAULT NULL
    COMMENT 'JSON array d''ids de groupes autorisés ; en union avec visible_role_slugs',
  ADD COLUMN IF NOT EXISTS restricted_note_group_ids TEXT NULL DEFAULT NULL
    COMMENT 'JSON array d''ids de groupes pour restricted_note ; union avec les rôles';

ALTER TABLE map_markers
  ADD COLUMN IF NOT EXISTS visible_group_ids TEXT NULL DEFAULT NULL
    COMMENT 'JSON array d''ids de groupes autorisés ; en union avec visible_role_slugs',
  ADD COLUMN IF NOT EXISTS restricted_note_group_ids TEXT NULL DEFAULT NULL
    COMMENT 'JSON array d''ids de groupes pour restricted_note ; union avec les rôles';

ALTER TABLE visit_zones
  ADD COLUMN IF NOT EXISTS visible_group_ids TEXT NULL DEFAULT NULL
    COMMENT 'Miroir visite de zones.visible_group_ids',
  ADD COLUMN IF NOT EXISTS restricted_note_group_ids TEXT NULL DEFAULT NULL
    COMMENT 'Miroir visite de zones.restricted_note_group_ids';

ALTER TABLE visit_markers
  ADD COLUMN IF NOT EXISTS visible_group_ids TEXT NULL DEFAULT NULL
    COMMENT 'Miroir visite de map_markers.visible_group_ids',
  ADD COLUMN IF NOT EXISTS restricted_note_group_ids TEXT NULL DEFAULT NULL
    COMMENT 'Miroir visite de map_markers.restricted_note_group_ids';

ALTER TABLE location_links
  ADD COLUMN IF NOT EXISTS audience_group_ids TEXT NULL DEFAULT NULL
    COMMENT 'JSON array d''ids de groupes ; union avec audience_role_slugs';

ALTER TABLE location_categories
  ADD COLUMN IF NOT EXISTS visible_role_slugs TEXT NULL DEFAULT NULL
    COMMENT 'Audience héritée par les lieux de la catégorie sans audience propre',
  ADD COLUMN IF NOT EXISTS visible_group_ids TEXT NULL DEFAULT NULL
    COMMENT 'Groupes hérités par les lieux de la catégorie sans audience propre';
