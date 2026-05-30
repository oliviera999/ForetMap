-- Surcharges couleurs optionnelles par chapitre GL
ALTER TABLE gl_chapters
  ADD COLUMN theme_json LONGTEXT NULL
  COMMENT 'Surcharges couleurs optionnelles { colors: { primary?, ... } }'
  AFTER map_image_frame_json;
