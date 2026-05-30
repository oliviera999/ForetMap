-- Liaison N:N chapitres ↔ biomes catalogue (remplace gl_chapters.biome_slug)

CREATE TABLE IF NOT EXISTS gl_chapter_biomes (
  chapter_id INT UNSIGNED NOT NULL,
  biome_slug VARCHAR(64) NOT NULL,
  order_index INT NOT NULL DEFAULT 0,
  PRIMARY KEY (chapter_id, biome_slug),
  INDEX idx_gl_chapter_biomes_order (chapter_id, order_index),
  CONSTRAINT fk_gl_chapter_biomes_chapter FOREIGN KEY (chapter_id)
    REFERENCES gl_chapters(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_chapter_biomes_biome FOREIGN KEY (biome_slug)
    REFERENCES gl_biomes(slug) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO gl_chapter_biomes (chapter_id, biome_slug, order_index)
SELECT c.id, c.biome_slug, 0
  FROM gl_chapters c
 WHERE c.biome_slug IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM gl_chapter_biomes cb
      WHERE cb.chapter_id = c.id AND cb.biome_slug = c.biome_slug
   );

ALTER TABLE gl_chapters DROP FOREIGN KEY fk_gl_chapters_biome;
ALTER TABLE gl_chapters DROP INDEX idx_gl_chapters_biome_slug;
ALTER TABLE gl_chapters DROP COLUMN biome_slug;
