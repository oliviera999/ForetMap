-- 342 — Plan e-nov : alignement sur le dossier de labellisation N3 (relecture du 10 novembre 2026).
--
-- Versement par PR des corrections appliquées en production le 10/11/2026 par le connecteur
-- Claude (plans de contenu 15940de2 et 8a5406db, mises à jour de lieux par l'API), après la
-- relecture du dossier par le groupe e-nov et les commentaires d'A. Besteiro sur le plan
-- imprimé du complexe sportif.
--
-- 1. Textes e-nov (`enov_description`) alignés sur le dossier :
--    - gymnase du complexe : panneaux solaires thermiques (eau chaude), et non photovoltaïques ;
--      première phrase courte, car la légende du plan imprimé coupe le premier paragraphe ;
--    - plateau sportif rénové : même découpage (la légende était tronquée) ;
--    - local du secourisme : le Bureau des Sports n'y est pas (il est hébergé à titre provisoire
--      au gymnase) ; texte recentré sur le secourisme, nom et fiche publique alignés ;
--    - fablab en salle T13 (et non T09) ; Ecofab : une douzaine d'élèves ;
--    - restauration : les lieux ont commencé à être réaménagés, marché de travaux de mai 2026 ;
--    - chats : la stérilisation est financée par l'établissement, la vaccination parfois faite
--      par des collègues.
-- 2. Types d'espace (`enov_space_type`, qui range la légende du plan imprimé) et sous-catégories
--    `cat-enov-*` correspondantes :
--    - poulailler et potager EPS : espace extérieur (et non sportif) ;
--    - poissons gloutons (lycée et complexe) : espace extérieur (et non vie scolaire) ;
--    - secourisme : vie scolaire et bien-être (et non sportif).
--
-- Idempotent : chaque mise à jour ne retient que l'ancien état (texte, type ou liaison) ; un
-- rejeu, ou une base où la correction est déjà faite, ne change rien.

-- 1. Textes e-nov ---------------------------------------------------------------------------

UPDATE zones
   SET enov_description = 'Avant 2020, des hangars. Depuis 2022, un bâtiment couvert d''environ 3 000 m², dont le toit porte des panneaux solaires thermiques pour chauffer l''eau.

Une piscine (bassin semi-olympique de 25 m et bassin d''apprentissage), un gymnase tracé pour le volley-ball et le badminton, une salle de musculation, des vestiaires. La piscine accueille les classes du primaire au lycée.

Le complexe porte depuis juin 2024 le nom de Nawal El Moutawakel, championne olympique du 400 m haies en 1984. L''équipe d''EPS y a installé un bloc d''escalade et porte le projet d''un grand mur ; en attendant, l''association sportive part une fois par mois grimper en hauteur au collège Anatole France.

Vidéo différée sur tablettes pour l''analyse du geste, chronométrage électronique, applications de suivi de l''effort : l''élève se voit, se mesure, et parfois se corrige.'
 WHERE id = 'enov-beaulieu-gymnase'
   AND enov_description LIKE 'Avant 2020, des hangars. Depuis 2022, un bâtiment couvert d''environ 3 000 m², dont le toit porte des panneaux photovoltaïques%';

UPDATE zones
   SET enov_description = 'Jusqu''en 2025, une piste et des terrains peints à même le bitume. À la rentrée 2025, à la demande de l''équipe d''EPS et sur le budget de l''établissement, ils ont été refaits en revêtement synthétique.

La piste d''athlétisme et les terrains qu''elle enserre (basket-ball, handball, volley-ball, ligne droite de sprint) couvrent environ 9 000 m² en plein air.

Les emplacements n''ont pas bougé : ce sont ceux que l''usage avait déjà tracés à la peinture. La rénovation a suivi la pratique au lieu de la précéder.'
 WHERE id = 'enov-beaulieu-plateau'
   AND enov_description LIKE '%la piste d''athlétisme et les terrains qu''elle enserre ont été refaits en revêtement synthétique :%';

UPDATE zones
   SET enov_description = 'Le secourisme forme tout un établissement : en 2025-2026, plus de 1 200 personnes formées, dont toutes les classes de cinquième aux gestes qui sauvent et toutes les classes de seconde au PSC.

Depuis septembre 2022, trois salles lui sont réservées ici, des préfabriqués équipés à demeure dont les façades portent, en grand format, les gestes à connaître. Des agents et des personnels du pôle y sont formés, et une brigade de 36 jeunes secouristes, créée en 2022, forme à son tour.'
 WHERE id = 'zone-bee5299d'
   AND enov_description LIKE 'Deux dynamiques nées de l''EPS se partagent ce local.%';

