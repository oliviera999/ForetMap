ALTER TABLE roles
  ADD COLUMN emoji VARCHAR(16) DEFAULT NULL;

ALTER TABLE roles
  ADD COLUMN min_done_tasks INT UNSIGNED DEFAULT NULL;

ALTER TABLE roles
  ADD COLUMN display_order INT NOT NULL DEFAULT 0;

UPDATE roles
SET
  emoji = CASE slug
    WHEN 'eleve_novice' THEN '🪨'
    WHEN 'eleve_avance' THEN '🌿'
    WHEN 'eleve_chevronne' THEN '🏆'
    ELSE emoji
  END,
  min_done_tasks = CASE slug
    WHEN 'eleve_novice' THEN 0
    WHEN 'eleve_avance' THEN 5
    WHEN 'eleve_chevronne' THEN 10
    ELSE min_done_tasks
  END,
  display_order = CASE slug
    WHEN 'admin' THEN 10
    WHEN 'prof' THEN 20
    WHEN 'eleve_chevronne' THEN 30
    WHEN 'eleve_avance' THEN 40
    WHEN 'eleve_novice' THEN 50
    WHEN 'visiteur' THEN 60
    ELSE display_order
  END;
