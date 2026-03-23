-- Corrections scientifiques ciblées sur le catalogue biodiversite.
-- Objectifs:
-- - corriger des temperatures invalides issues d'un import (valeurs Excel)
-- - normaliser certains noms scientifiques
-- - completer integralement la fiche "Menthe"

-- 1) Corrections des temperatures invalides
UPDATE plants
SET ideal_temperature_c = '12-24'
WHERE name = 'Ail' AND ideal_temperature_c = '46378';

UPDATE plants
SET ideal_temperature_c = '10-22'
WHERE name = 'Épinard' AND ideal_temperature_c = '46315';

UPDATE plants
SET ideal_temperature_c = '10-24'
WHERE name = 'Navet' AND ideal_temperature_c = '46376';

UPDATE plants
SET ideal_temperature_c = '10-25'
WHERE name = 'Oseille' AND ideal_temperature_c = '46378';

UPDATE plants
SET ideal_temperature_c = '10-20'
WHERE name = 'Petit pois' AND ideal_temperature_c = '46376';

-- 2) Normalisation de noms scientifiques
UPDATE plants
SET scientific_name = 'Planorbarius corneus'
WHERE name = 'Planorbe'
  AND (scientific_name = 'Planorbia sp.' OR scientific_name IS NULL OR scientific_name = '');

UPDATE plants
SET scientific_name = 'Hypostomus plecostomus'
WHERE name = 'Pléco albinos'
  AND (scientific_name = 'Plécostomus plecostomus' OR scientific_name IS NULL OR scientific_name = '');

UPDATE plants
SET scientific_name = 'Cactaceae sp.'
WHERE name = 'Cactus'
  AND (scientific_name IS NULL OR scientific_name = '');

-- 3) Mise a jour complete de la fiche "Menthe"
UPDATE plants
SET
  emoji = '🌿',
  description = 'Plante aromatique vivace, tiges quadrangulaires et feuilles opposées dentées, très parfumées.',
  second_name = 'Menthe verte',
  scientific_name = 'Mentha spicata',
  group_1 = 'Végétal (Chlorobiontes)',
  group_2 = 'Angiosperme',
  group_3 = 'Lamiacées',
  habitat = 'Potager',
  photo = NULL,
  nutrition = 'Autotrophe (photosynthèse)',
  agroecosystem_category = 'Producteur primaire',
  longevity = 'Vivace',
  remark_1 = 'Plante aromatique / condiment',
  remark_2 = 'Plante mellifère',
  remark_3 = 'Peut devenir envahissante',
  reproduction = 'Végétative (stolons) + sexuée',
  size = '30-80 cm',
  sources = 'https://fr.wikipedia.org/wiki/Mentha_spicata',
  ideal_temperature_c = '15-25',
  optimal_ph = '6,0-7,5',
  ecosystem_role = 'Couvre-sol partiel, ressource nectarifère, contribue a la biodiversité des pollinisateurs.',
  geographic_origin = 'Europe, Asie occidentale',
  human_utility = 'Aromate culinaire, infusion, usage traditionnel en phytotherapie.',
  harvest_part = 'Feuilles et sommités',
  planting_recommendations = 'Division de touffe ou bouture, mi-ombre a soleil doux, sol frais, contenir en bac si besoin.',
  preferred_nutrients = 'Azote (N), potassium (K)',
  photo_species = NULL,
  photo_leaf = NULL,
  photo_flower = NULL,
  photo_fruit = NULL,
  photo_harvest_part = NULL
WHERE name = 'Menthe';
