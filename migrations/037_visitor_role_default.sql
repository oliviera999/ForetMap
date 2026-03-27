-- Ajoute le profil système visiteur (lecture seule).
-- Idempotent : INSERT IGNORE pour ne pas écraser les personnalisations existantes.

INSERT IGNORE INTO roles (slug, display_name, rank, is_system)
VALUES ('visiteur', 'Visiteur', 50, 1);
