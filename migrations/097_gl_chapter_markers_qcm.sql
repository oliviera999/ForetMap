ALTER TABLE gl_chapter_markers
  ADD COLUMN qcm_categorie_slug VARCHAR(64) DEFAULT NULL AFTER description,
  ADD COLUMN qcm_question_code VARCHAR(16) DEFAULT NULL AFTER qcm_categorie_slug;

ALTER TABLE gl_chapter_markers
  ADD INDEX idx_gl_chapter_markers_qcm_cat (qcm_categorie_slug);

ALTER TABLE gl_chapter_markers
  ADD CONSTRAINT fk_gl_chapter_markers_qcm_question
    FOREIGN KEY (qcm_question_code) REFERENCES gl_qcm_questions(question_code)
    ON UPDATE CASCADE ON DELETE SET NULL;
