-- =====================================================================
-- 330 — G&L « Tenir à deux » v2, étape 1 : fondations.
--
-- Réglages `gameplay.tenir_*` (défauts posés sans écraser une valeur existante) et valeurs
-- DÉCIDÉES par la spec (docs/GL_TENIR_A_DEUX_REGLES.md § 15 : plafonds 8/8, cœurs
-- échangeables, lecture gratuite, pot « coordinator ») qui écrasent la prod.
-- Profils par partie (`gl_games.tenir_profil` / `tenir_overrides_json` / `tenir_surface`),
-- jeton de projection, état « tenir » par partie, effets temporaires.
-- Catalogues indépendants des parties, chargés par `scripts/gl-import-tenir.js` :
-- zones de chasse, questions de lecture, péripéties, missions, titres, badges, lignes d'Olu,
-- parures, pages de route du Passeur.
-- Sorts : colonnes du grimoire v2 (famille, peuple, coût + ressource, fenêtre, limite,
-- exécution, effet automatique, drapeau `tenir_v2`) ; brouillons : tour, paramètres d'effet,
-- partenaire de pacte, joueur (sort individuel), ressource choisie.
-- Marché : place publique (`gl_market_annonces`), dons, parures portées.
-- Retrait (conduite, hors économie) : `gl_game_retraits`, motif vu du prof seul.
-- Corrections de contenu (§ 7.3 du prompt) : les 4 cases d'arrivée ne donnent plus
-- +3 gemmes (l'honneur Éclaireurs remplace la récompense) ; les cases quiz des plateaux
-- 1-4 tirent dans TOUT le biome du chapitre (pools vides : catégories « base » absentes de
-- la banque) et promettent « +1 case et on relance ».
--
-- Idempotente : CREATE TABLE IF NOT EXISTS, ADD COLUMN gardé par INFORMATION_SCHEMA
-- (patron 195), ENUM étendus en fin de liste, INSERT … ON DUPLICATE KEY UPDATE. Aucun DROP.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Réglages : valeurs DÉCIDÉES (écrasent la prod).
-- ---------------------------------------------------------------------
INSERT INTO gl_settings (`key`, value_json, updated_by, updated_at) VALUES
  ('gameplay.vitality_enabled', 'true', NULL, NOW()),
  ('gameplay.max_power_points', '8', NULL, NOW()),
  ('gameplay.max_health_points', '8', NULL, NOW()),
  ('gameplay.market_hearts_enabled', 'true', NULL, NOW()),
  ('gameplay.lore_feuillet_retrigger', '"once_per_team"', NULL, NOW()),
  ('gameplay.lore_gemme_costs_enabled', 'false', NULL, NOW()),
  ('gameplay.lore_heart_rewards_enabled', 'false', NULL, NOW()),
  ('gameplay.feuillet_zone_traversal_enabled', 'false', NULL, NOW()),
  ('gameplay.spell_cast_contribution_mode', '"coordinator"', NULL, NOW()),
  ('gameplay.spell_cast_team_scope', '"own_team"', NULL, NOW()),
  ('gameplay.marker_effect_auto_move_enabled', 'true', NULL, NOW())
ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW();

-- Réglages : simples DÉFAUTS (ne touchent pas une valeur déjà posée par le MJ).
INSERT INTO gl_settings (`key`, value_json, updated_by, updated_at) VALUES
  ('gameplay.tenir_enabled', 'true', NULL, NOW()),
  ('gameplay.tenir_surface', '"tableau"', NULL, NOW()),
  ('gameplay.tenir_des_mode', '"physique"', NULL, NOW()),
  ('gameplay.tenir_des_mode_par_surface', '{"tableau":"physique","hybride":"physique","tablette":"serveur"}', NULL, NOW()),
  ('gameplay.tenir_des_count', '2', NULL, NOW()),
  ('gameplay.tenir_des_physiques_validation', '"prof"', NULL, NOW()),
  ('gameplay.tenir_questions_de_case', 'true', NULL, NOW()),
  ('gameplay.tenir_vent', 'true', NULL, NOW()),
  ('gameplay.tenir_vent_cases', '3', NULL, NOW()),
  ('gameplay.tenir_fouilles_par_tour', '{"gnome":1,"unicorn":2}', NULL, NOW()),
  ('gameplay.tenir_fouille_seuils', '{"chaud":0.06,"tiede":0.15}', NULL, NOW()),
  ('gameplay.tenir_zones_par_plateau', '{"1":8,"2":8,"3":10,"4":10}', NULL, NOW()),
  ('gameplay.tenir_pistes_par_semaine', '1', NULL, NOW()),
  ('gameplay.tenir_pages_veillee_par_semaine', '2', NULL, NOW()),
  ('gameplay.tenir_voile', 'true', NULL, NOW()),
  ('gameplay.tenir_voile_bonus_par_plateau', '{"1":4,"2":4,"3":5,"4":6}', NULL, NOW()),
  ('gameplay.tenir_palissement_pct', '10', NULL, NOW()),
  ('gameplay.tenir_palissement_max', '50', NULL, NOW()),
  ('gameplay.tenir_recul_carnet_complet', '3', NULL, NOW()),
  ('gameplay.tenir_recul_lumiere', '5', NULL, NOW()),
  ('gameplay.tenir_marche', 'true', NULL, NOW()),
  ('gameplay.tenir_marche_pendant_tour', 'true', NULL, NOW()),
  ('gameplay.tenir_parures', 'true', NULL, NOW()),
  ('gameplay.tenir_lumiere', 'false', NULL, NOW()),
  ('gameplay.tenir_lumiere_palier', '25', NULL, NOW()),
  ('gameplay.tenir_cartes_vers_cases', 'false', NULL, NOW()),
  ('gameplay.tenir_chapardeur', 'true', NULL, NOW()),
  ('gameplay.tenir_peripeties', 'true', NULL, NOW()),
  ('gameplay.tenir_olu_erreur_du_jour', 'true', NULL, NOW()),
  ('gameplay.tenir_sablier_secondes', '180', NULL, NOW()),
  ('gameplay.tenir_trimestres', '{"1":["09-01","12-20"],"2":["01-05","03-31"],"3":["04-01","07-10"]}', NULL, NOW()),
  ('gameplay.tenir_titre_prefixe_double', '"Très Grands"', NULL, NOW())
ON DUPLICATE KEY UPDATE updated_at = updated_at;

-- ---------------------------------------------------------------------
-- gl_games : profil, surcharges, surface dénormalisée, jeton de projection.
-- ---------------------------------------------------------------------
SET @fm330 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gl_games' AND COLUMN_NAME = 'tenir_profil');
SET @sql = IF(@fm330 = 0, 'ALTER TABLE gl_games ADD COLUMN tenir_profil ENUM(''complet'',''prologue'') NULL DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fm330 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gl_games' AND COLUMN_NAME = 'tenir_overrides_json');
SET @sql = IF(@fm330 = 0, 'ALTER TABLE gl_games ADD COLUMN tenir_overrides_json LONGTEXT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fm330 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gl_games' AND COLUMN_NAME = 'tenir_surface');
SET @sql = IF(@fm330 = 0, 'ALTER TABLE gl_games ADD COLUMN tenir_surface VARCHAR(16) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fm330 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gl_games' AND COLUMN_NAME = 'projection_token_hash');
SET @sql = IF(@fm330 = 0, 'ALTER TABLE gl_games ADD COLUMN projection_token_hash VARCHAR(128) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------
-- État « tenir » d'une partie (voile, carnet complet, première arrivée, chapardeur, nid,
-- position de l'oiseau) et effets temporaires (abri, sentier, fouille bonus, cordée…).
-- Créés dès l'étape 1 : `lib/glTenir.js` (`loadOrCreateTenirState`) les lit.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gl_game_tenir_state (
  game_id INT UNSIGNED NOT NULL,
  voile_position INT NOT NULL DEFAULT -1,
  voile_last_roll_round INT NOT NULL DEFAULT 0,
  carnet_complet_at DATETIME NULL,
  premiere_arrivee_team_id INT UNSIGNED NULL,
  chapardeur_round TINYINT NULL,
  nid_json LONGTEXT NULL,
  kraa_json LONGTEXT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (game_id),
  CONSTRAINT fk_gl_game_tenir_state_game FOREIGN KEY (game_id) REFERENCES gl_games(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_game_tenir_effets (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  game_id INT UNSIGNED NOT NULL,
  round_number INT NOT NULL DEFAULT 0,
  kind VARCHAR(32) NOT NULL,
  team_id INT UNSIGNED NULL,
  source_team_id INT UNSIGNED NULL,
  payload_json LONGTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_gl_game_tenir_effets_game_round (game_id, round_number, kind),
  CONSTRAINT fk_gl_game_tenir_effets_game FOREIGN KEY (game_id) REFERENCES gl_games(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Catalogues (indépendants des parties).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gl_chasse_zones (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  chapter_id INT UNSIGNED NULL,
  zone_key VARCHAR(48) NOT NULL,
  plateau TINYINT NOT NULL,
  feuillet_code VARCHAR(64) NOT NULL,
  titre_prive VARCHAR(255) NOT NULL DEFAULT '',
  indice VARCHAR(160) NOT NULL DEFAULT '',
  polygone_json LONGTEXT NULL,
  polygone_ref VARCHAR(48) NULL,
  centre_x DOUBLE NULL,
  centre_y DOUBLE NULL,
  rang_case INT NULL,
  geometrie_prete TINYINT(1) NOT NULL DEFAULT 0,
  question_code VARCHAR(32) NULL,
  theme_secours VARCHAR(64) NULL,
  ordre INT NOT NULL DEFAULT 0,
  actif TINYINT(1) NOT NULL DEFAULT 1,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_gl_chasse_zones_key (zone_key),
  KEY idx_gl_chasse_zones_plateau (plateau, actif, ordre),
  CONSTRAINT fk_gl_chasse_zones_chapter FOREIGN KEY (chapter_id) REFERENCES gl_chapters(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_tenir_questions_lecture (
  zone_key VARCHAR(48) NOT NULL,
  feuillet_code VARCHAR(64) NOT NULL,
  question TEXT NOT NULL,
  choix_json LONGTEXT NOT NULL,
  reponse CHAR(1) NOT NULL,
  feedback_correct TEXT NULL,
  feedback_incorrect TEXT NULL,
  actif TINYINT(1) NOT NULL DEFAULT 1,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (zone_key),
  CONSTRAINT fk_gl_tenir_questions_lecture_zone FOREIGN KEY (zone_key) REFERENCES gl_chasse_zones(zone_key) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_tenir_peripeties (
  id VARCHAR(32) NOT NULL,
  plateau TINYINT NOT NULL,
  biome_slug VARCHAR(48) NOT NULL,
  texte TEXT NOT NULL,
  passable TINYINT(1) NOT NULL DEFAULT 1,
  actif TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_tenir_missions (
  id VARCHAR(32) NOT NULL,
  texte TEXT NOT NULL,
  type VARCHAR(16) NOT NULL DEFAULT 'cooperative',
  titre_sceau VARCHAR(120) NOT NULL,
  actif TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_tenir_titres (
  code VARCHAR(64) NOT NULL,
  famille ENUM('honneur','sceau_peuple','mission','voyageur') NOT NULL,
  honneur VARCHAR(24) NULL,
  peuple VARCHAR(16) NULL,
  biome VARCHAR(24) NULL,
  plateau TINYINT NULL,
  libelle VARCHAR(120) NOT NULL,
  actif TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_tenir_badges (
  code VARCHAR(48) NOT NULL,
  nom VARCHAR(120) NOT NULL,
  critere TEXT NULL,
  regle_type ENUM('compteur','serie_hebdo','saisie_prof','reserve') NOT NULL DEFAULT 'compteur',
  seuil INT NULL,
  source VARCHAR(48) NULL,
  icone VARCHAR(32) NULL,
  actif TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_tenir_olu_lignes (
  id VARCHAR(16) NOT NULL,
  moment VARCHAR(16) NOT NULL,
  expression VARCHAR(16) NOT NULL DEFAULT 'neutre',
  texte VARCHAR(255) NOT NULL,
  variables_json LONGTEXT NULL,
  correction VARCHAR(255) NULL,
  actif TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  KEY idx_gl_tenir_olu_lignes_moment (moment, actif)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_tenir_parures (
  code VARCHAR(48) NOT NULL,
  nom VARCHAR(120) NOT NULL,
  description TEXT NULL,
  prix TINYINT NOT NULL DEFAULT 2,
  ressource VARCHAR(8) NOT NULL DEFAULT 'choix',
  chapitre_min TINYINT NOT NULL DEFAULT 1,
  type ENUM('calque','pastille') NOT NULL DEFAULT 'pastille',
  asset VARCHAR(255) NULL,
  pelage VARCHAR(16) NULL,
  actif TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_tenir_passeur_pages (
  plateau TINYINT NOT NULL,
  ordre TINYINT NOT NULL,
  feuillet_code VARCHAR(64) NOT NULL,
  ordre_voyage INT NULL,
  titre VARCHAR(255) NULL,
  biome_slug VARCHAR(48) NULL,
  justification TEXT NULL,
  avertissement VARCHAR(255) NULL,
  actif TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (plateau, ordre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Sorts : grimoire v2.
-- ---------------------------------------------------------------------
SET @fm330 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gl_spells' AND COLUMN_NAME = 'famille');
SET @sql = IF(@fm330 = 0, 'ALTER TABLE gl_spells ADD COLUMN famille VARCHAR(16) NULL, ADD COLUMN peuple ENUM(''any'',''gnome'',''unicorn'',''pacte'',''classe'') NOT NULL DEFAULT ''any'', ADD COLUMN cout TINYINT NULL, ADD COLUMN ressource ENUM(''gemmes'',''coeurs'',''peuple'',''choix'',''pacte'',''cartes'') NULL, ADD COLUMN fenetre VARCHAR(32) NULL, ADD COLUMN limite_json LONGTEXT NULL, ADD COLUMN execution ENUM(''auto'',''prof'') NOT NULL DEFAULT ''prof'', ADD COLUMN effet_auto_json LONGTEXT NULL, ADD COLUMN tenir_v2 TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE gl_spells MODIFY COLUMN caster_kind ENUM('any','gnome','unicorn','pacte','classe') NOT NULL DEFAULT 'any';

SET @fm330 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gl_spell_cast_drafts' AND COLUMN_NAME = 'cast_round_number');
SET @sql = IF(@fm330 = 0, 'ALTER TABLE gl_spell_cast_drafts ADD COLUMN cast_round_number INT NULL, ADD COLUMN effect_params_json LONGTEXT NULL, ADD COLUMN partner_team_id INT UNSIGNED NULL, ADD COLUMN player_id INT UNSIGNED NULL, ADD COLUMN ressource_choisie ENUM(''gemmes'',''coeurs'') NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------
-- Marché v2 : place publique, dons, parures portées.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gl_market_annonces (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  class_id INT UNSIGNED NOT NULL,
  player_id INT UNSIGNED NOT NULL,
  type ENUM('cherche','offre','propose') NOT NULL,
  cherche_json LONGTEXT NULL,
  offre_json LONGTEXT NULL,
  statut ENUM('ouverte','conclue','fermee','expiree') NOT NULL DEFAULT 'ouverte',
  trade_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_gl_market_annonces_class (class_id, statut, id),
  CONSTRAINT fk_gl_market_annonces_class FOREIGN KEY (class_id) REFERENCES gl_classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_market_annonces_player FOREIGN KEY (player_id) REFERENCES gl_players(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_market_annonces_trade FOREIGN KEY (trade_id) REFERENCES gl_market_trades(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_market_dons (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  class_id INT UNSIGNED NOT NULL,
  game_id INT UNSIGNED NULL,
  donneur_id INT UNSIGNED NOT NULL,
  receveur_id INT UNSIGNED NOT NULL,
  gemmes TINYINT NOT NULL DEFAULT 0,
  coeurs TINYINT NOT NULL DEFAULT 0,
  feuillet_code VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_gl_market_dons_class (class_id, id),
  KEY idx_gl_market_dons_donneur (donneur_id),
  CONSTRAINT fk_gl_market_dons_class FOREIGN KEY (class_id) REFERENCES gl_classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_market_dons_donneur FOREIGN KEY (donneur_id) REFERENCES gl_players(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_market_dons_receveur FOREIGN KEY (receveur_id) REFERENCES gl_players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_game_parures (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  game_id INT UNSIGNED NOT NULL,
  team_id INT UNSIGNED NOT NULL,
  parure_code VARCHAR(48) NOT NULL,
  achetee_par INT UNSIGNED NULL,
  ressource VARCHAR(8) NOT NULL DEFAULT 'gemmes',
  prix TINYINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  rendue_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_gl_game_parures_game_team (game_id, team_id, rendue_at),
  CONSTRAINT fk_gl_game_parures_game FOREIGN KEY (game_id) REFERENCES gl_games(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_game_parures_team FOREIGN KEY (team_id) REFERENCES gl_teams(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_game_parures_parure FOREIGN KEY (parure_code) REFERENCES gl_tenir_parures(code) ON DELETE CASCADE,
  CONSTRAINT fk_gl_game_parures_player FOREIGN KEY (achetee_par) REFERENCES gl_players(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Retrait (conduite) : motif vu du prof seul, jamais dans un payload d'événement.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gl_game_retraits (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  game_id INT UNSIGNED NOT NULL,
  player_id INT UNSIGNED NOT NULL,
  motif TEXT NULL,
  entree_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sortie_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_gl_game_retraits_open (game_id, player_id, sortie_at),
  CONSTRAINT fk_gl_game_retraits_game FOREIGN KEY (game_id) REFERENCES gl_games(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_game_retraits_player FOREIGN KEY (player_id) REFERENCES gl_players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Corrections de contenu (plateaux 1-4) — JSON régulier (version 2), JSON_SET suffit.
-- ---------------------------------------------------------------------
-- 1. Cases d'arrivée : plus de +3 gemmes (toutes les branches), description sans promesse.
UPDATE gl_chapter_markers m
  INNER JOIN gl_chapters ch ON ch.id = m.chapter_id
   SET m.event_config_json = JSON_SET(m.event_config_json, '$.effects.neutral.deltaGems', 0)
 WHERE ch.plateau_number BETWEEN 1 AND 4
   AND m.event_type = 'story'
   AND JSON_VALID(m.event_config_json)
   AND JSON_EXTRACT(m.event_config_json, '$.effects.neutral.deltaGems') IS NOT NULL;

UPDATE gl_chapter_markers m
  INNER JOIN gl_chapters ch ON ch.id = m.chapter_id
   SET m.event_config_json = JSON_SET(m.event_config_json, '$.effects.gnome.deltaGems', 0)
 WHERE ch.plateau_number BETWEEN 1 AND 4
   AND m.event_type = 'story'
   AND JSON_VALID(m.event_config_json)
   AND JSON_EXTRACT(m.event_config_json, '$.effects.gnome.deltaGems') IS NOT NULL;

UPDATE gl_chapter_markers m
  INNER JOIN gl_chapters ch ON ch.id = m.chapter_id
   SET m.event_config_json = JSON_SET(m.event_config_json, '$.effects.unicorn.deltaGems', 0)
 WHERE ch.plateau_number BETWEEN 1 AND 4
   AND m.event_type = 'story'
   AND JSON_VALID(m.event_config_json)
   AND JSON_EXTRACT(m.event_config_json, '$.effects.unicorn.deltaGems') IS NOT NULL;

UPDATE gl_chapter_markers m
  INNER JOIN gl_chapters ch ON ch.id = m.chapter_id
   SET m.description = CONCAT(m.description, ' La première équipe arrivée reçoit l''honneur des Éclaireurs.')
 WHERE ch.plateau_number BETWEEN 1 AND 4
   AND m.event_type = 'story'
   AND m.description NOT LIKE '%Éclaireurs%';

-- 2. Cases quiz : pool = tout le biome du chapitre (catégories et niveaux vides),
--    promesse « +1 case et on relance ».
UPDATE gl_chapter_markers m
  INNER JOIN gl_chapters ch ON ch.id = m.chapter_id
   SET m.event_config_json = JSON_SET(
         m.event_config_json,
         '$.question.pool.niveaux', JSON_ARRAY(),
         '$.question.pool.categorieSlugs', JSON_ARRAY()
       ),
       m.description = 'Tire une carte question du biome. Bonne réponse : +1 case et on relance.'
 WHERE ch.plateau_number BETWEEN 1 AND 4
   AND m.event_type IN ('quiz', 'question')
   AND JSON_VALID(m.event_config_json)
   AND JSON_EXTRACT(m.event_config_json, '$.question.pool') IS NOT NULL;
