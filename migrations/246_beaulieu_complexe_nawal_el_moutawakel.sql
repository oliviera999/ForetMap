-- Complexe Nawal El Moutawakel (carte `beaulieu`) : catégories, zones et repères.
--
-- Contenu de site, pas de schéma : les inserts sont **gardés par l'existence de la carte**
-- (`... SELECT ... FROM maps WHERE id = 'beaulieu'`). Sur une base neuve — CI, poste de dev —
-- la carte n'existe pas (elle est créée depuis les Réglages, image de fond comprise) et la
-- migration ne fait rien, sans violer la clé étrangère `fk_zones_map`.
--
-- Idempotent : INSERT IGNORE sur les clés primaires, donc rejouable sans écraser les
-- retouches faites ensuite depuis l'interface prof (contours, textes, catégories).
--
-- Géométries : polygones en pourcentage de l'image de fond, relevés sur la vue aérienne du
-- site. Ils placent et nomment chaque installation ; l'ajustement fin du contour se fait
-- depuis la carte (mode édition des points).

-- 1. Nom de la carte : « Plateau sportif de Beaulieu » -> nom officiel du complexe.
--    Conditionné à l'ancien libellé pour ne pas écraser un renommage manuel ultérieur.
UPDATE maps
   SET label = 'Complexe Nawal El Moutawakel (Beaulieu)'
 WHERE id = 'beaulieu'
   AND label = 'Plateau sportif de Beaulieu';

-- 2. Catégories de lieux propres à la carte (filtres et couleurs de la légende).
INSERT IGNORE INTO location_categories
  (id, map_id, slug, label, emoji, color, description, applies_to, is_infrastructure, sort_order, is_active, surfaces, zoom_only)
SELECT 'beaulieu-cat-athletisme', 'beaulieu', 'athletisme', 'Athlétisme', '🏃', '#a5b4fc90', 'Piste, courses et repères liés à l’athlétisme.',
       'both', 0, 1, 1, 'map,visit,plan', 0
  FROM maps WHERE id = 'beaulieu';
INSERT IGNORE INTO location_categories
  (id, map_id, slug, label, emoji, color, description, applies_to, is_infrastructure, sort_order, is_active, surfaces, zoom_only)
SELECT 'beaulieu-cat-terrains', 'beaulieu', 'terrains-exterieurs', 'Terrains extérieurs', '⚽', '#86efac90', 'Football, basket, beach-volley et plateaux de plein air.',
       'both', 0, 2, 1, 'map,visit,plan', 0
  FROM maps WHERE id = 'beaulieu';
INSERT IGNORE INTO location_categories
  (id, map_id, slug, label, emoji, color, description, applies_to, is_infrastructure, sort_order, is_active, surfaces, zoom_only)
SELECT 'beaulieu-cat-couvert', 'beaulieu', 'installations-couvertes', 'Installations couvertes', '🏟️', '#93c5fd90', 'Gymnase, salle de musculation et mur d’escalade.',
       'both', 0, 3, 1, 'map,visit,plan', 0
  FROM maps WHERE id = 'beaulieu';
INSERT IGNORE INTO location_categories
  (id, map_id, slug, label, emoji, color, description, applies_to, is_infrastructure, sort_order, is_active, surfaces, zoom_only)
SELECT 'beaulieu-cat-aquatique', 'beaulieu', 'aquatique', 'Aquatique', '🏊', '#a5f3fc90', 'Piscine et activités aquatiques.',
       'both', 0, 4, 1, 'map,visit,plan', 0
  FROM maps WHERE id = 'beaulieu';
INSERT IGNORE INTO location_categories
  (id, map_id, slug, label, emoji, color, description, applies_to, is_infrastructure, sort_order, is_active, surfaces, zoom_only)
SELECT 'beaulieu-cat-accueil', 'beaulieu', 'accueil-services', 'Accueil et services', '🚪', '#e9d5ff90', 'Entrée, vestiaires, locaux et liaisons entre sites.',
       'both', 0, 5, 1, 'map,visit,plan', 0
  FROM maps WHERE id = 'beaulieu';
