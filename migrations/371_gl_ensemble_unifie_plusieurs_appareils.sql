-- =====================================================================
-- 371 — G&L ensemble unifié, PR 3 : plusieurs appareils par équipe (M13).
--
-- 1. `gl_team_etat` : la **version d'état** d'une équipe en partie (`version`, un compteur qui
--    avance à chaque geste de l'équipe : un geste envoyé avec une version périmée est refusé,
--    sans perte) et **la main** (`main_holder` : l'appareil qui joue un geste décisif ;
--    `main_geste` ; `main_expire_ms` : échéance en millisecondes, 60 s au plus). Une main échue ne
--    compte plus : aucun état d'attente sans sortie. Table à part, et non colonnes de `gl_teams` :
--    les transactions du moteur verrouillent la ligne de l'équipe ; ce compteur, écrit à chaque
--    geste, ne doit jamais s'y interbloquer. La ligne naît au premier geste de l'équipe.
-- 2. `gl_guest_tokens` : **sessions d'équipe protégées**. `accepted_at` : une session ne vaut
--    qu'une fois acceptée (par un appareil déjà dans l'équipe, ou par le prof) ; `accepted_by`
--    dit par qui (`mj`, `equipe`, `eleve`). Une demande non acceptée expire seule au bout de
--    deux minutes (`expires_at`). Les sessions déjà ouvertes restent valables.
-- 3. `gameplay.tenir_delai_debat_secondes` : sur une question de case, le bouton de réponse
--    s'allume après ce délai (8 s par défaut, 0 = tout de suite).
--
-- Idempotente : CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, UPDATE gardé par la durée
-- de vie, INSERT IGNORE.
-- =====================================================================

CREATE TABLE IF NOT EXISTS gl_team_etat (
  team_id INT UNSIGNED NOT NULL,
  game_id INT UNSIGNED NOT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  main_holder VARCHAR(48) NULL DEFAULT NULL,
  main_geste VARCHAR(24) NULL DEFAULT NULL,
  main_expire_ms BIGINT NULL DEFAULT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (team_id),
  KEY idx_gl_team_etat_game (game_id),
  KEY idx_gl_team_etat_main (main_holder),
  CONSTRAINT fk_gl_team_etat_game FOREIGN KEY (game_id) REFERENCES gl_games(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE gl_guest_tokens
  ADD COLUMN IF NOT EXISTS accepted_at DATETIME NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS accepted_by VARCHAR(16) NULL DEFAULT NULL;

-- Sessions ouvertes avant cette migration : elles valaient dès leur création. Une demande en
-- attente, elle, n'a que deux minutes devant elle : rejouer la migration ne l'accepte pas.
UPDATE gl_guest_tokens
   SET accepted_at = created_at, accepted_by = 'migration'
 WHERE kind = 'team_session' AND accepted_at IS NULL
   AND expires_at > DATE_ADD(created_at, INTERVAL 10 MINUTE);

INSERT IGNORE INTO gl_settings (`key`, value_json, updated_by, updated_at)
VALUES ('gameplay.tenir_delai_debat_secondes', '8', NULL, NOW());
