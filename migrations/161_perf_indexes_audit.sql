-- Index de performance issus de l'audit de code (docs/AUDIT_CODE_2026-07.md §2.1).
-- Idempotent : les erreurs 1061 (index déjà présent) sont tolérées par le runner.

-- Prédicat « student_id = ? OR (student_first_name = ? AND student_last_name = ?) »
-- omniprésent (stats, enrôlement, suppression d'élève, assignments, rbac) :
-- la branche « nom » du OR empêchait tout index_merge efficace.
ALTER TABLE task_assignments
  ADD INDEX idx_task_assignments_student_name (student_first_name, student_last_name);

ALTER TABLE task_logs
  ADD INDEX idx_task_logs_student_name (student_first_name, student_last_name);

-- GET /api/zones : lecture de l'historique par zone triée par date de récolte.
ALTER TABLE zone_history
  ADD INDEX idx_zone_history_zone_harvested (zone_id, harvested_at);

-- GET /api/observations : ORDER BY created_at DESC (tri lexicographique correct,
-- created_at est un VARCHAR ISO).
ALTER TABLE observation_logs
  ADD INDEX idx_observation_logs_created (created_at);
