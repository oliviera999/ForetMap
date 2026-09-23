-- Parcours : défaut et rattrapage Visite + Carte de travail.
--
-- Depuis l'activation des écrans Visite/carte (`docs/AUDIT_PARCOURS_2026-09.md` §2.3), un
-- parcours « Plan seul » (défaut d'origine) n'apparaît nulle part dans ForetMap. Le défaut
-- SQL suit désormais l'éditeur (`map,visit,plan`), et les parcours **déjà publiés sur le
-- Plan** gagnent Carte + Visite s'il leur manquait — sans toucher aux parcours réservés au
-- seul plan des personnels (pas de surface `plan`).

ALTER TABLE map_routes
  MODIFY COLUMN surfaces SET('map','visit','plan','staff') NOT NULL DEFAULT 'map,visit,plan';

UPDATE map_routes
   SET surfaces = CONCAT_WS(',', NULLIF(surfaces, ''), 'map')
 WHERE is_published = 1
   AND FIND_IN_SET('plan', surfaces) > 0
   AND FIND_IN_SET('map', surfaces) = 0;

UPDATE map_routes
   SET surfaces = CONCAT_WS(',', NULLIF(surfaces, ''), 'visit')
 WHERE is_published = 1
   AND FIND_IN_SET('plan', surfaces) > 0
   AND FIND_IN_SET('visit', surfaces) = 0;
