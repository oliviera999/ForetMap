-- Visibilité repères / zones feuillets sur la carte en partie (override chapitre, NULL = hériter plateforme)
ALTER TABLE gl_chapters
  ADD COLUMN map_markers_visible TINYINT(1) DEFAULT NULL AFTER plateau_number,
  ADD COLUMN map_zones_visible TINYINT(1) DEFAULT NULL AFTER map_markers_visible;
