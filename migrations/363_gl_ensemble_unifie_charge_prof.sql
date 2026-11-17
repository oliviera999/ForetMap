-- =====================================================================
-- 363 — G&L ensemble unifié, PR 1b, étape 1.8 : charge du prof (M14).
--
-- Présences sans confirmation : tout le monde est présent par défaut, plus aucune demande
-- « présences à confirmer » n'entre dans la file du prof (le refus 409 `PRESENCE_A_CONFIRMER`
-- a disparu du moteur). Les lignes de ce type encore en attente sont fermées : plus rien ne les
-- fermerait, et la file du prof ne garde jamais une ligne sans sortie (garde-fou 11).
--
-- Idempotente : UPDATE gardé par le statut.
-- =====================================================================

UPDATE gl_game_demandes
   SET statut = 'annulee', resolved_at = NOW()
 WHERE kind = 'presence_a_confirmer' AND statut = 'en_attente';
