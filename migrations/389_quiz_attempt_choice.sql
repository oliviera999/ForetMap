SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- =====================================================================
-- Quiz : réponse choisie et version de la question (flux Q, 22/11/2026).
--
-- `user_quiz_attempts` ne gardait que `is_correct` : on ne savait pas QUEL choix l'élève avait
-- retenu. Or un distracteur choisi révèle une conception erronée précise, et c'est la seule
-- donnée qui permette de juger une question (distracteur attracteur, distracteur mort,
-- discrimination). Cinq colonnes, toutes NULL : les tentatives historiques restent sans valeur
-- et comptent dans le taux de réussite, pas dans la répartition des choix.
--
--   - `choix_lettre`       : lettre D'ORIGINE du choix retenu (celle de `quiz_questions`),
--                            jamais la position affichée ;
--   - `ordre_presente`     : ordre d'affichage en lettres d'origine (ex. `CADB`), pour mesurer
--                            un effet de position résiduel du mélange ;
--   - `duree_ms`           : temps entre la présentation et la réponse, mesuré CÔTÉ SERVEUR,
--                            borné à la durée de vie du jeton (15 min = 900 000 ms) ;
--   - `contexte`           : quiz libre, tirage, validation d'une fiche, séance pédagogique ;
--   - `question_empreinte` : SHA-256 tronqué (12 hex) de l'énoncé, des choix et de la bonne
--                            réponse à la présentation (lib/quizQuestionFingerprint.js) — une
--                            répartition des choix n'a de sens que pour un même jeu de choix.
--
-- Index `(question_code, question_empreinte, choix_lettre)` : la répartition par version est
-- un GROUP BY sur ces trois colonnes.
--
-- Pas de nouvelle table, aucune ligne `app_settings`. Pas de clé étrangère sur
-- `question_code` (cf. migration `integrity_foreign_keys`).
--
-- Idempotent : ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS.
--
-- Retour arrière (à la main, si besoin) :
--   DROP INDEX IF EXISTS idx_uqa_question_version_choice ON user_quiz_attempts;
--   ALTER TABLE user_quiz_attempts
--     DROP COLUMN IF EXISTS question_empreinte,
--     DROP COLUMN IF EXISTS contexte,
--     DROP COLUMN IF EXISTS duree_ms,
--     DROP COLUMN IF EXISTS ordre_presente,
--     DROP COLUMN IF EXISTS choix_lettre;
-- =====================================================================

ALTER TABLE user_quiz_attempts
  ADD COLUMN IF NOT EXISTS choix_lettre ENUM('A','B','C','D','E') NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ordre_presente VARCHAR(5) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS duree_ms INT UNSIGNED NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS contexte ENUM('libre','tirage','validation','seance') NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS question_empreinte CHAR(12) NULL DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_uqa_question_version_choice
  ON user_quiz_attempts (question_code, question_empreinte, choix_lettre);
