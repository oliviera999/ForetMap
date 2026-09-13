-- Profil système « Personnel » : même périmètre que Visiteur (lecture seule).
-- Idempotent : INSERT IGNORE pour ne pas écraser une personnalisation éventuelle.

INSERT IGNORE INTO roles (slug, display_name, `rank`, is_system, display_order)
VALUES ('personnel', 'Personnel', 50, 1, 61);
