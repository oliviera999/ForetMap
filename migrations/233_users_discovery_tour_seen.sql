-- Progression des visites guidées (accueil OLU + parcours d'onglets), liée au compte.
-- LONGTEXT JSON : portable d'un appareil a l'autre ; NULL / {} = rien encore vu.
-- Idempotence : errno 1060 (colonne deja presente) ignore par database.js.
ALTER TABLE users
  ADD COLUMN discovery_tour_seen_json LONGTEXT NULL
    COMMENT 'JSON des visites guidees deja presentees (welcome, map, ...)';
