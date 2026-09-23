-- Lot A — Niveaux pédagogiques biodiversité (Collège / Lycée / Université).
-- Colonnes nullable = « hériter ». Idempotent.

ALTER TABLE maps
  ADD COLUMN IF NOT EXISTS pedago_level ENUM('college','lycee','universite') DEFAULT NULL
  COMMENT 'Niveau pédagogique biodiversité pour cette carte (NULL = hériter)';

ALTER TABLE `groups`
  ADD COLUMN IF NOT EXISTS pedago_level ENUM('college','lycee','universite') DEFAULT NULL
  COMMENT 'Niveau pédagogique biodiversité pour ce groupe (NULL = hériter)';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS biodiv_pedago_level ENUM('college','lycee','universite') DEFAULT NULL
  COMMENT 'Préférence personnelle d''affichage biodiversité (NULL = hériter)';
