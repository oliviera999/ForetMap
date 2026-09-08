-- Auxiliaires, sol, mare et plantes sauvages utiles (jardin lycée).
-- Aligne G&L de façon ciblée : forêt caducifoliée, landes (mares), Méditerranée.
-- Réutilise Hérisson commun (SP0074) et Lierre grimpant (SP0091). Codes SP0255+.
-- Colonnes du SELECT aliasées (MariaDB).

-- Clarifier le ver du compost déjà présent (Eisenia, pas Lumbricus).
UPDATE plants
SET second_name = 'Ver du compost (Eisenia)',
    scientific_name = 'Eisenia fetida',
    taxon_genus = 'Eisenia',
    taxon_rank = 'species',
    description = 'Ver rouge de surface, spécialiste du compost et de la litière. Ce n’est pas le lombric profond (Lumbricus terrestris), qui creuse des galeries verticales.',
    remark_1 = 'À ne pas confondre avec la fiche « Lombric commun » (Lumbricus terrestris).'
WHERE name = 'Vers de terre'
  AND (scientific_name IS NULL OR scientific_name LIKE 'Eisenia%' OR scientific_name = '');

INSERT INTO plants (
  name, emoji, description, second_name, scientific_name, taxon_rank,
  taxon_kingdom, taxon_group, taxon_family, taxon_genus,
  habitat_type, trophic_role, habitat, nutrition,
  ecosystem_role, geographic_origin, human_utility, photo, remark_1
)
SELECT v.name, v.emoji, v.description, v.second_name, v.scientific_name, v.taxon_rank,
       v.taxon_kingdom, v.taxon_group, v.taxon_family, v.taxon_genus,
       v.habitat_type, v.trophic_role, v.habitat, v.nutrition,
       v.ecosystem_role, v.geographic_origin, v.human_utility, v.photo, v.remark_1
