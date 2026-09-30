-- Tickets d'arrivée LTI consommés (audit sécurité 2026-09-30, AC6). Le ticket signé qui
-- conduit de /api/lti/launch à /api/lti/session vivait deux minutes sans état : il
-- s'échangeait autant de fois que voulu contre une session. Son `jti` est désormais inséré
-- ici au premier échange réussi (clé primaire = anti-rejeu partagé entre instances) ; les
-- entrées expirées sont purgées à chaque échange, sur le modèle de `lti_nonces` (268).
--
-- Idempotent : CREATE TABLE IF NOT EXISTS.
CREATE TABLE IF NOT EXISTS lti_tickets_used (
  jti VARCHAR(64) NOT NULL PRIMARY KEY,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_lti_tickets_used_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