INSERT IGNORE INTO location_categories
  (id, map_id, slug, label, emoji, color, description, applies_to, is_infrastructure, sort_order, is_active, surfaces, zoom_only)
SELECT 'beaulieu-cat-sante', 'beaulieu', 'sante-securite', 'Santé et sécurité', '⛑️', '#fca5a590', 'Infirmerie, secours et matériel de première urgence.',
       'both', 0, 6, 1, 'map,visit,plan', 0
  FROM maps WHERE id = 'beaulieu';

-- 3. Zones (surfaces).
INSERT IGNORE INTO zones
  (id, map_id, name, emoji, x, y, width, height, current_plant, stage, special, shape, points, color, description, hidden_surfaces, search_aliases)
SELECT 'beaulieu-piste-athletisme', 'beaulieu', 'Piste d’athlétisme', '🏃', 0, 0, 0, 0, '', 'empty', 0, 'rect',
       '[{"xp":64.89,"yp":51.47},{"xp":64.38,"yp":58.87},{"xp":62.29,"yp":65.82},{"xp":58.81,"yp":71.67},{"xp":54.29,"yp":75.82},{"xp":49.17,"yp":77.89},{"xp":43.94,"yp":77.65},{"xp":39.13,"yp":75.14},{"xp":35.21,"yp":70.61},{"xp":32.55,"yp":64.49},{"xp":31.41,"yp":57.39},{"xp":31.92,"yp":49.99},{"xp":34.01,"yp":43.04},{"xp":37.49,"yp":37.19},{"xp":42.01,"yp":33.04},{"xp":47.13,"yp":30.98},{"xp":52.36,"yp":31.21},{"xp":57.17,"yp":33.72},{"xp":61.09,"yp":38.25},{"xp":63.76,"yp":44.37},{"xp":64.89,"yp":51.47},{"xp":62.89,"yp":51.83},{"xp":61.91,"yp":45.95},{"xp":59.58,"yp":40.91},{"xp":56.13,"yp":37.19},{"xp":51.91,"yp":35.16},{"xp":47.31,"yp":35.01},{"xp":42.8,"yp":36.77},{"xp":38.81,"yp":40.25},{"xp":35.73,"yp":45.12},{"xp":33.87,"yp":50.91},{"xp":33.41,"yp":57.03},{"xp":34.39,"yp":62.91},{"xp":36.72,"yp":67.95},{"xp":40.17,"yp":71.67},{"xp":44.4,"yp":73.7},{"xp":48.99,"yp":73.85},{"xp":53.51,"yp":72.09},{"xp":57.5,"yp":68.61},{"xp":60.57,"yp":63.74},{"xp":62.43,"yp":57.96},{"xp":62.89,"yp":51.83}]',
       '#a5b4fc80',
       'L’anneau d’athlétisme ceinture le cœur du complexe : c’est lui qui donne sa forme au site. Ses couloirs servent aux courses, aux tests de vitesse et d’endurance en EPS et aux entraînements de l’AS. Les terrains extérieurs sont installés à l’intérieur de l’anneau, ce qui permet de faire tourner plusieurs ateliers en même temps.',
       '', 'athlétisme;course;piste;stade;couloirs;sprint;endurance'
  FROM maps WHERE id = 'beaulieu';
INSERT IGNORE INTO zones
  (id, map_id, name, emoji, x, y, width, height, current_plant, stage, special, shape, points, color, description, hidden_surfaces, search_aliases)
SELECT 'beaulieu-terrain-football', 'beaulieu', 'Terrain de football', '⚽', 0, 0, 0, 0, '', 'empty', 0, 'rect',
       '[{"xp":41.38,"yp":12.91},{"xp":61.13,"yp":9.62},{"xp":61.94,"yp":28.1},{"xp":42.13,"yp":31.39}]',
       '#86efac80',
       'Le grand terrain extérieur au nord du complexe, en gazon synthétique et entièrement tracé. Il accueille les cours d’EPS, les entraînements et les rencontres de football.',
       '', 'foot;football;soccer;gazon;terrain de foot'
  FROM maps WHERE id = 'beaulieu';
INSERT IGNORE INTO zones
  (id, map_id, name, emoji, x, y, width, height, current_plant, stage, special, shape, points, color, description, hidden_surfaces, search_aliases)
