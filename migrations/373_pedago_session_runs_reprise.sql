-- =====================================================================
-- 373 — Séances guidées : reprise côté serveur (chantier « parcours d'apprentissage », lot 5).
--
-- L'étape en cours vivait dans le `sessionStorage` de l'onglet : un nouvel onglet, un autre
-- appareil ou un autre jour repartaient de l'étape 1, et « Reprendre » relançait la séance en
-- incrémentant `start_count`. Deux colonnes sur la ligne (séance, utilisateur) déjà existante :
--
--  - `current_step` : index (0 = première étape) de l'étape où l'élève s'est arrêté pendant le
--    passage en cours ; NULL quand aucun passage n'est en cours (jamais démarrée, ou terminée).
--  - `last_step_at` : horodatage du dernier changement d'étape (affiché « reprendre — étape n »,
--    utile au suivi prof).
--
-- Donnée liée à l'élève (même table, même durée de conservation, même suppression en cascade
-- avec le compte) : déclarée dans docs/MCP_REGISTRE_TRAITEMENT.md.
--
-- Idempotente : ADD COLUMN IF NOT EXISTS. Aucune donnée réécrite.
-- =====================================================================

ALTER TABLE pedago_session_runs
  ADD COLUMN IF NOT EXISTS current_step SMALLINT UNSIGNED NULL DEFAULT NULL AFTER completion_count,
  ADD COLUMN IF NOT EXISTS last_step_at DATETIME NULL DEFAULT NULL AFTER current_step;
