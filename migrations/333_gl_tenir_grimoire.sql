-- =====================================================================
-- 333 — G&L « Tenir à deux » v2, étape 4 : grimoire v2 exécuté, honneurs, titres, badges,
-- missions, Bestiaire, Héritage, Plume du voyageur, un usage de sort du voyageur par chapitre.
--
-- Semis du grimoire v2 (`data/gl/tenir/sorts.json`, généré) : 25 sorts `tenir_v2 = 1`,
-- rattachements par chapitre cumulatifs selon le plateau (1 → 4 ; « retour » = plateau 4).
-- `effet_auto_json` n'est posé qu'à la création (COALESCE) : le chargeur `gl:import:tenir`
-- reste maître. Les anciens sorts restent intacts (jamais rétrogradés ici).
--
-- Idempotente : CREATE TABLE IF NOT EXISTS, ADD COLUMN gardé par INFORMATION_SCHEMA,
-- INSERT … ON DUPLICATE KEY UPDATE / INSERT IGNORE. Aucun DROP.
-- =====================================================================

CREATE TABLE IF NOT EXISTS gl_game_honneurs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  game_id INT UNSIGNED NOT NULL,
  team_id INT UNSIGNED NOT NULL,
  honneur VARCHAR(24) NOT NULL,
  titre_code VARCHAR(64) NULL,
  libelle VARCHAR(160) NOT NULL,
  double_honneur TINYINT(1) NOT NULL DEFAULT 0,
  -- `''` et non NULL : une clé unique MySQL laisse passer les NULL en double.
  mission_id VARCHAR(32) NOT NULL DEFAULT '',
  valeur INT NULL,
  created_by VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_gl_game_honneurs (game_id, team_id, honneur, mission_id),
  CONSTRAINT fk_gl_game_honneurs_game FOREIGN KEY (game_id) REFERENCES gl_games(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_game_honneurs_team FOREIGN KEY (team_id) REFERENCES gl_teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_player_titres (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  player_id INT UNSIGNED NOT NULL,
  game_id INT UNSIGNED NULL,
  team_id INT UNSIGNED NULL,
  titre_code VARCHAR(64) NOT NULL,
  famille VARCHAR(16) NOT NULL DEFAULT 'honneur',
  libelle VARCHAR(160) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_gl_player_titres (player_id, game_id, titre_code),
  KEY idx_gl_player_titres_player (player_id, id),
  CONSTRAINT fk_gl_player_titres_player FOREIGN KEY (player_id) REFERENCES gl_players(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_player_titres_game FOREIGN KEY (game_id) REFERENCES gl_games(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_player_badges (
  player_id INT UNSIGNED NOT NULL,
  badge_code VARCHAR(48) NOT NULL,
  game_id INT UNSIGNED NULL,
  source VARCHAR(48) NULL,
  valeur INT NULL,
  awarded_by VARCHAR(64) NULL,
  awarded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (player_id, badge_code),
  CONSTRAINT fk_gl_player_badges_player FOREIGN KEY (player_id) REFERENCES gl_players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_game_missions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  game_id INT UNSIGNED NOT NULL,
  team_id INT UNSIGNED NOT NULL,
  mission_id VARCHAR(32) NOT NULL,
  titre_sceau VARCHAR(120) NOT NULL,
  created_by VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_gl_game_missions (game_id, team_id, mission_id),
  CONSTRAINT fk_gl_game_missions_game FOREIGN KEY (game_id) REFERENCES gl_games(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_game_missions_team FOREIGN KEY (team_id) REFERENCES gl_teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_game_chimeres (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  game_id INT UNSIGNED NOT NULL,
  chapter_id INT UNSIGNED NULL,
  nom VARCHAR(120) NOT NULL,
  histoire TEXT NOT NULL,
  image_url VARCHAR(512) NULL,
  proposee_par_player_id INT UNSIGNED NULL,
  proposee_par_actor VARCHAR(64) NULL,
  statut ENUM('proposee','validee','refusee') NOT NULL DEFAULT 'proposee',
  valide_par VARCHAR(64) NULL,
  valide_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_gl_game_chimeres_game (game_id, statut),
  CONSTRAINT fk_gl_game_chimeres_game FOREIGN KEY (game_id) REFERENCES gl_games(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_game_heritages (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  game_id INT UNSIGNED NOT NULL,
  class_id INT UNSIGNED NOT NULL,
  legataire_player_id INT UNSIGNED NOT NULL,
  beneficiaire_player_id INT UNSIGNED NOT NULL,
  ressource ENUM('health','power') NOT NULL,
  montant TINYINT NOT NULL DEFAULT 2,
  draft_id INT UNSIGNED NULL,
  applique_game_id INT UNSIGNED NULL,
  applique_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_gl_game_heritages_class (class_id, applique_at),
  CONSTRAINT fk_gl_game_heritages_game FOREIGN KEY (game_id) REFERENCES gl_games(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_game_heritages_legataire FOREIGN KEY (legataire_player_id) REFERENCES gl_players(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_game_heritages_beneficiaire FOREIGN KEY (beneficiaire_player_id) REFERENCES gl_players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_voyageur_plumes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  player_id INT UNSIGNED NOT NULL,
  game_id INT UNSIGNED NULL,
  source ENUM('plume','lettre') NOT NULL DEFAULT 'plume',
  titre VARCHAR(160) NOT NULL,
  texte TEXT NOT NULL,
  statut ENUM('proposee','validee','refusee') NOT NULL DEFAULT 'proposee',
  valide_par VARCHAR(64) NULL,
  valide_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_gl_voyageur_plumes_game (game_id, statut),
  CONSTRAINT fk_gl_voyageur_plumes_player FOREIGN KEY (player_id) REFERENCES gl_players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Un usage de sort du voyageur par chapitre : la partie `live` du dernier usage.
SET @fm333 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gl_voyageur_spell_uses' AND COLUMN_NAME = 'last_used_game_id');
SET @sql = IF(@fm333 = 0, 'ALTER TABLE gl_voyageur_spell_uses ADD COLUMN last_used_game_id INT UNSIGNED NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------
-- Grimoire v2 (généré depuis data/gl/tenir/sorts.json).
-- ---------------------------------------------------------------------
INSERT INTO gl_spells
  (spell_code, category_slug, nom, cout_gemmes, cout_coeurs, cible, effet_court, statut,
   approval_mode, cast_scope, caster_kind, famille, peuple, cout, ressource, fenetre, limite_json,
   execution, effet_auto_json, tenir_v2, created_at, updated_at)
VALUES
  ('SL002', 'mouvement', 'Progression', 0, 0, 'pion_equipe', '±1 case, puis la case s''applique', 'officiel', 'auto', 'any', 'any', 'commun', 'any', 1, 'choix', 'apres_jet', '{"par": "tour", "n": 1, "portee": "equipe"}', 'auto', '{"type": "move_delta", "choix": [-1, 1], "appliquer_case": true}', 1, NOW(), NOW()),
  ('SL005', 'mouvement', 'Relance', 0, 0, 'pion_equipe', 'rejoue les dés (serveur) ou autorise une nouvelle saisie', 'officiel', 'auto', 'any', 'any', 'commun', 'any', 2, 'choix', 'apres_jet', '{"par": "tour", "n": 1, "portee": "equipe"}', 'auto', '{"type": "reroll", "annule_precedent": true}', 1, NOW(), NOW()),
  ('SL036', 'mouvement', 'Farce', 0, 0, 'autre_equipe', 'la mascotte d''une autre équipe danse 10 s', 'officiel', 'auto', 'any', 'any', 'commun', 'any', 1, 'choix', 'jeu', '{"par": "seance", "n": 1, "portee": "equipe"}', 'auto', '{"type": "mascotte_danse", "duree_s": 10}', 1, NOW(), NOW()),
  ('SL033', 'mouvement', 'Héritage', 0, 0, 'eleve', 'lègue 2 unités (ressource au choix) à un élève pour le chapitre suivant', 'officiel', 'auto', 'any', 'any', 'commun', 'any', 3, 'choix', 'seuil', '{"par": "chapitre", "n": 1, "portee": "eleve"}', 'auto', '{"type": "heritage", "montant": 2, "ressource": "choix", "application": "ouverture_chapitre_suivant"}', 1, NOW(), NOW()),
  ('SL037', 'mouvement', 'Lanterne', 2, 0, 'zone_endormie_proche', 'la zone endormie la plus proche du pion devient revelee', 'officiel', 'auto', 'any', 'unicorn', 'licornes', 'unicorn', 2, 'gemmes', 'jeu_avant_fouille', '{"par": "tour", "n": 1, "portee": "equipe"}', 'auto', '{"type": "reveler_zone", "selection": "plus_proche_du_pion", "etats_source": ["endormie"], "etat_cible": "revelee"}', 1, NOW(), NOW()),
  ('SL038', 'mouvement', 'Boussole', 2, 0, 'pion_equipe', 'affiche les 6 cases suivantes avec leur type', 'officiel', 'auto', 'any', 'unicorn', 'licornes', 'unicorn', 2, 'gemmes', 'avant_jet', '{"par": "tour", "n": 1, "portee": "equipe"}', 'auto', '{"type": "apercu_cases", "n": 6}', 1, NOW(), NOW()),
  ('SL039', 'mouvement', 'Bourrasque', 2, 0, 'autre_equipe', '+3 cases à la cible, sans effets de case ni tour consommé', 'officiel', 'auto', 'any', 'unicorn', 'licornes', 'unicorn', 2, 'gemmes', 'jeu', '{"par": "tour", "n": 1, "portee": "equipe"}', 'auto', '{"type": "move_delta_cible", "delta": 3, "appliquer_case": false, "consomme_tour": false, "compte_aide": true}', 1, NOW(), NOW()),
  ('SL040', 'mouvement', 'Grand Regard', 3, 0, 'toutes_equipes', '+1 fouille à chaque équipe ce tour', 'officiel', 'auto', 'any', 'unicorn', 'licornes', 'unicorn', 3, 'gemmes', 'jeu', '{"par": "tour", "n": 1, "portee": "partie"}', 'auto', '{"type": "fouilles_bonus", "delta": 1, "portee": "toutes_equipes", "duree": "tour"}', 1, NOW(), NOW()),
  ('SL041', 'mouvement', 'Nommer', 0, 2, 'zone_palie', 'une page pâlie au choix devient reparee si l''équipe nomme 3 vivants du biome (clic de validation du prof) ; +1 cœur aux Gnomes de l''équipe', 'officiel', 'mj_required', 'any', 'gnome', 'gnomes', 'gnome', 2, 'coeurs', 'jeu', '{"par": "tour", "n": 1, "portee": "equipe"}', 'prof', '{"type": "reparer_zone", "validation": "prof", "vivants_a_nommer": 3, "bonus": {"ressource": "coeurs", "montant": 1, "beneficiaires": "gnomes_equipe"}}', 1, NOW(), NOW()),
  ('SL042', 'mouvement', 'Sentier', 0, 2, 'pion_equipe', 'la prochaine case Souffle n''a pas d''effet sur l''équipe', 'officiel', 'auto', 'any', 'gnome', 'gnomes', 'gnome', 2, 'coeurs', 'avant_jet', '{"par": "tour", "n": 1, "portee": "equipe"}', 'auto', '{"type": "ignorer_prochaine_case_souffle"}', 1, NOW(), NOW()),
  ('SL043', 'mouvement', 'Abri', 0, 2, 'autre_equipe', 'la cible garde ses fouilles et ne pâlit pas ce tour, même sous le voile', 'officiel', 'auto', 'any', 'gnome', 'gnomes', 'gnome', 2, 'coeurs', 'jeu', '{"par": "tour", "n": 1, "portee": "equipe"}', 'auto', '{"type": "abri", "garde_fouilles": true, "pas_de_palissement": true, "duree": "tour", "compte_aide": true}', 1, NOW(), NOW()),
  ('SL044', 'mouvement', 'Relais', 0, 3, 'equipe_derniere', 'l''équipe la plus en retard rejoint la case du lanceur', 'officiel', 'auto', 'any', 'gnome', 'gnomes', 'gnome', 3, 'coeurs', 'jeu', '{"par": "tour", "n": 1, "portee": "partie"}', 'auto', '{"type": "rejoindre_case_lanceur", "cible": "equipe_derniere", "appliquer_case": false, "compte_aide": true}', 1, NOW(), NOW()),
  ('SL045', 'meta_social', 'Cordée', 0, 0, 'deux_equipes', 'les deux équipes avancent du meilleur de leurs deux jets ; le voile ne les touche pas ce tour', 'officiel', 'auto', 'any', 'any', 'pacte', 'pacte', 4, 'pacte', 'avant_jets_pacte', '{"par": "tour", "n": 1, "portee": "partie"}', 'auto', '{"type": "cordee", "repartition": {"gnome": {"ressource": "coeurs", "montant": 2}, "unicorn": {"ressource": "gemmes", "montant": 2}}, "deplacement": "meilleur_des_deux_jets", "immunite_voile": true, "compte_aide": true}', 1, NOW(), NOW()),
  ('SL004', 'pedagogique', 'Question', 0, 0, 'prof', 'poser une question au prof hors cartes', 'officiel', 'mj_required', 'any', 'any', 'travail', 'any', 2, 'peuple', 'activite', '{"par": "seance", "n": 1, "portee": "equipe"}', 'prof', NULL, 1, NOW(), NOW()),
  ('SL021', 'pedagogique', 'Conseil', 0, 0, 'autre_equipe', '30 s avec une autre équipe', 'officiel', 'mj_required', 'any', 'any', 'travail', 'any', 2, 'peuple', 'activite', '{"par": "seance", "n": 1, "portee": "equipe"}', 'prof', NULL, 1, NOW(), NOW()),
  ('SL006', 'pedagogique', 'Tablette', 0, 0, 'equipe', 'une tablette de plus', 'officiel', 'mj_required', 'any', 'any', 'travail', 'any', 2, 'peuple', 'activite', '{"par": "seance", "n": 1, "portee": "equipe"}', 'prof', NULL, 1, NOW(), NOW()),
  ('SL007', 'pedagogique', 'Musique', 0, 0, 'classe', 'le cours en musique', 'officiel', 'mj_required', 'any', 'any', 'travail', 'any', 3, 'peuple', 'activite', '{"par": "seance", "n": 1, "portee": "partie"}', 'prof', NULL, 1, NOW(), NOW()),
  ('SL046', 'pedagogique', 'Pause', 0, 0, 'equipe', 'cinq minutes de pause d''équipe', 'officiel', 'mj_required', 'any', 'any', 'travail', 'any', 3, 'peuple', 'activite', '{"par": "seance", "n": 1, "portee": "equipe"}', 'prof', NULL, 1, NOW(), NOW()),
  ('SL047', 'pedagogique', 'Rôle', 0, 0, 'equipe', 'choisir son rôle à la séance suivante', 'officiel', 'mj_required', 'any', 'any', 'travail', 'any', 2, 'peuple', 'activite', '{"par": "seance", "n": 1, "portee": "equipe"}', 'prof', NULL, 1, NOW(), NOW()),
  ('SL010', 'pedagogique', 'Esquive', 0, 0, 'eleve', 'reporter un rendu', 'officiel', 'mj_required', 'any', 'any', 'seuil', 'any', 3, 'peuple', 'seuil_veillee', '{"par": "trimestre", "n": 1, "portee": "eleve"}', 'prof', NULL, 1, NOW(), NOW()),
  ('SL027', 'pedagogique', 'Mentorat', 0, 0, 'classe', 'enseigner deux minutes à la classe ; vert + à l''oral', 'officiel', 'mj_required', 'any', 'any', 'seuil', 'any', 4, 'peuple', 'seuil_veillee', '{"par": "chapitre", "n": 1, "portee": "eleve"}', 'prof', NULL, 1, NOW(), NOW()),
  ('SL048', 'pedagogique', 'Lettre', 0, 0, 'carnet_classe', 'une page vierge écrite par l''élève entre au carnet de la classe après relecture', 'officiel', 'mj_required', 'any', 'any', 'seuil', 'any', 3, 'peuple', 'seuil_veillee', '{"par": "chapitre", "n": 1, "portee": "eleve"}', 'prof', NULL, 1, NOW(), NOW()),
  ('SL049', 'pedagogique', 'Choix', 0, 0, 'composition_equipes', 'choisir son équipe au prochain chapitre (épingle de composition)', 'officiel', 'mj_required', 'any', 'any', 'seuil', 'any', 4, 'peuple', 'seuil', '{"par": "chapitre", "n": 1, "portee": "partie"}', 'prof', NULL, 1, NOW(), NOW()),
  ('SL018', 'pedagogique', 'Consécration', 0, 0, 'eleve', 'vert + au bulletin (8 unités offertes)', 'officiel', 'mj_required', 'any', 'any', 'seuil', 'any', 8, 'choix', 'trimestre_3', '{"par": "annee", "n": 1, "portee": "eleve"}', 'prof', NULL, 1, NOW(), NOW()),
  ('SL050', 'meta_social', 'Lumière', 0, 0, 'partie', 'au palier de cartes gardées (réglage lumiere_palier), la classe choisit : voile −5 ou sort de classe libre ; actif seulement si le réglage lumiere est vrai', 'officiel', 'mj_required', 'any', 'any', 'classe', 'classe', 0, 'cartes', 'fin_seance', NULL, 'prof', '{"type": "lumiere", "options": [{"code": "voile_recul", "delta": -5}, {"code": "sort_classe_libre"}], "reglage": "tenir_lumiere"}', 1, NOW(), NOW())
ON DUPLICATE KEY UPDATE nom = VALUES(nom), cout_gemmes = VALUES(cout_gemmes), cout_coeurs = VALUES(cout_coeurs),
  cible = VALUES(cible), effet_court = VALUES(effet_court), statut = 'officiel', approval_mode = VALUES(approval_mode),
  caster_kind = VALUES(caster_kind), famille = VALUES(famille), peuple = VALUES(peuple), cout = VALUES(cout),
  ressource = VALUES(ressource), fenetre = VALUES(fenetre), limite_json = VALUES(limite_json), execution = VALUES(execution),
  effet_auto_json = COALESCE(VALUES(effet_auto_json), effet_auto_json), tenir_v2 = 1, updated_at = NOW();

-- Ouvertures cumulatives par plateau (1 → 4, « retour » = plateau 4).
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL002', 0 FROM gl_chapters c WHERE c.plateau_number = 1;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL005', 10 FROM gl_chapters c WHERE c.plateau_number = 1;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL036', 20 FROM gl_chapters c WHERE c.plateau_number = 1;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL037', 30 FROM gl_chapters c WHERE c.plateau_number = 1;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL039', 40 FROM gl_chapters c WHERE c.plateau_number = 1;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL041', 50 FROM gl_chapters c WHERE c.plateau_number = 1;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL043', 60 FROM gl_chapters c WHERE c.plateau_number = 1;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL004', 70 FROM gl_chapters c WHERE c.plateau_number = 1;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL006', 80 FROM gl_chapters c WHERE c.plateau_number = 1;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL050', 90 FROM gl_chapters c WHERE c.plateau_number = 1;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL002', 0 FROM gl_chapters c WHERE c.plateau_number = 2;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL005', 10 FROM gl_chapters c WHERE c.plateau_number = 2;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL036', 20 FROM gl_chapters c WHERE c.plateau_number = 2;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL037', 30 FROM gl_chapters c WHERE c.plateau_number = 2;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL039', 40 FROM gl_chapters c WHERE c.plateau_number = 2;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL041', 50 FROM gl_chapters c WHERE c.plateau_number = 2;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL043', 60 FROM gl_chapters c WHERE c.plateau_number = 2;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL004', 70 FROM gl_chapters c WHERE c.plateau_number = 2;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL006', 80 FROM gl_chapters c WHERE c.plateau_number = 2;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL050', 90 FROM gl_chapters c WHERE c.plateau_number = 2;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL038', 100 FROM gl_chapters c WHERE c.plateau_number = 2;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL040', 110 FROM gl_chapters c WHERE c.plateau_number = 2;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL042', 120 FROM gl_chapters c WHERE c.plateau_number = 2;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL044', 130 FROM gl_chapters c WHERE c.plateau_number = 2;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL021', 140 FROM gl_chapters c WHERE c.plateau_number = 2;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL007', 150 FROM gl_chapters c WHERE c.plateau_number = 2;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL046', 160 FROM gl_chapters c WHERE c.plateau_number = 2;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL047', 170 FROM gl_chapters c WHERE c.plateau_number = 2;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL002', 0 FROM gl_chapters c WHERE c.plateau_number = 3;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL005', 10 FROM gl_chapters c WHERE c.plateau_number = 3;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL036', 20 FROM gl_chapters c WHERE c.plateau_number = 3;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL037', 30 FROM gl_chapters c WHERE c.plateau_number = 3;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL039', 40 FROM gl_chapters c WHERE c.plateau_number = 3;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL041', 50 FROM gl_chapters c WHERE c.plateau_number = 3;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL043', 60 FROM gl_chapters c WHERE c.plateau_number = 3;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL004', 70 FROM gl_chapters c WHERE c.plateau_number = 3;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL006', 80 FROM gl_chapters c WHERE c.plateau_number = 3;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL050', 90 FROM gl_chapters c WHERE c.plateau_number = 3;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL038', 100 FROM gl_chapters c WHERE c.plateau_number = 3;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL040', 110 FROM gl_chapters c WHERE c.plateau_number = 3;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL042', 120 FROM gl_chapters c WHERE c.plateau_number = 3;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL044', 130 FROM gl_chapters c WHERE c.plateau_number = 3;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL021', 140 FROM gl_chapters c WHERE c.plateau_number = 3;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL007', 150 FROM gl_chapters c WHERE c.plateau_number = 3;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL046', 160 FROM gl_chapters c WHERE c.plateau_number = 3;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL047', 170 FROM gl_chapters c WHERE c.plateau_number = 3;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL045', 180 FROM gl_chapters c WHERE c.plateau_number = 3;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL033', 190 FROM gl_chapters c WHERE c.plateau_number = 3;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL010', 200 FROM gl_chapters c WHERE c.plateau_number = 3;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL027', 210 FROM gl_chapters c WHERE c.plateau_number = 3;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL048', 220 FROM gl_chapters c WHERE c.plateau_number = 3;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL002', 0 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL005', 10 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL036', 20 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL037', 30 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL039', 40 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL041', 50 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL043', 60 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL004', 70 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL006', 80 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL050', 90 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL038', 100 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL040', 110 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL042', 120 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL044', 130 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL021', 140 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL007', 150 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL046', 160 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL047', 170 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL045', 180 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL033', 190 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL010', 200 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL027', 210 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL048', 220 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL049', 230 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL002', 0 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL005', 10 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL036', 20 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL037', 30 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL039', 40 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL041', 50 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL043', 60 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL004', 70 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL006', 80 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL050', 90 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL038', 100 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL040', 110 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL042', 120 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL044', 130 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL021', 140 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL007', 150 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL046', 160 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL047', 170 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL045', 180 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL033', 190 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL010', 200 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL027', 210 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL048', 220 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL049', 230 FROM gl_chapters c WHERE c.plateau_number = 4;
INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index)
  SELECT c.id, 'SL018', 240 FROM gl_chapters c WHERE c.plateau_number = 4;
