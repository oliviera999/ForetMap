-- Rétablit la vue `v_zone_inventory` sur les bases où elle manque.
--
-- Le constat (audit du 25/09/2026, § 1.1.5 et § 1.2.2). La vue est créée par les migrations 124
-- et 183, puis n'est plus jamais recréée. Une base restaurée depuis un export qui ne contient
-- pas les vues — c'est le cas du fixture anonymisé v259, et c'est le cas d'un dump fait avec
-- l'utilisateur mutualisé, qui ne peut pas exporter une vue portant un DEFINER — arrive donc en
-- v291 **sans** elle. `GET /api/food-web?zoneId=…` (routes/food-web.js) la lit et répond alors
-- en 500 (`ER_NO_SUCH_TABLE`).
--
-- Définition inchangée (migrations 124 / 183) : `SQL SECURITY INVOKER`, sans `DEFINER`, noms
-- de table non qualifiés — le runner l'exécute sur la base courante.
-- Idempotent : `DROP VIEW IF EXISTS` puis `CREATE`.

DROP VIEW IF EXISTS v_zone_inventory;
CREATE SQL SECURITY INVOKER VIEW v_zone_inventory AS
  SELECT z.id AS zone_id, z.name AS zone_name, z.map_id,
         p.id AS plant_id, p.name AS plant_name, p.emoji, p.trophic_role
    FROM zone_species zs
    JOIN zones z ON z.id = zs.zone_id
    JOIN plants p ON p.id = zs.plant_id;
