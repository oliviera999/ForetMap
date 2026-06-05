-- Repères GL : traits plateau (sous-biome, effet mécanique) + visage du Souffle par chapitre

ALTER TABLE gl_chapter_markers
  ADD COLUMN sous_biome_slug VARCHAR(64) DEFAULT NULL AFTER description,
  ADD COLUMN effet_mecanique TEXT DEFAULT NULL AFTER sous_biome_slug;

ALTER TABLE gl_chapter_markers
  ADD INDEX idx_gl_chapter_markers_sous_biome (sous_biome_slug);

ALTER TABLE gl_chapters
  ADD COLUMN souffle_face VARCHAR(120) DEFAULT NULL AFTER theme_json;
