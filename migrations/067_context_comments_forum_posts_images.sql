-- Photos optionnelles sur commentaires de contexte et messages forum (fichiers sous uploads/).
ALTER TABLE context_comments ADD COLUMN image_paths_json TEXT NULL DEFAULT NULL AFTER body;
ALTER TABLE forum_posts ADD COLUMN image_paths_json TEXT NULL DEFAULT NULL AFTER body;
