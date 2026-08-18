-- Simplification : les mascottes de visite ne sont plus rattachées à une carte.
--
-- Pourquoi : le studio « Packs mascotte » listait les packs de la carte active
-- (`visit_mascot_packs.map_id`), alors que le registre public
-- (`GET /api/visit/mascots`) les expose déjà toutes cartes confondues. Deux portées
-- pour un même objet = liste différente selon la carte, packs invisibles d'une carte
-- à l'autre, et impossibilité de déplacer un pack sans passer par export/import.
-- Un pack (et un sprite de bibliothèque) est désormais un objet **global** de la visite.
--
-- Idempotent : le runner ignore les errnos 1050/1060/1061/1091/1146/1826 — cf.
-- MYSQL_MIGRATION_EXPECTED_ERRNO dans database.js. Les `DROP` rejoués renvoient 1091.
--
-- Fichiers disque : rien n'est déplacé. Les sprites déjà écrits sous
-- `uploads/visit_mascot_sprite_library/<map_id>/` restent lisibles — le serveur
-- résout un nom de fichier d'abord à plat puis dans les sous-dossiers historiques
-- (cf. `resolveVisitMascotSpriteLibraryRelPath`), et l'URL historique
-- `/api/visit/mascot-sprite-library/<map_id>/assets/<fichier>` reste servie pour ne
-- pas casser les packs publiés qui la référencent dans `framesBase`.

-- 1) Packs : dédoublonnage par `catalog_id` avant l'unicité globale.
--    `catalog_id` est généré (`srv-<uuid>`), les collisions inter-cartes sont donc
--    théoriques ; on conserve la ligne la plus récemment mise à jour (updated_at est
--    un VARCHAR ISO, l'ordre lexicographique est chronologique).
DELETE p FROM visit_mascot_packs p
  INNER JOIN (
    SELECT catalog_id, MAX(CONCAT(COALESCE(updated_at, ''), '#', id)) AS keep_key
      FROM visit_mascot_packs
     GROUP BY catalog_id
    HAVING COUNT(*) > 1
  ) dup
    ON dup.catalog_id = p.catalog_id
   AND CONCAT(COALESCE(p.updated_at, ''), '#', p.id) <> dup.keep_key;

ALTER TABLE visit_mascot_packs DROP FOREIGN KEY fk_visit_mascot_packs_map;
ALTER TABLE visit_mascot_packs DROP INDEX uq_visit_mascot_packs_map_catalog;
ALTER TABLE visit_mascot_packs DROP INDEX idx_visit_mascot_packs_map_published;
CREATE UNIQUE INDEX uq_visit_mascot_packs_catalog ON visit_mascot_packs (catalog_id);
CREATE INDEX idx_visit_mascot_packs_published ON visit_mascot_packs (is_published);
ALTER TABLE visit_mascot_packs DROP COLUMN map_id;

-- 2) Bibliothèque de sprites : un fichier = une entrée, toutes cartes confondues.
--    En cas d'homonymie entre cartes on garde la plus ancienne entrée (celle que les
--    packs historiques référencent le plus probablement).
DELETE l FROM visit_mascot_sprite_library l
  INNER JOIN (
    SELECT filename, MIN(CONCAT(COALESCE(created_at, ''), '#', id)) AS keep_key
      FROM visit_mascot_sprite_library
     GROUP BY filename
    HAVING COUNT(*) > 1
  ) dup
    ON dup.filename = l.filename
   AND CONCAT(COALESCE(l.created_at, ''), '#', l.id) <> dup.keep_key;

ALTER TABLE visit_mascot_sprite_library DROP FOREIGN KEY fk_visit_mascot_sprite_lib_map;
ALTER TABLE visit_mascot_sprite_library DROP INDEX uq_visit_mascot_sprite_lib_map_file;
ALTER TABLE visit_mascot_sprite_library DROP INDEX idx_visit_mascot_sprite_lib_map;
CREATE UNIQUE INDEX uq_visit_mascot_sprite_lib_file ON visit_mascot_sprite_library (filename);
ALTER TABLE visit_mascot_sprite_library DROP COLUMN map_id;
