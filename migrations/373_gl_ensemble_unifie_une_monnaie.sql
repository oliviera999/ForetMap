-- =====================================================================
-- 373 — G&L, ensemble unifié, PR 4 : une seule monnaie, les gemmes (M1, M19).
--
-- 1. Grand livre : cause `depart` (bourse posée à 3 gemmes à la création d'une partie du
--    plateau 1).
-- 2. Sorts « Tenir » : toute ressource de bourse devient `gemmes` (`coeurs`, `peuple`, `choix`
--    et `pacte` disparaissent du vocabulaire ; `cartes` reste pour le sort de classe sorti du
--    grimoire). Le catalogue `data/gl/tenir/sorts.json` fait foi : cette mise à jour couvre le
--    temps entre la migration et la synchronisation. Libellé de coût périmé du Mentorat retiré.
-- 3. Parures : `gl_tenir_parures.rare`, ressource `gemmes` ; `gl_player_parures`, la
--    garde-robe — une parure achetée reste à l'élève toute l'année. Les parures déjà achetées
--    y entrent (y compris celles rendues au comptoir à la fin d'un chapitre).
-- 4. Conversion des bourses : pour chaque joueur d'une partie « Tenir » non close,
--    gemmes = min(8, gemmes + cœurs), sans jamais baisser un solde déjà supérieur. Les cœurs
--    restent en base tels quels (jeu classique, historique) : ils ne sont plus lus en
--    « Tenir ». Journalisée dans `gl_tenir_conversion_monnaie` et dans le grand livre (cause
--    `migration`), par identifiant seulement — aucun nom d'élève.
-- 5. Réserves de la caravane des mêmes parties : les cœurs en réserve passent en gemmes.
-- 6. Pots de sort en cours de collecte qui portaient des cœurs, dans ces parties : annulés
--    (rien n'avait été débité ; l'équipe relance son sort, en gemmes).
--
-- 7. Repère `gl_tenir_monnaie_unique` : le dernier mouvement du grand livre d'avant la
--    conversion. Après lui, plus aucun cœur ne doit bouger dans une partie « Tenir » : c'est ce
--    que vérifie l'invariant `COEURS_HORS_JEU` (banc, diagnostic).
--
-- Idempotente : MODIFY gardé par INFORMATION_SCHEMA, ADD COLUMN IF NOT EXISTS, CREATE TABLE IF
-- NOT EXISTS, INSERT IGNORE ; la conversion ne touche qu'une fois chaque joueur (clé primaire
-- du journal, `applique_at`). Aucun DROP. Rejouée, elle ne change rien.
-- =====================================================================

