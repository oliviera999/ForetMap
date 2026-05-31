-- Repères GL : mode d'affichage carte (texte, emoji, icône)

ALTER TABLE gl_chapter_markers
  ADD COLUMN display_mode ENUM('label', 'emoji', 'icon') DEFAULT NULL AFTER event_config_json,
  ADD COLUMN emoji VARCHAR(16) DEFAULT NULL AFTER display_mode,
  ADD COLUMN icon_url VARCHAR(512) DEFAULT NULL AFTER emoji;

UPDATE gl_chapter_markers
   SET display_mode = 'emoji',
       emoji = '❓'
 WHERE event_type IN ('question', 'quiz')
   AND display_mode IS NULL;