FROM (
  SELECT
    'Carabe doré' AS name, '🪲' AS emoji,
    'Grand coléoptère vert métallique, chasseur au sol. Allié contre limaces et escargots.' AS description,
    'Carabe' AS second_name, 'Carabus auratus' AS scientific_name, 'species' AS taxon_rank,
    'Animal (Métazoaires)' AS taxon_kingdom, 'Arthropodes' AS taxon_group,
    'Carabidés' AS taxon_family, 'Carabus' AS taxon_genus,
    'terrestre' AS habitat_type, 'consommateur' AS trophic_role,
    'Haies, tas de bois, potager paillé' AS habitat,
    'Prédateur de limaces, escargots, vers' AS nutrition,
    'Auxiliaire nocturne du sol' AS ecosystem_role,
    'Europe, Méditerranée' AS geographic_origin,
    'Lutte biologique contre les limaces' AS human_utility,
    'https://commons.wikimedia.org/wiki/Special:FilePath/Carabus_auratus.jpg' AS photo,
    CAST(NULL AS CHAR) AS remark_1
  UNION ALL
  SELECT
    'Perce-oreille', '🦗',
    'Insecte à pinces abdominales, se cache le jour dans les fleurs et les fentes. Mange pucerons et débris.',
    'Forficule', 'Forficula auricularia', 'species',
    'Animal (Métazoaires)', 'Arthropodes', 'Forficulidés', 'Forficula',
    'terrestre', 'consommateur',
    'Fleurs, pots, écorces, tas de bois',
    'Omnivore : pucerons, pollen, débris',
    'Auxiliaire et parfois grignoteur de pétales',
    'Cosmopolite',
    'Utile contre les pucerons si on lui offre des abris',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Forficula_auricularia.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Merle noir', '🐦',
    'Oiseau noir à bec jaune (mâle). Tire les vers après la pluie, picore baies et fruits tombés.',
    'Merle', 'Turdus merula', 'species',
    'Animal (Métazoaires)', 'Oiseaux', 'Turdidés', 'Turdus',
    'terrestre', 'consommateur',
    'Pelouses, haies, sureau, verger',
    'Vers, insectes, baies, fruits',
    'Relie le sol (vers) aux buissons à baies',
    'Europe, Maghreb, largement introduit',
    'Chant ; disperse les graines des baies',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Turdus_merula_male.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Hirondelle rustique', '🕊️',
    'Oiseau migrateur à longue queue fourchue. Chasse les insectes volants au-dessus de la cour et de la mare.',
    'Hirondelle de cheminée', 'Hirundo rustica', 'species',
    'Animal (Métazoaires)', 'Oiseaux', 'Hirundinidés', 'Hirundo',
    'les_deux', 'consommateur',
    'Cours, bâtiments, ciel au-dessus de la mare',
    'Insectivore aérien (moustiques, mouches, pucerons ailés)',
    'Régule les insectes volants le jour',
    'Cosmopolite (migrateur)',
    'Nidification sous les avant-toits à ménager',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Hirundo_rustica.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Pipistrelle commune', '🦇',
    'Petite chauve-souris des jardins et des combles. Chasse les moustiques à la tombée de la nuit.',
    'Chauve-souris', 'Pipistrellus pipistrellus', 'species',
    'Animal (Métazoaires)', 'Mammifères', 'Vespertilionidés', 'Pipistrellus',
    'terrestre', 'consommateur',
    'Combles, fissures, vol autour des lampes et de la mare',
    'Insectivore nocturne (moustiques, papillons de nuit)',
    'Complément nocturne de l’hirondelle',
    'Europe, Maghreb',
    'Auxiliaire ; gîtes à chauves-souris, pas de produits chimiques',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Pipistrellus_pipistrellus.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Crapaud de Maurétanie', '🐸',
    'Crapaud d’Afrique du Nord, fréquent près des mares et des jardins irrigués du Maroc. Chasse au sol la nuit.',
    'Crapaud', 'Sclerophrys mauritanica', 'species',
    'Animal (Métazoaires)', 'Amphibiens', 'Bufonidés', 'Sclerophrys',
    'les_deux', 'consommateur',
    'Mare, ornières, haies humides, potager le soir',
    'Insectes, limaces, vers, parfois têtards',
    'Auxiliaire du potager ; a besoin d’eau pour pondre',
    'Maghreb',
    'Allié nocturne ; ne pas combler toutes les flaques au printemps',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Sclerophrys_mauritanica.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Mycorhizes à Glomus', '🍄',
    'Champignons du sol qui s’associent aux racines de la plupart des légumes : la plante donne des sucres, le champignon apporte eau et phosphore.',
    'Glomus', 'Glomus sp.', 'genus',
    'Champignon (Fungi)', CAST(NULL AS CHAR), 'Gloméromycètes', 'Glomus',
    'terrestre', CAST(NULL AS CHAR),
    'Rhizosphère des légumes et des herbacées',
    'Symbiose : sucres de la plante contre minéraux et eau',
    'Pendant fongique du Rhizobium : pas d’azote, mais phosphore et réseau du sol',
    'Cosmopolite (sols)',
    'Sol vivant ; éviter le labour profond et les fongicides inutiles',
    CAST(NULL AS CHAR),
    'Rang : genre. Ce n’est pas une espèce unique.'
  UNION ALL
  SELECT
    'Staphylin odorant', '🪲',
    'Grand coléoptère noir qui relève l’abdomen. Chasseur de limaces dans la litière et le compost.',
    'Staphylin', 'Ocypus olens', 'species',
    'Animal (Métazoaires)', 'Arthropodes', 'Staphylinidés', 'Ocypus',
    'terrestre', 'consommateur',
    'Litière, compost, sous les pots',
    'Prédateur de limaces, vers, débris',
    'Auxiliaire du tas de compost',
    'Europe, Méditerranée',
    'Ne pas le confondre avec un nuisible : il chasse',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Ocypus_olens.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Lombric commun', '🪱',
    'Grand ver de terre anécique : galeries verticales profondes, turricules en surface. Distinct du ver rouge du compost (Eisenia).',
    'Ver de terre anécique', 'Lumbricus terrestris', 'species',
    'Animal (Métazoaires)', 'Annélides', 'Lumbricidés', 'Lumbricus',
    'terrestre', 'decomposeur',
    'Prairie, potager profond, pelouse',
    'Détritivore géophage (litière tirée dans les galeries, terre)',
    'Aère et draine le sol en profondeur ; pas un ver de lombricomposteur',
    'Europe, largement introduit',
    'Indicateur de sol vivant ; pas de bêchage profond',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Lumbricus_terrestris.jpg',
    'Complète la fiche « Vers de terre » (Eisenia du compost).'
  UNION ALL
  SELECT
    'Daphnie', '🫧',
    'Petit crustacé transparent des mares et des bacs, qui nage par saccades. Filtre le plancton et sert de proie.',
    'Puce d’eau', 'Daphnia magna', 'species',
    'Animal (Métazoaires)', 'Crustacés', 'Daphniidés', 'Daphnia',
    'aquatique', 'consommateur',
    'Mare, bac, eau calme',
    'Filtreur (algues, bactéries, débris fins)',
    'Maillon entre le biofilm et les prédateurs (gambusie, larve de libellule)',
    'Eaux douces de l’hémisphère nord',
    'Indicateur de qualité d’eau ; nourriture vivante d’aquarium',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Daphnia_magna.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Libellule', '🐉',
    'La larve (naïade) chasse sous l’eau ; l’adulte chasse au-dessus de la mare. Une fiche pour les deux stades.',
    'Larve de libellule', 'Libellula depressa', 'species',
    'Animal (Métazoaires)', 'Arthropodes', 'Libellulidés', 'Libellula',
    'les_deux', 'consommateur',
    'Mare, bac, roselière, air au-dessus de l’eau',
    'Larve : daphnies, larves de moustiques, gerris ; adulte : insectes volants',
    'Prédateur-clé de la mare, complémentaire de la gambusie',
    'Europe, Méditerranée',
    'Mare naturelle sans poisson trop nombreux',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Libellula_depressa_male.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Gerris', '💧',
    'Punaise à longues pattes qui patine à la surface de l’eau. Chasse les insectes tombés et les larves proches de la surface.',
    'Araignée d’eau', 'Gerris lacustris', 'species',
    'Animal (Métazoaires)', 'Arthropodes', 'Gerridés', 'Gerris',
    'aquatique', 'consommateur',
    'Surface des mares et des bacs calmes',
    'Prédateur de surface (moustiques, insectes noyés)',
    'Occupe la pellicule de surface, là où la gambusie ne chasse pas',
    'Eaux douces d’Eurasie',
    'Mare sans vague ni trop de poissons de surface',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Gerris_lacustris.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Sureau noir', '🍇',
    'Arbuste des haies, corymbes blancs puis baies noires. Nectar au printemps, fruits pour les merles, litière à l’automne.',
    'Sureau', 'Sambucus nigra', 'species',
    'Végétal (Chlorobiontes)', 'Angiosperme', 'Adoxacées', 'Sambucus',
    'terrestre', 'producteur',
    'Haie, lisière, coin un peu frais du jardin',
    'Autotrophe (photosynthèse)',
    'Nectar, baies, litière : trois ressources sans quitter le lycée',
    'Europe, Maghreb',
    'Fleurs et baies cuites (crues irritantes) ; haie vive',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Sambucus_nigra_berries.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Lierre', '🌿',
    'Grimpante sempervirente des murs et des troncs. Floraison tardive, précieuse pour les abeilles d’automne.',
    'Lierre grimpant', 'Hedera helix', 'species',
    'Végétal (Chlorobiontes)', 'Angiosperme', 'Araliacées', 'Hedera',
    'terrestre', 'producteur',
    'Murs, arbres, sols ombragés',
    'Autotrophe (photosynthèse)',
    'Nectar d’automne, abri, litière persistante',
    'Europe, Méditerranée',
    'Couvre-mur ; ne « tue » pas l’arbre sain',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Hedera_helix_flowers.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Pâquerette', '🌼',
    'Petite composée des pelouses. Fleurit presque toute l’année, butinée dès les beaux jours.',
    'Marguerite des prés', 'Bellis perennis', 'species',
    'Végétal (Chlorobiontes)', 'Angiosperme', 'Astéracées', 'Bellis',
    'terrestre', 'producteur',
    'Pelouse, allées, pieds de haie',
    'Autotrophe (photosynthèse)',
    'Nectar de proximité ; résiste à la tonte rase',
    'Europe, naturalisée au Maghreb',
    'Laisser une bande non tondue',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Bellis_perennis_flower.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Plantain lancéolé', '🌱',
    'Rosette de feuilles nervurées des allées. Plante « sauvage » du lycée, visitée par les insectes, parfois broutée.',
    'Plantain', 'Plantago lanceolata', 'species',
    'Végétal (Chlorobiontes)', 'Angiosperme', 'Plantaginacées', 'Plantago',
    'terrestre', 'producteur',
    'Allées, pelouses compactées, pieds de mur',
    'Autotrophe (photosynthèse)',
    'Indicateur de sol piétiné ; nectar et litière fine',
    'Eurasie, cosmopolite',
    'Tisane traditionnelle ; ne pas tout désherber',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Plantago_lanceolata.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Violette odorante', '💜',
    'Petites fleurs violettes de lisière et de haie, parfois dès la fin de l’hiver.',
    'Violette', 'Viola odorata', 'species',
    'Végétal (Chlorobiontes)', 'Angiosperme', 'Violacées', 'Viola',
    'terrestre', 'producteur',
    'Haie, pied d’arbre, coin frais',
    'Autotrophe (photosynthèse)',
    'Nectar précoce ; couvre-sol de lisière',
    'Europe, Méditerranée',
    'Ornement discret, parfum',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Viola_odorata_flowers.jpg',
    CAST(NULL AS CHAR)
) AS v
WHERE NOT EXISTS (SELECT 1 FROM plants p WHERE p.name = v.name);

