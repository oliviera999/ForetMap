-- =====================================================================
-- ForetMap / GL — Possession durable des feuillets + échange sur le Marché
--
-- CONTEXTE. Jusqu'ici, la possession d'un feuillet n'était pas stockée : le
-- carnet d'un joueur était *recalculé* comme l'union des états des équipes
-- auxquelles il appartenait (`gl_game_feuillet_states` JOIN `gl_team_members`).
-- La possession était donc **dérivée de l'appartenance**, et donc révocable :
--   - retirer un joueur d'une partie (DELETE sur gl_team_members) lui faisait
--     perdre rétroactivement des feuillets qu'il avait lui-même découverts ;
--   - le déplacer d'équipe lui faisait perdre ceux de l'ancienne équipe ;
--   - supprimer une partie effaçait le carnet de tous ses joueurs (cascade).
-- Sans échange, cela passait inaperçu. Avec l'échange, un élève pourrait perdre
-- un feuillet qu'il a payé, à cause d'une manipulation de roster sans rapport.
--
-- [1] gl_player_feuillet_states — trace de possession **par joueur**, écrite à
--     chaque acquisition (découverte d'équipe ou réception d'un échange). Le
--     carnet devient l'union « ce que mes équipes ont trouvé » + « ce que je
--     possède en propre » : insensible aux remaniements d'équipe.
--     La règle de partage ne change pas : une découverte profite toujours à
--     toute l'équipe — chaque membre présent reçoit simplement sa propre trace.
--
-- [2] gl_market_trade_side_feuillets — feuillets proposés dans un échange.
--     Un échange de feuillet est une **copie** : le donneur garde le sien.
--
-- [3] unlocked_via += 'echange' — distingue un feuillet reçu d'un feuillet
--     trouvé sur la carte. Indispensable pour qu'un futur bonus de complétion
--     de chapitre compte l'exploration et non le troc.
--
-- [4] gameplay.market_feuillets_enabled (défaut true) — pendant du réglage
--     `market_hearts_enabled` : permet de couper l'échange de feuillets sans
--     couper le Marché.
--
-- Idempotent (CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, INSERT
-- ... ON DUPLICATE KEY UPDATE sans écriture de valeur).
-- =====================================================================

-- [1] Possession durable, par joueur.
CREATE TABLE IF NOT EXISTS gl_player_feuillet_states (
  player_id INT UNSIGNED NOT NULL,
  feuillet_code VARCHAR(64) NOT NULL,
  status ENUM('discovered', 'read', 'held', 'effaced') NOT NULL DEFAULT 'discovered',
  effacement_pct TINYINT UNSIGNED NOT NULL DEFAULT 0,
  acquired_via ENUM('decouverte', 'echange') NOT NULL DEFAULT 'decouverte',
  -- Attribution d'origine : le nom du découvreur voyage avec la copie, de sorte
  -- qu'un feuillet reçu par échange crédite toujours celui qui l'a trouvé.
  discovered_by_player_id VARCHAR(64) DEFAULT NULL,
  discovered_by_name VARCHAR(120) DEFAULT NULL,
  discovered_source VARCHAR(48) DEFAULT NULL,
  acquired_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (player_id, feuillet_code),
  INDEX idx_gl_player_feuillet_states_code (feuillet_code),
  CONSTRAINT fk_gl_player_feuillet_states_player FOREIGN KEY (player_id)
    REFERENCES gl_players(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_player_feuillet_states_feuillet FOREIGN KEY (feuillet_code)
    REFERENCES gl_lore_feuillets(feuillet_code) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reprise de l'existant : on matérialise la possession déjà acquise via les
-- équipes, pour que les carnets actuels ne dépendent plus de l'appartenance.
-- En cas d'états multiples pour un même joueur, on retient le moins effacé
-- (même règle que la lecture du carnet).
INSERT INTO gl_player_feuillet_states (
  player_id, feuillet_code, status, effacement_pct, acquired_via,
  discovered_by_player_id, discovered_by_name, discovered_source, acquired_at
)
SELECT tm.player_id,
       s.feuillet_code,
       SUBSTRING_INDEX(GROUP_CONCAT(s.status ORDER BY s.effacement_pct ASC), ',', 1),
       MIN(s.effacement_pct),
       'decouverte',
       SUBSTRING_INDEX(
         GROUP_CONCAT(COALESCE(s.discovered_by_player_id, '') ORDER BY s.effacement_pct ASC), ',', 1
       ),
       SUBSTRING_INDEX(
         GROUP_CONCAT(COALESCE(s.discovered_by_name, '') ORDER BY s.effacement_pct ASC), ',', 1
       ),
       SUBSTRING_INDEX(
         GROUP_CONCAT(COALESCE(s.discovered_source, '') ORDER BY s.effacement_pct ASC), ',', 1
       ),
       NOW()
  FROM gl_game_feuillet_states s
  JOIN gl_team_members tm ON tm.game_id = s.game_id AND tm.team_id = s.team_id
 WHERE s.status IN ('discovered', 'read', 'held', 'effaced')
 GROUP BY tm.player_id, s.feuillet_code
ON DUPLICATE KEY UPDATE updated_at = updated_at;

-- Les chaînes vides produites par le COALESCE ci-dessus ne sont pas des
-- attributions : on les remet à NULL.
UPDATE gl_player_feuillet_states
   SET discovered_by_player_id = NULL
 WHERE discovered_by_player_id = '';
UPDATE gl_player_feuillet_states
   SET discovered_by_name = NULL
 WHERE discovered_by_name = '';
UPDATE gl_player_feuillet_states
   SET discovered_source = NULL
 WHERE discovered_source = '';

-- [2] Feuillets proposés dans un échange du Marché.
CREATE TABLE IF NOT EXISTS gl_market_trade_side_feuillets (
  trade_id INT UNSIGNED NOT NULL,
  player_id INT UNSIGNED NOT NULL,
  feuillet_code VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (trade_id, player_id, feuillet_code),
  INDEX idx_gl_market_trade_side_feuillets_trade (trade_id),
  CONSTRAINT fk_gl_market_side_feuillets_trade FOREIGN KEY (trade_id)
    REFERENCES gl_market_trades(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_market_side_feuillets_player FOREIGN KEY (player_id)
    REFERENCES gl_players(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_market_side_feuillets_feuillet FOREIGN KEY (feuillet_code)
    REFERENCES gl_lore_feuillets(feuillet_code) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- [3] Nouveau canal de déblocage : réception par échange.
-- La liste reprend l'ENUM courant (117 + 'espece' ajouté par la migration 119) et
-- n'ajoute 'echange' QU'À LA FIN : MySQL stocke un ENUM par son index, donc retirer
-- ou réordonner une valeur remapperait — ou tronquerait — les lignes existantes.
ALTER TABLE gl_game_feuillet_states
  MODIFY COLUMN unlocked_via
    ENUM('zone', 'manual', 'story', 'gemme', 'espece', 'echange') DEFAULT NULL;

-- [4] Réglage d'activation de l'échange de feuillets (actif par défaut).
INSERT INTO gl_settings (`key`, value_json, updated_by, updated_at)
VALUES ('gameplay.market_feuillets_enabled', 'true', NULL, NOW())
ON DUPLICATE KEY UPDATE updated_at = updated_at;