SELECT 'beaulieu-terrains-basket', 'beaulieu', 'Terrains de basket-ball', '🏀', 0, 0, 0, 0, '', 'empty', 0, 'rect',
       '[{"xp":36.87,"yp":45.32},{"xp":45.77,"yp":43.8},{"xp":46.39,"yp":70.38},{"xp":38.5,"yp":69.37}]',
       '#fdba7480',
       'Les terrains de basket installés à l’intérieur de l’anneau, côté ouest. Plusieurs plateaux côte à côte permettent de faire travailler plusieurs groupes en parallèle pendant un cours ou un entraînement.',
       '', 'basket;basketball;paniers;playground'
  FROM maps WHERE id = 'beaulieu';
INSERT IGNORE INTO zones
  (id, map_id, name, emoji, x, y, width, height, current_plant, stage, special, shape, points, color, description, hidden_surfaces, search_aliases)
SELECT 'beaulieu-plateau-central', 'beaulieu', 'Plateau central multisports', '🤾', 0, 0, 0, 0, '', 'empty', 0, 'rect',
       '[{"xp":46.52,"yp":43.04},{"xp":53.17,"yp":41.9},{"xp":53.79,"yp":71.65},{"xp":47.15,"yp":72.78}]',
       '#c4b5fd80',
       'La grande surface au centre de l’anneau, tracée pour les sports collectifs. Elle sert aussi d’espace d’échauffement et d’ateliers quand les autres terrains sont occupés.',
       '', 'plateau;handball;multisports;sports collectifs;échauffement'
  FROM maps WHERE id = 'beaulieu';
INSERT IGNORE INTO zones
  (id, map_id, name, emoji, x, y, width, height, current_plant, stage, special, shape, points, color, description, hidden_surfaces, search_aliases)
SELECT 'beaulieu-beach-volley', 'beaulieu', 'Terrains de beach-volley', '🏐', 0, 0, 0, 0, '', 'empty', 0, 'rect',
       '[{"xp":56.11,"yp":44.94},{"xp":59.69,"yp":44.3},{"xp":60.06,"yp":56.71},{"xp":56.49,"yp":57.34}]',
       '#fde68a80',
       'Les terrains de beach-volley, sur sable, à l’est du plateau central. Le sable change complètement les appuis : c’est un excellent travail de gainage et de détente, très apprécié en fin de séance.',
       '', 'beach-volley;beach volley;volley;sable;volley-ball'
  FROM maps WHERE id = 'beaulieu';
INSERT IGNORE INTO zones
  (id, map_id, name, emoji, x, y, width, height, current_plant, stage, special, shape, points, color, description, hidden_surfaces, search_aliases)
SELECT 'beaulieu-courts-tennis', 'beaulieu', 'Courts de tennis', '🎾', 0, 0, 0, 0, '', 'empty', 0, 'rect',
       '[{"xp":46.71,"yp":61.65},{"xp":57.55,"yp":59.75},{"xp":56.93,"yp":68.1},{"xp":47.34,"yp":71.9}]',
       '#f9a8d480',
       'Les courts extérieurs au sud de l’anneau, en revêtement dur, alignés les uns à côté des autres. Ils complètent l’offre de sports de raquette du site.',
       '', 'tennis;courts;raquette;raquettes'
  FROM maps WHERE id = 'beaulieu';
INSERT IGNORE INTO zones
  (id, map_id, name, emoji, x, y, width, height, current_plant, stage, special, shape, points, color, description, hidden_surfaces, search_aliases)
SELECT 'beaulieu-batiment-couvert', 'beaulieu', 'Bâtiment des installations couvertes', '🏟️', 0, 0, 0, 0, '', 'special', 1, 'rect',
       '[{"xp":3.45,"yp":33.16},{"xp":21.94,"yp":30.13},{"xp":22.57,"yp":42.03},{"xp":4.08,"yp":45.06}]',
       '#93c5fd90',
       'Le grand bâtiment de l’ouest du site regroupe les installations couvertes du complexe : gymnase, piscine, salle de musculation et mur d’escalade, avec les vestiaires élèves. Chaque installation a son propre repère sur la carte, avec sa description.',
       '', 'gymnase;piscine;musculation;escalade;vestiaires;salle;couvert'
  FROM maps WHERE id = 'beaulieu';
