-- Image de couverture optionnelle pour les tutoriels (URL locale /uploads/... ou HTTPS).
ALTER TABLE tutorials
  ADD COLUMN cover_image_url VARCHAR(512) DEFAULT NULL AFTER summary;
