-- Lien optionnel tâche → séance pédagogique (bouton « Lancer la séance » sur la tâche).
-- Le lien ne valide jamais la tâche automatiquement. Idempotent (erreurs de doublon ignorées).

ALTER TABLE tasks
  ADD COLUMN pedago_session_id CHAR(36) DEFAULT NULL
    COMMENT 'pedago_sessions.id — séance à lancer depuis la tâche';

ALTER TABLE tasks
  ADD INDEX idx_tasks_pedago_session (pedago_session_id);

ALTER TABLE tasks
  ADD CONSTRAINT fk_tasks_pedago_session
    FOREIGN KEY (pedago_session_id) REFERENCES pedago_sessions (id) ON DELETE SET NULL;
