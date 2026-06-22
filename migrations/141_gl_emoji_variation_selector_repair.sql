-- Annule la corruption U+1FE0F (réparation erronée de U+FE0F) → U+FE0F
-- UTF-8 : F0 9F B8 8F → EF B8 8F
-- COLLATE explicite : évite ER_CANT_AGGREGATE_2COLLATIONS (MariaDB uca1400 vs unicode_ci).

UPDATE gl_chapter_markers
SET emoji = REPLACE(
  emoji,
  CONVERT(UNHEX('F09FB88F') USING utf8mb4) COLLATE utf8mb4_unicode_ci,
  CONVERT(UNHEX('EFB88F') USING utf8mb4) COLLATE utf8mb4_unicode_ci
)
WHERE emoji LIKE CONCAT('%', CONVERT(UNHEX('F09FB88F') USING utf8mb4) COLLATE utf8mb4_unicode_ci, '%') COLLATE utf8mb4_unicode_ci;

UPDATE gl_chapters
SET sortileges_markdown = REPLACE(
  sortileges_markdown,
  CONVERT(UNHEX('F09FB88F') USING utf8mb4) COLLATE utf8mb4_unicode_ci,
  CONVERT(UNHEX('EFB88F') USING utf8mb4) COLLATE utf8mb4_unicode_ci
)
WHERE sortileges_markdown LIKE CONCAT('%', CONVERT(UNHEX('F09FB88F') USING utf8mb4) COLLATE utf8mb4_unicode_ci, '%') COLLATE utf8mb4_unicode_ci;

UPDATE gl_chapters
SET story_markdown = REPLACE(
  story_markdown,
  CONVERT(UNHEX('F09FB88F') USING utf8mb4) COLLATE utf8mb4_unicode_ci,
  CONVERT(UNHEX('EFB88F') USING utf8mb4) COLLATE utf8mb4_unicode_ci
)
WHERE story_markdown LIKE CONCAT('%', CONVERT(UNHEX('F09FB88F') USING utf8mb4) COLLATE utf8mb4_unicode_ci, '%') COLLATE utf8mb4_unicode_ci;

UPDATE gl_chapters
SET biotope_markdown = REPLACE(
  biotope_markdown,
  CONVERT(UNHEX('F09FB88F') USING utf8mb4) COLLATE utf8mb4_unicode_ci,
  CONVERT(UNHEX('EFB88F') USING utf8mb4) COLLATE utf8mb4_unicode_ci
)
WHERE biotope_markdown LIKE CONCAT('%', CONVERT(UNHEX('F09FB88F') USING utf8mb4) COLLATE utf8mb4_unicode_ci, '%') COLLATE utf8mb4_unicode_ci;

UPDATE gl_chapters
SET biocenose_markdown = REPLACE(
  biocenose_markdown,
  CONVERT(UNHEX('F09FB88F') USING utf8mb4) COLLATE utf8mb4_unicode_ci,
  CONVERT(UNHEX('EFB88F') USING utf8mb4) COLLATE utf8mb4_unicode_ci
)
WHERE biocenose_markdown LIKE CONCAT('%', CONVERT(UNHEX('F09FB88F') USING utf8mb4) COLLATE utf8mb4_unicode_ci, '%') COLLATE utf8mb4_unicode_ci;
