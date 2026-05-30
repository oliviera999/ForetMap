-- Repères GL : configuration d'événements extensible + re-déclenchement questions

ALTER TABLE gl_chapter_markers
  ADD COLUMN event_config_json LONGTEXT DEFAULT NULL AFTER qcm_question_code;

INSERT INTO gl_settings (`key`, value_json, updated_by, updated_at)
SELECT 'gameplay.marker_question_retrigger', '"every_arrival"', NULL, NOW()
 WHERE NOT EXISTS (
   SELECT 1 FROM gl_settings WHERE `key` = 'gameplay.marker_question_retrigger'
 );
