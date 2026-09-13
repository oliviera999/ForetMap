-- Audience par rôles ForetMap sur la couche visite (visit_zones / visit_markers).
-- Même contrat que 236_location_audience_roles.sql sur zones / map_markers :
-- NULL / vide sur visible_role_slugs = public ; restricted_note_role_slugs vide =
-- réservé aux gestionnaires (zones.manage / map.manage_markers).
-- Idempotent (ADD COLUMN IF NOT EXISTS). MariaDB 11.4 / cPanel : pas de USE / DEFINER.

ALTER TABLE visit_zones
  ADD COLUMN IF NOT EXISTS visible_role_slugs TEXT NULL DEFAULT NULL
    COMMENT 'JSON array de slugs rôles autorisés ; vide/NULL = public',
  ADD COLUMN IF NOT EXISTS restricted_note TEXT NULL DEFAULT NULL
    COMMENT 'Complément de texte visible seulement pour certains rôles',
  ADD COLUMN IF NOT EXISTS restricted_note_role_slugs TEXT NULL DEFAULT NULL
    COMMENT 'JSON array de slugs rôles pour restricted_note ; vide = gestionnaires seuls';

ALTER TABLE visit_markers
  ADD COLUMN IF NOT EXISTS visible_role_slugs TEXT NULL DEFAULT NULL
    COMMENT 'JSON array de slugs rôles autorisés ; vide/NULL = public',
  ADD COLUMN IF NOT EXISTS restricted_note TEXT NULL DEFAULT NULL
    COMMENT 'Complément de texte visible seulement pour certains rôles',
  ADD COLUMN IF NOT EXISTS restricted_note_role_slugs TEXT NULL DEFAULT NULL
    COMMENT 'JSON array de slugs rôles pour restricted_note ; vide = gestionnaires seuls';

-- Reprise des audiences déjà saisies côté carte (même id + map_id), sans écraser
-- une valeur visite déjà renseignée. Pas de copie description/note → short_description
-- (éditorial visite distinct ; la bascule sync/rebuild le fait explicitement).
UPDATE visit_zones vz
INNER JOIN zones z ON z.id = vz.id AND z.map_id = vz.map_id
SET
  vz.visible_role_slugs = COALESCE(vz.visible_role_slugs, z.visible_role_slugs),
  vz.restricted_note = COALESCE(vz.restricted_note, z.restricted_note),
  vz.restricted_note_role_slugs = COALESCE(vz.restricted_note_role_slugs, z.restricted_note_role_slugs);

UPDATE visit_markers vm
INNER JOIN map_markers mm ON mm.id = vm.id AND mm.map_id = vm.map_id
SET
  vm.visible_role_slugs = COALESCE(vm.visible_role_slugs, mm.visible_role_slugs),
  vm.restricted_note = COALESCE(vm.restricted_note, mm.restricted_note),
  vm.restricted_note_role_slugs = COALESCE(vm.restricted_note_role_slugs, mm.restricted_note_role_slugs);
