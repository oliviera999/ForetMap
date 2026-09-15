-- Statuts écologiques pédagogiques des fiches espèces.
--
-- 1) origin_status — indigène / introduit / envahissant (programmes biodiversité,
--    introductions, invasions ; gambusie, tilapia, élodée…).
-- 2) iucn_status — codes Liste rouge UICN (EX…NE) pour lire le niveau de menace
--    mondiale, distinct du statut biogéographique local.
--
-- errno 1060 (colonne déjà présente) est ignoré instruction par instruction
-- par database.js.
ALTER TABLE plants
  ADD COLUMN origin_status ENUM('indigene','introduit','envahissant') DEFAULT NULL
    COMMENT 'Statut biogéographique pédagogique (indigène / introduit / envahissant)';

ALTER TABLE plants
  ADD COLUMN iucn_status ENUM('EX','EW','CR','EN','VU','NT','LC','DD','NE') DEFAULT NULL
    COMMENT 'Statut Liste rouge UICN (évaluation mondiale)';

-- Semis ciblé origin_status : cas pédagogiques déjà au catalogue (noms stables).
UPDATE plants SET origin_status = 'envahissant'
WHERE name IN ('Gambusie', 'Elodée') AND origin_status IS NULL;

UPDATE plants SET origin_status = 'introduit'
WHERE name IN (
  'Tilapia du Nil',
  'Figuier de Barbarie',
  'Poisson indien mangeur d''algues'
) AND origin_status IS NULL;

UPDATE plants SET origin_status = 'indigene'
WHERE name IN (
  'Arganier',
  'Caroubier',
  'Hérisson d’Algérie',
  'Tarente de Maurétanie',
  'Criquet marocain'
) AND origin_status IS NULL;

-- Semis iucn_status (évaluations mondiales courantes, à titre pédagogique).
-- Contraste voulu : la gambusie est LC mondialement tout en étant envahissante localement.
UPDATE plants SET iucn_status = 'LC'
WHERE name IN (
  'Gambusie',
  'Tilapia du Nil',
  'Hérisson d’Algérie',
  'Tarente de Maurétanie',
  'Arganier'
) AND iucn_status IS NULL;
