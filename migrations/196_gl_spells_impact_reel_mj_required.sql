-- Garde-fou « impact scolaire réel » : cinq sortilèges ne produisent pas un effet de jeu
-- mais un effet dans la scolarité de l'élève (report d'un rendu, réponse donnée par le
-- professeur, « vert + » à l'oral ou au bulletin, dispense d'une activité évaluée).
--
-- Tous les sortilèges étaient en `approval_mode = 'auto'`, et le réglage global
-- `gameplay.spell_cast_approval_mode` vaut `per_spell` : ces cinq-là étaient donc lançables
-- sans qu'aucun adulte ne soit consulté, dès lors qu'un élève réunissait les gemmes. Un
-- avantage scolaire s'achetait au comptant — et ceux qui pouvaient le plus en acheter
-- étaient ceux qui en avaient le moins besoin.
--
-- `mj_required` ne supprime aucun sortilège et ne change aucun coût : le lancement passe
-- simplement par une validation du maître du jeu. Les sortilèges purement fictionnels
-- (déplacement, soin, narration) restent en `auto`.
--
-- Idempotente : ne touche que les lignes encore en 'auto', et ne recrée rien.

UPDATE gl_spells
   SET approval_mode = 'mj_required',
       updated_at = NOW()
 WHERE spell_code IN (
         'SL010', -- Esquive       : reporte un rendu
         'SL012', -- Révélation    : le professeur donne la réponse
         'SL017', -- Annulation    : dispense d'une activité évaluée
         'SL018', -- Consécration  : « vert + » au bulletin
         'SL027'  -- Mentorat      : « vert + » à l'oral
       )
   AND approval_mode = 'auto';
