-- 214 — Les propositions de rattachement ne conditionnent jamais (lot 4 de
-- docs/AUDIT_VALIDATION_QUIZ_2026-09.md, constat B2).
--
-- Le rattachement automatique (`POST /api/learning-links/suggest`, `scripts/suggest-learning-links.js`)
-- insérait ses propositions en `is_gating = 1` : approuvées en lot d'un clic, quarante propositions
-- textuelles devenaient quarante questions bloquantes. Règle unique désormais : une proposition, un
-- import ou une génération ne conditionne jamais ; seul un geste explicite « rendre bloquant » le fait.
-- Les propositions encore en attente prennent la nouvelle valeur ; les liens déjà approuvés ne sont
-- pas touchés (un professeur a pu vouloir ce qu'il a approuvé). Idempotente.

UPDATE resource_question_links
   SET is_gating = 0, updated_at = NOW()
 WHERE status = 'suggested' AND is_gating = 1 AND origin IN ('auto', 'import');

UPDATE gl_resource_question_links
   SET is_gating = 0, updated_at = NOW()
 WHERE status = 'suggested' AND is_gating = 1 AND origin IN ('auto', 'import');
