-- Ordre d’affichage des photos zone / repère (glisser-déposer côté UI).
-- Rétrocompatibilité : conserver l’ordre visuel historique (plus récent en premier dans la grille).

ALTER TABLE zone_photos
  ADD COLUMN sort_order INT UNSIGNED NOT NULL DEFAULT 0 AFTER caption;

ALTER TABLE marker_photos
  ADD COLUMN sort_order INT UNSIGNED NOT NULL DEFAULT 0 AFTER caption;

UPDATE zone_photos zp
INNER JOIN (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY zone_id ORDER BY uploaded_at DESC, id DESC) - 1 AS rn
  FROM zone_photos
) x ON zp.id = x.id
SET zp.sort_order = x.rn;

UPDATE marker_photos mp
INNER JOIN (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY marker_id ORDER BY uploaded_at DESC, id DESC) - 1 AS rn
  FROM marker_photos
) x ON mp.id = x.id
SET mp.sort_order = x.rn;
