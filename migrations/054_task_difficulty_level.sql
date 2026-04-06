-- Niveau de difficulté des tâches (facile, moyen, compliqué, super compliqué).
ALTER TABLE tasks
  ADD COLUMN difficulty_level VARCHAR(32) NOT NULL DEFAULT 'easy';
