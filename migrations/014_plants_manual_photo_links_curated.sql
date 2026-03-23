-- Migration 014
-- Photos biodiversite: selection manuelle, stricte et biologiquement coherente.
-- Regles appliquees:
-- - uniquement des liens directs Wikimedia "Special:FilePath"
-- - pas d'auto-resolution heuristique
-- - on renseigne seulement les champs juges fiables, le reste reste NULL

-- Menthe (fiche complete demandee)
UPDATE plants
SET
  photo = 'https://commons.wikimedia.org/wiki/Special:FilePath/Mint_leaves_(Mentha_spicata).jpg',
  photo_species = 'https://commons.wikimedia.org/wiki/Special:FilePath/Mint_leaves_(Mentha_spicata).jpg',
  photo_leaf = 'https://commons.wikimedia.org/wiki/Special:FilePath/Mentha_spicata_spicata_395472591.jpg',
  photo_flower = 'https://commons.wikimedia.org/wiki/Special:FilePath/Mentha_spicata_flowers.jpg',
  photo_fruit = NULL,
  photo_harvest_part = 'https://commons.wikimedia.org/wiki/Special:FilePath/Mint_leaves_(Mentha_spicata).jpg'
WHERE name = 'Menthe'
  AND scientific_name = 'Mentha spicata';

-- Ail
UPDATE plants
SET
  photo = 'https://commons.wikimedia.org/wiki/Special:FilePath/Knoblauch_(Allium_sativum)-20200621-RM-085344.jpg',
  photo_species = 'https://commons.wikimedia.org/wiki/Special:FilePath/Knoblauch_(Allium_sativum)-20200621-RM-085344.jpg',
  photo_leaf = NULL,
  photo_flower = NULL,
  photo_fruit = NULL,
  photo_harvest_part = 'https://commons.wikimedia.org/wiki/Special:FilePath/Garlic_bulbs_and_cloves.jpg'
WHERE name = 'Ail'
  AND scientific_name = 'Allium sativum';

-- Epinard
UPDATE plants
SET
  photo = 'https://commons.wikimedia.org/wiki/Special:FilePath/Spinacia_oleracea_bd-1.jpg',
  photo_species = 'https://commons.wikimedia.org/wiki/Special:FilePath/Spinacia_oleracea_bd-1.jpg',
  photo_leaf = 'https://commons.wikimedia.org/wiki/Special:FilePath/Spinacia_oleracea_bd-2.jpg',
  photo_flower = 'https://commons.wikimedia.org/wiki/Special:FilePath/Spinacia_oleracea_Spinazie_bloeiend.jpg',
  photo_fruit = NULL,
  photo_harvest_part = 'https://commons.wikimedia.org/wiki/Special:FilePath/Spinacia_oleracea_bd-1.jpg'
WHERE name = 'Épinard'
  AND scientific_name = 'Spinacia oleracea';

-- Navet
UPDATE plants
SET
  photo = 'https://commons.wikimedia.org/wiki/Special:FilePath/Brassica_rapa_subsp._rapa.jpg',
  photo_species = 'https://commons.wikimedia.org/wiki/Special:FilePath/Brassica_rapa_subsp._rapa.jpg',
  photo_leaf = NULL,
  photo_flower = NULL,
  photo_fruit = NULL,
  photo_harvest_part = 'https://commons.wikimedia.org/wiki/Special:FilePath/Brassica_rapa_subsp._rapa_or_simply_turnips.jpg'
WHERE name = 'Navet'
  AND scientific_name = 'Brassica rapa subsp. rapa';

-- Oseille
UPDATE plants
SET
  photo = 'https://commons.wikimedia.org/wiki/Special:FilePath/Rumex_acetosa_-_Hapu_oblikas.jpg',
  photo_species = 'https://commons.wikimedia.org/wiki/Special:FilePath/Rumex_acetosa_-_Hapu_oblikas.jpg',
  photo_leaf = 'https://commons.wikimedia.org/wiki/Special:FilePath/Rumex_acetosa_kz12.jpg',
  photo_flower = NULL,
  photo_fruit = NULL,
  photo_harvest_part = 'https://commons.wikimedia.org/wiki/Special:FilePath/Rumex_acetosa_kz12.jpg'
WHERE name = 'Oseille'
  AND scientific_name = 'Rumex acetosa';

-- Petit pois
UPDATE plants
SET
  photo = 'https://commons.wikimedia.org/wiki/Special:FilePath/Pisum_sativum_seedling_(8755683513).jpg',
  photo_species = 'https://commons.wikimedia.org/wiki/Special:FilePath/Pisum_sativum_seedling_(8755683513).jpg',
  photo_leaf = NULL,
  photo_flower = 'https://commons.wikimedia.org/wiki/Special:FilePath/EB1911_-_Leguminosae_-_Fig._7.%E2%80%94Flower_of_Pea_(Pisum_sativum).jpg',
  photo_fruit = 'https://commons.wikimedia.org/wiki/Special:FilePath/Doperwt_rijserwt_peulen_Pisum_sativum.jpg',
  photo_harvest_part = 'https://commons.wikimedia.org/wiki/Special:FilePath/Snow_peas_-_Pisum_sativum.jpg'
WHERE name = 'Petit pois'
  AND scientific_name = 'Pisum sativum';

-- Planorbe
UPDATE plants
SET
  photo = 'https://commons.wikimedia.org/wiki/Special:FilePath/Planorbarius_corneus_001.JPG',
  photo_species = 'https://commons.wikimedia.org/wiki/Special:FilePath/Planorbarius_corneus_001.JPG',
  photo_leaf = NULL,
  photo_flower = NULL,
  photo_fruit = NULL,
  photo_harvest_part = NULL
WHERE name = 'Planorbe'
  AND scientific_name = 'Planorbarius corneus';

-- Pleco albinos
UPDATE plants
SET
  photo = 'https://commons.wikimedia.org/wiki/Special:FilePath/Sapu-sapu_(Hypostomus_Plecostomus).jpg',
  photo_species = 'https://commons.wikimedia.org/wiki/Special:FilePath/Sapu-sapu_(Hypostomus_Plecostomus).jpg',
  photo_leaf = NULL,
  photo_flower = NULL,
  photo_fruit = NULL,
  photo_harvest_part = NULL
WHERE name = 'Pléco albinos'
  AND scientific_name = 'Hypostomus plecostomus';

-- Cactus (niveau famille: image representative)
UPDATE plants
SET
  photo = 'https://commons.wikimedia.org/wiki/Special:FilePath/Cacti_plant.jpg',
  photo_species = 'https://commons.wikimedia.org/wiki/Special:FilePath/Cacti_plant.jpg',
  photo_leaf = NULL,
  photo_flower = NULL,
  photo_fruit = NULL,
  photo_harvest_part = NULL
WHERE name = 'Cactus'
  AND scientific_name = 'Cactaceae sp.';
