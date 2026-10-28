-- =====================================================================
-- Photos des fiches : statut « confirmée » (pré-saisie / GBIF intégrés d'emblée).
--
-- Une photo proposée par pré-saisie (Wikimedia, iNaturalist, GBIF…) est enregistrée
-- tout de suite et visible de tous, avec `confirmed = 0` : l'élève voit la mention
-- « À confirmer » ; le professeur peut la valider (`confirmed = 1`). Les photos déjà
-- présentes et les téléversements manuels restent confirmées par défaut.
--
-- IDEMPOTENCE : ADD COLUMN ignore errno 1060 (colonne déjà là). Aucune table gl_*.
-- Retour arrière : ALTER TABLE plant_photos DROP COLUMN confirmed;
-- =====================================================================

ALTER TABLE plant_photos
  ADD COLUMN confirmed TINYINT(1) NOT NULL DEFAULT 1
    COMMENT '1 = validée par un professeur ; 0 = proposée, visible avec mention À confirmer'
    AFTER sort_order;
