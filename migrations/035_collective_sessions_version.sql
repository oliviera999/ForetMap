ALTER TABLE collective_sessions
  ADD COLUMN version INT UNSIGNED NOT NULL DEFAULT 1 AFTER is_active;