INSERT IGNORE INTO zones
  (id, map_id, name, emoji, x, y, width, height, current_plant, stage, special, shape, points, color, description, hidden_surfaces, search_aliases)
SELECT 'beaulieu-plateau-ouest', 'beaulieu', 'Plateau extérieur ouest', '🏀', 0, 0, 0, 0, '', 'empty', 0, 'rect',
       '[{"xp":7.4,"yp":45.82},{"xp":30.53,"yp":42.15},{"xp":31.16,"yp":70.63},{"xp":8.03,"yp":74.43}]',
       '#fdba7480',
       'La grande aire goudronnée à l’ouest, tracée pour le basket et les jeux de ballon. Elle complète les terrains situés à l’intérieur de l’anneau et permet d’accueillir plusieurs classes en même temps.',
       '', 'plateau ouest;cour;goudron;terrains extérieurs;basket extérieur'
  FROM maps WHERE id = 'beaulieu';

-- 4. Repères ponctuels (les installations, l'accueil et l'hommage qui donne son nom au site).
INSERT IGNORE INTO map_markers
  (id, map_id, x_pct, y_pct, label, plant_name, note, emoji, created_at, hidden_surfaces, search_aliases)
SELECT 'beaulieu-gymnase', 'beaulieu', 13.48, 36.08, 'Gymnase', '',
       'L’espace polyvalent couvert du complexe : basketball, volleyball, handball et autres sports collectifs. C’est aussi la solution de repli quand la météo empêche la pratique en extérieur.',
       '🏟️', '2026-09-15T00:00:00.000Z', '', 'gymnase;salle omnisports;handball;volley;basket couvert'
  FROM maps WHERE id = 'beaulieu';
INSERT IGNORE INTO map_markers
  (id, map_id, x_pct, y_pct, label, plant_name, note, emoji, created_at, hidden_surfaces, search_aliases)
SELECT 'beaulieu-piscine', 'beaulieu', 6.9, 37.97, 'Piscine', '',
       'Un bassin moderne adapté aux cours de natation, aux entraînements et aux activités aquatiques. L’accès se fait par les vestiaires du bâtiment.',
       '🏊', '2026-09-15T00:00:00.000Z', '', 'piscine;natation;bassin;nager;aquatique'
  FROM maps WHERE id = 'beaulieu';
INSERT IGNORE INTO map_markers
  (id, map_id, x_pct, y_pct, label, plant_name, note, emoji, created_at, hidden_surfaces, search_aliases)
SELECT 'beaulieu-musculation', 'beaulieu', 19.44, 34.81, 'Salle de musculation', '',
       'Une salle équipée pour le renforcement musculaire, le fitness et la préparation physique. Le matériel s’utilise sous encadrement, avec un échauffement préalable et des charges adaptées à chacun.',
       '🏋️', '2026-09-15T00:00:00.000Z', '', 'musculation;muscu;fitness;renforcement;préparation physique'
  FROM maps WHERE id = 'beaulieu';
INSERT IGNORE INTO map_markers
  (id, map_id, x_pct, y_pct, label, plant_name, note, emoji, created_at, hidden_surfaces, search_aliases)
SELECT 'beaulieu-mur-escalade', 'beaulieu', 16.61, 41.77, 'Mur d’escalade', '',
       'Un espace sécurisé pour grimper, qui développe la force, la coordination et la confiance en soi. L’escalade se pratique à deux — grimpeur et assureur — : c’est l’une des activités du complexe où l’esprit d’équipe est le plus direct.',
       '🧗', '2026-09-15T00:00:00.000Z', '', 'escalade;mur;grimpe;varappe;bloc'
  FROM maps WHERE id = 'beaulieu';
INSERT IGNORE INTO map_markers
  (id, map_id, x_pct, y_pct, label, plant_name, note, emoji, created_at, hidden_surfaces, search_aliases)
