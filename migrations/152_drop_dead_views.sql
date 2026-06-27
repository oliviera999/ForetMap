-- =====================================================================
-- ForetMap — Nettoyage : suppression de deux vues SQL mortes.
--
-- `v_species` (créée par la migration 124) et `v_gl_food_web` (créée par la
-- migration 136) ne sont consommées NULLE PART dans le code applicatif
-- (lib/, routes/, scripts/, src/, tests/ — vérifié par grep récursif).
--   * v_species : vue de confort jamais branchée à une route.
--   * v_gl_food_web : provisionnée en amont d'une UI réseau-trophique GL qui
--     n'a jamais été câblée (aucune route ne la lit).
-- Suppression sans risque : la re-création reste triviale (définitions
-- conservées dans les migrations 124 et 136) si un besoin émerge.
--
-- IMPORTANT — vues conservées : `v_food_web` et `v_zone_inventory` restent en
-- place car consommées par `routes/food-web.js` (NE PAS supprimer ici).
--
-- Idempotent (DROP VIEW IF EXISTS) : rejouable sans erreur.
-- =====================================================================

DROP VIEW IF EXISTS v_species;
DROP VIEW IF EXISTS v_gl_food_web;
