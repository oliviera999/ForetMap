-- Zones « bâtiments » — partie centrale de la carte `lyautey` (Lycée Lyautey).
-- Généré par scripts/gen-zones-lyautey-batiments.js — NE PAS éditer à la main.
--
-- Import : mysql -u <user> -p <base> < sql/zones_lyautey_batiments.sql
-- Idempotent : ré-exécutable sans doublon (ON DUPLICATE KEY UPDATE par id stable).
-- Géométrie : polygones en % de l’image de fond ({xp,yp}, 0→100).
-- Tracé relevé sur la vue OpenStreetMap étiquetée du campus (G, D, S, M, I, L,
--   K, H, Salle Delacroix, Infirmerie, CDI, Vie scolaire).
-- ⚠ Les % sont relatifs au CADRAGE de cette image OSM : le fond de la carte
--   `lyautey` doit être cette même image pour que les zones s’alignent.

-- Garde-fou : la carte doit exister (no-op si déjà présente).
INSERT IGNORE INTO maps (id, label, sort_order) VALUES ('lyautey', 'Lycée Lyautey', 3);

-- Nettoyage des rectangles génériques de la 1re passe (no-op si absents).
DELETE FROM zones WHERE map_id = 'lyautey' AND id IN ('lyautey-bat-01', 'lyautey-bat-02', 'lyautey-bat-03', 'lyautey-bat-04', 'lyautey-bat-05', 'lyautey-bat-06', 'lyautey-bat-07', 'lyautey-bat-08', 'lyautey-bat-09', 'lyautey-bat-10', 'lyautey-bat-11', 'lyautey-bat-12');

-- Bâtiment G
INSERT INTO zones (id, map_id, name, x, y, width, height, current_plant, stage, special, shape, points, color, description) VALUES
  ('lyautey-bat-g', 'lyautey', 'Bâtiment G', 0, 0, 0, 0, '', 'special', 1, 'rect', '[{"xp":49.3,"yp":10},{"xp":65.9,"yp":8.1},{"xp":67.9,"yp":17.6},{"xp":51.7,"yp":19.5}]', '#9ca3af80', 'Bâtiment G (nord du campus).')
ON DUPLICATE KEY UPDATE
  map_id = VALUES(map_id),
  name = VALUES(name),
  stage = VALUES(stage),
  special = VALUES(special),
  shape = VALUES(shape),
  points = VALUES(points),
  color = VALUES(color),
  description = VALUES(description);

-- Salle Delacroix
INSERT INTO zones (id, map_id, name, x, y, width, height, current_plant, stage, special, shape, points, color, description) VALUES
  ('lyautey-salle-delacroix', 'lyautey', 'Salle Delacroix', 0, 0, 0, 0, '', 'special', 1, 'rect', '[{"xp":67.4,"yp":12},{"xp":77,"yp":11},{"xp":78.4,"yp":19.4},{"xp":68.5,"yp":20.5}]', '#9ca3af80', 'Salle Delacroix (nord-est, à droite du Bâtiment G).')
ON DUPLICATE KEY UPDATE
  map_id = VALUES(map_id),
  name = VALUES(name),
  stage = VALUES(stage),
  special = VALUES(special),
  shape = VALUES(shape),
  points = VALUES(points),
  color = VALUES(color),
  description = VALUES(description);

-- Bâtiment D
INSERT INTO zones (id, map_id, name, x, y, width, height, current_plant, stage, special, shape, points, color, description) VALUES
  ('lyautey-bat-d', 'lyautey', 'Bâtiment D', 0, 0, 0, 0, '', 'special', 1, 'rect', '[{"xp":18.8,"yp":14.4},{"xp":36.9,"yp":12},{"xp":38.7,"yp":23.2},{"xp":20.6,"yp":25.7}]', '#9ca3af80', 'Bâtiment D (nord-ouest du campus).')
