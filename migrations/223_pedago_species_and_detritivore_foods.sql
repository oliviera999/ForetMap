-- Catalogue pédagogique : espèces manquantes du jardin + nourritures des détritivores.
-- Idempotent : INSERT … SELECT … WHERE NOT EXISTS (plants.name n’est pas UNIQUE).
-- Les liaisons se font par nom, jamais par id numérique (les ids varient selon les bases).
-- 219–222 sont déjà pris.
-- Chaque colonne du SELECT est aliasée : sinon MariaDB refuse les NULL / valeurs
-- homonymes (« Duplicate column name ») et la migration avale l’erreur 1060.

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
    'Moustique commun' AS name, '🦟' AS emoji,
    'Insecte à cycle aquatique : la larve vit dans l’eau stagnante, l’adulte vole. La femelle pique pour pondre.' AS description,
    'Culex' AS second_name, 'Culex pipiens' AS scientific_name, 'species' AS taxon_rank,
    'Animal (Métazoaires)' AS taxon_kingdom, 'Arthropodes' AS taxon_group,
    'Culicidés' AS taxon_family, 'Culex' AS taxon_genus,
    'les_deux' AS habitat_type, 'consommateur' AS trophic_role,
    'Mare, bac, eau stagnante, abords du jardin' AS habitat,
    'Larve filtreuse (matière organique, micro-organismes) ; femelle adulte hématophage' AS nutrition,
    'Proie des gambusies et d’autres prédateurs ; les gîtes larvaires relient mare et air' AS ecosystem_role,
    'Cosmopolite' AS geographic_origin,
    'Intérêt pédagogique (cycle larvaire) ; certaines espèces sont vectrices' AS human_utility,
    'https://commons.wikimedia.org/wiki/Special:FilePath/Culex_pipiens_01.jpg' AS photo,
    CAST(NULL AS CHAR) AS remark_1
  UNION ALL
  SELECT
    'Coccinelle à sept points', '🐞',
    'Coléoptère rouge à sept points noirs. Larve et adulte chassent les pucerons.',
    'Bête à bon Dieu', 'Coccinella septempunctata', 'species',
    'Animal (Métazoaires)', 'Arthropodes', 'Coccinellidés', 'Coccinella',
    'terrestre', 'consommateur',
    'Feuilles colonisées par les pucerons, haies, potager',
    'Prédateur de pucerons (larve et adulte)',
    'Auxiliaire du jardinier : régule les colonies de pucerons',
    'Paléarctique, largement introduit',
    'Lutte biologique contre les pucerons',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Coccinella_septempunctata_01.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Syrphe ceinturé', '🪰',
    'Mouche qui imite une guêpe (mimétisme). L’adulte butine ; la larve dévore les pucerons.',
    'Mouche des fleurs', 'Episyrphus balteatus', 'species',
    'Animal (Métazoaires)', 'Arthropodes', 'Syrphidés', 'Episyrphus',
    'terrestre', 'consommateur',
    'Fleurs du potager, colonies de pucerons',
    'Adulte nectarivore ; larve prédatrice de pucerons',
    'Double rôle : pollinisation et régulation des pucerons',
    'Cosmopolite (très commun en Europe)',
    'Auxiliaire et pollinisateur',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Episyrphus_balteatus_%28female%29.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Rhizobium', '🦠',
    'Bactérie du sol qui vit dans les nodosités des racines de légumineuses et fixe l’azote de l’air.',
    'Bactérie des nodosités', 'Rhizobium sp.', 'genus',
    'Bactérie (Eubactéries)', CAST(NULL AS CHAR), 'Rhizobiacées', 'Rhizobium',
    'terrestre', CAST(NULL AS CHAR),
    'Sol, racines de haricot, fève, pois',
    'Fixation de l’azote atmosphérique en échange de sucres de la plante',
    'Symbiose avec les Fabacées : enrichit le sol en azote assimilable',
    'Cosmopolite (sols)',
    'Engrais vert naturel des légumineuses',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Root_nodules.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Champignons de litière', '🍄',
    'Champignons qui se nourrissent de feuilles mortes et de bois tendre : ils minéralisent la matière organique.',
    'Saprophytes de litière', 'Fungi (saprophytes)', 'clade',
    'Champignon (Fungi)', CAST(NULL AS CHAR), CAST(NULL AS CHAR), CAST(NULL AS CHAR),
    'terrestre', 'decomposeur',
    'Litière, humus, bois mort tendre',
    'Matière organique morte (feuilles, bois, débris)',
    'Décomposeurs : transforment la litière en humus et sels minéraux',
    'Cosmopolite',
    'Recyclage de la matière ; certains sont comestibles, d’autres toxiques',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Coprinellus_disseminatus_G4.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Ortie dioïque', '🌿',
    'Plante urticante des sols riches en azote. Feuilles comestibles cuites ; base du purin d’ortie.',
    'Grande ortie', 'Urtica dioica', 'species',
    'Végétal (Chlorobiontes)', 'Angiosperme', 'Urticacées', 'Urtica',
    'terrestre', 'producteur',
    'Lisières, pieds de haie, sols azotés',
    'Autotrophe (photosynthèse)',
    'Bio-indicateur de sol riche ; plante-hôte de nombreux insectes ; fourrage de pucerons',
    'Eurasie, largement naturalisée',
    'Alimentation (feuilles cuites), purin, fibres',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Urtica_dioica_002.JPG',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Pissenlit', '🌼',
    'Rosette de feuilles dentées et capitule jaune. Fleur précoce, très visitée par les butineurs.',
    'Dent-de-lion', 'Taraxacum officinale', 'species',
    'Végétal (Chlorobiontes)', 'Angiosperme', 'Astéracées', 'Taraxacum',
    'terrestre', 'producteur',
    'Pelouses, allées, sols ouverts',
    'Autotrophe (photosynthèse)',
    'Ressource nectarifère précoce ; feuilles et racines comestibles',
    'Hémisphère nord',
    'Alimentation (feuilles, fleurs), infusion de racines',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Taraxacum_officinale_flower.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Collembole', '🪲',
    'Très petit hexapode sauteur de la litière. Il broute biofilms, hyphae et débris : un maillon discret du sol.',
    'Puce des litières', 'Collembola', 'clade',
    'Animal (Métazoaires)', 'Arthropodes', CAST(NULL AS CHAR), CAST(NULL AS CHAR),
    'terrestre', 'decomposeur',
    'Litière humide, compost de surface, sous les pots',
    'Détritivore / mycophage (litière, champignons, biofilms)',
    'Fragmente la litière et disperse les spores de champignons',
    'Cosmopolite',
    'Indicateur de sol vivant ; parfois nombreux dans les pots d’intérieur',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Orchesella_cincta.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Escargot petit-gris', '🐌',
    'Gastéropode terrestre à coquille spiralée. Mange feuilles tendres et parfois débris humides.',
    'Petit-gris', 'Cornu aspersum', 'species',
    'Animal (Métazoaires)', 'Gastéropode', 'Hélicidés', 'Cornu',
    'terrestre', 'consommateur',
    'Haies, tas de bois, potager humide',
    'Herbivore (feuilles) et occasionnellement détritivore',
    'Consommateur de plantes tendres ; proie des oiseaux et hérissons',
    'Méditerranée, largement introduit',
    'Comestible (élevage) ; ravageur au potager si trop nombreux',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Cornu_aspersum_01.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Litière de feuilles', '🍂',
    'Tapis de feuilles mortes au sol : point de départ de la chaîne détritique du jardin.',
    'Feuilles mortes', CAST(NULL AS CHAR), CAST(NULL AS CHAR),
    CAST(NULL AS CHAR), CAST(NULL AS CHAR), CAST(NULL AS CHAR), CAST(NULL AS CHAR),
    'terrestre', CAST(NULL AS CHAR),
    'Sous les arbres, haies, allées peu ratissées',
    CAST(NULL AS CHAR),
    'Matière organique morte : nourrit vers, cloportes, collemboles et champignons',
    CAST(NULL AS CHAR),
    'Exemple de nourriture pour le réseau trophique (ce n’est pas une espèce)',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Leaf_litter.jpg',
    'Fiche-ressource pédagogique : nourriture des détritivores, pas un être vivant nommé.'
  UNION ALL
  SELECT
    'Compost et épluchures', '🪣',
    'Déchets de cuisine et de jardin en tas ou en bac : épluchures, marc, tontes, feuilles.',
    'Déchets de compost', CAST(NULL AS CHAR), CAST(NULL AS CHAR),
    CAST(NULL AS CHAR), CAST(NULL AS CHAR), CAST(NULL AS CHAR), CAST(NULL AS CHAR),
    'terrestre', CAST(NULL AS CHAR),
    'Composteur, lombricomposteur, tas',
    CAST(NULL AS CHAR),
    'Nourriture principale du ver de lombricompost, des blattes et de nombreux détritivores',
    CAST(NULL AS CHAR),
    'Exemple de nourriture pour le réseau trophique (ce n’est pas une espèce)',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Compost.jpg',
    'Fiche-ressource pédagogique : nourriture des détritivores, pas un être vivant nommé.'
  UNION ALL
  SELECT
    'Bois mort', '🪵',
    'Branches, souches et planches qui pourrissent : habitat et nourriture d’une faune spécialisée.',
    'Bois en décomposition', CAST(NULL AS CHAR), CAST(NULL AS CHAR),
    CAST(NULL AS CHAR), CAST(NULL AS CHAR), CAST(NULL AS CHAR), CAST(NULL AS CHAR),
    'terrestre', CAST(NULL AS CHAR),
    'Tas de bois, haies sèches, souches',
    CAST(NULL AS CHAR),
    'Nourrit champignons, cloportes, certains vers ; abri pour de nombreux invertébrés',
    CAST(NULL AS CHAR),
    'Exemple de nourriture pour le réseau trophique (ce n’est pas une espèce)',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Deadwood_in_a_forest.jpg',
    'Fiche-ressource pédagogique : nourriture des détritivores, pas un être vivant nommé.'
  UNION ALL
  SELECT
    'Biofilm', '🫧',
    'Fine pellicule vivante sur les parois, les feuilles immergées et les galets : algues, bactéries, débris.',
    'Périphyton', CAST(NULL AS CHAR), CAST(NULL AS CHAR),
    CAST(NULL AS CHAR), CAST(NULL AS CHAR), CAST(NULL AS CHAR), CAST(NULL AS CHAR),
    'aquatique', CAST(NULL AS CHAR),
    'Parois de bac, feuilles de plantes aquatiques, galets',
    CAST(NULL AS CHAR),
    'Nourriture principale des escargots d’eau (planorbe, limnée)',
    CAST(NULL AS CHAR),
    'Exemple de nourriture pour le réseau trophique (ce n’est pas une espèce)',
    CAST(NULL AS CHAR),
    'Fiche-ressource pédagogique : nourriture des détritivores, pas un être vivant nommé.'
  UNION ALL
  SELECT
    'Fruits et légumes tombés', '🍎',
    'Fruits au sol, légumes oubliés, parties ramollies : sucre et cellulose pour fourmis, blattes, vers.',
    'Fruits au sol', CAST(NULL AS CHAR), CAST(NULL AS CHAR),
    CAST(NULL AS CHAR), CAST(NULL AS CHAR), CAST(NULL AS CHAR), CAST(NULL AS CHAR),
    'terrestre', CAST(NULL AS CHAR),
    'Verger, allées, pied des plants',
    CAST(NULL AS CHAR),
    'Nourriture opportuniste des omnivores et détritivores du jardin',
    CAST(NULL AS CHAR),
    'Exemple de nourriture pour le réseau trophique (ce n’est pas une espèce)',
    CAST(NULL AS CHAR),
    'Fiche-ressource pédagogique : nourriture des détritivores, pas un être vivant nommé.'
  UNION ALL
  SELECT
    'Carton de lombricompost', '📦',
    'Carton brun déchiré, humidifié : carbone pour équilibrer les épluchures dans un lombricomposteur de classe.',
    'Litière carbonée', CAST(NULL AS CHAR), CAST(NULL AS CHAR),
    CAST(NULL AS CHAR), CAST(NULL AS CHAR), CAST(NULL AS CHAR), CAST(NULL AS CHAR),
    'terrestre', CAST(NULL AS CHAR),
    'Lombricomposteur (salle de classe, composteur d’appartement)',
    CAST(NULL AS CHAR),
    'Nourriture et abri du ver de lombricompost ; apporte le carbone du mélange',
    CAST(NULL AS CHAR),
    'Exemple de nourriture pour le réseau trophique (ce n’est pas une espèce)',
    CAST(NULL AS CHAR),
    'Fiche-ressource pédagogique : nourriture des détritivores, pas un être vivant nommé.'
  UNION ALL
  SELECT
    'Crottes et fientes', '🟤',
    'Déjections d’animaux du jardin ou d’élevage : matière déjà partiellement digérée, très recherchée par les vers.',
    'Bouses, crottes, fientes', CAST(NULL AS CHAR), CAST(NULL AS CHAR),
    CAST(NULL AS CHAR), CAST(NULL AS CHAR), CAST(NULL AS CHAR), CAST(NULL AS CHAR),
    'terrestre', CAST(NULL AS CHAR),
    'Prairie, poulailler, sol du potager',
    CAST(NULL AS CHAR),
    'Nourriture des vers de terre géophages ; relance le cycle de l’azote et du carbone',
    CAST(NULL AS CHAR),
    'Exemple de nourriture pour le réseau trophique (ce n’est pas une espèce)',
    CAST(NULL AS CHAR),
    'Fiche-ressource pédagogique : nourriture des détritivores, pas un être vivant nommé.'
) AS v
WHERE NOT EXISTS (SELECT 1 FROM plants p WHERE p.name = v.name);

