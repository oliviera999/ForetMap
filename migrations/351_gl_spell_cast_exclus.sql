-- =====================================================================
-- 351 — G&L « Tenir à deux » : « pas moi » dans le pot d'un sort (lot 2, étape 2.4).
--
-- `gl_spell_cast_drafts.exclus_json` : identifiants des membres présents qui se sont retirés
-- du pot (tableau JSON d'entiers). Le partage automatique se recalcule sur les présents non
-- exclus ; la réserve de la caravane paie toujours en premier.
--
-- Idempotente : ADD COLUMN IF NOT EXISTS. Aucun DROP.
-- =====================================================================

ALTER TABLE gl_spell_cast_drafts
  ADD COLUMN IF NOT EXISTS exclus_json TEXT NULL;
