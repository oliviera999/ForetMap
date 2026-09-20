-- Rend leurs lieux aux tâches actives que la validation avait détachées.
--
-- Pourquoi. Valider une tâche efface volontairement ses liens de zone/repère (règle métier :
-- une tâche validée n'occupe plus un lieu), après les avoir mémorisés dans
-- `recurrence_template_zone_ids` / `recurrence_template_marker_ids`. Mais rien ne les rendait
-- quand un professeur remettait ensuite la tâche à « à faire » ou « en cours » : elle
-- redevenait active **sans lieu**, donc sans pastille et introuvable sur la carte, alors que
-- la fiche de tâche ne signalait rien. En production, des tâches à faire rattachées à une
-- zone n'y apparaissaient plus — d'où ce rattrapage. Le code ne laisse plus se reformer cet
-- état (`routes/tasks.js`, `restoreDetachedLocations`) ; cette migration répare l'existant.
--
-- Portée délibérément étroite : seules les tâches **actives, non archivées, sans aucun lien
-- de lieu** et dont la mémoire désigne des lieux **qui existent toujours**. Une tâche que
-- quelqu'un a volontairement détachée de son lieu garde donc au moins un lien (ou n'a pas de
-- mémoire) et n'est pas touchée. Les tâches détachées avant l'existence de cette mémoire
-- (colonnes vides) ne sont pas rattrapables ici : leur lieu est à ressaisir à la main.
--
-- Dix lieux au plus par tâche : au-delà, la mémoire est rendue partiellement (aucune tâche
-- réelle n'approche ce nombre, et une jointure de rangs reste portable MySQL/MariaDB, là où
-- JSON_TABLE ne l'est pas).
--
-- Idempotent : les tâches réparées cessent d'être éligibles (elles ont un lien), et
-- INSERT IGNORE absorbe un doublon éventuel.

-- Collation explicite : la base de CI (MariaDB 11) crée par défaut en utf8mb4_uca1400_ai_ci,
-- et une jointure sur `tasks.id` (utf8mb4_unicode_ci) échouerait en « Illegal mix of
-- collations ». Même précaution sur les valeurs sorties de JSON_UNQUOTE plus bas.
DROP TEMPORARY TABLE IF EXISTS fm_tasks_sans_lieu;

CREATE TEMPORARY TABLE fm_tasks_sans_lieu (
  id VARCHAR(64) NOT NULL PRIMARY KEY
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO fm_tasks_sans_lieu (id)
SELECT t.id
  FROM tasks t
 WHERE t.archived_at IS NULL
   AND t.status NOT IN ('validated', 'done')
   AND (
         (t.recurrence_template_zone_ids IS NOT NULL AND t.recurrence_template_zone_ids <> '[]')
      OR (t.recurrence_template_marker_ids IS NOT NULL AND t.recurrence_template_marker_ids <> '[]')
       )
   AND NOT EXISTS (SELECT 1 FROM task_zones tz WHERE tz.task_id = t.id)
   AND NOT EXISTS (SELECT 1 FROM task_markers tm WHERE tm.task_id = t.id);

DROP TEMPORARY TABLE IF EXISTS fm_rangs_lieux;

CREATE TEMPORARY TABLE fm_rangs_lieux (i INT NOT NULL PRIMARY KEY) ENGINE=InnoDB;

INSERT INTO fm_rangs_lieux (i)
SELECT 0 UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9;

INSERT IGNORE INTO task_zones (task_id, zone_id)
SELECT t.id, z.id
  FROM tasks t
 INNER JOIN fm_tasks_sans_lieu s ON s.id = t.id
 INNER JOIN fm_rangs_lieux n
 INNER JOIN zones z
    ON z.id = CONVERT(
                JSON_UNQUOTE(
                  JSON_EXTRACT(t.recurrence_template_zone_ids, CONCAT('$[', n.i, ']'))
                ) USING utf8mb4
              ) COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO task_markers (task_id, marker_id)
SELECT t.id, m.id
  FROM tasks t
 INNER JOIN fm_tasks_sans_lieu s ON s.id = t.id
 INNER JOIN fm_rangs_lieux n
 INNER JOIN map_markers m
    ON m.id = CONVERT(
                JSON_UNQUOTE(
                  JSON_EXTRACT(t.recurrence_template_marker_ids, CONCAT('$[', n.i, ']'))
                ) USING utf8mb4
              ) COLLATE utf8mb4_unicode_ci;

-- Colonnes historiques `tasks.zone_id` / `tasks.marker_id` : elles portent le premier lieu et
-- servent encore de repli côté carte (`taskLocationIds`). Les laisser vides rendrait la
-- réparation invisible pour une tâche lue par ce chemin.
UPDATE tasks t
   INNER JOIN fm_tasks_sans_lieu s ON s.id = t.id
   SET t.zone_id = (
         SELECT tz.zone_id FROM task_zones tz WHERE tz.task_id = t.id ORDER BY tz.zone_id LIMIT 1
       ),
       t.marker_id = (
         SELECT tm.marker_id FROM task_markers tm WHERE tm.task_id = t.id ORDER BY tm.marker_id LIMIT 1
       );

DROP TEMPORARY TABLE IF EXISTS fm_tasks_sans_lieu;

DROP TEMPORARY TABLE IF EXISTS fm_rangs_lieux;
