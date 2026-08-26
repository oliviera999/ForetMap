-- =====================================================================
-- ForetMap : accuses d'apprentissage generiques (« j'ai appris ce terme »).
--
-- Contexte. Le glossaire ForetMap etait purement consultatif : trois routes de lecture,
-- aucune notion d'« appris ». Consequence directe cote conditionnement, un lien bloquant
-- sur un terme etait accepte mais restait inerte a jamais — il n'existait aucun geste de
-- validation auquel le subordonner. Gnomes & Licornes, lui, sait valider un terme depuis
-- la migration 107 (`gl_learning_acknowledgements`).
--
-- Cette table est le miroir ForetMap de celle de GL. Une seule difference, imposee par le
-- produit : GL identifie son lecteur par un COUPLE (type, identifiant) — un invite ou un MJ
-- n'a pas de compte —, la ou ForetMap a toujours un compte. La cle est donc `user_id`, avec
-- la contrainte referentielle qui va avec : un compte supprime emporte ses accuses.
--
-- `target_type` reste generique (et non « glossary » en dur) pour que les prochains
-- contenus validables ForetMap s'y rangent sans nouvelle table, comme cote GL.
--
-- Idempotente : `CREATE TABLE IF NOT EXISTS`, rejouable sans effet au second passage.
-- =====================================================================

CREATE TABLE IF NOT EXISTS learning_acknowledgements (
  user_id VARCHAR(64) NOT NULL,
  target_type VARCHAR(16) NOT NULL,
  target_code VARCHAR(64) NOT NULL,
  acknowledged_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, target_type, target_code),
  INDEX idx_la_target (target_type, target_code),
  CONSTRAINT fk_la_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
