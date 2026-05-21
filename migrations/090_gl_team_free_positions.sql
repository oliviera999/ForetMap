ALTER TABLE gl_teams
  ADD COLUMN position_x_pct DECIMAL(5,2) DEFAULT NULL AFTER position_marker_id,
  ADD COLUMN position_y_pct DECIMAL(5,2) DEFAULT NULL AFTER position_x_pct;