ON DUPLICATE KEY UPDATE
  map_id = VALUES(map_id),
  name = VALUES(name),
  stage = VALUES(stage),
  special = VALUES(special),
  shape = VALUES(shape),
  points = VALUES(points),
  color = VALUES(color),
  description = VALUES(description);

-- Bâtiment S
INSERT INTO zones (id, map_id, name, x, y, width, height, current_plant, stage, special, shape, points, color, description) VALUES
  ('lyautey-bat-s', 'lyautey', 'Bâtiment S', 0, 0, 0, 0, '', 'special', 1, 'rect', '[{"xp":5.2,"yp":22.3},{"xp":18.8,"yp":20.5},{"xp":20.6,"yp":33},{"xp":6.6,"yp":34.9}]', '#9ca3af80', 'Bâtiment S (flanc ouest, côté Rue de la Réunion).')
ON DUPLICATE KEY UPDATE
  map_id = VALUES(map_id),
  name = VALUES(name),
  stage = VALUES(stage),
  special = VALUES(special),
  shape = VALUES(shape),
  points = VALUES(points),
  color = VALUES(color),
  description = VALUES(description);

-- Infirmerie du Lycée Lyautey
INSERT INTO zones (id, map_id, name, x, y, width, height, current_plant, stage, special, shape, points, color, description) VALUES
  ('lyautey-infirmerie', 'lyautey', 'Infirmerie du Lycée Lyautey', 0, 0, 0, 0, '', 'special', 1, 'rect', '[{"xp":60.3,"yp":31.4},{"xp":70,"yp":30.5},{"xp":71.1,"yp":36.4},{"xp":61.3,"yp":37.2}]', '#9ca3af80', 'Infirmerie du Lycée Lyautey (centre).')
ON DUPLICATE KEY UPDATE
  map_id = VALUES(map_id),
  name = VALUES(name),
  stage = VALUES(stage),
  special = VALUES(special),
  shape = VALUES(shape),
  points = VALUES(points),
  color = VALUES(color),
  description = VALUES(description);

-- Centre de Documentation et d’Information
INSERT INTO zones (id, map_id, name, x, y, width, height, current_plant, stage, special, shape, points, color, description) VALUES
  ('lyautey-cdi', 'lyautey', 'Centre de Documentation et d’Information', 0, 0, 0, 0, '', 'special', 1, 'rect', '[{"xp":44.6,"yp":36.7},{"xp":60.6,"yp":34.9},{"xp":62.4,"yp":47.8},{"xp":46.3,"yp":49.6}]', '#9ca3af80', 'CDI — Centre de Documentation et d’Information (centre).')
ON DUPLICATE KEY UPDATE
  map_id = VALUES(map_id),
  name = VALUES(name),
  stage = VALUES(stage),
  special = VALUES(special),
  shape = VALUES(shape),
  points = VALUES(points),
  color = VALUES(color),
  description = VALUES(description);

-- Bâtiment M
INSERT INTO zones (id, map_id, name, x, y, width, height, current_plant, stage, special, shape, points, color, description) VALUES
  ('lyautey-bat-m', 'lyautey', 'Bâtiment M', 0, 0, 0, 0, '', 'special', 1, 'rect', '[{"xp":10.5,"yp":42.5},{"xp":32.8,"yp":39.9},{"xp":34.5,"yp":52.5},{"xp":12.2,"yp":55.1}]', '#9ca3af80', 'Bâtiment M (centre-ouest).')
ON DUPLICATE KEY UPDATE
  map_id = VALUES(map_id),
  name = VALUES(name),
  stage = VALUES(stage),
  special = VALUES(special),
  shape = VALUES(shape),
  points = VALUES(points),
  color = VALUES(color),
  description = VALUES(description);

-- Bâtiment I
INSERT INTO zones (id, map_id, name, x, y, width, height, current_plant, stage, special, shape, points, color, description) VALUES
  ('lyautey-bat-i', 'lyautey', 'Bâtiment I', 0, 0, 0, 0, '', 'special', 1, 'rect', '[{"xp":71.4,"yp":42.8},{"xp":86.2,"yp":41.1},{"xp":88,"yp":52.8},{"xp":73.2,"yp":54.5}]', '#9ca3af80', 'Bâtiment I (centre-est, côté Rue d’Indochine).')
