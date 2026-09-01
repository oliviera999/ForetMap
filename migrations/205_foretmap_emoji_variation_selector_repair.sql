-- Étend la réparation de la migration 141 (limitée aux tables gl_*) aux tables ForetMap :
-- annule la corruption U+1FE0F (réparation erronée de U+FE0F) → U+FE0F dans les noms de
-- zones, les emojis de repères (carte et visite), de catégories, de plantes et de rôles.
-- UTF-8 : F0 9F B8 8F → EF B8 8F. Idempotente (REPLACE ne matche plus après passage).
-- COLLATE explicite : évite ER_CANT_AGGREGATE_2COLLATIONS (MariaDB uca1400 vs unicode_ci).

UPDATE zones
SET name = REPLACE(
  name,
  CONVERT(UNHEX('F09FB88F') USING utf8mb4) COLLATE utf8mb4_unicode_ci,
  CONVERT(UNHEX('EFB88F') USING utf8mb4) COLLATE utf8mb4_unicode_ci
)
WHERE name LIKE CONCAT('%', CONVERT(UNHEX('F09FB88F') USING utf8mb4) COLLATE utf8mb4_unicode_ci, '%') COLLATE utf8mb4_unicode_ci;

UPDATE map_markers
SET emoji = REPLACE(
  emoji,
  CONVERT(UNHEX('F09FB88F') USING utf8mb4) COLLATE utf8mb4_unicode_ci,
  CONVERT(UNHEX('EFB88F') USING utf8mb4) COLLATE utf8mb4_unicode_ci
)
WHERE emoji LIKE CONCAT('%', CONVERT(UNHEX('F09FB88F') USING utf8mb4) COLLATE utf8mb4_unicode_ci, '%') COLLATE utf8mb4_unicode_ci;

UPDATE visit_markers
SET emoji = REPLACE(
  emoji,
  CONVERT(UNHEX('F09FB88F') USING utf8mb4) COLLATE utf8mb4_unicode_ci,
  CONVERT(UNHEX('EFB88F') USING utf8mb4) COLLATE utf8mb4_unicode_ci
)
WHERE emoji LIKE CONCAT('%', CONVERT(UNHEX('F09FB88F') USING utf8mb4) COLLATE utf8mb4_unicode_ci, '%') COLLATE utf8mb4_unicode_ci;

UPDATE visit_markers
SET label = REPLACE(
  label,
  CONVERT(UNHEX('F09FB88F') USING utf8mb4) COLLATE utf8mb4_unicode_ci,
  CONVERT(UNHEX('EFB88F') USING utf8mb4) COLLATE utf8mb4_unicode_ci
)
WHERE label LIKE CONCAT('%', CONVERT(UNHEX('F09FB88F') USING utf8mb4) COLLATE utf8mb4_unicode_ci, '%') COLLATE utf8mb4_unicode_ci;

UPDATE location_categories
SET emoji = REPLACE(
  emoji,
  CONVERT(UNHEX('F09FB88F') USING utf8mb4) COLLATE utf8mb4_unicode_ci,
  CONVERT(UNHEX('EFB88F') USING utf8mb4) COLLATE utf8mb4_unicode_ci
)
WHERE emoji LIKE CONCAT('%', CONVERT(UNHEX('F09FB88F') USING utf8mb4) COLLATE utf8mb4_unicode_ci, '%') COLLATE utf8mb4_unicode_ci;

UPDATE plants
SET emoji = REPLACE(
  emoji,
  CONVERT(UNHEX('F09FB88F') USING utf8mb4) COLLATE utf8mb4_unicode_ci,
  CONVERT(UNHEX('EFB88F') USING utf8mb4) COLLATE utf8mb4_unicode_ci
)
WHERE emoji LIKE CONCAT('%', CONVERT(UNHEX('F09FB88F') USING utf8mb4) COLLATE utf8mb4_unicode_ci, '%') COLLATE utf8mb4_unicode_ci;

UPDATE roles
SET emoji = REPLACE(
  emoji,
  CONVERT(UNHEX('F09FB88F') USING utf8mb4) COLLATE utf8mb4_unicode_ci,
  CONVERT(UNHEX('EFB88F') USING utf8mb4) COLLATE utf8mb4_unicode_ci
)
WHERE emoji LIKE CONCAT('%', CONVERT(UNHEX('F09FB88F') USING utf8mb4) COLLATE utf8mb4_unicode_ci, '%') COLLATE utf8mb4_unicode_ci;
