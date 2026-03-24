-- Normalisation des URLs d'images de cartes pour compatibilité frontend
INSERT IGNORE INTO maps (id, label, map_image_url, sort_order) VALUES
  ('foret', 'Forêt comestible', '/map.png', 1),
  ('n3', 'N3', '/maps/plan%20n3.jpg', 2);

UPDATE maps
SET map_image_url = '/map.png'
WHERE id = 'foret';

UPDATE maps
SET map_image_url = '/maps/plan%20n3.jpg'
WHERE id = 'n3';

UPDATE schema_version SET version = 16;