INSERT IGNORE INTO plant_name_aliases (alias, plant_id)
SELECT 'Carabe', id FROM plants WHERE name = 'Carabe doré' LIMIT 1;
INSERT IGNORE INTO plant_name_aliases (alias, plant_id)
SELECT 'Forficule', id FROM plants WHERE name = 'Perce-oreille' LIMIT 1;
INSERT IGNORE INTO plant_name_aliases (alias, plant_id)
SELECT 'Merle', id FROM plants WHERE name = 'Merle noir' LIMIT 1;
INSERT IGNORE INTO plant_name_aliases (alias, plant_id)
SELECT 'Hirondelle', id FROM plants WHERE name = 'Hirondelle rustique' LIMIT 1;
INSERT IGNORE INTO plant_name_aliases (alias, plant_id)
SELECT 'Chauve-souris', id FROM plants WHERE name = 'Pipistrelle commune' LIMIT 1;
INSERT IGNORE INTO plant_name_aliases (alias, plant_id)
SELECT 'Crapaud', id FROM plants WHERE name = 'Crapaud de Maurétanie' LIMIT 1;
INSERT IGNORE INTO plant_name_aliases (alias, plant_id)
SELECT 'Glomus', id FROM plants WHERE name = 'Mycorhizes à Glomus' LIMIT 1;
INSERT IGNORE INTO plant_name_aliases (alias, plant_id)
SELECT 'Mycorhize', id FROM plants WHERE name = 'Mycorhizes à Glomus' LIMIT 1;
INSERT IGNORE INTO plant_name_aliases (alias, plant_id)
SELECT 'Staphylin', id FROM plants WHERE name = 'Staphylin odorant' LIMIT 1;
INSERT IGNORE INTO plant_name_aliases (alias, plant_id)
SELECT 'Lombric', id FROM plants WHERE name = 'Lombric commun' LIMIT 1;
INSERT IGNORE INTO plant_name_aliases (alias, plant_id)
SELECT 'Ver de terre commun', id FROM plants WHERE name = 'Lombric commun' LIMIT 1;
INSERT IGNORE INTO plant_name_aliases (alias, plant_id)
SELECT 'Puce d''eau', id FROM plants WHERE name = 'Daphnie' LIMIT 1;
INSERT IGNORE INTO plant_name_aliases (alias, plant_id)
SELECT 'Larve de libellule', id FROM plants WHERE name = 'Libellule' LIMIT 1;
INSERT IGNORE INTO plant_name_aliases (alias, plant_id)
SELECT 'Araignée d''eau', id FROM plants WHERE name = 'Gerris' LIMIT 1;
INSERT IGNORE INTO plant_name_aliases (alias, plant_id)
SELECT 'Sureau', id FROM plants WHERE name = 'Sureau noir' LIMIT 1;
INSERT IGNORE INTO plant_name_aliases (alias, plant_id)
SELECT 'Hedera', id FROM plants WHERE name = 'Lierre' LIMIT 1;
INSERT IGNORE INTO plant_name_aliases (alias, plant_id)
SELECT 'Plantain', id FROM plants WHERE name = 'Plantain lancéolé' LIMIT 1;
INSERT IGNORE INTO plant_name_aliases (alias, plant_id)
SELECT 'Violette', id FROM plants WHERE name = 'Violette odorante' LIMIT 1;

INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
SELECT f.id, t.id, v.itype, v.descr
FROM (
  SELECT 'Carabe doré' AS fname, 'Escargot petit-gris' AS tname, 'predation' AS itype, 'Chasse escargots et limaces au sol' AS descr
  UNION ALL SELECT 'Carabe doré', 'Vers de terre', 'predation', 'Complète son régime avec des vers de surface'
  UNION ALL SELECT 'Staphylin odorant', 'Escargot petit-gris', 'predation', 'Chasseur de limaces et escargots dans la litière'
  UNION ALL SELECT 'Staphylin odorant', 'Litière de feuilles', 'decomposition', 'Fouille et fragmente la litière en chassant'
  UNION ALL SELECT 'Perce-oreille', 'Puceron', 'predation', 'Complète son menu avec les pucerons des fleurs'
  UNION ALL SELECT 'Perce-oreille', 'Litière de feuilles', 'decomposition', 'Mange aussi les débris de la litière'
  UNION ALL SELECT 'Merle noir', 'Vers de terre', 'predation', 'Tire les vers après la pluie'
  UNION ALL SELECT 'Merle noir', 'Lombric commun', 'predation', 'Recherche les lombrics anéciques en surface'
  UNION ALL SELECT 'Merle noir', 'Escargot petit-gris', 'predation', 'Casse parfois les petites coquilles'
  UNION ALL SELECT 'Merle noir', 'Sureau noir', 'herbivorie', 'Baies de sureau en fin d’été'
  UNION ALL SELECT 'Merle noir', 'Fruits et légumes tombés', 'decomposition', 'Picore les fruits au sol'
  UNION ALL SELECT 'Hirondelle rustique', 'Moustique commun', 'predation', 'Chasse les moustiques adultes en vol'
  UNION ALL SELECT 'Pipistrelle commune', 'Moustique commun', 'predation', 'Chasse nocturne des moustiques autour des lampes et de la mare'
  UNION ALL SELECT 'Crapaud de Maurétanie', 'Moustique commun', 'predation', 'Gobe les insectes près de l’eau'
  UNION ALL SELECT 'Crapaud de Maurétanie', 'Escargot petit-gris', 'predation', 'Chasse au sol : escargots et limaces'
  UNION ALL SELECT 'Crapaud de Maurétanie', 'Perce-oreille', 'predation', 'Insectes du sol et des haies'
  UNION ALL SELECT 'Hérisson d’Algérie', 'Lombric commun', 'predation', 'Complète le régime avec le lombric profond'
  UNION ALL SELECT 'Mycorhizes à Glomus', 'Tomate', 'symbiose', 'Réseau mycorhizien : phosphore et eau contre sucres'
  UNION ALL SELECT 'Mycorhizes à Glomus', 'Laitue', 'symbiose', 'Association racines–champignon du sol'
  UNION ALL SELECT 'Mycorhizes à Glomus', 'Haricot', 'symbiose', 'Complète la nodosité Rhizobium par un réseau fongique'
  UNION ALL SELECT 'Mycorhizes à Glomus', 'Pois chiche', 'symbiose', 'Légumineuse : Rhizobium (N) et Glomus (P)'
  UNION ALL SELECT 'Lombric commun', 'Litière de feuilles', 'decomposition', 'Tire la litière dans ses galeries verticales'
  UNION ALL SELECT 'Lombric commun', 'Crottes et fientes', 'decomposition', 'Incorpore les déjections en profondeur'
  UNION ALL SELECT 'Lombric commun', 'Bois mort', 'decomposition', 'Explore le bois très dégradé en surface'
  UNION ALL SELECT 'Daphnie', 'Biofilm', 'decomposition', 'Filtre algues et bactéries en suspension'
  UNION ALL SELECT 'Libellule', 'Daphnie', 'predation', 'La naïade chasse les daphnies'
  UNION ALL SELECT 'Libellule', 'Moustique commun', 'predation', 'Larve : nymphes de moustiques ; adulte : moustiques volants'
  UNION ALL SELECT 'Libellule', 'Gerris', 'predation', 'La larve peut saisir un gerris trop proche'
  UNION ALL SELECT 'Gerris', 'Moustique commun', 'predation', 'Capture à la surface, surtout les émergences'
  UNION ALL SELECT 'Gambusie', 'Daphnie', 'predation', 'Complète le menu des larves de moustiques par le zooplancton'
  UNION ALL SELECT 'Abeille', 'Sureau noir', 'pollinisation', 'Corymbes printaniers très visités'
  UNION ALL SELECT 'Abeille', 'Pâquerette', 'pollinisation', 'Fleurs de pelouse, presque toute l’année'
  UNION ALL SELECT 'Abeille', 'Violette odorante', 'pollinisation', 'Floraison précoce de lisière'
  UNION ALL SELECT 'Abeille', 'Lierre', 'pollinisation', 'Floraison tardive, précieuse en automne'
  UNION ALL SELECT 'Puceron', 'Sureau noir', 'herbivorie', 'Jeunes pousses de sureau'
  UNION ALL SELECT 'Puceron', 'Plantain lancéolé', 'herbivorie', 'Colonies sur les hampes'
  UNION ALL SELECT 'Puceron', 'Violette odorante', 'herbivorie', 'Feuilles tendres de lisière'
) AS v
JOIN plants f ON f.name = v.fname
JOIN plants t ON t.name = v.tname
WHERE NOT EXISTS (
  SELECT 1 FROM species_interactions si
  WHERE si.from_plant_id = f.id AND si.to_plant_id = t.id AND si.interaction_type = v.itype
);

