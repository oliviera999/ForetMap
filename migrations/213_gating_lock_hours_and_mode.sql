-- =====================================================================
-- Conditionnement par QCM — délai de verrou en HEURES et sévérité du verrou (`lock_mode`).
-- Lot 2 de docs/AUDIT_VALIDATION_QUIZ_2026-09.md (§5.2), ForetMap + GL.
--
-- 1. Le délai de re-tentative se réglait en jours (défaut 3 j) ; il se règle en heures
--    (défaut 6 h). Les colonnes `retry_cooldown_days` des politiques et les clés de réglages
--    `*.retry_cooldown_days` sont converties (× 24) vers `retry_cooldown_hours`, sans jamais
--    perdre une valeur réglée : une base qui avait 3 j obtient 72 h. Les anciennes colonnes
--    restent en place (inertes) ; les anciennes clés de réglages sont retirées après copie.
-- 2. `lock_mode` (advisory | flow | strict ; NULL = hériter) : sévérité du verrou, réglable en
--    cascade site → type de ressource → fiche.
-- Idempotent. Pré-requis : 203 (colonnes de session/verrou).
-- =====================================================================

ALTER TABLE resource_gating_policy
  ADD COLUMN IF NOT EXISTS retry_cooldown_hours SMALLINT NULL DEFAULT NULL
    COMMENT 'Delai verrou apres erreurs, en heures ; NULL = herite',
  ADD COLUMN IF NOT EXISTS lock_mode VARCHAR(16) NULL DEFAULT NULL
    COMMENT 'advisory | flow | strict ; NULL = herite';

ALTER TABLE gl_resource_gating_policy
  ADD COLUMN IF NOT EXISTS retry_cooldown_hours SMALLINT NULL DEFAULT NULL
    COMMENT 'Delai verrou apres erreurs, en heures ; NULL = herite',
  ADD COLUMN IF NOT EXISTS lock_mode VARCHAR(16) NULL DEFAULT NULL
    COMMENT 'advisory | flow | strict ; NULL = herite';

-- Reprise des délais réglés en jours (une seule fois : la colonne heures est encore NULL).
UPDATE resource_gating_policy
   SET retry_cooldown_hours = LEAST(retry_cooldown_days * 24, 8760)
 WHERE retry_cooldown_hours IS NULL AND retry_cooldown_days IS NOT NULL;

UPDATE gl_resource_gating_policy
   SET retry_cooldown_hours = LEAST(retry_cooldown_days * 24, 8760)
 WHERE retry_cooldown_hours IS NULL AND retry_cooldown_days IS NOT NULL;

-- Réglages du site ForetMap (`app_settings`, valeur JSON numérique) : jours → heures.
INSERT INTO app_settings (`key`, scope, value_json, updated_by_user_type, updated_by_user_id)
SELECT 'learning.gating.retry_cooldown_hours', 'teacher',
       CAST(LEAST(CAST(REPLACE(value_json, '"', '') AS SIGNED) * 24, 8760) AS CHAR),
       updated_by_user_type, updated_by_user_id
  FROM app_settings
 WHERE `key` = 'learning.gating.retry_cooldown_days'
   AND CAST(value_json AS CHAR) REGEXP '^"?[0-9]+"?$'
   AND NOT EXISTS (
     SELECT 1 FROM (SELECT `key` FROM app_settings) AS existing
      WHERE existing.`key` = 'learning.gating.retry_cooldown_hours'
   );

DELETE FROM app_settings WHERE `key` = 'learning.gating.retry_cooldown_days';

-- Réglages du site GL (`gl_settings`) : même reprise.
INSERT INTO gl_settings (`key`, value_json, updated_by)
SELECT 'gating.retry_cooldown_hours',
       CAST(LEAST(CAST(REPLACE(value_json, '"', '') AS SIGNED) * 24, 8760) AS CHAR),
       updated_by
  FROM gl_settings
 WHERE `key` = 'gating.retry_cooldown_days'
   AND CAST(value_json AS CHAR) REGEXP '^"?[0-9]+"?$'
   AND NOT EXISTS (
     SELECT 1 FROM (SELECT `key` FROM gl_settings) AS existing
      WHERE existing.`key` = 'gating.retry_cooldown_hours'
   );

DELETE FROM gl_settings WHERE `key` = 'gating.retry_cooldown_days';
