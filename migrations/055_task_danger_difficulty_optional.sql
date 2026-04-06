-- danger_level / difficulty_level : NULL = non renseigné (pas d’affichage implicite « facile / sans danger »).
ALTER TABLE tasks MODIFY COLUMN danger_level VARCHAR(32) NULL DEFAULT NULL;
ALTER TABLE tasks MODIFY COLUMN difficulty_level VARCHAR(32) NULL DEFAULT NULL;
UPDATE tasks SET danger_level = NULL, difficulty_level = NULL;
