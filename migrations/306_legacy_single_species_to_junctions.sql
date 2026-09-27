-- 306 : les anciens noms mono-espèce des lieux rejoignent les jonctions d'espèces.
--
-- Piste C de l'audit du 25/09/2026 (§ 3.5, ligne `zones.current_plant` /
-- `map_markers.plant_name`), temps T1 et T2 : le code ne lit plus ni n'écrit ces deux
-- colonnes. Tant qu'elles servaient de repli à la lecture, un repère sans ligne dans
-- `marker_species` affichait quand même son ancien nom d'espèce ; le repli retiré, ce nom
-- n'apparaîtrait plus. On le rattache donc d'abord à la fiche qu'il désigne, quand elle est
-- identifiable sans ambiguïté.
--
-- Règle de correspondance : nom de fiche (`plants.name`) égal au nom hérité après
-- normalisation (espaces de tête et de queue retirés, espaces internes réduits à un seul,
-- casse ignorée), comparaison binaire ensuite — un accent différent ne correspond PAS, pour ne
-- jamais rattacher « Mûre » à « Mure ». Un nom normalisé porté par deux fiches ou plus est
-- ambigu : il est laissé de côté.
--
-- Rien n'est supprimé ni vidé : les colonnes restent en place jusqu'au temps T3 (DROP), dont
-- le contrôle de passage est :
--   SELECT COUNT(*) FROM zones WHERE current_plant <> ''                          -- = 0
--   SELECT COUNT(*) FROM map_markers m WHERE m.plant_name <> '' AND NOT EXISTS (
--     SELECT 1 FROM marker_species ms JOIN plants p ON p.id = ms.plant_id
--      WHERE ms.marker_id = m.id
--        AND LOWER(TRIM(p.name)) = LOWER(TRIM(m.plant_name)))                     -- = 0
--
-- Mesure (fixture anonymisée locale, 26/09/2026) : 3 repères sur 95 ont un `plant_name`, tous
-- trois déjà rattachés à la bonne fiche → 0 ligne ajoutée ; 0 zone sur 118 a un
-- `current_plant`. Idempotent : `INSERT IGNORE` sur la clé primaire des jonctions.

INSERT IGNORE INTO marker_species (marker_id, plant_id)
SELECT m.id, p.plant_id
  FROM map_markers m
  JOIN (
    SELECT MIN(id) AS plant_id,
           LOWER(TRIM(REGEXP_REPLACE(name, '[[:space:]]+', ' '))) COLLATE utf8mb4_bin AS norm_name
      FROM plants
     WHERE name IS NOT NULL AND TRIM(name) <> ''
     GROUP BY norm_name
    HAVING COUNT(*) = 1
  ) p
    ON p.norm_name =
       LOWER(TRIM(REGEXP_REPLACE(m.plant_name, '[[:space:]]+', ' '))) COLLATE utf8mb4_bin
 WHERE m.plant_name IS NOT NULL
   AND TRIM(m.plant_name) <> '';

INSERT IGNORE INTO zone_species (zone_id, plant_id)
SELECT z.id, p.plant_id
  FROM zones z
  JOIN (
    SELECT MIN(id) AS plant_id,
           LOWER(TRIM(REGEXP_REPLACE(name, '[[:space:]]+', ' '))) COLLATE utf8mb4_bin AS norm_name
      FROM plants
     WHERE name IS NOT NULL AND TRIM(name) <> ''
     GROUP BY norm_name
    HAVING COUNT(*) = 1
  ) p
    ON p.norm_name =
       LOWER(TRIM(REGEXP_REPLACE(z.current_plant, '[[:space:]]+', ' '))) COLLATE utf8mb4_bin
 WHERE z.current_plant IS NOT NULL
   AND TRIM(z.current_plant) <> '';
