-- =====================================================================
-- Plan e-nov : type d'espace d'un lieu innovant (zones et repères).
--
-- Le cahier des charges du label (domaine 1, niveau 3) demande d'attester, par un plan de
-- l'établissement, que plusieurs espaces de types différents ont été aménagés (extérieur,
-- pédagogique, administratif, sportif, restauration…). Ce type range la légende du plan
-- annoté imprimable (`/impression` sur `enov.*`) et s'affiche dans la fiche du lieu.
--
-- Valeurs (contrôlées côté serveur, `lib/enovPlan.js` ENOV_SPACE_TYPES) : `exterieur`,
-- `pedagogique`, `administratif`, `sportif`, `restauration`, `vie-scolaire`, `autre`.
-- NULL = type non renseigné. Colonne VARCHAR plutôt qu'ENUM : la liste peut s'allonger sans
-- `MODIFY COLUMN` sur deux tables.
--
-- IDEMPOTENCE : ADD COLUMN ignore errno 1060 (colonne déjà là). Aucune table gl_*.
-- Retour arrière : ALTER TABLE zones DROP COLUMN enov_space_type;
--                  ALTER TABLE map_markers DROP COLUMN enov_space_type;
-- =====================================================================

ALTER TABLE zones
  ADD COLUMN enov_space_type VARCHAR(24) DEFAULT NULL
    COMMENT 'Type d''espace e-nov (cahier des charges D1) : plan annoté, plan e-nov seulement'
    AFTER enov_description;

ALTER TABLE map_markers
  ADD COLUMN enov_space_type VARCHAR(24) DEFAULT NULL
    COMMENT 'Type d''espace e-nov (cahier des charges D1) : plan annoté, plan e-nov seulement'
    AFTER enov_description;
