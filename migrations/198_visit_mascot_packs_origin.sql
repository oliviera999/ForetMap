-- Étape 2 de la fusion catalogue / packs (docs/AUDIT_MASCOTTES_2026-08.md, piste P3).
--
-- Les mascottes livrées avec l'application vivaient dans le code (`visitMascotCatalog.js`), les
-- packs en base : deux univers parallèles aux droits et à l'outillage différents. Elles sont
-- désormais semées dans cette table, et `origin` dit d'où vient chaque ligne.
--
-- `custom` par défaut : toute ligne existante est, par construction, un pack créé au studio.
-- Le semis, lui, pose `builtin` — ce qui rend « réinitialiser depuis l'origine » possible, et
-- distingue au studio ce qu'on peut restaurer de ce qu'on perdrait définitivement.
--
-- Idempotente : `runMigrations` ignore l'étape si la colonne existe déjà (ER_DUP_FIELDNAME).
ALTER TABLE visit_mascot_packs
  ADD COLUMN origin VARCHAR(16) NOT NULL DEFAULT 'custom';

CREATE INDEX idx_visit_mascot_packs_origin ON visit_mascot_packs (origin);