UPDATE zones
   SET name = '⛑️ Secourisme'
 WHERE id = 'zone-bee5299d'
   AND name = '⛑️ Secourisme et BDS';

UPDATE zones
   SET description = REPLACE(description, ') et du BDS, à l’est du site.', '), à l’est du site.'),
       search_aliases = REPLACE(search_aliases, ' ; BDS', '')
 WHERE id = 'zone-bee5299d'
   AND description LIKE '%) et du BDS, à l’est du site.%';

UPDATE visit_zones
   SET short_description = REPLACE(short_description, ') et du BDS, à l’est du site.', '), à l’est du site.')
 WHERE id = 'zone-bee5299d'
   AND short_description LIKE '%) et du BDS, à l’est du site.%';

UPDATE map_markers
   SET enov_description = REPLACE(enov_description, 'Salle T09.', 'Salle T13.')
 WHERE id = 'a075954c-a063-406a-94c7-c54f45923196'
   AND enov_description LIKE 'Salle T09.%';

UPDATE map_markers
   SET enov_description = REPLACE(enov_description, 'une vingtaine d''élèves fabriquent', 'une douzaine d''élèves fabriquent')
 WHERE id = '807b6e8f-29a8-4674-9ff7-ba0153513710'
   AND enov_description LIKE '%une vingtaine d''élèves fabriquent%';

UPDATE zones
   SET enov_description = REPLACE(enov_description,
         'les lieux, eux, n''ont pas encore bougé.',
         'les lieux ont commencé à être réaménagés, et un marché de travaux a été lancé en mai 2026 pour les espaces de restauration des élèves et des enseignants.')
 WHERE id = 'zone-128203d0'
   AND enov_description LIKE '%les lieux, eux, n''ont pas encore bougé.%';

UPDATE map_markers
   SET enov_description = REPLACE(enov_description,
         'finance leur stérilisation et leur vaccination.',
         'finance leur stérilisation, et des collègues les font parfois vacciner.')
 WHERE id IN ('mk-nourrissage-chats', '0feee96a-16f0-40b3-8015-262798b6271f')
   AND enov_description LIKE '%finance leur stérilisation et leur vaccination.%';

-- 2. Types d'espace et sous-catégories ------------------------------------------------------

-- Poulailler et potager EPS (complexe) : espace extérieur.
INSERT IGNORE INTO zone_categories (zone_id, category_id)
SELECT zone_id, 'cat-enov-exterieur'
  FROM zone_categories
 WHERE category_id = 'cat-enov-sportif'
   AND zone_id IN ('zone-6950f475', 'zone-da7711ea');

DELETE FROM zone_categories
 WHERE category_id = 'cat-enov-sportif'
   AND zone_id IN ('zone-6950f475', 'zone-da7711ea');

UPDATE zones
   SET enov_space_type = 'exterieur'
 WHERE id IN ('zone-6950f475', 'zone-da7711ea')
   AND enov_space_type = 'sportif';

-- Secourisme (complexe) : vie scolaire et bien-être.
INSERT IGNORE INTO zone_categories (zone_id, category_id)
SELECT zone_id, 'cat-enov-vie-collective'
  FROM zone_categories
 WHERE category_id = 'cat-enov-sportif'
   AND zone_id = 'zone-bee5299d';

DELETE FROM zone_categories
 WHERE category_id = 'cat-enov-sportif'
   AND zone_id = 'zone-bee5299d';

UPDATE zones
   SET enov_space_type = 'vie-scolaire'
 WHERE id = 'zone-bee5299d'
   AND enov_space_type = 'sportif';

-- Poissons gloutons (complexe et lycée) : espace extérieur.
INSERT IGNORE INTO marker_categories (marker_id, category_id)
SELECT marker_id, 'cat-enov-exterieur'
  FROM marker_categories
 WHERE category_id = 'cat-enov-vie-collective'
   AND marker_id IN ('b0a1c6b7-f433-4d53-a63e-e1e50e4ba33d', '3cff4487-7c45-4d97-9d60-5df6d123126c');

DELETE FROM marker_categories
 WHERE category_id = 'cat-enov-vie-collective'
   AND marker_id IN ('b0a1c6b7-f433-4d53-a63e-e1e50e4ba33d', '3cff4487-7c45-4d97-9d60-5df6d123126c');

UPDATE map_markers
   SET enov_space_type = 'exterieur'
 WHERE id IN ('b0a1c6b7-f433-4d53-a63e-e1e50e4ba33d', '3cff4487-7c45-4d97-9d60-5df6d123126c')
   AND enov_space_type = 'vie-scolaire';
