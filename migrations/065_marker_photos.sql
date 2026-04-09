-- Photos sur la fiche repère (carte), même principe que zone_photos.
CREATE TABLE IF NOT EXISTS marker_photos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  marker_id VARCHAR(64) NOT NULL,
  image_path VARCHAR(512) DEFAULT NULL,
  caption VARCHAR(512) DEFAULT '',
  uploaded_at VARCHAR(32) DEFAULT NULL,
  INDEX idx_marker_photos_marker_id (marker_id),
  CONSTRAINT fk_marker_photos_marker FOREIGN KEY (marker_id) REFERENCES map_markers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
