-- Applique une politique "photos directes uniquement" pour le catalogue biodiversité.
-- Conserve uniquement :
--   - les URLs HTTPS finissant par une extension image
--   - les URLs Wikimedia de type /wiki/Special:FilePath/...
-- Les autres valeurs sont mises a NULL pour eviter les miniatures cassees.

UPDATE plants
SET
  photo = CASE
    WHEN photo IS NULL THEN NULL
    WHEN LOWER(TRIM(photo)) REGEXP '^https://[^[:space:]]+\\.(avif|bmp|gif|jpe?g|png|svg|webp)(\\?.*)?$' THEN TRIM(photo)
    WHEN LOWER(TRIM(photo)) REGEXP '^https://[^[:space:]]+/wiki/special:filepath/[^[:space:]]+$' THEN TRIM(photo)
    ELSE NULL
  END,
  photo_species = CASE
    WHEN photo_species IS NULL THEN NULL
    WHEN LOWER(TRIM(photo_species)) REGEXP '^https://[^[:space:]]+\\.(avif|bmp|gif|jpe?g|png|svg|webp)(\\?.*)?$' THEN TRIM(photo_species)
    WHEN LOWER(TRIM(photo_species)) REGEXP '^https://[^[:space:]]+/wiki/special:filepath/[^[:space:]]+$' THEN TRIM(photo_species)
    ELSE NULL
  END,
  photo_leaf = CASE
    WHEN photo_leaf IS NULL THEN NULL
    WHEN LOWER(TRIM(photo_leaf)) REGEXP '^https://[^[:space:]]+\\.(avif|bmp|gif|jpe?g|png|svg|webp)(\\?.*)?$' THEN TRIM(photo_leaf)
    WHEN LOWER(TRIM(photo_leaf)) REGEXP '^https://[^[:space:]]+/wiki/special:filepath/[^[:space:]]+$' THEN TRIM(photo_leaf)
    ELSE NULL
  END,
  photo_flower = CASE
    WHEN photo_flower IS NULL THEN NULL
    WHEN LOWER(TRIM(photo_flower)) REGEXP '^https://[^[:space:]]+\\.(avif|bmp|gif|jpe?g|png|svg|webp)(\\?.*)?$' THEN TRIM(photo_flower)
    WHEN LOWER(TRIM(photo_flower)) REGEXP '^https://[^[:space:]]+/wiki/special:filepath/[^[:space:]]+$' THEN TRIM(photo_flower)
    ELSE NULL
  END,
  photo_fruit = CASE
    WHEN photo_fruit IS NULL THEN NULL
    WHEN LOWER(TRIM(photo_fruit)) REGEXP '^https://[^[:space:]]+\\.(avif|bmp|gif|jpe?g|png|svg|webp)(\\?.*)?$' THEN TRIM(photo_fruit)
    WHEN LOWER(TRIM(photo_fruit)) REGEXP '^https://[^[:space:]]+/wiki/special:filepath/[^[:space:]]+$' THEN TRIM(photo_fruit)
    ELSE NULL
  END,
  photo_harvest_part = CASE
    WHEN photo_harvest_part IS NULL THEN NULL
    WHEN LOWER(TRIM(photo_harvest_part)) REGEXP '^https://[^[:space:]]+\\.(avif|bmp|gif|jpe?g|png|svg|webp)(\\?.*)?$' THEN TRIM(photo_harvest_part)
    WHEN LOWER(TRIM(photo_harvest_part)) REGEXP '^https://[^[:space:]]+/wiki/special:filepath/[^[:space:]]+$' THEN TRIM(photo_harvest_part)
    ELSE NULL
  END;
