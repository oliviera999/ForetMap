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
-- **Collations.** Le schéma pose toutes ses tables en `utf8mb4_unicode_ci`, mais une valeur
-- calculée (`JSON_UNQUOTE(...)`) ou une colonne déclarée sans collation explicite (une table
-- temporaire) prend celle du **serveur** : `utf8mb4_uca1400_ai_ci` sur MariaDB 11.4, celle de
-- la CI. Les comparer à `zones.id` casse alors la migration — « Illegal mix of collations »,
-- erreur 1267, et le démarrage échoue. D'où deux précautions ici : le rapprochement reste
-- dans le domaine JSON (`JSON_CONTAINS`, qui ne borne pas non plus le nombre de lieux
-- mémorisés), avec la collation des deux opérandes fixée explicitement ; et la table
-- temporaire déclare la sienne au lieu de l'hériter.
--
-- Idempotent : les tâches réparées cessent d'être éligibles (elles ont un lien), et
-- INSERT IGNORE absorbe un doublon éventuel.

CREATE TEMPORARY TABLE IF NOT EXISTS fm_tasks_sans_lieu (
  id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL PRIMARY KEY
) ENGINE=InnoDB;

TRUNCATE TABLE fm_tasks_sans_lieu;

-- Les tâches éligibles sont figées ici : sans cela, l'insertion des zones rendrait la tâche
-- « déjà pourvue » et la passe suivante n'irait plus chercher ses repères.
INSERT INTO fm_tasks_sans_lieu (id)
SELECT t.id
  FROM tasks t
 WHERE t.archived_at IS NULL
   AND t.status NOT IN ('validated', 'done')
   AND (
         (JSON_VALID(t.recurrence_template_zone_ids) AND JSON_LENGTH(t.recurrence_template_zone_ids) > 0)
      OR (JSON_VALID(t.recurrence_template_marker_ids) AND JSON_LENGTH(t.recurrence_template_marker_ids) > 0)
       )
   AND NOT EXISTS (SELECT 1 FROM task_zones tz WHERE tz.task_id = t.id)
   AND NOT EXISTS (SELECT 1 FROM task_markers tm WHERE tm.task_id = t.id);

INSERT IGNORE INTO task_zones (task_id, zone_id)
SELECT t.id, z.id
  FROM tasks t
 INNER JOIN fm_tasks_sans_lieu s ON s.id = t.id
 INNER JOIN zones z
    ON JSON_VALID(t.recurrence_template_zone_ids)
   AND JSON_CONTAINS(
         t.recurrence_template_zone_ids COLLATE utf8mb4_bin,
         JSON_QUOTE(z.id COLLATE utf8mb4_bin)
       );

INSERT IGNORE INTO task_markers (task_id, marker_id)
SELECT t.id, m.id
  FROM tasks t
 INNER JOIN fm_tasks_sans_lieu s ON s.id = t.id
 INNER JOIN map_markers m
    ON JSON_VALID(t.recurrence_template_marker_ids)
   AND JSON_CONTAINS(
         t.recurrence_template_marker_ids COLLATE utf8mb4_bin,
         JSON_QUOTE(m.id COLLATE utf8mb4_bin)
       );

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
