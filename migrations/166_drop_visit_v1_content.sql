-- F4 — Assainissement Visite : suppression du modèle V1 (visit_zone_content /
-- visit_marker_content), gelé depuis la migration 022 (copie douce vers
-- visit_zones / visit_markers). Plus aucun lecteur ni écrivain applicatif.
--
-- Filet de sécurité : on rejoue la copie douce de 022 (INSERT IGNORE) au cas où
-- du contenu V1 aurait été ajouté hors application sur une base historique.
-- Les erreurs 1146 (table V1 absente sur base neuve) sont tolérées par le runner.

INSERT IGNORE INTO visit_zones
  (id, map_id, name, points, subtitle, short_description, details_title, details_text, is_active, sort_order, created_at, updated_at)
SELECT
  z.id,
  z.map_id,
  z.name,
  COALESCE(z.points, '[]') AS points,
  COALESCE(vz.subtitle, ''),
  COALESCE(vz.short_description, ''),
  COALESCE(vz.details_title, 'Détails'),
  COALESCE(vz.details_text, ''),
  COALESCE(vz.is_active, 1),
  COALESCE(vz.sort_order, 0),
  NOW(),
  NOW()
FROM zones z
JOIN visit_zone_content vz ON vz.zone_id = z.id;

INSERT IGNORE INTO visit_markers
  (id, map_id, x_pct, y_pct, label, emoji, subtitle, short_description, details_title, details_text, is_active, sort_order, created_at, updated_at)
SELECT
  m.id,
  m.map_id,
  m.x_pct,
  m.y_pct,
  m.label,
  COALESCE(m.emoji, '📍'),
  COALESCE(vm.subtitle, ''),
  COALESCE(vm.short_description, ''),
  COALESCE(vm.details_title, 'Détails'),
  COALESCE(vm.details_text, ''),
  COALESCE(vm.is_active, 1),
  COALESCE(vm.sort_order, 0),
  NOW(),
  NOW()
FROM map_markers m
JOIN visit_marker_content vm ON vm.marker_id = m.id;

-- Suppression destructive (documentée dans CHANGELOG.md et docs/EVOLUTION.md).
DROP TABLE IF EXISTS visit_marker_content;
DROP TABLE IF EXISTS visit_zone_content;
