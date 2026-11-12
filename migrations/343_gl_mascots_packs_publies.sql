-- G&L : le choix de mascotte d'équipe ne propose plus que les packs PUBLIÉS du studio ForêtMap
-- (`visit_mascot_packs.is_published = 1`, cf. lib/glUnifiedMascotCatalog.js).
--
-- 1. Réattribue les équipes dont `gl_teams.mascot_id` n'est pas un pack publié (anciennes
--    mascottes SVG `gl-*`, mascottes livrées supprimées au studio, pack disparu) : pour chaque
--    partie, un pack publié du même peuple que l'équipe, distinct des autres équipes de la partie
--    (contrainte 409 de POST /api/gl/mascots/assign). S'il n'y en a pas assez : NULL, jamais de
--    doublon. Peuple d'un pack : `pack_json.type` s'il est fixé au studio, sinon déduit du
--    libellé (même règle que lib/glMascotType.js).
-- 2. Aligne `gl_mascot_assignments` sur `gl_teams.mascot_id`.
-- 3. Vide `gl_mascot_packs` (studio de packs GL, doublon du studio ForêtMap) ; les assets
--    suivent par ON DELETE CASCADE. Tables et routes conservées dans ce lot.
--
-- Idempotente : un second passage ne trouve plus d'équipe à corriger. Tables de travail
-- ordinaires (et non TEMPORARY) : MySQL refuse de rouvrir une table temporaire deux fois dans
-- la même requête.

DROP TABLE IF EXISTS _mig343_packs;
DROP TABLE IF EXISTS _mig343_fix;
DROP TABLE IF EXISTS _mig343_taken;
DROP TABLE IF EXISTS _mig343_cand;

CREATE TABLE _mig343_packs (
  catalog_id VARCHAR(120) NOT NULL PRIMARY KEY,
  people VARCHAR(16) DEFAULT NULL,
  sort_key VARCHAR(64) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO _mig343_packs (catalog_id, people, sort_key)
SELECT p.catalog_id,
       CASE
         WHEN (CASE WHEN JSON_VALID(p.pack_json)
                    THEN JSON_UNQUOTE(JSON_EXTRACT(p.pack_json, '$.type')) END) IN ('gnome', 'unicorn')
           THEN (CASE WHEN JSON_VALID(p.pack_json)
                      THEN JSON_UNQUOTE(JSON_EXTRACT(p.pack_json, '$.type')) END)
         WHEN LOWER(p.label) LIKE '%gnome%' THEN 'gnome'
         WHEN LOWER(p.label) LIKE '%licorne%' OR LOWER(p.label) LIKE '%unicorn%' THEN 'unicorn'
         ELSE NULL
       END,
       COALESCE(p.created_at, '')
  FROM visit_mascot_packs p
 WHERE p.is_published = 1;

-- Équipes à corriger, numérotées par (partie, peuple).
CREATE TABLE _mig343_fix (
  team_id INT UNSIGNED NOT NULL PRIMARY KEY,
  game_id INT UNSIGNED NOT NULL,
  people VARCHAR(16) NOT NULL,
  rn INT UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO _mig343_fix (team_id, game_id, people, rn)
SELECT t.id, t.game_id, t.type,
       ROW_NUMBER() OVER (PARTITION BY t.game_id, t.type ORDER BY t.id)
  FROM gl_teams t
 WHERE t.mascot_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM _mig343_packs k WHERE k.catalog_id = t.mascot_id);

-- Packs déjà pris dans chaque partie par les équipes conservées.
CREATE TABLE _mig343_taken (
  game_id INT UNSIGNED NOT NULL,
  catalog_id VARCHAR(120) NOT NULL,
  PRIMARY KEY (game_id, catalog_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO _mig343_taken (game_id, catalog_id)
SELECT t.game_id, t.mascot_id
  FROM gl_teams t
 WHERE t.mascot_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM _mig343_fix f WHERE f.team_id = t.id);

INSERT IGNORE INTO _mig343_taken (game_id, catalog_id)
SELECT a.game_id, a.mascot_id
  FROM gl_mascot_assignments a
 WHERE NOT EXISTS (SELECT 1 FROM _mig343_fix f WHERE f.team_id = a.team_id);

-- Packs libres de chaque partie concernée, numérotés par peuple (plus ancien d'abord).
CREATE TABLE _mig343_cand (
  game_id INT UNSIGNED NOT NULL,
  people VARCHAR(16) NOT NULL,
  rn INT UNSIGNED NOT NULL,
  catalog_id VARCHAR(120) NOT NULL,
  PRIMARY KEY (game_id, people, rn)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO _mig343_cand (game_id, people, rn, catalog_id)
SELECT g.game_id, k.people,
       ROW_NUMBER() OVER (PARTITION BY g.game_id, k.people ORDER BY k.sort_key, k.catalog_id),
       k.catalog_id
  FROM (SELECT DISTINCT game_id FROM _mig343_fix) g
  INNER JOIN _mig343_packs k ON k.people IS NOT NULL
 WHERE NOT EXISTS (
         SELECT 1 FROM _mig343_taken x
          WHERE x.game_id = g.game_id AND x.catalog_id = k.catalog_id
       );

-- Le n-ième équipe à corriger d'un peuple reçoit le n-ième pack libre de ce peuple (ou NULL).
UPDATE gl_teams t
  INNER JOIN _mig343_fix f ON f.team_id = t.id
  LEFT JOIN _mig343_cand c ON c.game_id = f.game_id AND c.people = f.people AND c.rn = f.rn
   SET t.mascot_id = c.catalog_id;

INSERT INTO gl_mascot_assignments (game_id, team_id, mascot_id, created_at)
SELECT t.game_id, t.id, t.mascot_id, NOW()
  FROM gl_teams t
  INNER JOIN _mig343_fix f ON f.team_id = t.id
 WHERE t.mascot_id IS NOT NULL
ON DUPLICATE KEY UPDATE mascot_id = VALUES(mascot_id);

-- Plus aucune assignation vers une mascotte qui n'est pas un pack publié.
DELETE a FROM gl_mascot_assignments a
 WHERE NOT EXISTS (SELECT 1 FROM _mig343_packs k WHERE k.catalog_id = a.mascot_id);

DROP TABLE IF EXISTS _mig343_packs;
DROP TABLE IF EXISTS _mig343_fix;
DROP TABLE IF EXISTS _mig343_taken;
DROP TABLE IF EXISTS _mig343_cand;

-- Studio de packs GL : contenu retiré (4 lignes vides « Nouveau pack GL » en production).
DELETE FROM gl_mascot_packs;
