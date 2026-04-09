-- Photos visite : stockage fichier local (comme zone_photos), en plus des URLs externes.
ALTER TABLE visit_media
  ADD COLUMN image_path VARCHAR(512) DEFAULT NULL AFTER image_url;
ALTER TABLE visit_media
  MODIFY COLUMN image_url VARCHAR(512) NULL;
