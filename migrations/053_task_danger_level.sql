-- Niveau de danger affiché / filtrable sur les tâches (sans danger, dangereux, très dangereux).
ALTER TABLE tasks
  ADD COLUMN danger_level VARCHAR(32) NOT NULL DEFAULT 'safe';
