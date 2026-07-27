-- Unicité (task_id, student_id) sur les inscriptions aux tâches.
--
-- Pourquoi : `POST /api/tasks/:id/assign` contrôlait « déjà inscrit » puis insérait sans
-- transaction ni contrainte. Un double-clic (ou l'inscription en lot du front) pouvait créer
-- deux lignes pour le même n3beur sur la même tâche, et dépasser `required_students`.
-- Cf. audit B4, docs/AUDIT_BUGS_2026-07.md.
--
-- Portée : MySQL/MariaDB autorise plusieurs NULL dans un index UNIQUE, donc les inscriptions
-- HÉRITÉES (`student_id IS NULL`, appariées par nom) ne sont pas contraintes — comportement
-- volontaire, elles restent gérées par la logique applicative.
--
-- Idempotent : le runner ignore l'errno 1061 (index déjà présent) — cf.
-- MYSQL_MIGRATION_EXPECTED_ERRNO dans database.js.

-- 1) Dédoublonnage préalable : sans lui, la création de l'index unique échouerait (errno 1062).
--    On conserve la ligne la plus ancienne (MIN(id)), qui porte l'inscription d'origine ;
--    `done_at` éventuellement posé sur un doublon est reporté sur la ligne conservée pour ne
--    pas perdre la progression d'un n3beur en mode collectif.
UPDATE task_assignments ta
  INNER JOIN (
    SELECT MIN(id) AS keep_id, task_id, student_id, MAX(done_at) AS any_done_at
      FROM task_assignments
     WHERE student_id IS NOT NULL
     GROUP BY task_id, student_id
    HAVING COUNT(*) > 1
  ) dup ON dup.keep_id = ta.id
   SET ta.done_at = COALESCE(ta.done_at, dup.any_done_at);

DELETE ta
  FROM task_assignments ta
  INNER JOIN (
    SELECT MIN(id) AS keep_id, task_id, student_id
      FROM task_assignments
     WHERE student_id IS NOT NULL
     GROUP BY task_id, student_id
    HAVING COUNT(*) > 1
  ) dup
    ON dup.task_id = ta.task_id
   AND dup.student_id = ta.student_id
   AND ta.id <> dup.keep_id;

-- 2) Contrainte d'unicité.
CREATE UNIQUE INDEX uq_task_assignments_task_student
  ON task_assignments (task_id, student_id);