INSERT IGNORE INTO plant_name_aliases (alias, plant_id)
SELECT 'Moustique', id FROM plants WHERE name = 'Moustique commun' LIMIT 1;
INSERT IGNORE INTO plant_name_aliases (alias, plant_id)
SELECT 'Coccinelle', id FROM plants WHERE name = 'Coccinelle à sept points' LIMIT 1;
INSERT IGNORE INTO plant_name_aliases (alias, plant_id)
SELECT 'Syrphe', id FROM plants WHERE name = 'Syrphe ceinturé' LIMIT 1;
INSERT IGNORE INTO plant_name_aliases (alias, plant_id)
SELECT 'Ortie', id FROM plants WHERE name = 'Ortie dioïque' LIMIT 1;
INSERT IGNORE INTO plant_name_aliases (alias, plant_id)
SELECT 'Dent-de-lion', id FROM plants WHERE name = 'Pissenlit' LIMIT 1;
INSERT IGNORE INTO plant_name_aliases (alias, plant_id)
SELECT 'Petit-gris', id FROM plants WHERE name = 'Escargot petit-gris' LIMIT 1;
INSERT IGNORE INTO plant_name_aliases (alias, plant_id)
SELECT 'Feuilles mortes', id FROM plants WHERE name = 'Litière de feuilles' LIMIT 1;
INSERT IGNORE INTO plant_name_aliases (alias, plant_id)
SELECT 'Épluchures', id FROM plants WHERE name = 'Compost et épluchures' LIMIT 1;

