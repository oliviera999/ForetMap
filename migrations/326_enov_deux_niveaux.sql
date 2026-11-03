-- =====================================================================
-- Plan e-nov : deux niveaux de mise en avant, alignés sur le dossier de labellisation N3.
-- Voir `lib/enovPlan.js` (niveaux), `lib/settings/plan.js` (réglages `ui.enov_plan.secondary_*`)
-- et `docs/reference/plan/plan-enov.md`.
--
-- LE BESOIN
-- Le dossier N3 (pièce 3 « Espaces transformés ») ne retient que quatre espaces, comptés dans la
-- superficie transformée : la salle aérée n³, la forêt comestible, le complexe sportif Nawal
-- El Moutawakel (gymnase-piscine et plateau refait) et le fablab. Le plan e-nov, lui, mettait au
-- même niveau une vingtaine de lieux : points de tri, chats, services, cafétéria… Plan et dossier
-- ne disaient pas la même chose.
--
-- LA RÉPONSE
-- 1. Catégorie-label `cat-enov-secondaire` (surface `enov` seule, comme `cat-enov`) : les
--    **autres lieux d'innovation**, cités ailleurs dans le dossier (§ 3.5 de la pièce 3, pièce 4)
--    ou présents sans y être cités. Même mise en avant, autre couleur (bleu ciel du label).
-- 2. Reclassement : les lieux qui ne sont pas des espaces retenus quittent `cat-enov` pour
--    `cat-enov-secondaire`. Liste **explicite** d'identifiants : un lieu posé plus tard dans
--    `cat-enov` n'est jamais rétrogradé par un rejeu.
-- 3. `enov_space_type` (migration 323) était vide partout : le plan imprimé rangeait tout sous
--    « Type d'espace non renseigné ». Il est déduit des sous-catégories `cat-enov-*` posées le
--    13/10 (le type déjà saisi n'est jamais écrasé).
-- 4. Filtre d'ouverture du plan e-nov : il ne cochait que `cat-enov` ; il coche aussi la
--    catégorie du second niveau (sinon ses lieux disparaissaient à l'ouverture). Message
--    d'accueil reformulé (il renvoyait à un chemin devenu inutile). Les deux mises à jour ne
--    touchent qu'une valeur restée telle que posée le 28/10.
-- 5. Repère Watt2O (pièce 4, § 2.6), au second niveau, sur le toit du bâtiment de direction
--    attenant à la forêt comestible. Position approximative, à retoucher dans ForetMap.
-- 6. Texte commun des structures végétalisantes des cours aligné sur le dossier (« autant
--    d'initiatives d'élèves que d'adultes »).
--
-- IDEMPOTENCE : `INSERT IGNORE`, `DELETE` ciblés après copie, `UPDATE` gardés par la valeur
-- attendue. Aucune table gl_*.
-- Retour arrière : réinsérer `cat-enov` sur les lieux listés au § 2, supprimer les lignes
-- `cat-enov-secondaire` et la catégorie, `DELETE FROM map_markers WHERE id = 'mk-enov-watt2o'`.
-- =====================================================================

-- 1. Catégorie du second niveau (catégorie-label, visible sur le seul plan e-nov).
INSERT IGNORE INTO location_categories
  (id, map_id, slug, label, emoji, color, description, applies_to, is_infrastructure,
   sort_order, is_active, surfaces, zoom_only, is_distinction)
VALUES
  ('cat-enov-secondaire', NULL, 'enov-secondaire', 'e-nov — autres lieux', '🔹', '#66a4d990',
   'Autre lieu d''innovation (label e-nov) : cité dans le dossier sans être compté parmi les espaces transformés, ou présent sans y être cité. Visible sur le seul plan e-nov.',
   'both', 0, 1, 1, 'enov', 0, 1);

-- La catégorie d'origine devient explicitement celle des espaces retenus.
UPDATE location_categories
   SET label = 'e-nov — espaces retenus',
       description = 'Espace retenu par le dossier e-nov (aménagement pour un usage nouveau et équipement numérique à plus-value pédagogique), compté dans la superficie transformée. Visible sur le seul plan e-nov.'
 WHERE id = 'cat-enov'
   AND label = 'e-nov';

-- 2. Reclassement des autres lieux d'innovation (copie, puis retrait de `cat-enov`).
INSERT IGNORE INTO zone_categories (zone_id, category_id)
SELECT zone_id, 'cat-enov-secondaire'
  FROM zone_categories
 WHERE category_id = 'cat-enov'
   AND zone_id IN (
     'zone-da7711ea',            -- Potager EPS (complexe)
     'zone-6950f475',            -- Poulailler (complexe)
     'zone-bee5299d',            -- Secourisme et BDS (complexe)
     'enov-lyautey-esplanade-s', -- Esplanade du bâtiment S
     'zone-35ee721c',            -- Jardin du bâtiment S
     'zone-d794b453',            -- CDI et ludothèque
     'zone-f4d8b71d',            -- Service informatique
     'lyautey-x-13',             -- Vie scolaire du lycée et communication
     'zone-128203d0'             -- Cafétéria (projet)
   );

DELETE FROM zone_categories
 WHERE category_id = 'cat-enov'
   AND zone_id IN (
     'zone-da7711ea', 'zone-6950f475', 'zone-bee5299d', 'enov-lyautey-esplanade-s',
     'zone-35ee721c', 'zone-d794b453', 'zone-f4d8b71d', 'lyautey-x-13', 'zone-128203d0'
   );

INSERT IGNORE INTO marker_categories (marker_id, category_id)
SELECT marker_id, 'cat-enov-secondaire'
  FROM marker_categories
 WHERE category_id = 'cat-enov'
   AND marker_id IN (
     'b0a1c6b7-f433-4d53-a63e-e1e50e4ba33d', -- Poisson glouton (complexe)
     '3cff4487-7c45-4d97-9d60-5df6d123126c', -- Poisson glouton (lycée)
     '807b6e8f-29a8-4674-9ff7-ba0153513710', -- Ecofab
     'mk-studio-radio',                      -- Studio Radio Lyautey
     'mk-nourrissage-chats',                 -- Point de nourrissage des chats, bâtiment I
     '0feee96a-16f0-40b3-8015-262798b6271f', -- Point de nourrissage des chats, parking
     'b7f7aeef-43dc-46fb-8e1b-7c67e3f9f6ac', -- Points de tri végétalisés (cinq)
     '93faf993-7284-4cea-a3d9-7167e1986258',
     '2c6169eb-aa6f-459b-81ed-a4be52580527',
     '62bca08b-57dd-454d-8598-5105071df2f2',
     '5da8131e-fe54-482f-8926-a4a5f9d38f73',
     '8c548c39-476e-4aa4-83a1-80c48698b112'  -- Tables d'échecs végétalisées
   );

DELETE FROM marker_categories
 WHERE category_id = 'cat-enov'
   AND marker_id IN (
     'b0a1c6b7-f433-4d53-a63e-e1e50e4ba33d', '3cff4487-7c45-4d97-9d60-5df6d123126c',
     '807b6e8f-29a8-4674-9ff7-ba0153513710', 'mk-studio-radio', 'mk-nourrissage-chats',
     '0feee96a-16f0-40b3-8015-262798b6271f', 'b7f7aeef-43dc-46fb-8e1b-7c67e3f9f6ac',
     '93faf993-7284-4cea-a3d9-7167e1986258', '2c6169eb-aa6f-459b-81ed-a4be52580527',
     '62bca08b-57dd-454d-8598-5105071df2f2', '5da8131e-fe54-482f-8926-a4a5f9d38f73',
     '8c548c39-476e-4aa4-83a1-80c48698b112'
   );

-- 3. Type d'espace déduit des sous-catégories `cat-enov-*` (jamais d'écrasement).
UPDATE zones z
  JOIN zone_categories zc ON zc.zone_id = z.id
   SET z.enov_space_type = CASE zc.category_id
         WHEN 'cat-enov-exterieur' THEN 'exterieur'
         WHEN 'cat-enov-pedagogique' THEN 'pedagogique'
         WHEN 'cat-enov-sportif' THEN 'sportif'
         WHEN 'cat-enov-vie-collective' THEN 'vie-scolaire'
         WHEN 'cat-enov-administratif' THEN 'administratif'
         WHEN 'cat-enov-restauration' THEN 'restauration'
       END
 WHERE (z.enov_space_type IS NULL OR z.enov_space_type = '')
   AND zc.category_id IN ('cat-enov-exterieur', 'cat-enov-pedagogique', 'cat-enov-sportif',
                          'cat-enov-vie-collective', 'cat-enov-administratif',
                          'cat-enov-restauration');

UPDATE map_markers m
  JOIN marker_categories mc ON mc.marker_id = m.id
   SET m.enov_space_type = CASE mc.category_id
         WHEN 'cat-enov-exterieur' THEN 'exterieur'
         WHEN 'cat-enov-pedagogique' THEN 'pedagogique'
         WHEN 'cat-enov-sportif' THEN 'sportif'
         WHEN 'cat-enov-vie-collective' THEN 'vie-scolaire'
         WHEN 'cat-enov-administratif' THEN 'administratif'
         WHEN 'cat-enov-restauration' THEN 'restauration'
       END
 WHERE (m.enov_space_type IS NULL OR m.enov_space_type = '')
   AND mc.category_id IN ('cat-enov-exterieur', 'cat-enov-pedagogique', 'cat-enov-sportif',
                          'cat-enov-vie-collective', 'cat-enov-administratif',
                          'cat-enov-restauration');

-- 4. Filtre d'ouverture et message d'accueil du plan e-nov (valeurs du 28/10 seulement).
UPDATE app_settings
   SET value_json = '"cat-enov;cat-enov-secondaire"'
 WHERE `key` = 'ui.enov_plan.default_category_ids'
   AND value_json = '"cat-enov"';

UPDATE app_settings
   SET value_json = '"Candidature au label e-nov niveau 3. En jaune, les espaces retenus par le dossier ; en bleu, les autres lieux d’innovation. Touchez-en un, ou ouvrez « Innovations ». La bascule sous la barre passe du lycée au complexe sportif."'
 WHERE `key` = 'ui.enov_plan.welcome_hint'
   AND value_json LIKE '"Candidature au label e-nov niveau 3. Les lieux mis en avant sont%';

-- 5. Repère Watt2O, visible sur le seul plan e-nov.
INSERT IGNORE INTO map_markers
  (id, x_pct, y_pct, label, plant_name, note, emoji, created_at, map_id, hidden_surfaces,
   enov_description, enov_space_type)
VALUES
  ('mk-enov-watt2o', 62.2, 83.6, 'Watt2O — toiture de la direction', '', '', '☀️', NOW(3),
   'lyautey', 'map,visit,plan,staff',
   'Sur les toits des bâtiments administratifs, en bordure de la forêt comestible, une première tranche de vingt panneaux solaires (10 kW) et une cuve de stockage sont inscrites au budget 2027. L''eau de pluie recueillie à la surface des panneaux servira à l''arrosage ; l''électricité produite alimentera les bâtiments.

Le projet est porté par un enseignant de physique-chimie, avec la direction, le secrétariat général, l''antenne immobilière du pôle et Ecolyautey. Son volet pédagogique se voit déjà dans la salle aérée n³, où un panneau solaire alimente l''aquaponie.',
   'autre');

INSERT IGNORE INTO marker_categories (marker_id, category_id)
SELECT 'mk-enov-watt2o', 'cat-enov-secondaire'
  FROM map_markers
 WHERE id = 'mk-enov-watt2o';

-- 6. Structures végétalisantes : texte aligné sur la pièce 3 (§ 3.5).
UPDATE map_markers
   SET enov_description = REPLACE(
         enov_description,
         'Les structures végétalisantes des cours sont portées par les éco-délégués, à partir d''idées d''élèves ; elles font des cours de récréation des supports d''éducation.',
         'Les structures végétalisantes des cours sont conçues par les éco-délégués ou demandées par les enseignants et les services dans le cadre du projet d''établissement, puis réalisées par le service intérieur ou des prestataires : autant d''initiatives d''élèves que d''adultes, qui font des cours de récréation des supports d''éducation.'
       )
 WHERE enov_description LIKE '%Les structures végétalisantes des cours sont portées par les éco-délégués, à partir d''idées d''élèves%';
