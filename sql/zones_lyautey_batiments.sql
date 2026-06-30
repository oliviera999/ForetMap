-- Zones « bâtiments » — partie centrale de la carte `lyautey` (Lycée Lyautey).
-- Généré par scripts/gen-zones-lyautey-batiments.js — NE PAS éditer à la main.
--
-- Import : mysql -u <user> -p <base> < sql/zones_lyautey_batiments.sql
-- Idempotent : ré-exécutable sans doublon (ON DUPLICATE KEY UPDATE par id stable).
-- Géométrie : polygones en % de l’image de fond ({xp,yp}, 0→100).
-- ⚠ Coordonnées relevées visuellement sur la capture — à affiner dans l’éditeur prof.

-- Garde-fou : la carte doit exister (no-op si déjà présente).
INSERT IGNORE INTO maps (id, label, sort_order) VALUES ('lyautey', 'Lycée Lyautey', 3);

-- Bâtiment Nord-Ouest
INSERT INTO zones (id, map_id, name, x, y, width, height, current_plant, stage, special, shape, points, color, description) VALUES
  ('lyautey-bat-01', 'lyautey', 'Bâtiment Nord-Ouest', 0, 0, 0, 0, '', 'special', 1, 'rect', '[{"xp":12,"yp":5},{"xp":21,"yp":5},{"xp":21,"yp":12},{"xp":12,"yp":12}]', '#9ca3af80', 'Bâtiment au nord-ouest du campus (côté Rue de la Réunion).')
ON DUPLICATE KEY UPDATE
  map_id = VALUES(map_id),
  name = VALUES(name),
  stage = VALUES(stage),
  special = VALUES(special),
  shape = VALUES(shape),
  points = VALUES(points),
  color = VALUES(color),
  description = VALUES(description);

-- Grand bâtiment Nord
INSERT INTO zones (id, map_id, name, x, y, width, height, current_plant, stage, special, shape, points, color, description) VALUES
  ('lyautey-bat-02', 'lyautey', 'Grand bâtiment Nord', 0, 0, 0, 0, '', 'special', 1, 'rect', '[{"xp":31,"yp":5.5},{"xp":55,"yp":5.5},{"xp":55,"yp":13},{"xp":31,"yp":13}]', '#9ca3af80', 'Grand bâtiment au nord du campus (bloc central supérieur).')
ON DUPLICATE KEY UPDATE
  map_id = VALUES(map_id),
  name = VALUES(name),
  stage = VALUES(stage),
  special = VALUES(special),
  shape = VALUES(shape),
  points = VALUES(points),
  color = VALUES(color),
  description = VALUES(description);

-- Bâtiment Nord-Est
INSERT INTO zones (id, map_id, name, x, y, width, height, current_plant, stage, special, shape, points, color, description) VALUES
  ('lyautey-bat-03', 'lyautey', 'Bâtiment Nord-Est', 0, 0, 0, 0, '', 'special', 1, 'rect', '[{"xp":63,"yp":13},{"xp":72,"yp":13},{"xp":72,"yp":21},{"xp":63,"yp":21}]', '#9ca3af80', 'Bâtiment au nord-est du campus (côté Rue Indochine).')
ON DUPLICATE KEY UPDATE
  map_id = VALUES(map_id),
  name = VALUES(name),
  stage = VALUES(stage),
  special = VALUES(special),
  shape = VALUES(shape),
  points = VALUES(points),
  color = VALUES(color),
  description = VALUES(description);

-- Bâtiment Ouest
INSERT INTO zones (id, map_id, name, x, y, width, height, current_plant, stage, special, shape, points, color, description) VALUES
  ('lyautey-bat-04', 'lyautey', 'Bâtiment Ouest', 0, 0, 0, 0, '', 'special', 1, 'rect', '[{"xp":12,"yp":16},{"xp":21,"yp":16},{"xp":21,"yp":26},{"xp":12,"yp":26}]', '#9ca3af80', 'Bâtiment sur le flanc ouest du campus.')
ON DUPLICATE KEY UPDATE
  map_id = VALUES(map_id),
  name = VALUES(name),
  stage = VALUES(stage),
  special = VALUES(special),
  shape = VALUES(shape),
  points = VALUES(points),
  color = VALUES(color),
  description = VALUES(description);

-- Bâtiment central
INSERT INTO zones (id, map_id, name, x, y, width, height, current_plant, stage, special, shape, points, color, description) VALUES
  ('lyautey-bat-05', 'lyautey', 'Bâtiment central', 0, 0, 0, 0, '', 'special', 1, 'rect', '[{"xp":40,"yp":34},{"xp":51,"yp":34},{"xp":51,"yp":43},{"xp":40,"yp":43}]', '#9ca3af80', 'Bâtiment principal au centre, près du repère « Lycée Lyautey ».')
ON DUPLICATE KEY UPDATE
  map_id = VALUES(map_id),
  name = VALUES(name),
  stage = VALUES(stage),
  special = VALUES(special),
  shape = VALUES(shape),
  points = VALUES(points),
  color = VALUES(color),
  description = VALUES(description);

-- Bâtiment Centre-Ouest
INSERT INTO zones (id, map_id, name, x, y, width, height, current_plant, stage, special, shape, points, color, description) VALUES
  ('lyautey-bat-06', 'lyautey', 'Bâtiment Centre-Ouest', 0, 0, 0, 0, '', 'special', 1, 'rect', '[{"xp":34,"yp":38},{"xp":40,"yp":38},{"xp":40,"yp":47},{"xp":34,"yp":47}]', '#9ca3af80', 'Bâtiment du centre, à l’ouest du repère principal.')
