-- =====================================================================
-- 353 — G&L « Tenir à deux » : défi de case (lot 2, étape 2.12).
--
-- Les 8 cases « Défi d'équipe » (cases 21 et 41 des plateaux 1 à 4) n'avaient ni contenu ni
-- effet. Léger et non bloquant : l'équipe reçoit un défi du plateau, le prépare pendant la
-- semaine, le prof juge « Relevé » ou « Pas encore ». Relevé : le voile recule. Jamais de
-- ressource.
--
-- 1. `gl_tenir_defis_cases` : catalogue (`data/gl/tenir/defis-cases.json`).
-- 2. `gl_game_defis_case` : défis reçus dans une partie (`a_preparer` → `releve` |
--    `pas_encore` | `annule` au Seuil).
-- 3. Réglages surchargeables par partie : `tenir_defis_case` (true), `tenir_defi_declenchement`
--    (`arret`, ou `passage`), `tenir_defi_recul` (2).
-- 4. Marquage des 8 cases par leur CONFIGURATION (`tenir.defi = true` dans
--    `event_config_json`), gardé : seulement les repères d'origine, encore sans configuration.
-- 5. Texte des 8 cases, gardé par l'ancienne valeur exacte (une case retouchée par le MJ n'est
--    pas réécrite).
--
-- 6. `gl_tenir_olu_lignes.moment` passe à 32 caractères : les moments d'Olu
--    `defi_case_recu`, `defi_case_releve`, `defi_case_pas_encore` dépassent 16.
--
-- Idempotente : CREATE TABLE IF NOT EXISTS, INSERT IGNORE, UPDATE gardés, MODIFY rejouable.
-- Aucun DROP.
-- =====================================================================

CREATE TABLE IF NOT EXISTS gl_tenir_defis_cases (
  code VARCHAR(64) NOT NULL,
  plateau TINYINT UNSIGNED NOT NULL,
  titre VARCHAR(160) NOT NULL,
  consigne TEXT NOT NULL,
  preparation TEXT NULL,
  critere TEXT NULL,
  notion VARCHAR(255) NULL,
  duree_s INT UNSIGNED NOT NULL DEFAULT 60,
  ordre INT NOT NULL DEFAULT 0,
  actif TINYINT(1) NOT NULL DEFAULT 1,
  updated_at DATETIME NULL,
  PRIMARY KEY (code),
  KEY idx_gl_tenir_defis_cases_plateau (plateau, actif)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_game_defis_case (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  game_id INT UNSIGNED NOT NULL,
  team_id INT UNSIGNED NOT NULL,
  marker_id INT UNSIGNED NULL,
  defi_code VARCHAR(64) NOT NULL,
  round_number INT NOT NULL DEFAULT 0,
  statut ENUM('a_preparer','releve','pas_encore','annule') NOT NULL DEFAULT 'a_preparer',
  created_at DATETIME NOT NULL,
  decided_at DATETIME NULL,
  decided_by VARCHAR(64) NULL,
  PRIMARY KEY (id),
  KEY idx_gl_game_defis_case_game (game_id, statut),
  KEY idx_gl_game_defis_case_team (game_id, team_id, marker_id),
  CONSTRAINT fk_gl_game_defis_case_game FOREIGN KEY (game_id) REFERENCES gl_games(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_game_defis_case_team FOREIGN KEY (team_id) REFERENCES gl_teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO gl_settings (`key`, value_json, updated_by, updated_at) VALUES
  ('gameplay.tenir_defis_case', 'true', NULL, NOW()),
  ('gameplay.tenir_defi_declenchement', '"arret"', NULL, NOW()),
  ('gameplay.tenir_defi_recul', '2', NULL, NOW());

-- 4. Marquage : les 8 repères d'origine (cases 21 et 41 des plateaux 1 à 4), encore sans
--    configuration. Le libellé ne sert que de garde ; le moteur lit `tenir.defi`.
UPDATE gl_chapter_markers
   SET event_config_json = '{"version":2,"tenir":{"defi":true}}'
 WHERE id IN (23, 40, 58, 75, 93, 110, 128, 232)
   AND event_type = 'behavior'
   AND label = 'Défi d''équipe'
   AND (event_config_json IS NULL OR event_config_json = '');

-- 5. Texte des 8 cases, gardé par l'ancienne valeur exacte.
UPDATE gl_chapter_markers
   SET description = 'Défi d''équipe : l''app vous confie un défi à préparer pour la prochaine séance. Relevé, il fait reculer le voile.'
 WHERE id IN (23, 40, 58, 75, 93, 110, 128, 232)
   AND label = 'Défi d''équipe'
   AND description = 'L''équipe doit relever un mini-défi proposé par le professeur (mime, dessin, énigme).';

UPDATE gl_chapter_markers
   SET effet_mecanique = 'Défi d''équipe : l''app vous confie un défi à préparer pour la prochaine séance. Relevé, il fait reculer le voile.'
 WHERE id IN (23, 40, 58, 75, 93, 110, 128, 232)
   AND label = 'Défi d''équipe'
   AND effet_mecanique = 'Mini-défi proposé par le professeur (mime, dessin, énigme). Ni gain ni perte : on le relève pour l''équipe.';

-- 6. Moments d'Olu des défis de case : la colonne s'élargit (rejouable sans effet).
ALTER TABLE gl_tenir_olu_lignes MODIFY COLUMN moment VARCHAR(32) NOT NULL;
