-- Consommation one-shot des jetons de présentation QCM en partie.
-- Empêche le rejeu d'un même presentationToken pour gonfler gl_team_scores.
CREATE TABLE IF NOT EXISTS gl_qcm_presentation_uses (
  jti VARCHAR(64) NOT NULL,
  game_id INT UNSIGNED NOT NULL,
  team_id INT UNSIGNED NULL,
  question_code VARCHAR(32) NOT NULL,
  used_at DATETIME NOT NULL,
  PRIMARY KEY (jti),
  KEY idx_gl_qcm_presentation_uses_game (game_id, used_at)
);