SELECT 'beaulieu-vestiaires', 'beaulieu', 10.03, 43.04, 'Vestiaires élèves', '',
       'Les vestiaires et sanitaires des élèves, dans le bâtiment des installations couvertes. On s’y change avant le cours et on y récupère ses affaires à la fin de la séance.',
       '🚻', '2026-09-15T00:00:00.000Z', '', 'vestiaires;douches;casiers;se changer'
  FROM maps WHERE id = 'beaulieu';
INSERT IGNORE INTO map_markers
  (id, map_id, x_pct, y_pct, label, plant_name, note, emoji, created_at, hidden_surfaces, search_aliases)
SELECT 'beaulieu-infirmerie', 'beaulieu', 21.32, 40.25, 'Infirmerie', '',
       'Le site de Beaulieu dispose de sa propre infirmerie et de ses propres défibrillateurs automatisés externes (DAE). En cas de blessure pendant une séance, on prévient d’abord l’enseignant, qui décide de l’orientation.',
       '⛑️', '2026-09-15T00:00:00.000Z', '', 'infirmerie;santé;secours;blessure;DAE;défibrillateur'
  FROM maps WHERE id = 'beaulieu';
INSERT IGNORE INTO map_markers
  (id, map_id, x_pct, y_pct, label, plant_name, note, emoji, created_at, hidden_surfaces, search_aliases)
SELECT 'beaulieu-entree', 'beaulieu', 37.62, 81.65, 'Entrée du complexe', '',
       'L’entrée du Complexe Nawal El Moutawakel. Le complexe est ouvert à tous les élèves du Pôle : cours d’EPS, entraînements et activités extrascolaires y passent par ce point d’accès.',
       '🚪', '2026-09-15T00:00:00.000Z', '', 'entrée;accueil;portail;accès'
  FROM maps WHERE id = 'beaulieu';
INSERT IGNORE INTO map_markers
  (id, map_id, x_pct, y_pct, label, plant_name, note, emoji, created_at, hidden_surfaces, search_aliases)
SELECT 'beaulieu-vers-lyautey', 'beaulieu', 43.89, 88.61, 'Vers le lycée Lyautey', '',
       'La direction du site principal du lycée Lyautey, de l’autre côté de la rue d’Aït Ourir. Le site principal a sa propre carte dans l’application.',
       '🏫', '2026-09-15T00:00:00.000Z', '', 'lyautey;site principal;retour;liaison'
  FROM maps WHERE id = 'beaulieu';
INSERT IGNORE INTO map_markers
  (id, map_id, x_pct, y_pct, label, plant_name, note, emoji, created_at, hidden_surfaces, search_aliases)
SELECT 'beaulieu-local-technique', 'beaulieu', 36.05, 56.71, 'Local technique', '',
       'Petit bâtiment technique à l’intérieur de l’anneau de la piste, au plus près des terrains. Repère commode pour fixer un point de rendez-vous avec un groupe ou situer l’emplacement d’un atelier.',
       '🧰', '2026-09-15T00:00:00.000Z', '', 'local;matériel;rangement;technique'
  FROM maps WHERE id = 'beaulieu';
INSERT IGNORE INTO map_markers
  (id, map_id, x_pct, y_pct, label, plant_name, note, emoji, created_at, hidden_surfaces, search_aliases)
SELECT 'beaulieu-hommage-nawal', 'beaulieu', 61.13, 55.7, 'Nawal El Moutawakel', '',
       'Le complexe porte le nom de Nawal El Moutawakel, championne olympique du 400 m haies aux Jeux de Los Angeles en 1984 et figure emblématique du sport marocain : elle fut la première femme marocaine titrée aux Jeux olympiques. Donner son nom au site, c’est afficher l’ambition que le complexe veut transmettre — se dépasser, et développer son potentiel quel que soit son niveau de départ.',
       '🥇', '2026-09-15T00:00:00.000Z', '', 'Nawal El Moutawakel;Moutawakel;hommage;jeux olympiques;400 m haies'
  FROM maps WHERE id = 'beaulieu';