UPDATE species_interactions si
INNER JOIN plants f ON f.id = si.from_plant_id
INNER JOIN plants t ON t.name = 'Moustique commun'
SET si.to_plant_id = t.id,
    si.description = 'Larves de moustiques consommées par la gambusie'
WHERE f.name = 'Gambusie'
  AND si.interaction_type = 'predation'
  AND si.to_plant_id IS NULL;

UPDATE species_interactions si
INNER JOIN plants f ON f.id = si.from_plant_id
INNER JOIN plants t ON t.name = 'Litière de feuilles'
SET si.to_plant_id = t.id,
    si.description = 'Fragmente et ingère la litière de feuilles'
WHERE f.name = 'Cloporte'
  AND si.interaction_type = 'decomposition'
  AND si.to_plant_id IS NULL;

UPDATE species_interactions si
INNER JOIN plants f ON f.id = si.from_plant_id
INNER JOIN plants t ON t.name = 'Compost et épluchures'
SET si.to_plant_id = t.id,
    si.description = 'Digère les épluchures et déchets du lombricomposteur'
WHERE f.name = 'Ver de lombricompost'
  AND si.interaction_type = 'decomposition'
  AND si.to_plant_id IS NULL;

UPDATE species_interactions si
INNER JOIN plants f ON f.id = si.from_plant_id
INNER JOIN plants t ON t.name = 'Litière de feuilles'
SET si.to_plant_id = t.id,
    si.description = 'Incorpore la litière au sol et la transforme en humus'
