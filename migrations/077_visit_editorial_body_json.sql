ALTER TABLE visit_zones
  ADD COLUMN body_json LONGTEXT DEFAULT NULL AFTER details_text;

ALTER TABLE visit_markers
  ADD COLUMN body_json LONGTEXT DEFAULT NULL AFTER details_text;

