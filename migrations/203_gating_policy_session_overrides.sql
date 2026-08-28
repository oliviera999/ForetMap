-- =====================================================================
-- Politique de conditionnement : surcharges session/verrou/granularite
-- par type (resource_ref='*') et par ressource (ForetMap + GL).
-- NULL = heriter du niveau superieur.
-- Idempotent.
-- =====================================================================

ALTER TABLE resource_gating_policy
  ADD COLUMN IF NOT EXISTS allowed_wrong_attempts SMALLINT NULL DEFAULT NULL
    COMMENT 'Erreurs tolerees avant verrou ; NULL = herite',
  ADD COLUMN IF NOT EXISTS max_questions_per_session SMALLINT NULL DEFAULT NULL
    COMMENT 'Plafond questions par session ; NULL = herite',
  ADD COLUMN IF NOT EXISTS retry_cooldown_days SMALLINT NULL DEFAULT NULL
    COMMENT 'Delai verrou apres erreurs ; NULL = herite',
  ADD COLUMN IF NOT EXISTS cooldown_scope VARCHAR(16) NULL DEFAULT NULL
    COMMENT 'resource | question ; NULL = herite',
  ADD COLUMN IF NOT EXISTS granularity VARCHAR(16) NULL DEFAULT NULL
    COMMENT 'player | team | per_resource ; NULL = herite (FM ignore sauf player)';

ALTER TABLE gl_resource_gating_policy
  ADD COLUMN IF NOT EXISTS allowed_wrong_attempts SMALLINT NULL DEFAULT NULL
    COMMENT 'Erreurs tolerees avant verrou ; NULL = herite',
  ADD COLUMN IF NOT EXISTS max_questions_per_session SMALLINT NULL DEFAULT NULL
    COMMENT 'Plafond questions par session ; NULL = herite',
  ADD COLUMN IF NOT EXISTS retry_cooldown_days SMALLINT NULL DEFAULT NULL
    COMMENT 'Delai verrou apres erreurs ; NULL = herite',
  ADD COLUMN IF NOT EXISTS cooldown_scope VARCHAR(16) NULL DEFAULT NULL
    COMMENT 'resource | question ; NULL = herite',
  ADD COLUMN IF NOT EXISTS granularity VARCHAR(16) NULL DEFAULT NULL
    COMMENT 'player | team | per_resource ; NULL = herite';
