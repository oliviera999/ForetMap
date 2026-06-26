-- Géoréférencement des plans pour le suivi GPS de la mascotte.
-- geo_anchors_json : 3 points de calibration [{ "xp":n, "yp":n, "lat":n, "lng":n }, x3]
--   reliant le repère % du plan aux coordonnées GPS réelles (transformation affine,
--   voir src/utils/mapGeoTransform.js). La transformation est dérivée à la volée, non stockée.
-- gps_enabled : active le bouton « Suivre ma position » pour ce plan (extérieur uniquement).
ALTER TABLE maps ADD COLUMN geo_anchors_json LONGTEXT DEFAULT NULL;
ALTER TABLE maps ADD COLUMN gps_enabled TINYINT(1) NOT NULL DEFAULT 0;
