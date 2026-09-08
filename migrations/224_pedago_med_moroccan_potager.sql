-- Espèces méditerranéennes, marocaines et de potager.
-- Figuier de Barbarie et volubilis sont nouveaux ; le tillandsia existe déjà
-- (« Tillandsia aérienne ») : on ajoute seulement des alias de recherche.
-- Idempotent, liaisons par nom. Chaque colonne du SELECT est aliasée (MariaDB).

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
    'Figuier de Barbarie' AS name, '🌵' AS emoji,
    'Cactus à raquettes (cladodes) portant des figues orangées. Haies, talus et jardins du Maghreb. Distinct de l’oponce ornementale déjà au catalogue.' AS description,
    'Nopal, figue de Barbarie' AS second_name, 'Opuntia ficus-indica' AS scientific_name, 'species' AS taxon_rank,
    'Végétal (Chlorobiontes)' AS taxon_kingdom, 'Angiosperme' AS taxon_group,
    'Cactacées' AS taxon_family, 'Opuntia' AS taxon_genus,
    'terrestre' AS habitat_type, 'producteur' AS trophic_role,
    'Haies, talus secs, jardins méditerranéens' AS habitat,
    'Autotrophe (photosynthèse CAM)' AS nutrition,
    'Haie vive, fruit, fourrage ; hôte de la cochenille de la figue de Barbarie' AS ecosystem_role,
    'Mexique, naturalisé au Maghreb et en Méditerranée' AS geographic_origin,
    'Alimentation (raquettes jeunes, fruits), clôture vivante' AS human_utility,
    'https://commons.wikimedia.org/wiki/Special:FilePath/Opuntia_ficus-indica_fruit.jpg' AS photo,
    CAST(NULL AS CHAR) AS remark_1
  UNION ALL
  SELECT
    'Volubilis', '🌸',
    'Liane volubile à grandes fleurs en entonnoir, souvent bleues ou violettes. Très plantée sur les murs et pergolas du Maroc.',
    'Ipomée', 'Ipomoea indica', 'species',
    'Végétal (Chlorobiontes)', 'Angiosperme', 'Convolvulacées', 'Ipomoea',
    'terrestre', 'producteur',
    'Murs, grilles, pergolas, lisières de jardin',
    'Autotrophe (photosynthèse)',
    'Grimpante mellifère ; peut devenir envahissante si on la laisse grainer',
    'Régions tropicales, largement naturalisée en Méditerranée et au Maghreb',
    'Ornement, ombrage léger, nectar pour butineurs',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Ipomoea_indica_1.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Figuier commun', '🌳',
    'Arbre au latex blanc, grandes feuilles lobées, figues charnues. Arbre fruitier emblématique des cours et terrasses.',
    'Figue', 'Ficus carica', 'species',
    'Végétal (Chlorobiontes)', 'Angiosperme', 'Moracées', 'Ficus',
    'terrestre', 'producteur',
    'Cours, vergers, pieds de murs chauds',
    'Autotrophe (photosynthèse)',
    'Fruit, ombre, litière ; les figues tombées nourrissent oiseaux et fourmis',
    'Bassin méditerranéen, Asie occidentale',
    'Alimentation (figues fraîches ou séchées), ombrage',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Ficus_carica_fruit.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Olivier', '🫒',
    'Arbre sempervirent au tronc noueux, feuilles gris-vert, olives. Paysage agricole du Maroc et de toute la Méditerranée.',
    'Olive', 'Olea europaea', 'species',
    'Végétal (Chlorobiontes)', 'Angiosperme', 'Oléacées', 'Olea',
    'terrestre', 'producteur',
    'Oliveraies, jardins, sols drainés et ensoleillés',
    'Autotrophe (photosynthèse)',
    'Culture emblématique ; hôte de la cigale ; floraison visitée par les abeilles',
    'Bassin méditerranéen',
    'Huile, olives de table, bois',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Olea_europaea_olives.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Caroubier', '🌳',
    'Grand arbre à gousses brunes sucrées (caroubes). Ombrage des places et des champs du Maghreb.',
    'Caroube', 'Ceratonia siliqua', 'species',
    'Végétal (Chlorobiontes)', 'Angiosperme', 'Fabacées', 'Ceratonia',
    'terrestre', 'producteur',
    'Champs, bords de route, jardins secs',
    'Autotrophe (photosynthèse)',
    'Ombre, fourrage, gousses comestibles ; Fabacée sans nodosités classiques à Rhizobium',
    'Méditerranée orientale, naturalisé au Maghreb',
    'Alimentation (poudre de caroube), fourrage, ombrage',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Ceratonia_siliqua_fruit.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Arganier', '🌳',
    'Arbre épineux endémique du sud-ouest marocain. Fruits à amande oléagineuse, souvent associés aux chèvres dans les branches.',
    'Argane', 'Argania spinosa', 'species',
    'Végétal (Chlorobiontes)', 'Angiosperme', 'Sapotacées', 'Argania',
    'terrestre', 'producteur',
    'Arganeraie (Souss, Essaouira), sols arides',
    'Autotrophe (photosynthèse)',
    'Forêt claire endémique du Maroc ; sol, ombre, huile',
    'Maroc (endémique du Sud-Ouest)',
    'Huile d’argan (alimentaire et cosmétique), bois, fourrage',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Argania_spinosa_MHNT.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Citronnier', '🍋',
    'Petit agrume sempervirent, fleurs blanches parfumées, fruits jaunes. Cour, patio et potager irrigué.',
    'Citron', 'Citrus limon', 'species',
    'Végétal (Chlorobiontes)', 'Angiosperme', 'Rutacées', 'Citrus',
    'terrestre', 'producteur',
    'Cours, serres, potagers irrigués',
    'Autotrophe (photosynthèse)',
    'Floraison très mellifère ; fruit ; parfois pucerons sur les jeunes pousses',
    'Asie, cultivé en Méditerranée et au Maghreb',
    'Alimentation (fruit, zestes), parfum, ornement',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Lemon_tree_with_fruit.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Palmier-dattier', '🌴',
    'Grand palmier dioïque aux régimes de dattes. Oasis, jardins et alignements du Maroc.',
    'Dattier', 'Phoenix dactylifera', 'species',
    'Végétal (Chlorobiontes)', 'Angiosperme', 'Arécacées', 'Phoenix',
    'terrestre', 'producteur',
    'Oasis, jardins, alignements',
    'Autotrophe (photosynthèse)',
    'Ombre d’oasis, fruits ; pollinisation surtout par le vent, parfois aidée à la main',
    'Afrique du Nord, Moyen-Orient',
    'Alimentation (dattes), ombrage, vannerie',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Phoenix_dactylifera_dates.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Artichaut', '🥬',
    'Grande composée aux capitules charnus. Légume d’hiver et de printemps des potagers maghrébins et méditerranéens.',
    'Cynara', 'Cynara cardunculus', 'species',
    'Végétal (Chlorobiontes)', 'Angiosperme', 'Astéracées', 'Cynara',
    'terrestre', 'producteur',
    'Potager, sols riches et frais',
    'Autotrophe (photosynthèse)',
    'Légume ; floraison mellifère si on laisse monter un capitule',
    'Bassin méditerranéen',
    'Alimentation (capitules), ornement',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Cynara_cardunculus_artichoke.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Pois chiche', '🫘',
    'Légumineuse à gousses courtes et graines rondelettes. Base de nombreux plats du Maghreb (couscous, hummus, tajines).',
    'Chiche', 'Cicer arietinum', 'species',
    'Végétal (Chlorobiontes)', 'Angiosperme', 'Fabacées', 'Cicer',
    'terrestre', 'producteur',
    'Potager, champs de secano',
    'Autotrophe + fixation d’azote (symbiose Rhizobium)',
    'Engrais vert et aliment ; nodosités à Rhizobium',
    'Proche-Orient, largement cultivé au Maghreb',
    'Alimentation (graines sèches), engrais vert',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Cicer_arietinum_flowers.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Fenugrec', '🌿',
    'Petite légumineuse aux feuilles trifoliolées et à l’odeur de curry. Épice et fourrage du potager marocain (helba).',
    'Helba', 'Trigonella foenum-graecum', 'species',
    'Végétal (Chlorobiontes)', 'Angiosperme', 'Fabacées', 'Trigonella',
    'terrestre', 'producteur',
    'Potager, planches de printemps',
    'Autotrophe + fixation d’azote (symbiose Rhizobium)',
    'Aromate, fourrage, nodosités',
    'Méditerranée orientale, très cultivé au Maghreb',
    'Alimentation (graines, germes), tisane, engrais vert',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Trigonella_foenum-graecum.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Lavande', '💜',
    'Sous-arbrisseau gris, épis violets très parfumés. Haies basses des jardins secs ; la lavande dentée est fréquente au Maghreb.',
    'Lavande dentée', 'Lavandula dentata', 'species',
    'Végétal (Chlorobiontes)', 'Angiosperme', 'Lamiacées', 'Lavandula',
    'terrestre', 'producteur',
    'Rocailles, bordures ensoleillées, sols drainés',
    'Autotrophe (photosynthèse)',
    'Très mellifère ; insectifuge discret',
    'Méditerranée occidentale, Maghreb',
    'Parfum, infusion, ornement, miel',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Lavandula_dentata.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Bougainvillier', '🌺',
    'Grimpante épineuse aux bractées rose vif, magenta ou orange. Façades et riads du Maroc.',
    'Bougainvillée', 'Bougainvillea glabra', 'species',
    'Végétal (Chlorobiontes)', 'Angiosperme', 'Nyctaginacées', 'Bougainvillea',
    'terrestre', 'producteur',
    'Murs, pergolas, cours ensoleillées',
    'Autotrophe (photosynthèse)',
    'Ornement ; les vraies fleurs sont petites, au milieu des bractées colorées',
    'Amérique du Sud, naturalisée en Méditerranée et au Maghreb',
    'Ornement, ombrage de façade',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Bougainvillea_glabra.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Jasmin', '🌼',
    'Liane ou arbuste aux fleurs blanches très parfumées, surtout le soir. Balcons et cours du Maghreb.',
    'Jasmin d’Espagne', 'Jasminum grandiflorum', 'species',
    'Végétal (Chlorobiontes)', 'Angiosperme', 'Oléacées', 'Jasminum',
    'terrestre', 'producteur',
    'Murs, treilles, pots de cour',
    'Autotrophe (photosynthèse)',
    'Mellifère nocturne et diurne ; parfum',
    'Himalaya / Arabie, cultivé en Méditerranée et au Maroc',
    'Parfum, ornement, eau de jasmin',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Jasminum_grandiflorum.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Capucine', '🧡',
    'Annuelle rampante ou grimpante, feuilles rondes, fleurs orange. Plante-piège à pucerons au potager.',
    'Cresson d’Inde', 'Tropaeolum majus', 'species',
    'Végétal (Chlorobiontes)', 'Angiosperme', 'Tropaéolacées', 'Tropaeolum',
    'terrestre', 'producteur',
    'Bordures de potager, jardinières',
    'Autotrophe (photosynthèse)',
    'Attire les pucerons loin des choux ; fleurs et feuilles comestibles',
    'Andes, naturalisée dans les potagers méditerranéens',
    'Compagnonnage, alimentation (fleurs, feuilles, graines)',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Tropaeolum_majus_flowers.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Souci officinal', '🧡',
    'Capitules orange du potager, floraison longue. Attire syrphes et abeilles, se resème tout seul.',
    'Calendula', 'Calendula officinalis', 'species',
    'Végétal (Chlorobiontes)', 'Angiosperme', 'Astéracées', 'Calendula',
    'terrestre', 'producteur',
    'Planches de potager, allées',
    'Autotrophe (photosynthèse)',
    'Plante compagne ; nectar et pollen pour auxiliaires',
    'Méditerranée, cultivé partout',
    'Ornement, pétales comestibles, baume traditionnel',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Calendula_officinalis_flower.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Fenouil', '🌿',
    'Hautes tiges anisées, ombelles jaunes. Légume et plante-hôte de papillons (machaon) au potager méditerranéen.',
    'Fenouil commun', 'Foeniculum vulgare', 'species',
    'Végétal (Chlorobiontes)', 'Angiosperme', 'Apiacées', 'Foeniculum',
    'terrestre', 'producteur',
    'Potager, friches sèches, bords de chemin',
    'Autotrophe (photosynthèse)',
    'Ombelles très visitées ; parfois brouté par escargots et criquets',
    'Bassin méditerranéen',
    'Alimentation (bulbe, feuilles, graines), infusion',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Foeniculum_vulgare_1.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Verveine odorante', '🍃',
    'Arbuste aux feuilles allongées citronnées. Tisane « louiza » des jardins marocains.',
    'Louiza', 'Aloysia citrodora', 'species',
    'Végétal (Chlorobiontes)', 'Angiosperme', 'Verbénacées', 'Aloysia',
    'terrestre', 'producteur',
    'Cours, pots, coins abrités du vent',
    'Autotrophe (photosynthèse)',
    'Aromate ; floraison visitée par les butineurs',
    'Amérique du Sud, cultivée au Maghreb et en Méditerranée',
    'Tisane, aromate, ornement',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Aloysia_citrodora.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Câprier', '🤍',
    'Sous-arbrisseau épineux des murs et rochers. Boutons floraux = câpres ; fruits = câprons.',
    'Câpre', 'Capparis spinosa', 'species',
    'Végétal (Chlorobiontes)', 'Angiosperme', 'Capparacées', 'Capparis',
    'terrestre', 'producteur',
    'Murs, rochers, sols pauvres et chauds',
    'Autotrophe (photosynthèse)',
    'Fleurs nocturnes à longues étamines, visitées au petit matin',
    'Bassin méditerranéen, Maghreb',
    'Alimentation (câpres, câprons)',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Capparis_spinosa_flower.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Cochenille de la figue de Barbarie', '🐛',
    'Puceron-cochenille qui forme des amas blancs cotonneux sur les raquettes. Responsable d’épidémies sur les haies de nopal au Maroc.',
    'Cochenille du nopal', 'Dactylopius opuntiae', 'species',
    'Animal (Métazoaires)', 'Arthropodes', 'Dactylopiidés', 'Dactylopius',
    'terrestre', 'consommateur',
    'Raquettes du figuier de Barbarie',
    'Herbivore piqueur-suceur (sève des cladodes)',
    'Ravageur spécialiste ; peut détruire une haie de nopal en une saison',
    'Amériques, invasive au Maghreb',
    'Nuisible agricole ; autrefois source de colorant (carmin) pour d’autres Dactylopius',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Dactylopius_coccus.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Hérisson d’Algérie', '🦔',
    'Petit mammifère épineux d’Afrique du Nord, fréquent dans les jardins et les haies du Maroc. Chasse la nuit.',
    'Hérisson du Maghreb', 'Atelerix algirus', 'species',
    'Animal (Métazoaires)', 'Mammifères', 'Érinacéidés', 'Atelerix',
    'terrestre', 'consommateur',
    'Haies, tas de bois, jardins, oliveraies',
    'Insectivore / malacophage (insectes, vers, escargots)',
    'Auxiliaire nocturne du potager ; sensible aux granulés anti-limaces',
    'Maghreb, péninsule Ibérique',
    'Allié du jardinier ; espèce à ménager (passages sous les clôtures)',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Atelerix_algirus.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Tarente de Maurétanie', '🦎',
    'Gecko des murs, doigts à lamelles, souvent autour des lampes le soir. Très commun au Maroc et en Méditerranée.',
    'Gecko des murailles', 'Tarentola mauritanica', 'species',
    'Animal (Métazoaires)', 'Reptiles', 'Phyllodactylidés', 'Tarentola',
    'terrestre', 'consommateur',
    'Murs, rochers, abords des maisons',
    'Insectivore (papillons de nuit, moustiques, mouches)',
    'Prédateur nocturne des insectes attirés par la lumière',
    'Méditerranée occidentale, Maghreb',
    'Auxiliaire discret autour des habitations',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Tarentola_mauritanica_01.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Chrysope verte', '🪲',
    'Insecte au corps vert et aux ailes en toit. La larve (« lion des pucerons ») est un auxiliaire du potager.',
    'Demi-lune verte', 'Chrysoperla carnea', 'species',
    'Animal (Métazoaires)', 'Arthropodes', 'Chrysopidés', 'Chrysoperla',
    'terrestre', 'consommateur',
    'Potager, haies, plantes à pucerons',
    'Larve prédatrice de pucerons ; adulte surtout nectarivore',
    'Auxiliaire : régule les pucerons avec la coccinelle et le syrphe',
    'Cosmopolite, très présent en Méditerranée',
    'Lutte biologique',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Chrysoperla_carnea.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Cigale', '🎶',
    'Grand homoptère dont la larve vit des années dans le sol. L’adulte chante l’été dans les oliviers et les pins.',
    'Cigale commune', 'Cicada orni', 'species',
    'Animal (Métazoaires)', 'Arthropodes', 'Cicadidés', 'Cicada',
    'terrestre', 'consommateur',
    'Oliveraies, pins, jardins chauds',
    'Piqueur-suceur (sève des arbres, surtout olivier)',
    'Indicateur des étés méditerranéens ; les larves aèrent le sol',
    'Bassin méditerranéen',
    'Patrimoine sonore ; pas un ravageur grave au jardin',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Cicada_orni.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Criquet marocain', '🦗',
    'Criquet des steppes et des cultures du Maghreb. En pullulation, il broute céréales et potagers.',
    'Criquet du Maroc', 'Dociostaurus maroccanus', 'species',
    'Animal (Métazoaires)', 'Arthropodes', 'Acrididés', 'Dociostaurus',
    'terrestre', 'consommateur',
    'Steppes, jachères, abords de potager',
    'Herbivore brouteur',
    'Ravageur potentiel ; proie des mantes, oiseaux et tarentes',
    'Méditerranée, Maghreb, Proche-Orient',
    'Enjeu agricole historique au Maroc',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Dociostaurus_maroccanus.jpg',
    CAST(NULL AS CHAR)
  UNION ALL
  SELECT
    'Tillandsia', '🌬️',
    'Plante épiphyte sans terre : les feuilles absorbent l’eau et les poussières de l’air. Fréquente en classe et sur les branches des jardins chauds.',
    'Fille de l’air', 'Tillandsia usneoides', 'species',
    'Végétal (Chlorobiontes)', 'Angiosperme', 'Broméliacées', 'Tillandsia',
    'terrestre', 'producteur',
    'Branches, fils, pots suspendus, sans substrat',
    'Autotrophe ; absorbe humidité et nutriments par les feuilles',
    'Épiphyte : ne parasite pas l’arbre support ; abri pour petits invertébrés',
    'Amériques tropicales, cultivée partout',
    'Plante d’intérieur et d’étude (pas besoin de terre)',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Tillandsia_usneoides.jpg',
    'Si « Tillandsia aérienne » (T. aeranthos) est déjà au catalogue, cette fiche complète le genre.'
) AS v
WHERE NOT EXISTS (SELECT 1 FROM plants p WHERE p.name = v.name);

