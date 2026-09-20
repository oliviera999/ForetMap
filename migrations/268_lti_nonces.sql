-- Nonces OIDC LTI consommés (audit CDG-17). Jusqu'ici en mémoire de processus : un nonce
-- restait rejouable sur une autre instance (Passenger multi-process) pendant ses dix minutes
-- de vie. La table est purgée des entrées expirées à chaque lancement LTI.
--
-- Idempotent : CREATE TABLE IF NOT EXISTS.
CREATE TABLE IF NOT EXISTS lti_nonces (
  nonce VARCHAR(255) NOT NULL PRIMARY KEY,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_lti_nonces_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
