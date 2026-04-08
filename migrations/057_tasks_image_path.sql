-- Photo illustrative optionnelle sur la fiche tâche (création / édition).
ALTER TABLE tasks ADD COLUMN image_path VARCHAR(512) DEFAULT NULL AFTER description;
