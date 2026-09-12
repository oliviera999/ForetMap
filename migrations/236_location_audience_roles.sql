-- Visibilité des lieux (zones / repères) par rôles ForetMap + complément de texte réservé.
-- NULL / vide sur visible_role_slugs = public (comportement historique).
-- restricted_note : texte optionnel ; restricted_note_role_slugs vide = réservé aux
-- gestionnaires (zones.manage / map.manage_markers). Idempotent (ADD COLUMN IF NOT EXISTS).

ALTER TABLE zones
  ADD COLUMN IF NOT EXISTS visible_role_slugs TEXT NULL DEFAULT NULL
    COMMENT 'JSON array de slugs rôles autorisés ; vide/NULL = public',
  ADD COLUMN IF NOT EXISTS restricted_note TEXT NULL DEFAULT NULL
    COMMENT 'Complément de texte visible seulement pour certains rôles',
  ADD COLUMN IF NOT EXISTS restricted_note_role_slugs TEXT NULL DEFAULT NULL
    COMMENT 'JSON array de slugs rôles pour restricted_note ; vide = gestionnaires seuls';

ALTER TABLE map_markers
  ADD COLUMN IF NOT EXISTS visible_role_slugs TEXT NULL DEFAULT NULL
    COMMENT 'JSON array de slugs rôles autorisés ; vide/NULL = public',
  ADD COLUMN IF NOT EXISTS restricted_note TEXT NULL DEFAULT NULL
    COMMENT 'Complément de texte visible seulement pour certains rôles',
  ADD COLUMN IF NOT EXISTS restricted_note_role_slugs TEXT NULL DEFAULT NULL
    COMMENT 'JSON array de slugs rôles pour restricted_note ; vide = gestionnaires seuls';