-- 1. Grand livre : cause `depart`.
SET @fm373 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gl_resource_ledger' AND COLUMN_NAME = 'cause' AND COLUMN_TYPE LIKE '%''depart''%');
SET @sql = IF(@fm373 = 0, "ALTER TABLE gl_resource_ledger MODIFY COLUMN cause ENUM('page_tenue','trame','case_positive','case_souffle','carnet_complet','sort_pot','echange','don','parure','chapardeur','nid','heritage','reparation','geste_prof','migration','case_plateau','feuillet','defaut','reserve_entree','reserve_sortie','reserve_seuil','sort_rembourse','depart') NOT NULL DEFAULT 'geste_prof'", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. Sorts « Tenir » : une seule monnaie.
UPDATE gl_spells
   SET ressource = 'gemmes', cout_gemmes = COALESCE(cout, 0), cout_coeurs = 0
 WHERE tenir_v2 = 1 AND ressource IN ('coeurs', 'peuple', 'choix', 'pacte');

-- Le Mentorat coûte 3 et ne se rembourse jamais (M23) : l'ancien libellé « 4 gemmes (récupère 2) »,
-- affiché par le catalogue des sorts, est retiré (gardé par l'ancienne valeur).
UPDATE gl_spells SET cout_total_eq = NULL
 WHERE spell_code = 'SL027' AND tenir_v2 = 1 AND cout_total_eq LIKE '4 gemmes%';

-- 3. Parures : rares, en gemmes, gardées toute l'année.
ALTER TABLE gl_tenir_parures
  ADD COLUMN IF NOT EXISTS rare TINYINT(1) NOT NULL DEFAULT 0 AFTER pelage;

UPDATE gl_tenir_parures SET ressource = 'gemmes' WHERE ressource <> 'gemmes';

CREATE TABLE IF NOT EXISTS gl_player_parures (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  player_id INT UNSIGNED NOT NULL,
  parure_code VARCHAR(48) NOT NULL,
  prix TINYINT NOT NULL DEFAULT 0,
  game_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_gl_player_parures (player_id, parure_code),
  KEY idx_gl_player_parures_parure (parure_code),
  CONSTRAINT fk_gl_player_parures_player FOREIGN KEY (player_id) REFERENCES gl_players(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_player_parures_parure FOREIGN KEY (parure_code) REFERENCES gl_tenir_parures(code) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO gl_player_parures (player_id, parure_code, prix, game_id, created_at)
SELECT gp.achetee_par, gp.parure_code, MIN(gp.prix), MIN(gp.game_id), MIN(gp.created_at)
  FROM gl_game_parures gp
 WHERE gp.achetee_par IS NOT NULL
 GROUP BY gp.achetee_par, gp.parure_code;

-- 4. Conversion des bourses des parties « Tenir » non closes.
CREATE TABLE IF NOT EXISTS gl_tenir_conversion_monnaie (
  player_id INT UNSIGNED NOT NULL,
  game_id INT UNSIGNED NULL,
  gemmes_avant INT NOT NULL DEFAULT 0,
  coeurs INT NOT NULL DEFAULT 0,
  gemmes_apres INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applique_at DATETIME NULL,
  PRIMARY KEY (player_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO gl_tenir_conversion_monnaie (player_id, game_id, gemmes_avant, coeurs, gemmes_apres, created_at)
SELECT p.id, MAX(g.id), p.power_points, p.health_points,
       GREATEST(p.power_points, LEAST(8, p.power_points + p.health_points)), NOW()
  FROM gl_players p
  INNER JOIN gl_team_members tm ON tm.player_id = p.id
  INNER JOIN gl_games g ON g.id = tm.game_id
 WHERE g.tenir_profil IS NOT NULL AND g.status <> 'ended'
 GROUP BY p.id, p.power_points, p.health_points;

UPDATE gl_players p
  INNER JOIN gl_tenir_conversion_monnaie c ON c.player_id = p.id
   SET p.power_points = c.gemmes_apres
 WHERE c.applique_at IS NULL;

INSERT INTO gl_resource_ledger
  (game_id, player_id, kind, team_id, delta_health, delta_power, solde_health_apres, solde_power_apres, cause, event_id, created_at)
SELECT c.game_id, c.player_id, 'bourse', NULL, 0, c.gemmes_apres - c.gemmes_avant, c.coeurs, c.gemmes_apres, 'migration', NULL, NOW(3)
  FROM gl_tenir_conversion_monnaie c
 WHERE c.applique_at IS NULL AND c.gemmes_apres <> c.gemmes_avant;

UPDATE gl_tenir_conversion_monnaie SET applique_at = NOW() WHERE applique_at IS NULL;

-- 5. Réserves de la caravane : les cœurs en réserve passent en gemmes (livre d'abord, sur les
--    soldes d'avant).
INSERT INTO gl_resource_ledger
  (game_id, player_id, kind, team_id, delta_health, delta_power, solde_health_apres, solde_power_apres, cause, event_id, created_at)
SELECT r.game_id, NULL, 'reserve', r.team_id, -r.reserve_health, r.reserve_health, 0, r.reserve_power + r.reserve_health, 'migration', NULL, NOW(3)
  FROM gl_game_team_reserves r
  INNER JOIN gl_games g ON g.id = r.game_id
 WHERE g.tenir_profil IS NOT NULL AND g.status <> 'ended' AND r.reserve_health > 0;

UPDATE gl_game_team_reserves r
  INNER JOIN gl_games g ON g.id = r.game_id
   SET r.reserve_power = r.reserve_power + r.reserve_health, r.reserve_health = 0
 WHERE g.tenir_profil IS NOT NULL AND g.status <> 'ended' AND r.reserve_health > 0;

-- 6. Pots en cours de collecte qui portaient des cœurs : annulés, rien n'avait été débité.
UPDATE gl_spell_cast_drafts d
  INNER JOIN gl_games g ON g.id = d.game_id
   SET d.status = 'cancelled'
 WHERE g.tenir_profil IS NOT NULL AND g.status <> 'ended' AND d.status = 'collecting'
   AND EXISTS (SELECT 1 FROM gl_spell_cast_contributions c WHERE c.draft_id = d.id AND c.hearts > 0);

-- 7. Repère de la conversion (posé une seule fois).
CREATE TABLE IF NOT EXISTS gl_tenir_monnaie_unique (
  id TINYINT UNSIGNED NOT NULL,
  ledger_id_max INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO gl_tenir_monnaie_unique (id, ledger_id_max, created_at)
SELECT 1, COALESCE(MAX(id), 0), NOW() FROM gl_resource_ledger;
