-- Lot 9 — Vue v_visit_coverage avec alias statut_short (SQL SECURITY INVOKER).
-- Sur certaines bases externes, la dernière colonne du premier SELECT n'avait pas
-- d'alias (MariaDB la nommait Name_exp_11). Aucun code applicatif ne consomme
-- encore cette vue ; on la crée pour l'aligner sur le dump de référence.
--
-- Ne PAS supprimer zones.current_plant ni map_markers.plant_name : encore lus
-- et écrits (routes zones/map/visit, formulaires carte, tests).
-- Idempotent : DROP VIEW IF EXISTS + CREATE.

DROP VIEW IF EXISTS v_visit_coverage;
CREATE SQL SECURITY INVOKER VIEW v_visit_coverage AS
SELECT 'zone' AS kind, z.map_id, z.id, z.name AS label,
       CHAR_LENGTH(COALESCE(vz.subtitle, '')) AS len_subtitle,
       CHAR_LENGTH(COALESCE(vz.short_description, '')) AS len_short,
       CHAR_LENGTH(COALESCE(vz.details_text, '')) AS len_details,
       (SELECT COUNT(*) FROM zone_species s WHERE s.zone_id = z.id) AS nb_species,
       (SELECT COUNT(*) FROM tutorial_zones t WHERE t.zone_id = z.id) AS nb_tutorials,
       (SELECT COUNT(*) FROM zone_photos p WHERE p.zone_id = z.id) AS nb_photos,
       CASE WHEN CHAR_LENGTH(COALESCE(vz.short_description, '')) = 0 THEN 'vide'
            WHEN CHAR_LENGTH(COALESCE(vz.short_description, '')) < 120 THEN 'trop court'
            WHEN CHAR_LENGTH(COALESCE(vz.short_description, '')) > 600 THEN 'trop long'
            ELSE 'ok' END COLLATE utf8mb4_unicode_ci AS statut_short
FROM zones z LEFT JOIN visit_zones vz ON vz.id = z.id
UNION ALL
SELECT 'repere' AS kind, m.map_id, m.id, m.label AS label,
       CHAR_LENGTH(COALESCE(vm.subtitle, '')) AS len_subtitle,
       CHAR_LENGTH(COALESCE(vm.short_description, '')) AS len_short,
       CHAR_LENGTH(COALESCE(vm.details_text, '')) AS len_details,
       (SELECT COUNT(*) FROM marker_species s WHERE s.marker_id = m.id) AS nb_species,
       (SELECT COUNT(*) FROM tutorial_markers t WHERE t.marker_id = m.id) AS nb_tutorials,
       (SELECT COUNT(*) FROM marker_photos p WHERE p.marker_id = m.id) AS nb_photos,
       CASE WHEN CHAR_LENGTH(COALESCE(vm.short_description, '')) = 0 THEN 'vide'
            WHEN CHAR_LENGTH(COALESCE(vm.short_description, '')) < 120 THEN 'trop court'
            WHEN CHAR_LENGTH(COALESCE(vm.short_description, '')) > 600 THEN 'trop long'
            ELSE 'ok' END COLLATE utf8mb4_unicode_ci AS statut_short
FROM map_markers m LEFT JOIN visit_markers vm ON vm.id = m.id;
