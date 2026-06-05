-- Popover texte + images pour zones royaume GL

ALTER TABLE gl_kingdom_zones
  ADD COLUMN popover_markdown TEXT DEFAULT NULL,
  ADD COLUMN popover_images_json LONGTEXT DEFAULT NULL;

ALTER TABLE gl_games
  ADD COLUMN zone_content_retrigger ENUM('every_arrival', 'once_per_team', 'once_per_game') DEFAULT NULL
    AFTER current_team_id;

INSERT INTO gl_settings (`key`, value_json, updated_by, updated_at)
VALUES ('gameplay.zone_content_retrigger', '"once_per_game"', NULL, NOW())
ON DUPLICATE KEY UPDATE updated_at = updated_at;