ON DUPLICATE KEY UPDATE
  map_id = VALUES(map_id),
  name = VALUES(name),
  stage = VALUES(stage),
  special = VALUES(special),
  shape = VALUES(shape),
  points = VALUES(points),
  color = VALUES(color),
  description = VALUES(description);

-- Bâtiment L
INSERT INTO zones (id, map_id, name, x, y, width, height, current_plant, stage, special, shape, points, color, description) VALUES
  ('lyautey-bat-l', 'lyautey', 'Bâtiment L', 0, 0, 0, 0, '', 'special', 1, 'rect', '[{"xp":21.3,"yp":57.5},{"xp":51.9,"yp":54},{"xp":53.7,"yp":64.2},{"xp":23,"yp":67.7}]', '#9ca3af80', 'Bâtiment L (long bâtiment, centre-sud).')
ON DUPLICATE KEY UPDATE
  map_id = VALUES(map_id),
  name = VALUES(name),
  stage = VALUES(stage),
  special = VALUES(special),
  shape = VALUES(shape),
  points = VALUES(points),
  color = VALUES(color),
  description = VALUES(description);

-- Vie scolaire
INSERT INTO zones (id, map_id, name, x, y, width, height, current_plant, stage, special, shape, points, color, description) VALUES
  ('lyautey-vie-scolaire', 'lyautey', 'Vie scolaire', 0, 0, 0, 0, '', 'special', 1, 'rect', '[{"xp":74.9,"yp":61},{"xp":89.2,"yp":59.2},{"xp":90.6,"yp":66.9},{"xp":76.3,"yp":68.6}]', '#9ca3af80', 'Vie scolaire (sud-est).')
ON DUPLICATE KEY UPDATE
  map_id = VALUES(map_id),
  name = VALUES(name),
  stage = VALUES(stage),
  special = VALUES(special),
  shape = VALUES(shape),
  points = VALUES(points),
  color = VALUES(color),
  description = VALUES(description);

-- Bâtiment K
INSERT INTO zones (id, map_id, name, x, y, width, height, current_plant, stage, special, shape, points, color, description) VALUES
  ('lyautey-bat-k', 'lyautey', 'Bâtiment K', 0, 0, 0, 0, '', 'special', 1, 'rect', '[{"xp":43.9,"yp":65.7},{"xp":60.6,"yp":63.6},{"xp":62.4,"yp":73.3},{"xp":45.6,"yp":75.4}]', '#9ca3af80', 'Bâtiment K (sud du campus).')
ON DUPLICATE KEY UPDATE
  map_id = VALUES(map_id),
  name = VALUES(name),
  stage = VALUES(stage),
  special = VALUES(special),
  shape = VALUES(shape),
  points = VALUES(points),
  color = VALUES(color),
  description = VALUES(description);

-- Bâtiment H
INSERT INTO zones (id, map_id, name, x, y, width, height, current_plant, stage, special, shape, points, color, description) VALUES
  ('lyautey-bat-h', 'lyautey', 'Bâtiment H', 0, 0, 0, 0, '', 'special', 1, 'rect', '[{"xp":46.7,"yp":74.5},{"xp":82.6,"yp":70.1},{"xp":84.7,"yp":81.5},{"xp":48.8,"yp":85.9}]', '#9ca3af80', 'Bâtiment H (long bâtiment sud, côté Boulevard Ziraoui).')
ON DUPLICATE KEY UPDATE
  map_id = VALUES(map_id),
  name = VALUES(name),
  stage = VALUES(stage),
  special = VALUES(special),
  shape = VALUES(shape),
  points = VALUES(points),
  color = VALUES(color),
  description = VALUES(description);

