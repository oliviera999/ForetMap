-- Nettoyage non destructif des champs photo* biodiversité
-- - normalise les valeurs vides/placeholder en NULL
-- - force HTTPS quand une URL est en http://
-- - convertit les pages Wikimedia de type /wiki/File:... vers /wiki/Special:FilePath/...

UPDATE plants
SET
  photo = NULLIF(TRIM(photo), ''),
  photo_species = NULLIF(TRIM(photo_species), ''),
  photo_leaf = NULLIF(TRIM(photo_leaf), ''),
  photo_flower = NULLIF(TRIM(photo_flower), ''),
  photo_fruit = NULLIF(TRIM(photo_fruit), ''),
  photo_harvest_part = NULLIF(TRIM(photo_harvest_part), '');

UPDATE plants
SET
  photo = NULLIF(photo, '-'),
  photo_species = NULLIF(photo_species, '-'),
  photo_leaf = NULLIF(photo_leaf, '-'),
  photo_flower = NULLIF(photo_flower, '-'),
  photo_fruit = NULLIF(photo_fruit, '-'),
  photo_harvest_part = NULLIF(photo_harvest_part, '-');

UPDATE plants
SET
  photo = NULLIF(photo, 'null'),
  photo_species = NULLIF(photo_species, 'null'),
  photo_leaf = NULLIF(photo_leaf, 'null'),
  photo_flower = NULLIF(photo_flower, 'null'),
  photo_fruit = NULLIF(photo_fruit, 'null'),
  photo_harvest_part = NULLIF(photo_harvest_part, 'null');

UPDATE plants
SET
  photo = IF(photo LIKE 'http://%', CONCAT('https://', SUBSTRING(photo, 8)), photo),
  photo_species = IF(photo_species LIKE 'http://%', CONCAT('https://', SUBSTRING(photo_species, 8)), photo_species),
  photo_leaf = IF(photo_leaf LIKE 'http://%', CONCAT('https://', SUBSTRING(photo_leaf, 8)), photo_leaf),
  photo_flower = IF(photo_flower LIKE 'http://%', CONCAT('https://', SUBSTRING(photo_flower, 8)), photo_flower),
  photo_fruit = IF(photo_fruit LIKE 'http://%', CONCAT('https://', SUBSTRING(photo_fruit, 8)), photo_fruit),
  photo_harvest_part = IF(photo_harvest_part LIKE 'http://%', CONCAT('https://', SUBSTRING(photo_harvest_part, 8)), photo_harvest_part);

UPDATE plants
SET
  photo = REPLACE(photo, 'https://commons.wikimedia.org/wiki/File:', 'https://commons.wikimedia.org/wiki/Special:FilePath/'),
  photo_species = REPLACE(photo_species, 'https://commons.wikimedia.org/wiki/File:', 'https://commons.wikimedia.org/wiki/Special:FilePath/'),
  photo_leaf = REPLACE(photo_leaf, 'https://commons.wikimedia.org/wiki/File:', 'https://commons.wikimedia.org/wiki/Special:FilePath/'),
  photo_flower = REPLACE(photo_flower, 'https://commons.wikimedia.org/wiki/File:', 'https://commons.wikimedia.org/wiki/Special:FilePath/'),
  photo_fruit = REPLACE(photo_fruit, 'https://commons.wikimedia.org/wiki/File:', 'https://commons.wikimedia.org/wiki/Special:FilePath/'),
  photo_harvest_part = REPLACE(photo_harvest_part, 'https://commons.wikimedia.org/wiki/File:', 'https://commons.wikimedia.org/wiki/Special:FilePath/');

UPDATE plants
SET
  photo = REPLACE(photo, 'https://wikipedia.org/wiki/File:', 'https://wikipedia.org/wiki/Special:FilePath/'),
  photo_species = REPLACE(photo_species, 'https://wikipedia.org/wiki/File:', 'https://wikipedia.org/wiki/Special:FilePath/'),
  photo_leaf = REPLACE(photo_leaf, 'https://wikipedia.org/wiki/File:', 'https://wikipedia.org/wiki/Special:FilePath/'),
  photo_flower = REPLACE(photo_flower, 'https://wikipedia.org/wiki/File:', 'https://wikipedia.org/wiki/Special:FilePath/'),
  photo_fruit = REPLACE(photo_fruit, 'https://wikipedia.org/wiki/File:', 'https://wikipedia.org/wiki/Special:FilePath/'),
  photo_harvest_part = REPLACE(photo_harvest_part, 'https://wikipedia.org/wiki/File:', 'https://wikipedia.org/wiki/Special:FilePath/');