-- 5. Rattachement aux catégories (garde : la zone / le repère existe bien).
INSERT IGNORE INTO zone_categories (zone_id, category_id)
SELECT 'beaulieu-piste-athletisme', 'beaulieu-cat-athletisme' FROM zones WHERE id = 'beaulieu-piste-athletisme';
INSERT IGNORE INTO zone_categories (zone_id, category_id)
SELECT 'beaulieu-terrain-football', 'beaulieu-cat-terrains' FROM zones WHERE id = 'beaulieu-terrain-football';
INSERT IGNORE INTO zone_categories (zone_id, category_id)
SELECT 'beaulieu-terrains-basket', 'beaulieu-cat-terrains' FROM zones WHERE id = 'beaulieu-terrains-basket';
INSERT IGNORE INTO zone_categories (zone_id, category_id)
SELECT 'beaulieu-plateau-central', 'beaulieu-cat-terrains' FROM zones WHERE id = 'beaulieu-plateau-central';
INSERT IGNORE INTO zone_categories (zone_id, category_id)
SELECT 'beaulieu-beach-volley', 'beaulieu-cat-terrains' FROM zones WHERE id = 'beaulieu-beach-volley';
INSERT IGNORE INTO zone_categories (zone_id, category_id)
SELECT 'beaulieu-courts-tennis', 'beaulieu-cat-terrains' FROM zones WHERE id = 'beaulieu-courts-tennis';
INSERT IGNORE INTO zone_categories (zone_id, category_id)
SELECT 'beaulieu-batiment-couvert', 'beaulieu-cat-couvert' FROM zones WHERE id = 'beaulieu-batiment-couvert';
INSERT IGNORE INTO zone_categories (zone_id, category_id)
SELECT 'beaulieu-plateau-ouest', 'beaulieu-cat-terrains' FROM zones WHERE id = 'beaulieu-plateau-ouest';

INSERT IGNORE INTO zone_categories (zone_id, category_id)
SELECT 'beaulieu-batiment-couvert', 'cat-infrastructure' FROM zones WHERE id = 'beaulieu-batiment-couvert';

INSERT IGNORE INTO marker_categories (marker_id, category_id)
SELECT 'beaulieu-gymnase', 'beaulieu-cat-couvert' FROM map_markers WHERE id = 'beaulieu-gymnase';
INSERT IGNORE INTO marker_categories (marker_id, category_id)
SELECT 'beaulieu-piscine', 'beaulieu-cat-aquatique' FROM map_markers WHERE id = 'beaulieu-piscine';
INSERT IGNORE INTO marker_categories (marker_id, category_id)
SELECT 'beaulieu-musculation', 'beaulieu-cat-couvert' FROM map_markers WHERE id = 'beaulieu-musculation';
INSERT IGNORE INTO marker_categories (marker_id, category_id)
SELECT 'beaulieu-mur-escalade', 'beaulieu-cat-couvert' FROM map_markers WHERE id = 'beaulieu-mur-escalade';
INSERT IGNORE INTO marker_categories (marker_id, category_id)
SELECT 'beaulieu-vestiaires', 'beaulieu-cat-accueil' FROM map_markers WHERE id = 'beaulieu-vestiaires';
INSERT IGNORE INTO marker_categories (marker_id, category_id)
SELECT 'beaulieu-infirmerie', 'beaulieu-cat-sante' FROM map_markers WHERE id = 'beaulieu-infirmerie';
INSERT IGNORE INTO marker_categories (marker_id, category_id)
SELECT 'beaulieu-entree', 'beaulieu-cat-accueil' FROM map_markers WHERE id = 'beaulieu-entree';
INSERT IGNORE INTO marker_categories (marker_id, category_id)
SELECT 'beaulieu-vers-lyautey', 'beaulieu-cat-accueil' FROM map_markers WHERE id = 'beaulieu-vers-lyautey';
INSERT IGNORE INTO marker_categories (marker_id, category_id)
SELECT 'beaulieu-local-technique', 'beaulieu-cat-accueil' FROM map_markers WHERE id = 'beaulieu-local-technique';
INSERT IGNORE INTO marker_categories (marker_id, category_id)
SELECT 'beaulieu-hommage-nawal', 'beaulieu-cat-athletisme' FROM map_markers WHERE id = 'beaulieu-hommage-nawal';