WHERE f.name = 'Vers de terre'
  AND si.interaction_type = 'decomposition'
  AND si.to_plant_id IS NULL;

INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
SELECT f.id, t.id, 'predation', 'Larves de moustiques consommées par la gambusie'
FROM plants f JOIN plants t ON t.name = 'Moustique commun'
WHERE f.name = 'Gambusie'
  AND NOT EXISTS (
    SELECT 1 FROM species_interactions si
    WHERE si.from_plant_id = f.id AND si.to_plant_id = t.id AND si.interaction_type = 'predation'
  );

INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
SELECT f.id, t.id, 'predation', 'Adulte et larve dévorent les colonies de pucerons'
FROM plants f JOIN plants t ON t.name = 'Puceron'
WHERE f.name = 'Coccinelle à sept points'
  AND NOT EXISTS (
    SELECT 1 FROM species_interactions si
    WHERE si.from_plant_id = f.id AND si.to_plant_id = t.id AND si.interaction_type = 'predation'
  );

INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
SELECT f.id, t.id, 'predation', 'La larve du syrphe est un prédateur vorace de pucerons'
FROM plants f JOIN plants t ON t.name = 'Puceron'
WHERE f.name = 'Syrphe ceinturé'
  AND NOT EXISTS (
    SELECT 1 FROM species_interactions si
    WHERE si.from_plant_id = f.id AND si.to_plant_id = t.id AND si.interaction_type = 'predation'
  );

INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
SELECT f.id, t.id, 'pollinisation', 'L’adulte butine ; pollinisation accessoire'
FROM plants f JOIN plants t ON t.name = 'Pissenlit'
WHERE f.name = 'Syrphe ceinturé'
  AND NOT EXISTS (
    SELECT 1 FROM species_interactions si
    WHERE si.from_plant_id = f.id AND si.to_plant_id = t.id AND si.interaction_type = 'pollinisation'
  );

INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
SELECT f.id, t.id, 'pollinisation', 'Floraison précoce, très visitée par les abeilles'
FROM plants f JOIN plants t ON t.name = 'Pissenlit'
WHERE f.name = 'Abeille'
  AND NOT EXISTS (
    SELECT 1 FROM species_interactions si
    WHERE si.from_plant_id = f.id AND si.to_plant_id = t.id AND si.interaction_type = 'pollinisation'
  );

INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
SELECT f.id, t.id, 'herbivorie', 'Colonies fréquentes sous les feuilles d’ortie'
FROM plants f JOIN plants t ON t.name = 'Ortie dioïque'
WHERE f.name = 'Puceron'
  AND NOT EXISTS (
    SELECT 1 FROM species_interactions si
    WHERE si.from_plant_id = f.id AND si.to_plant_id = t.id AND si.interaction_type = 'herbivorie'
  );

INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
SELECT f.id, t.id, 'herbivorie', 'Broute les feuilles tendres de laitue'
FROM plants f JOIN plants t ON t.name = 'Laitue'
WHERE f.name = 'Escargot petit-gris'
  AND NOT EXISTS (
    SELECT 1 FROM species_interactions si
    WHERE si.from_plant_id = f.id AND si.to_plant_id = t.id AND si.interaction_type = 'herbivorie'
  );

INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
SELECT f.id, t.id, 'herbivorie', 'Broute les jeunes feuilles de chou'
FROM plants f JOIN plants t ON t.name = 'Chou'
WHERE f.name = 'Escargot petit-gris'
  AND NOT EXISTS (
    SELECT 1 FROM species_interactions si
    WHERE si.from_plant_id = f.id AND si.to_plant_id = t.id AND si.interaction_type = 'herbivorie'
  );

INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
SELECT f.id, t.id, 'decomposition', 'Mange aussi les débris humides de la litière'
FROM plants f JOIN plants t ON t.name = 'Litière de feuilles'
WHERE f.name = 'Escargot petit-gris'
  AND NOT EXISTS (
    SELECT 1 FROM species_interactions si
    WHERE si.from_plant_id = f.id AND si.to_plant_id = t.id AND si.interaction_type = 'decomposition'
  );

INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
SELECT f.id, t.id, 'symbiose', 'Nodosités : la bactérie fixe l’azote, le haricot fournit des sucres'
FROM plants f JOIN plants t ON t.name = 'Haricot'
WHERE f.name = 'Rhizobium'
  AND NOT EXISTS (
    SELECT 1 FROM species_interactions si
    WHERE si.from_plant_id = f.id AND si.to_plant_id = t.id AND si.interaction_type = 'symbiose'
  );

INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
SELECT f.id, t.id, 'symbiose', 'Nodosités : la bactérie fixe l’azote, la fève fournit des sucres'
FROM plants f JOIN plants t ON t.name = 'Fève'
WHERE f.name = 'Rhizobium'
  AND NOT EXISTS (
    SELECT 1 FROM species_interactions si
    WHERE si.from_plant_id = f.id AND si.to_plant_id = t.id AND si.interaction_type = 'symbiose'
  );

INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
SELECT f.id, t.id, 'symbiose', 'Nodosités : la bactérie fixe l’azote, le pois fournit des sucres'
FROM plants f JOIN plants t ON t.name = 'Petit pois'
WHERE f.name = 'Rhizobium'
  AND NOT EXISTS (
    SELECT 1 FROM species_interactions si
    WHERE si.from_plant_id = f.id AND si.to_plant_id = t.id AND si.interaction_type = 'symbiose'
  );

INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
SELECT f.id, t.id, 'decomposition', 'Minéralise les feuilles mortes'
FROM plants f JOIN plants t ON t.name = 'Litière de feuilles'
WHERE f.name = 'Champignons de litière'
  AND NOT EXISTS (
    SELECT 1 FROM species_interactions si
    WHERE si.from_plant_id = f.id AND si.to_plant_id = t.id AND si.interaction_type = 'decomposition'
  );

INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
SELECT f.id, t.id, 'decomposition', 'Dégrade le bois mort tendre'
FROM plants f JOIN plants t ON t.name = 'Bois mort'
WHERE f.name = 'Champignons de litière'
  AND NOT EXISTS (
    SELECT 1 FROM species_interactions si
    WHERE si.from_plant_id = f.id AND si.to_plant_id = t.id AND si.interaction_type = 'decomposition'
  );

INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
SELECT f.id, t.id, 'decomposition', 'Fragmente et ingère la litière de feuilles'
FROM plants f JOIN plants t ON t.name = 'Litière de feuilles'
WHERE f.name = 'Cloporte'
  AND NOT EXISTS (
    SELECT 1 FROM species_interactions si
    WHERE si.from_plant_id = f.id AND si.to_plant_id = t.id AND si.interaction_type = 'decomposition'
  );

INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
SELECT f.id, t.id, 'decomposition', 'Racle le bois mort humide'
FROM plants f JOIN plants t ON t.name = 'Bois mort'
WHERE f.name = 'Cloporte'
  AND NOT EXISTS (
    SELECT 1 FROM species_interactions si
    WHERE si.from_plant_id = f.id AND si.to_plant_id = t.id AND si.interaction_type = 'decomposition'
  );

INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
SELECT f.id, t.id, 'decomposition', 'Fréquente aussi le compost de surface'
FROM plants f JOIN plants t ON t.name = 'Compost et épluchures'
WHERE f.name = 'Cloporte'
  AND NOT EXISTS (
    SELECT 1 FROM species_interactions si
    WHERE si.from_plant_id = f.id AND si.to_plant_id = t.id AND si.interaction_type = 'decomposition'
  );

INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
SELECT f.id, t.id, 'decomposition', 'Digère les épluchures et déchets du lombricomposteur'
FROM plants f JOIN plants t ON t.name = 'Compost et épluchures'
WHERE f.name = 'Ver de lombricompost'
  AND NOT EXISTS (
    SELECT 1 FROM species_interactions si
    WHERE si.from_plant_id = f.id AND si.to_plant_id = t.id AND si.interaction_type = 'decomposition'
  );

INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
SELECT f.id, t.id, 'decomposition', 'Mange le carton humidifié (apport de carbone)'
FROM plants f JOIN plants t ON t.name = 'Carton de lombricompost'
WHERE f.name = 'Ver de lombricompost'
  AND NOT EXISTS (
    SELECT 1 FROM species_interactions si
    WHERE si.from_plant_id = f.id AND si.to_plant_id = t.id AND si.interaction_type = 'decomposition'
  );

INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
SELECT f.id, t.id, 'decomposition', 'Accepte les fruits et légumes ramollis'
FROM plants f JOIN plants t ON t.name = 'Fruits et légumes tombés'
WHERE f.name = 'Ver de lombricompost'
  AND NOT EXISTS (
    SELECT 1 FROM species_interactions si
    WHERE si.from_plant_id = f.id AND si.to_plant_id = t.id AND si.interaction_type = 'decomposition'
  );

INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
SELECT f.id, t.id, 'decomposition', 'Incorpore la litière au sol et la transforme en humus'
FROM plants f JOIN plants t ON t.name = 'Litière de feuilles'
WHERE f.name = 'Vers de terre'
  AND NOT EXISTS (
    SELECT 1 FROM species_interactions si
    WHERE si.from_plant_id = f.id AND si.to_plant_id = t.id AND si.interaction_type = 'decomposition'
  );

INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
SELECT f.id, t.id, 'decomposition', 'Mélange le compost au sol'
FROM plants f JOIN plants t ON t.name = 'Compost et épluchures'
WHERE f.name = 'Vers de terre'
  AND NOT EXISTS (
    SELECT 1 FROM species_interactions si
    WHERE si.from_plant_id = f.id AND si.to_plant_id = t.id AND si.interaction_type = 'decomposition'
  );

INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
SELECT f.id, t.id, 'decomposition', 'Ingère les déjections et les transforme en turricules'
FROM plants f JOIN plants t ON t.name = 'Crottes et fientes'
WHERE f.name = 'Vers de terre'
  AND NOT EXISTS (
    SELECT 1 FROM species_interactions si
    WHERE si.from_plant_id = f.id AND si.to_plant_id = t.id AND si.interaction_type = 'decomposition'
  );

INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
SELECT f.id, t.id, 'decomposition', 'Explore le bois mort très dégradé'
FROM plants f JOIN plants t ON t.name = 'Bois mort'
WHERE f.name = 'Vers de terre'
  AND NOT EXISTS (
    SELECT 1 FROM species_interactions si
    WHERE si.from_plant_id = f.id AND si.to_plant_id = t.id AND si.interaction_type = 'decomposition'
  );

INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
SELECT f.id, t.id, 'decomposition', 'Racle le biofilm des parois et des feuilles immergées'
FROM plants f JOIN plants t ON t.name = 'Biofilm'
WHERE f.name = 'Planorbe'
  AND NOT EXISTS (
    SELECT 1 FROM species_interactions si
    WHERE si.from_plant_id = f.id AND si.to_plant_id = t.id AND si.interaction_type = 'decomposition'
  );

INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
SELECT f.id, t.id, 'decomposition', 'Racle le biofilm ; complète parfois par des débris végétaux'
FROM plants f JOIN plants t ON t.name = 'Biofilm'
WHERE f.name = 'Limnée'
  AND NOT EXISTS (
    SELECT 1 FROM species_interactions si
    WHERE si.from_plant_id = f.id AND si.to_plant_id = t.id AND si.interaction_type = 'decomposition'
  );

INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
SELECT f.id, t.id, 'decomposition', 'Récolte les sucres des fruits tombés'
FROM plants f JOIN plants t ON t.name = 'Fruits et légumes tombés'
WHERE f.name = 'Fourmi'
  AND NOT EXISTS (
    SELECT 1 FROM species_interactions si
    WHERE si.from_plant_id = f.id AND si.to_plant_id = t.id AND si.interaction_type = 'decomposition'
  );

INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
SELECT f.id, t.id, 'decomposition', 'Emporte de petits débris du compost'
FROM plants f JOIN plants t ON t.name = 'Compost et épluchures'
WHERE f.name = 'Fourmi'
  AND NOT EXISTS (
    SELECT 1 FROM species_interactions si
    WHERE si.from_plant_id = f.id AND si.to_plant_id = t.id AND si.interaction_type = 'decomposition'
  );

INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
SELECT f.id, t.id, 'decomposition', 'Omnivore nocturne des déchets du compost'
FROM plants f JOIN plants t ON t.name = 'Compost et épluchures'
WHERE f.name = 'Blatte germanique'
  AND NOT EXISTS (
    SELECT 1 FROM species_interactions si
    WHERE si.from_plant_id = f.id AND si.to_plant_id = t.id AND si.interaction_type = 'decomposition'
  );

INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
SELECT f.id, t.id, 'decomposition', 'Fouille les fruits et légumes ramollis'
FROM plants f JOIN plants t ON t.name = 'Fruits et légumes tombés'
WHERE f.name = 'Blatte germanique'
  AND NOT EXISTS (
    SELECT 1 FROM species_interactions si
    WHERE si.from_plant_id = f.id AND si.to_plant_id = t.id AND si.interaction_type = 'decomposition'
  );

INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
SELECT f.id, t.id, 'decomposition', 'Broute la litière fine et les biofilms du sol'
FROM plants f JOIN plants t ON t.name = 'Litière de feuilles'
WHERE f.name = 'Collembole'
  AND NOT EXISTS (
    SELECT 1 FROM species_interactions si
    WHERE si.from_plant_id = f.id AND si.to_plant_id = t.id AND si.interaction_type = 'decomposition'
  );

INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
SELECT f.id, t.id, 'decomposition', 'Mycophage : broute les hyphes des champignons de litière'
FROM plants f JOIN plants t ON t.name = 'Champignons de litière'
WHERE f.name = 'Collembole'
  AND NOT EXISTS (
    SELECT 1 FROM species_interactions si
    WHERE si.from_plant_id = f.id AND si.to_plant_id = t.id AND si.interaction_type = 'decomposition'
  );

INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
SELECT f.id, t.id, 'decomposition', 'Fréquente aussi la surface du compost humide'
FROM plants f JOIN plants t ON t.name = 'Compost et épluchures'
WHERE f.name = 'Collembole'
  AND NOT EXISTS (
    SELECT 1 FROM species_interactions si
    WHERE si.from_plant_id = f.id AND si.to_plant_id = t.id AND si.interaction_type = 'decomposition'
  );
