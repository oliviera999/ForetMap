-- 215 — Index couvrants sur les chemins les plus chauds du conditionnement (lot 6 de
-- docs/AUDIT_VALIDATION_QUIZ_2026-09.md, constat C5).
--
-- `listFmCorrectQuestionCodes` lit `user_quiz_attempts WHERE user_id = ? AND is_correct = 1`
-- (à chaque challenge, résumé et accusé) ; l'index existant `(user_id, answered_at)` obligeait à
-- relire les lignes. Même chose côté G&L pour `listCorrectQcmCodesForReader`
-- (`reader_user_type, reader_user_id, is_correct, question_dataset`). Les deux index ci-dessous
-- répondent à ces requêtes sans toucher à la table. Le lanceur de migrations ignore un index
-- déjà présent (idempotent).

CREATE INDEX idx_uqa_user_correct_question
  ON user_quiz_attempts (user_id, is_correct, question_code);

CREATE INDEX idx_gl_qcm_attempts_reader_correct
  ON gl_qcm_attempts (reader_user_type, reader_user_id, is_correct, question_dataset, question_code);
