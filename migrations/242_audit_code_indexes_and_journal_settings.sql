-- =====================================================================
-- ForetMap — Audit du code du 13/09/2026 (docs/AUDIT_CODE_2026-09-13.md)
--
-- §5.2 : les journaux purgés ou lus par date n'avaient aucun index sur cette date.
--   `scripts/purge-audit-logs.js` filtre `audit_log.created_at` et
--   `gl_game_events.created_at` : chaque purge balayait la table entière.
--   `task_logs.created_at` sert aux lectures chronologiques du journal de tâche.
--   (`security_events.occurred_at` et `observation_logs.created_at` étaient déjà indexés.)
--
-- §2.1 : la migration 237 semait deux réglages du carnet dans une table `settings`
--   inexistante (la bonne est `app_settings`) ; l'erreur était avalée. Rattrapage pour les
--   bases déjà passées en 237 — `ON DUPLICATE KEY UPDATE key = key` ne touche pas une valeur
--   qu'un admin aurait posée depuis.
-- =====================================================================

CREATE INDEX idx_audit_log_created ON audit_log (created_at);
CREATE INDEX idx_gl_game_events_created ON gl_game_events (created_at);
CREATE INDEX idx_task_logs_created ON task_logs (created_at);

INSERT INTO app_settings (`key`, scope, value_json)
VALUES ('observations.journal_max_chars', 'teacher', '0')
ON DUPLICATE KEY UPDATE `key` = `key`;

INSERT INTO app_settings (`key`, scope, value_json)
VALUES ('observations.journal_max_assets', 'teacher', '0')
ON DUPLICATE KEY UPDATE `key` = `key`;