INSERT INTO gl_species (
  species_code, biome_slug, type, nom_commun, nom_scientifique, taxon_rank,
  groupe, famille, role_ecologique, regime_alimentaire, description_courte,
  anecdote, wikipedia_url, statut, created_at, updated_at
)
SELECT v.species_code, v.biome_slug, v.type, v.nom_commun, v.nom_scientifique, v.taxon_rank,
       v.groupe, v.famille, v.role_ecologique, v.regime_alimentaire, v.description_courte,
       v.anecdote, v.wikipedia_url, v.statut, v.created_at, v.updated_at
FROM (
  SELECT
    'SP0255' AS species_code, 'foret_caducifoliee' AS biome_slug, 'faune' AS type,
    'Merle noir' AS nom_commun, 'Turdus merula' AS nom_scientifique, 'species' AS taxon_rank,
    'Oiseaux' AS groupe, 'Turdidés' AS famille,
    'Relie le sol aux buissons à baies' AS role_ecologique,
    'Vers, insectes, baies' AS regime_alimentaire,
    'Oiseau des lisières : tire les vers, disperse les graines du sureau.' AS description_courte,
    'Le bec jaune du mâle se voit de loin sur une pelouse après la pluie.' AS anecdote,
    'https://fr.wikipedia.org/wiki/Merle_noir' AS wikipedia_url,
    'actif' AS statut, NOW() AS created_at, NOW() AS updated_at
  UNION ALL SELECT 'SP0256', 'foret_caducifoliee', 'faune', 'Carabe doré', 'Carabus auratus', 'species',
    'Insectes', 'Carabidés', 'Prédateur du sol', 'Limaces, escargots, vers',
    'Coléoptère métallique chasseur de nuisibles du sous-bois.',
    'Il chasse surtout la nuit, sous les feuilles mortes.',
    'https://fr.wikipedia.org/wiki/Carabus_auratus', 'actif', NOW(), NOW()
  UNION ALL SELECT 'SP0257', 'foret_caducifoliee', 'faune', 'Perce-oreille', 'Forficula auricularia', 'species',
    'Insectes', 'Forficulidés', 'Auxiliaire omnivore', 'Pucerons, débris, pollen',
    'Insecte à pinces, utile contre les pucerons des lisières.',
    'Les pinces servent surtout à se défendre, pas à pincer les humains.',
    'https://fr.wikipedia.org/wiki/Forficula_auricularia', 'actif', NOW(), NOW()
  UNION ALL SELECT 'SP0258', 'foret_caducifoliee', 'faune', 'Hirondelle rustique', 'Hirundo rustica', 'species',
    'Oiseaux', 'Hirundinidés', 'Insectivore aérien', 'Moustiques, mouches, pucerons ailés',
    'Migrateur qui chasse les insectes au-dessus des clairières et des mares.',
    'Elle niche sous les avant-toits : un bâtiment du chapitre lui suffit.',
    'https://fr.wikipedia.org/wiki/Hirondelle_rustique', 'actif', NOW(), NOW()
  UNION ALL SELECT 'SP0259', 'foret_caducifoliee', 'faune', 'Crapaud commun', 'Bufo bufo', 'species',
    'Amphibiens', 'Bufonidés', 'Prédateur nocturne des lisières', 'Insectes, limaces, vers',
    'Amphibien des mares forestières, allié des sous-bois humides.',
    'Il revient pondre à la même mare chaque printemps.',
    'https://fr.wikipedia.org/wiki/Crapaud_commun', 'actif', NOW(), NOW()
  UNION ALL SELECT 'SP0260', 'foret_caducifoliee', 'faune', 'Staphylin odorant', 'Ocypus olens', 'species',
    'Insectes', 'Staphylinidés', 'Prédateur de litière', 'Limaces, vers, débris',
    'Grand coléoptère noir de la litière, chasse les limaces.',
    'Il relève l’abdomen comme un scorpion, mais n’a pas de venin.',
    'https://fr.wikipedia.org/wiki/Ocypus_olens', 'actif', NOW(), NOW()
  UNION ALL SELECT 'SP0261', 'foret_caducifoliee', 'flore', 'Mycorhizes à Glomus', 'Glomus sp.', 'genus',
    'Champignons', 'Gloméromycètes', 'Symbiose racinaire', 'Sucres de la plante contre phosphore et eau',
    'Champignon du sol associé aux racines des herbacées — le pendant du Rhizobium, pour le phosphore.',
    'Invisible à l’œil nu, il forme un réseau entre plusieurs plantes.',
    'https://fr.wikipedia.org/wiki/Glomeromycota', 'actif', NOW(), NOW()
  UNION ALL SELECT 'SP0262', 'foret_caducifoliee', 'faune', 'Lombric commun', 'Lumbricus terrestris', 'species',
    'Annélides', 'Lumbricidés', 'Ingénieur du sol profond', 'Litière tirée dans les galeries',
    'Ver anécique à galeries verticales, distinct des vers rouges de compost.',
    'Ses turricules forment de petits tas sur le sentier le matin.',
    'https://fr.wikipedia.org/wiki/Lumbricus_terrestris', 'actif', NOW(), NOW()
  UNION ALL SELECT 'SP0263', 'foret_caducifoliee', 'flore', 'Sureau noir', 'Sambucus nigra', 'species',
    'Angiospermes', 'Adoxacées', 'Nectar, baies, litière', 'Autotrophe',
    'Arbuste de lisière : fleurs pour les butineurs, baies pour les merles.',
    'Les baies crues irritent ; les oiseaux, eux, les dispersent sans souci.',
    'https://fr.wikipedia.org/wiki/Sureau_noir', 'actif', NOW(), NOW()
  UNION ALL SELECT 'SP0264', 'foret_caducifoliee', 'flore', 'Pâquerette', 'Bellis perennis', 'species',
    'Angiospermes', 'Astéracées', 'Nectar de lisière', 'Autotrophe',
    'Petite fleur des ourlets et clairières, butinée presque toute l’année.',
    'Elle referme sa capitule dès que le ciel se couvre.',
    'https://fr.wikipedia.org/wiki/Pâquerette', 'actif', NOW(), NOW()
  UNION ALL SELECT 'SP0265', 'foret_caducifoliee', 'flore', 'Plantain lancéolé', 'Plantago lanceolata', 'species',
    'Angiospermes', 'Plantaginacées', 'Plante des sentiers', 'Autotrophe',
    'Rosette des chemins forestiers, nectar et litière fine.',
    'On le trouve pile là où les bottes ont tassé la terre.',
    'https://fr.wikipedia.org/wiki/Plantago_lanceolata', 'actif', NOW(), NOW()
  UNION ALL SELECT 'SP0266', 'foret_caducifoliee', 'flore', 'Violette des bois', 'Viola odorata', 'species',
    'Angiospermes', 'Violacées', 'Nectar précoce de lisière', 'Autotrophe',
    'Fleur de sous-bois et de haie, parfois dès la fin de l’hiver.',
    'Son parfum a donné son nom à une couleur.',
    'https://fr.wikipedia.org/wiki/Viola_odorata', 'actif', NOW(), NOW()
  UNION ALL SELECT 'SP0267', 'foret_caducifoliee', 'faune', 'Chrysope verte', 'Chrysoperla carnea', 'species',
    'Insectes', 'Chrysopidés', 'Auxiliaire', 'Larve : pucerons ; adulte : nectar',
    'La larve, « lion des pucerons », chasse dans le feuillage des lisières.',
    'L’adulte, tout vert, se pose le soir près des lampes.',
    'https://fr.wikipedia.org/wiki/Chrysoperla_carnea', 'actif', NOW(), NOW()
  UNION ALL SELECT 'SP0268', 'landes', 'faune', 'Daphnie', 'Daphnia magna', 'species',
    'Crustacés', 'Daphniidés', 'Filtreur des mares', 'Algues, bactéries, débris fins',
    'Puce d’eau des mares de lande : relie le plancton aux prédateurs.',
    'On voit son œil noir à travers le corps transparent.',
    'https://fr.wikipedia.org/wiki/Daphnia', 'actif', NOW(), NOW()
  UNION ALL SELECT 'SP0269', 'landes', 'faune', 'Libellule déprimée', 'Libellula depressa', 'species',
    'Insectes', 'Libellulidés', 'Prédateur de mare', 'Larve : daphnies, moustiques ; adulte : insectes volants',
    'Naïade sous l’eau, chasseresse au-dessus des mares de lande.',
    'L’adulte a l’abdomen aplati, bleu chez le mâle âgé.',
    'https://fr.wikipedia.org/wiki/Libellula_depressa', 'actif', NOW(), NOW()
  UNION ALL SELECT 'SP0270', 'landes', 'faune', 'Gerris', 'Gerris lacustris', 'species',
    'Insectes', 'Gerridés', 'Prédateur de surface', 'Insectes tombés, émergences de moustiques',
    'Patineur des mares de lande, chasse sur la pellicule d’eau.',
    'Ses pattes répartissent le poids : il ne perce pas la surface.',
    'https://fr.wikipedia.org/wiki/Gerris', 'actif', NOW(), NOW()
  UNION ALL SELECT 'SP0271', 'foret_mediterraneenne', 'faune', 'Pipistrelle commune', 'Pipistrellus pipistrellus', 'species',
    'Mammifères', 'Vespertilionidés', 'Insectivore nocturne', 'Moustiques, papillons de nuit',
    'Petite chauve-souris des garrigues et des villages, chasse au crépuscule.',
    'Elle se faufile dans une fissure de mur plus étroite qu’un pouce.',
    'https://fr.wikipedia.org/wiki/Pipistrelle_commune', 'actif', NOW(), NOW()
  UNION ALL SELECT 'SP0272', 'foret_caducifoliee', 'faune', 'Escargot des bois', 'Cepaea nemoralis', 'species',
    'Mollusques', 'Hélicidés', 'Herbivore / proie', 'Feuilles, débris',
    'Escargot de lisière, proie du carabe, du staphylin et du hérisson.',
    'Sa coquille porte des bandes dont le dessin varie d’un bois à l’autre.',
    'https://fr.wikipedia.org/wiki/Cepaea_nemoralis', 'actif', NOW(), NOW()
  UNION ALL SELECT 'SP0273', 'landes', 'faune', 'Moustique commun', 'Culex pipiens', 'species',
    'Insectes', 'Culicidés', 'Proie aérienne et aquatique', 'Larve filtreuse ; femelle hématophage',
    'Relie la mare (larves) au ciel (adultes chassés par hirondelle et pipistrelle).',
    'Sans mare stagnante, les prédateurs aériens doivent chercher plus loin.',
    'https://fr.wikipedia.org/wiki/Culex_pipiens', 'actif', NOW(), NOW()
  UNION ALL SELECT 'SP0274', 'foret_caducifoliee', 'faune', 'Puceron', 'Aphididae', 'family',
    'Insectes', 'Aphididés', 'Herbivore sucévore, proie d’auxiliaires', 'Sève',
    'Colonies sous les feuilles de lisière ; proie de la chrysope et du perce-oreille.',
    'Une colonie peut doubler en quelques jours si aucun prédateur n’arrive.',
    'https://fr.wikipedia.org/wiki/Aphididae', 'actif', NOW(), NOW()
) AS v
WHERE NOT EXISTS (SELECT 1 FROM gl_species g WHERE g.species_code = v.species_code);


