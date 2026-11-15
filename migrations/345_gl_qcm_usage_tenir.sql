-- =====================================================================
-- 345 — G&L « Tenir à deux » : questions posées en partie (14 novembre 2026).
--
-- 29 % des questions tirées sur les cases étaient de la taxonomie générée (« À quelle famille
-- appartient… », « Quel est le nom scientifique de… ») : sans intérêt pour des élèves de 6e.
-- Nouvelle colonne `usage_tenir` : à 0, la question ne sort plus du tirage d'une partie
-- « Tenir à deux » (cases et questions de secours des fouilles). Rien n'est supprimé ni
-- désactivé : la question reste active partout ailleurs (carnet, fiches, QCM libres).
-- La case « Posée en partie » de l'écran d'administration des QCM pilote la colonne.
--
-- Passe après la 344, qui remplace la question de zone du suricate : sa nouvelle rédaction
-- garde donc `usage_tenir = 1`. Les questions fixes des zones de chasse ne passent pas par ce
-- filtre.
-- =====================================================================

ALTER TABLE gl_qcm_questions
  ADD COLUMN IF NOT EXISTS usage_tenir TINYINT(1) NOT NULL DEFAULT 1 AFTER statut;

UPDATE gl_qcm_questions
   SET usage_tenir = 0
 WHERE usage_tenir = 1
   AND (question LIKE 'À quelle famille appartient%' OR question LIKE '%nom scientifique%');