INSERT IGNORE INTO plant_name_aliases (alias, plant_id)
SELECT 'Tillandsia', id FROM plants
 WHERE name IN ('Tillandsia aérienne', 'Tillandsia')
 ORDER BY CASE name WHEN 'Tillandsia aérienne' THEN 1 ELSE 2 END
 LIMIT 1;
INSERT IGNORE INTO plant_name_aliases (alias, plant_id)
SELECT 'Fille de l''air', id FROM plants
 WHERE name IN ('Tillandsia aérienne', 'Tillandsia')
 ORDER BY CASE name WHEN 'Tillandsia aérienne' THEN 1 ELSE 2 END
 LIMIT 1;
INSERT IGNORE INTO plant_name_aliases (alias, plant_id)
SELECT 'Fille des airs', id FROM plants
 WHERE name IN ('Tillandsia aérienne', 'Tillandsia')
 ORDER BY CASE name WHEN 'Tillandsia aérienne' THEN 1 ELSE 2 END
 LIMIT 1;
INSERT IGNORE INTO plant_name_aliases (alias, plant_id)
SELECT 'Nopal', id FROM plants WHERE name = 'Figuier de Barbarie' LIMIT 1;
INSERT IGNORE INTO plant_name_aliases (alias, plant_id)
SELECT 'Figue de Barbarie', id FROM plants WHERE name = 'Figuier de Barbarie' LIMIT 1;
INSERT IGNORE INTO plant_name_aliases (alias, plant_id)
SELECT 'Ipomée', id FROM plants WHERE name = 'Volubilis' LIMIT 1;
INSERT IGNORE INTO plant_name_aliases (alias, plant_id)
SELECT 'Ipomee', id FROM plants WHERE name = 'Volubilis' LIMIT 1;
INSERT IGNORE INTO plant_name_aliases (alias, plant_id)
SELECT 'Figue', id FROM plants WHERE name = 'Figuier commun' LIMIT 1;
INSERT IGNORE INTO plant_name_aliases (alias, plant_id)
SELECT 'Olive', id FROM plants WHERE name = 'Olivier' LIMIT 1;
INSERT IGNORE INTO plant_name_aliases (alias, plant_id)
SELECT 'Argane', id FROM plants WHERE name = 'Arganier' LIMIT 1;
INSERT IGNORE INTO plant_name_aliases (alias, plant_id)
SELECT 'Louiza', id FROM plants WHERE name = 'Verveine odorante' LIMIT 1;
INSERT IGNORE INTO plant_name_aliases (alias, plant_id)
SELECT 'Helba', id FROM plants WHERE name = 'Fenugrec' LIMIT 1;
INSERT IGNORE INTO plant_name_aliases (alias, plant_id)
SELECT 'Calendula', id FROM plants WHERE name = 'Souci officinal' LIMIT 1;
INSERT IGNORE INTO plant_name_aliases (alias, plant_id)
SELECT 'Gecko des murailles', id FROM plants WHERE name = 'Tarente de Maurétanie' LIMIT 1;

INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
SELECT f.id, t.id, v.itype, v.descr
FROM (
  SELECT 'Abeille' AS fname, 'Lavande' AS tname, 'pollinisation' AS itype, 'Floraison très visitée, miel de lavande' AS descr
  UNION ALL SELECT 'Abeille', 'Jasmin', 'pollinisation', 'Fleurs parfumées butinées le matin'
  UNION ALL SELECT 'Abeille', 'Bougainvillier', 'pollinisation', 'Visite les petites fleurs au centre des bractées'
  UNION ALL SELECT 'Abeille', 'Volubilis', 'pollinisation', 'Grandes corolles visitées au soleil'
  UNION ALL SELECT 'Abeille', 'Souci officinal', 'pollinisation', 'Capitules du potager, nectar et pollen'
  UNION ALL SELECT 'Abeille', 'Fenouil', 'pollinisation', 'Ombelles jaunes très mellifères'
  UNION ALL SELECT 'Abeille', 'Capucine', 'pollinisation', 'Fleurs éperonnées du potager'
  UNION ALL SELECT 'Abeille', 'Citronnier', 'pollinisation', 'Fleurs d’agrume très odorantes'
  UNION ALL SELECT 'Abeille', 'Olivier', 'pollinisation', 'Floraison printanière, appoint de nectar'
  UNION ALL SELECT 'Abeille', 'Figuier commun', 'pollinisation', 'Visites opportunistes ; le figuier a aussi ses propres pollinisateurs'
  UNION ALL SELECT 'Abeille', 'Artichaut', 'pollinisation', 'Capitule laissé fleurir : banquet pour les butineurs'
  UNION ALL SELECT 'Abeille', 'Verveine odorante', 'pollinisation', 'Floraison estivale de la louiza'
  UNION ALL SELECT 'Abeille', 'Câprier', 'pollinisation', 'Grandes fleurs ouvertes au petit matin'
  UNION ALL SELECT 'Abeille', 'Fenugrec', 'pollinisation', 'Petites fleurs de légumineuse'
  UNION ALL SELECT 'Abeille', 'Caroubier', 'pollinisation', 'Floraison du caroubier'
  UNION ALL SELECT 'Abeille', 'Arganier', 'pollinisation', 'Fleurs d’arganier, ressource locale'
  UNION ALL SELECT 'Syrphe ceinturé', 'Souci officinal', 'pollinisation', 'L’adulte butine les calendula du potager'
  UNION ALL SELECT 'Syrphe ceinturé', 'Fenouil', 'pollinisation', 'Ombelles plates, faciles pour les syrphes'
  UNION ALL SELECT 'Rhizobium', 'Pois chiche', 'symbiose', 'Nodosités : azote fixé, sucres fournis par le pois chiche'
  UNION ALL SELECT 'Rhizobium', 'Fenugrec', 'symbiose', 'Nodosités : azote fixé, sucres fournis par le fenugrec'
  UNION ALL SELECT 'Cochenille de la figue de Barbarie', 'Figuier de Barbarie', 'herbivorie', 'Pique les raquettes et peut dessécher toute la haie'
  UNION ALL SELECT 'Criquet marocain', 'Laitue', 'herbivorie', 'Broute les feuilles tendres du potager'
  UNION ALL SELECT 'Criquet marocain', 'Chou', 'herbivorie', 'Broute les jeunes choux en pullulation'
  UNION ALL SELECT 'Criquet marocain', 'Fenouil', 'herbivorie', 'Broute le feuillage anisé'
  UNION ALL SELECT 'Puceron', 'Fenouil', 'herbivorie', 'Colonies sur les tiges tendres'
  UNION ALL SELECT 'Puceron', 'Capucine', 'herbivorie', 'La capucine sert souvent de plante-piège à pucerons'
  UNION ALL SELECT 'Puceron', 'Fenugrec', 'herbivorie', 'Jeunes pousses de légumineuse'
  UNION ALL SELECT 'Puceron', 'Citronnier', 'herbivorie', 'Jeunes pousses d’agrume'
  UNION ALL SELECT 'Escargot petit-gris', 'Fenouil', 'herbivorie', 'Broute les jeunes feuilles'
  UNION ALL SELECT 'Escargot petit-gris', 'Capucine', 'herbivorie', 'Broute feuilles et fleurs tendres'
  UNION ALL SELECT 'Cigale', 'Olivier', 'herbivorie', 'L’adulte pique la sève ; la larve vit au pied de l’arbre'
  UNION ALL SELECT 'Chrysope verte', 'Puceron', 'predation', 'La larve, « lion des pucerons », dévore les colonies'
  UNION ALL SELECT 'Mante religieuse africaine', 'Criquet marocain', 'predation', 'La mante capture les criquets au potager'
  UNION ALL SELECT 'Hérisson d’Algérie', 'Escargot petit-gris', 'predation', 'Chasse nocturne des escargots dans les haies'
  UNION ALL SELECT 'Hérisson d’Algérie', 'Vers de terre', 'predation', 'Complète son régime avec des vers'
  UNION ALL SELECT 'Tarente de Maurétanie', 'Moustique commun', 'predation', 'Chasse les insectes autour des lampes, dont les moustiques'
) AS v
JOIN plants f ON f.name = v.fname
JOIN plants t ON t.name = v.tname
WHERE NOT EXISTS (
  SELECT 1 FROM species_interactions si
  WHERE si.from_plant_id = f.id AND si.to_plant_id = t.id AND si.interaction_type = v.itype
);
