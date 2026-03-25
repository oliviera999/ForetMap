-- Ajout des nouveaux tutoriels HTML du dossier tutos/
INSERT IGNORE INTO tutorials
  (title, slug, type, summary, source_file_path, sort_order, created_at, updated_at)
VALUES
  ('Associations de plantes', 'associations-plantes', 'html', 'Associer les plantes pour favoriser la biodiversité et les récoltes.', '/tutos/fiche-associations-punk.html', 5, NOW(), NOW()),
  ('Compostage', 'compostage', 'html', 'Comprendre et réussir le compostage au jardin.', '/tutos/fiche-compost-punk.html', 6, NOW(), NOW()),
  ('Eau au jardin', 'eau-au-jardin', 'html', 'Mieux gérer l’eau au jardin et limiter le gaspillage.', '/tutos/fiche-eau-punk.html', 7, NOW(), NOW()),
  ('Semences', 'semences', 'html', 'Récolter, conserver et utiliser les semences.', '/tutos/fiche-semences-punk.html', 8, NOW(), NOW()),
  ('Lire son sol', 'lire-son-sol', 'html', 'Observer et interpréter les caractéristiques du sol.', '/tutos/fiche-sol-punk.html', 9, NOW(), NOW()),
  ('Sol vivant', 'sol-vivant', 'html', 'Découvrir le rôle du sol vivant dans la santé du jardin.', '/tutos/fiche-sol-vivant-punk.html', 10, NOW(), NOW());

UPDATE schema_version SET version = 21;
