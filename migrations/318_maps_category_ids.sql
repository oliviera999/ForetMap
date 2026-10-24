-- =====================================================================
-- Catégories affichées par défaut et catégories cachées, réglées **par carte**.
-- Voir `lib/terrain/mapService.js`, `src/components/settings/MapsAdminPanel.jsx` et
-- `docs/reference/foretmap/carte-et-zones.md`.
--
-- LE BESOIN
-- « Cartographie → Cartes » proposait un seul réglage global (`ui.map.default_category_ids`)
-- listant toutes les catégories de toutes les cartes. Chaque carte a ses propres catégories
-- (colonne `location_categories.map_id`) : le choix des catégories cochées à l'ouverture doit
-- donc se faire carte par carte, et chaque carte doit pouvoir cacher des catégories.
--
-- LA RÉPONSE
-- 1. `maps.default_category_ids` : catégories cochées d'office à l'ouverture de la carte de
--    travail (identifiants séparés par `;`, vide = aucun filtre).
-- 2. `maps.hidden_category_ids` : catégories cachées sur cette carte (retirées des filtres,
--    lieux qui n'avaient qu'elles absents de la carte de travail).
-- 3. Reprise : chaque carte encore jamais réglée (`NULL`) hérite de la valeur du réglage
--    global. Les identifiants qui ne concernent pas la carte sont écartés à la lecture.
--
-- IDEMPOTENCE
-- Colonnes : erreur 1060 tolérée par le lanceur. La reprise ne touche que les lignes `NULL`,
-- or l'écriture depuis la console pose toujours une chaîne (vide comprise).
-- Retour arrière : DROP des deux colonnes.
-- =====================================================================

ALTER TABLE maps
  ADD COLUMN default_category_ids TEXT DEFAULT NULL
    COMMENT 'Catégories cochées par défaut sur la carte de travail';

ALTER TABLE maps
  ADD COLUMN hidden_category_ids TEXT DEFAULT NULL
    COMMENT 'Catégories cachées sur la carte de travail';

UPDATE maps m
  JOIN app_settings s ON s.`key` = 'ui.map.default_category_ids'
   SET m.default_category_ids = JSON_UNQUOTE(s.value_json)
 WHERE m.default_category_ids IS NULL
   AND JSON_VALID(s.value_json) = 1
   AND JSON_TYPE(s.value_json) = 'STRING';
