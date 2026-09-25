-- Remet « à valider » les fiches marquées « danger relu et validé » sans relecteur connu.
--
-- Le constat (audit du 25/09/2026, § 1.3.6). Le drapeau `hazard_reviewed` était écrit par le
-- formulaire de la fiche et par l'import (alias `danger_valide`) avec la seule permission
-- `plants.manage`, sans renseigner `hazard_reviewed_by` ni `hazard_reviewed_at`. La production
-- compte 145 fiches validées sans relecteur : une mention de sécurité posée sans que personne
-- d'habilité ait relu. Le contournement est fermé dans le code (le drapeau n'est plus écrit
-- que par `POST /api/plants/:id/validate-hazard`) ; cette migration traite le stock.
--
-- Décision du mainteneur (25/09) : repasser ces fiches « à valider », pour qu'elles soient
-- revérifiées depuis la file « Dangers à valider ».
--
-- Deux corrections :
--   1. drapeau levé sans relecteur → retombe à 0 (la date orpheline, s'il y en a une, aussi) ;
--   2. drapeau baissé avec un relecteur ou une date résiduels (case décochée dans l'ancien
--      formulaire) → traçabilité effacée, pour qu'elle ne certifie rien.
-- Idempotent : rejoué, aucune ligne ne satisfait plus les conditions.

UPDATE plants
   SET hazard_reviewed = 0, hazard_reviewed_at = NULL
 WHERE hazard_reviewed = 1 AND hazard_reviewed_by IS NULL;

UPDATE plants
   SET hazard_reviewed_by = NULL, hazard_reviewed_at = NULL
 WHERE hazard_reviewed = 0
   AND (hazard_reviewed_by IS NOT NULL OR hazard_reviewed_at IS NOT NULL);
