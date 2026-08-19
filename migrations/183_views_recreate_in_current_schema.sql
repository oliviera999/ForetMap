-- =====================================================================
-- ForetMap — Re-création des vues de lecture dans la base COURANTE.
--
-- Problème corrigé (audit docs/AUDIT_BDD_2026-08.md §4.1) : MariaDB ne stocke
-- pas la définition d'une vue telle qu'on l'a écrite. Il résout les noms de
-- table au moment du `CREATE VIEW` et **fige le nom de la base active** dans
-- `information_schema.VIEWS.VIEW_DEFINITION`. Les migrations 124 et 143
-- écrivaient pourtant des noms non qualifiés (`FROM species_interactions`).
--
-- Conséquence : le nom de la base voyage avec le schéma. Toute copie /
-- restauration sous un autre nom hérite de vues qui continuent de lire la base
-- d'ORIGINE — donc, pour une copie de la production, la production elle-même.
-- Observé sur un export du 18/08/2026 : `oliviera_foretmap5` contenait deux
-- vues lisant `oliviera_foretmap`.
--   * copie restaurée sur le serveur → `/api/food-web` écrit dans la copie
--     (nom non qualifié) et relit en production (via la vue) ;
--   * copie restaurée en local → `CREATE VIEW` refusé (base absente), et
--     `npm run db:import:dump` s'arrête là.
--
-- Cette migration rejoue les deux `CREATE VIEW` : exécutée par le runner de
-- `database.js` sur la connexion de la base courante, elle recalcule la
-- qualification quelle que soit la base. Elle est donc à rejouer après toute
-- copie de base — c'est le rôle du test `tests/schema-views-current-db.test.js`,
-- qui échoue si une vue cite un schéma autre que `DATABASE()`.
--
-- Définitions inchangées : v_food_web reprend la migration 143 (rôles
-- trophiques), v_zone_inventory la migration 124. Aucun changement de
-- comportement, aucune donnée touchée.
--
-- Idempotent (DROP VIEW IF EXISTS + CREATE) : rejouable sans erreur.
-- =====================================================================

DROP VIEW IF EXISTS v_food_web;
CREATE SQL SECURITY INVOKER VIEW v_food_web AS
  SELECT si.id, si.interaction_type,
         pf.id AS from_id, pf.name AS from_name, pf.emoji AS from_emoji,
         pf.trophic_role AS from_role,
         pt.id AS to_id, pt.name AS to_name, pt.emoji AS to_emoji,
         pt.trophic_role AS to_role,
         si.description
    FROM species_interactions si
    JOIN plants pf ON pf.id = si.from_plant_id
    LEFT JOIN plants pt ON pt.id = si.to_plant_id;

DROP VIEW IF EXISTS v_zone_inventory;
CREATE SQL SECURITY INVOKER VIEW v_zone_inventory AS
  SELECT z.id AS zone_id, z.name AS zone_name, z.map_id,
         p.id AS plant_id, p.name AS plant_name, p.emoji, p.trophic_role
    FROM zone_species zs
    JOIN zones z ON z.id = zs.zone_id
    JOIN plants p ON p.id = zs.plant_id;
