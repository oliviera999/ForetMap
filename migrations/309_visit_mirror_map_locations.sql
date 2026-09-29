-- La Visite reflète exactement les zones et repères des cartes (`lib/visitMapMirror.js`).
--
-- La carte est la seule source des lieux ; la ligne `visit_zones` / `visit_markers` qui
-- partage l'`id` d'un lieu ne porte que ce qui est propre à la visite (textes, blocs, ordre,
-- activation). Jusqu'ici, trois chemins laissaient la visite dériver :
--   - un lieu créé sur la carte n'y apparaissait pas (zones jamais recopiées, repères
--     seulement si un texte de visite était saisi à la création) ;
--   - un renommage / déplacement sur la carte n'était recopié que si l'on touchait aussi
--     aux textes de visite ;
--   - la visite pouvait créer ses propres lieux, absents de la carte (export de production
--     du 29/09/2026 : « permanence 1 », « VIE SCOLAIRE COLLEGE », « cantine college » sur
--     `lyautey`, essais jamais supprimés).
-- Le code tient désormais le miroir à chaque écriture ; cette migration réaligne l'existant.
--
-- Idempotente : un second passage ne trouve plus d'orphelin, plus de manquant, et réécrit
-- l'identité à l'identique. Les fichiers photo des lignes orphelines restent sur le disque
-- (une migration SQL n'y a pas accès) : ils ne sont plus référencés par aucune ligne.

-- ---------------------------------------------------------------------------------------
-- 1) Lignes visite sans lieu de carte : dépendances, puis lignes
-- ---------------------------------------------------------------------------------------
DELETE vm FROM visit_media vm
  JOIN visit_zones v ON vm.target_type = 'zone' AND vm.target_id = v.id
  LEFT JOIN zones z ON z.id = v.id
 WHERE z.id IS NULL;
DELETE vm FROM visit_media vm
  JOIN visit_markers v ON vm.target_type = 'marker' AND vm.target_id = v.id
  LEFT JOIN map_markers m ON m.id = v.id
 WHERE m.id IS NULL;

DELETE s FROM visit_seen_students s
  JOIN visit_zones v ON s.target_type = 'zone' AND s.target_id = v.id
  LEFT JOIN zones z ON z.id = v.id
 WHERE z.id IS NULL;
DELETE s FROM visit_seen_students s
  JOIN visit_markers v ON s.target_type = 'marker' AND s.target_id = v.id
  LEFT JOIN map_markers m ON m.id = v.id
 WHERE m.id IS NULL;

DELETE s FROM visit_seen_anonymous s
  JOIN visit_zones v ON s.target_type = 'zone' AND s.target_id = v.id
  LEFT JOIN zones z ON z.id = v.id
 WHERE z.id IS NULL;
DELETE s FROM visit_seen_anonymous s
  JOIN visit_markers v ON s.target_type = 'marker' AND s.target_id = v.id
  LEFT JOIN map_markers m ON m.id = v.id
 WHERE m.id IS NULL;

DELETE n FROM location_notes n
  JOIN visit_zones v ON n.location_kind = 'zone' AND n.location_id = v.id
  LEFT JOIN zones z ON z.id = v.id
 WHERE z.id IS NULL;
DELETE n FROM location_notes n
  JOIN visit_markers v ON n.location_kind = 'marker' AND n.location_id = v.id
  LEFT JOIN map_markers m ON m.id = v.id
 WHERE m.id IS NULL;

DELETE v FROM visit_zones v LEFT JOIN zones z ON z.id = v.id WHERE z.id IS NULL;
DELETE v FROM visit_markers v LEFT JOIN map_markers m ON m.id = v.id WHERE m.id IS NULL;

-- ---------------------------------------------------------------------------------------
-- 2) Identité recopiée depuis la carte (carte, nom, forme, position, emoji)
-- ---------------------------------------------------------------------------------------
UPDATE visit_zones v
  JOIN zones z ON z.id = v.id
   SET v.map_id = z.map_id, v.name = z.name, v.points = z.points
 WHERE NOT (v.map_id <=> z.map_id AND v.name <=> z.name AND v.points <=> z.points);

UPDATE visit_markers v
  JOIN map_markers m ON m.id = v.id
   SET v.map_id = m.map_id, v.x_pct = m.x_pct, v.y_pct = m.y_pct,
       v.label = m.label, v.emoji = COALESCE(m.emoji, '')
 WHERE NOT (v.map_id <=> m.map_id AND v.x_pct <=> m.x_pct AND v.y_pct <=> m.y_pct
            AND v.label <=> m.label AND v.emoji <=> COALESCE(m.emoji, ''));

-- ---------------------------------------------------------------------------------------
-- 3) Lieux de carte absents de la visite : ligne créée, visible, accroche = description
-- ---------------------------------------------------------------------------------------
INSERT INTO visit_zones
  (id, map_id, name, points, subtitle, short_description, details_title, details_text,
   body_json, visible_role_slugs, visible_group_ids, is_active, sort_order, created_at, updated_at)
SELECT z.id, z.map_id, z.name, z.points, '', COALESCE(z.description, ''), 'Détails', '',
       NULL, z.visible_role_slugs, z.visible_group_ids, 1, 0, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)
  FROM zones z
  LEFT JOIN visit_zones v ON v.id = z.id
 WHERE v.id IS NULL;

INSERT INTO visit_markers
  (id, map_id, x_pct, y_pct, label, emoji, subtitle, short_description, details_title,
   details_text, body_json, visible_role_slugs, visible_group_ids, is_active, sort_order,
   created_at, updated_at)
SELECT m.id, m.map_id, m.x_pct, m.y_pct, m.label, COALESCE(m.emoji, ''), '',
       COALESCE(m.note, ''), 'Détails', '', NULL, m.visible_role_slugs, m.visible_group_ids,
       1, 0, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)
  FROM map_markers m
  LEFT JOIN visit_markers v ON v.id = m.id
 WHERE v.id IS NULL;
