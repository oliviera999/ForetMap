SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- =====================================================================
-- Élèves référents automatiques des tâches récurrentes (migration `task_referents_auto`).
--
-- Structure seule : aucune donnée n'est posée ni modifiée ici. Les liens référents existants
-- restent tels quels et prennent la valeur par défaut `manual` ; ils ne deviennent `auto` que
-- par le script de reprise (`scripts/student-referents-sync.js --adopt-existing --apply`),
-- lancé par un administrateur.
--
--   - `task_referents.source` : `manual` (posé par une personne) ou `auto` (posé par le moteur
--     `lib/tasks/studentReferents.js`). Le moteur ne retire jamais un lien `manual`. Nouvelles
--     valeurs éventuelles : en fin de liste ;
--   - `task_referents.added_at` : date de pose du lien (NULL pour les liens antérieurs) ;
--   - `task_series_referent_vetoes` : refus d'un n3boss qui a retiré un référent `auto` d'une
--     série (`series_id` = `COALESCE(recurrence_series_id, id)` d'une tâche). Le moteur ne
--     repose pas le lien ; un ajout manuel du même élève lève le refus. Donnée personnelle :
--     suit le compte (suppression en cascade, fusion par clé étrangère, export).
--
-- Idempotent : ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS, ADD FOREIGN KEY IF NOT
-- EXISTS. Rejouable deux fois sans erreur. Aucun trigger, aucun DEFINER, aucune table `gl_*`.
-- =====================================================================

ALTER TABLE task_referents
  ADD COLUMN IF NOT EXISTS source ENUM('manual','auto') NOT NULL DEFAULT 'manual'
    COMMENT 'Origine du lien : manual (personne) ou auto (moteur des élèves référents)',
  ADD COLUMN IF NOT EXISTS added_at DATETIME NULL
    COMMENT 'Date de pose du lien (NULL pour les liens antérieurs à la migration)';

CREATE TABLE IF NOT EXISTS task_series_referent_vetoes (
  series_id VARCHAR(64) NOT NULL
    COMMENT 'Série : COALESCE(tasks.recurrence_series_id, tasks.id)',
  user_id VARCHAR(64) NOT NULL,
  created_by VARCHAR(64) NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (series_id, user_id),
  INDEX idx_task_series_referent_vetoes_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE task_series_referent_vetoes
  ADD CONSTRAINT fk_task_series_referent_vetoes_user
    FOREIGN KEY IF NOT EXISTS (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE task_series_referent_vetoes
  ADD CONSTRAINT fk_task_series_referent_vetoes_created_by
    FOREIGN KEY IF NOT EXISTS (created_by) REFERENCES users(id) ON DELETE SET NULL;
