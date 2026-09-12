-- Affiche échelle + rose des vents sur les plans calés GPS (désactivable carte par carte).
-- Indépendant de gps_enabled : dès qu'un calage valide existe, l'overlay peut s'afficher.
-- Défaut 1 : les plans déjà calés en profitent sans réenregistrement.
-- Idempotence : errno 1060 (colonne déjà présente) ignoré par database.js.
ALTER TABLE maps
  ADD COLUMN scale_compass_enabled TINYINT(1) NOT NULL DEFAULT 1;
