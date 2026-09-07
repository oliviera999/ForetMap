-- =====================================================================
-- Conditionnement par QCM — les liens GENERES par script ne bloquent plus.
--
-- Contexte (docs/AUDIT_VALIDATION_QUIZ_2026-09.md, constat B1) : la migration 194 a posé la
-- règle « un conditionnement ne s'applique que là où un humain a coché bloquant » et a
-- rattrapé les liens d'import (`origin = 'import'`). Mais scripts/generate-linked-questions.js
-- écrivait encore `origin = 'generated'`, `status = 'approved'`, `is_gating = 1` : des liens
-- approuvés ET bloquants que personne n'a cochés, hors du rattrapage de 194. À l'allumage de
-- l'interrupteur global, ils auraient conditionné d'un coup toutes les ressources couvertes.
--
-- Le script insère désormais `is_gating = 0` ; cette migration rattrape l'existant, sur le
-- même modèle que 194. Ne touche jamais `origin = 'manual'`.
-- Idempotent (deuxième passage : 0 ligne affectée). Pré-requis : 144 (FM) et 145 (GL).
-- =====================================================================

UPDATE resource_question_links
   SET is_gating = 0
 WHERE origin = 'generated' AND is_gating = 1;

UPDATE gl_resource_question_links
   SET is_gating = 0
 WHERE origin = 'generated' AND is_gating = 1;
