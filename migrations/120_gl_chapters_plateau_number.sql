-- Chapitres GL : numéro de plateau narratif (1–5) pour les zones feuillets

ALTER TABLE gl_chapters
  ADD COLUMN plateau_number TINYINT UNSIGNED DEFAULT NULL AFTER souffle_face;

ALTER TABLE gl_chapters
  ADD INDEX idx_gl_chapters_plateau_number (plateau_number);