INSERT INTO gl_species_interactions (from_species_id, to_species_id, interaction_type, description)
SELECT f.id, t.id, v.itype, v.descr
FROM (
  SELECT 'Merle noir' AS fname, 'Lombric commun' AS tname, 'predation' AS itype, 'Tire les lombrics après la pluie' AS descr
  UNION ALL SELECT 'Merle noir', 'Sureau noir', 'herbivorie', 'Baies de sureau en fin d’été'
  UNION ALL SELECT 'Carabe doré', 'Escargot des bois', 'predation', 'Chasse les escargots de litière'
  UNION ALL SELECT 'Staphylin odorant', 'Escargot des bois', 'predation', 'Chasseur de limaces et escargots'
  UNION ALL SELECT 'Hérisson commun', 'Lombric commun', 'predation', 'Régime nocturne : vers et escargots'
  UNION ALL SELECT 'Hérisson commun', 'Escargot des bois', 'predation', 'Ouvre les coquilles au bord des haies'
  UNION ALL SELECT 'Crapaud commun', 'Escargot des bois', 'predation', 'Chasse au sol près des mares'
  UNION ALL SELECT 'Crapaud commun', 'Moustique commun', 'predation', 'Insectes près de l’eau'
  UNION ALL SELECT 'Hirondelle rustique', 'Moustique commun', 'predation', 'Chasse aérienne diurne'
  UNION ALL SELECT 'Pipistrelle commune', 'Moustique commun', 'predation', 'Chasse aérienne nocturne'
  UNION ALL SELECT 'Perce-oreille', 'Puceron', 'predation', 'Complète son menu avec les pucerons'
  UNION ALL SELECT 'Chrysope verte', 'Puceron', 'predation', 'La larve dévore les colonies'
  UNION ALL SELECT 'Puceron', 'Sureau noir', 'herbivorie', 'Jeunes pousses'
  UNION ALL SELECT 'Puceron', 'Violette des bois', 'herbivorie', 'Feuilles tendres'
  UNION ALL SELECT 'Mycorhizes à Glomus', 'Violette des bois', 'symbiose', 'Réseau racinaire : phosphore contre sucres'
  UNION ALL SELECT 'Mycorhizes à Glomus', 'Pâquerette', 'symbiose', 'Herbacée mycorhizée'
  UNION ALL SELECT 'Mycorhizes à Glomus', 'Jacinthe des bois', 'symbiose', 'Bulbeuse de sous-bois associée aux Glomus'
  UNION ALL SELECT 'Mycorhizes à Glomus', 'Muguet', 'symbiose', 'Sous-bois : champignon et racines'
  UNION ALL SELECT 'Libellule déprimée', 'Daphnie', 'predation', 'La naïade chasse les daphnies'
  UNION ALL SELECT 'Libellule déprimée', 'Moustique commun', 'predation', 'Larves et adultes de moustiques'
  UNION ALL SELECT 'Libellule déprimée', 'Gerris', 'predation', 'Peut saisir un patineur trop proche'
  UNION ALL SELECT 'Gerris', 'Moustique commun', 'predation', 'Capture à la surface de la mare'
) AS v
JOIN gl_species f ON f.nom_commun = v.fname
JOIN gl_species t ON t.nom_commun = v.tname
WHERE NOT EXISTS (
  SELECT 1 FROM gl_species_interactions si
  WHERE si.from_species_id = f.id AND si.to_species_id = t.id AND si.interaction_type = v.itype
);