ON DUPLICATE KEY UPDATE
  map_id = VALUES(map_id),
  name = VALUES(name),
  stage = VALUES(stage),
  special = VALUES(special),
  shape = VALUES(shape),
  points = VALUES(points),
  color = VALUES(color),
  description = VALUES(description);

-- Bâtiment Centre-Est
INSERT INTO zones (id, map_id, name, x, y, width, height, current_plant, stage, special, shape, points, color, description) VALUES
  ('lyautey-bat-07', 'lyautey', 'Bâtiment Centre-Est', 0, 0, 0, 0, '', 'special', 1, 'rect', '[{"xp":60,"yp":31},{"xp":72,"yp":31},{"xp":72,"yp":42},{"xp":60,"yp":42}]', '#9ca3af80', 'Bâtiment du centre, à l’est du repère principal.')
ON DUPLICATE KEY UPDATE
  map_id = VALUES(map_id),
  name = VALUES(name),
  stage = VALUES(stage),
  special = VALUES(special),
  shape = VALUES(shape),
  points = VALUES(points),
  color = VALUES(color),
  description = VALUES(description);

-- Bâtiment Est
INSERT INTO zones (id, map_id, name, x, y, width, height, current_plant, stage, special, shape, points, color, description) VALUES
  ('lyautey-bat-08', 'lyautey', 'Bâtiment Est', 0, 0, 0, 0, '', 'special', 1, 'rect', '[{"xp":71,"yp":43},{"xp":81,"yp":43},{"xp":81,"yp":51},{"xp":71,"yp":51}]', '#9ca3af80', 'Bâtiment sur le flanc est du campus (vers le Lycée Maïmonide).')
ON DUPLICATE KEY UPDATE
  map_id = VALUES(map_id),
  name = VALUES(name),
  stage = VALUES(stage),
  special = VALUES(special),
  shape = VALUES(shape),
  points = VALUES(points),
  color = VALUES(color),
  description = VALUES(description);

-- Bâtiment Sud-Ouest
INSERT INTO zones (id, map_id, name, x, y, width, height, current_plant, stage, special, shape, points, color, description) VALUES
  ('lyautey-bat-09', 'lyautey', 'Bâtiment Sud-Ouest', 0, 0, 0, 0, '', 'special', 1, 'rect', '[{"xp":20,"yp":47},{"xp":29,"yp":47},{"xp":29,"yp":54},{"xp":20,"yp":54}]', '#9ca3af80', 'Bâtiment au sud-ouest, au-dessus du long bâtiment central.')
ON DUPLICATE KEY UPDATE
  map_id = VALUES(map_id),
  name = VALUES(name),
  stage = VALUES(stage),
  special = VALUES(special),
  shape = VALUES(shape),
  points = VALUES(points),
  color = VALUES(color),
  description = VALUES(description);

-- Long bâtiment Sud
INSERT INTO zones (id, map_id, name, x, y, width, height, current_plant, stage, special, shape, points, color, description) VALUES
  ('lyautey-bat-10', 'lyautey', 'Long bâtiment Sud', 0, 0, 0, 0, '', 'special', 1, 'rect', '[{"xp":21,"yp":56},{"xp":61,"yp":56},{"xp":61,"yp":61},{"xp":21,"yp":61}]', '#9ca3af80', 'Long bâtiment horizontal traversant le sud du campus.')
ON DUPLICATE KEY UPDATE
  map_id = VALUES(map_id),
  name = VALUES(name),
  stage = VALUES(stage),
  special = VALUES(special),
  shape = VALUES(shape),
  points = VALUES(points),
  color = VALUES(color),
  description = VALUES(description);

-- Bâtiment Sud-Centre
INSERT INTO zones (id, map_id, name, x, y, width, height, current_plant, stage, special, shape, points, color, description) VALUES
  ('lyautey-bat-11', 'lyautey', 'Bâtiment Sud-Centre', 0, 0, 0, 0, '', 'special', 1, 'rect', '[{"xp":37,"yp":68},{"xp":47,"yp":68},{"xp":47,"yp":74},{"xp":37,"yp":74}]', '#9ca3af80', 'Bâtiment au sud du long bâtiment central.')
ON DUPLICATE KEY UPDATE
  map_id = VALUES(map_id),
  name = VALUES(name),
  stage = VALUES(stage),
  special = VALUES(special),
  shape = VALUES(shape),
  points = VALUES(points),
  color = VALUES(color),
  description = VALUES(description);

-- Bâtiment Sud-Est
INSERT INTO zones (id, map_id, name, x, y, width, height, current_plant, stage, special, shape, points, color, description) VALUES
  ('lyautey-bat-12', 'lyautey', 'Bâtiment Sud-Est', 0, 0, 0, 0, '', 'special', 1, 'rect', '[{"xp":60,"yp":64},{"xp":70,"yp":64},{"xp":70,"yp":71},{"xp":60,"yp":71}]', '#9ca3af80', 'Bâtiment au sud-est du campus.')
ON DUPLICATE KEY UPDATE
  map_id = VALUES(map_id),
  name = VALUES(name),
  stage = VALUES(stage),
  special = VALUES(special),
  shape = VALUES(shape),
  points = VALUES(points),
  color = VALUES(color),
  description = VALUES(description);

