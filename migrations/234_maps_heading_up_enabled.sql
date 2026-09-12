-- Autorise, carte par carte, le mode « orientation boussole » (heading-up).
-- Indépendant de gps_enabled : sans calage GPS le bouton reste inutilisable côté client,
-- mais le flag permet de préparer une carte ou de couper l'orientation sur un plan précis.
-- Idempotence : errno 1060 (colonne déjà présente) ignoré par database.js.
ALTER TABLE maps
  ADD COLUMN heading_up_enabled TINYINT(1) NOT NULL DEFAULT 0;
