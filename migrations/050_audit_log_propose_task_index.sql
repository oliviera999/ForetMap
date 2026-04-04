-- Optimise la recherche du proposeur sur la liste des tâches (GET /api/tasks).
ALTER TABLE audit_log
  ADD INDEX idx_audit_log_propose_lookup (action, target_type, target_id);
