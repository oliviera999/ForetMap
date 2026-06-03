-- Feedback pédagogique par question QCM (réponse correcte + par choix A–E)

ALTER TABLE gl_qcm_questions
  ADD COLUMN feedback_correct TEXT NULL AFTER statut,
  ADD COLUMN feedback_a TEXT NULL,
  ADD COLUMN feedback_b TEXT NULL,
  ADD COLUMN feedback_c TEXT NULL,
  ADD COLUMN feedback_d TEXT NULL,
  ADD COLUMN feedback_e TEXT NULL;
