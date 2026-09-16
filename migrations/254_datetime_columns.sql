-- Colonnes temporelles : de VARCHAR(32) à un vrai type date.
--
-- 30 colonnes stockaient une date en texte. Le format est homogène et vérifié colonne par
-- colonne sur l'export du 15/09/2026 : 26 horodatages en ISO-8601 UTC avec millisecondes
-- (`2026-03-21T17:48:26.126Z`) et 4 dates seules (`2026-04-23`). Aucune valeur hors format.
--
-- Trois pièges, dans l'ordre où ils se présentent.
--
-- 1. L'ALTER direct échoue. `ALTER TABLE ... MODIFY COLUMN c DATETIME(3)` sur une colonne
--    au format ISO renvoie « ERROR 1292 Truncated incorrect datetime value » en mode
--    STRICT_TRANS_TABLES : la conversion implicite de colonne n'accepte ni le séparateur
--    `T` ni le suffixe `Z`, là où la fonction `CAST()` les accepte. D'où la normalisation
--    textuelle préalable, un UPDATE par colonne, avant chaque ALTER.
--
-- 2. Les millisecondes. `DATETIME` sans précision fractionnaire les tronque. C'est
--    `DATETIME(3)` qu'il faut, sinon 1 434 horodatages d'audit perdent leur milliseconde.
--
-- 3. Le fuseau — le plus coûteux, parce qu'il est silencieux. Aujourd'hui l'API renvoie la
--    chaîne ISO telle quelle, suffixée `Z`, donc non ambiguë. Après conversion, mysql2
--    renvoie un objet Date : sans configuration, il interprète le DATETIME dans le fuseau
--    du serveur Node. Mesuré sur la colonne `audit_log.created_at` convertie :
--
--       TZ=UTC              -> 2026-03-21T17:48:26.126Z   (juste, par hasard)
--       TZ=America/New_York -> 2026-03-21T21:48:26.126Z   (4 h d'écart)
--       TZ=Asia/Tokyo       -> 2026-03-21T08:48:26.126Z   (9 h d'écart)
--
--    La migration est donc INDISSOCIABLE du réglage `timezone: 'Z'` posé sur le pool dans
--    `database.js`. Et `dateStrings: ['DATE']` l'accompagne pour les 4 colonnes DATE :
--    sans lui, `2026-04-23` ressortirait en `2026-04-23T00:00:00.000Z` et les champs date
--    du formulaire de tâche cesseraient de se remplir.
--
-- Les valeurs restent de l'heure UTC : `CAST` ne décale rien, il retire `T` et `Z`. Avec
-- `timezone: 'Z'`, l'aller-retour redonne exactement la chaîne d'avant migration.
--
-- Les 79 tables `gl_*` ne sont pas concernées : aucune n'a de date en texte.
--
-- Rejouabilité : les UPDATE sont bornés par `LIKE '%T%Z'`, sans effet sur une colonne déjà
-- convertie ; les ALTER vers un type identique sont des non-opérations pour MySQL.

-- ---------------------------------------------------------------------------
-- Horodatages complets → DATETIME(3), heure UTC.
-- ---------------------------------------------------------------------------
-- `users.last_seen` ouvre la liste parce que c'est la colonne qui motivait encore
-- `lib/legacyTimestampNormalization.js` : deux écritures concurrentes y cohabitaient,
-- `toISOString()` côté application et `NOW()` côté SQL, et MySQL triant une chaîne octet
-- par octet (`' '` 0x20 avant `'T'` 0x54), toute valeur ISO passait après toute valeur
-- MySQL du même jour. Un type règle le problème à la racine : il n'y a plus de tri
-- lexicographique. Sur l'export du 15/09/2026, les 439 valeurs non vides sont en ISO.
UPDATE `users` SET `last_seen` = REPLACE(REPLACE(`last_seen`, 'T', ' '), 'Z', '') WHERE `last_seen` LIKE '%T%Z';
UPDATE `users` SET `last_seen` = NULL WHERE `last_seen` = '';
ALTER TABLE `users` MODIFY COLUMN `last_seen` DATETIME(3) DEFAULT NULL;

UPDATE `audit_log` SET `created_at` = REPLACE(REPLACE(`created_at`, 'T', ' '), 'Z', '') WHERE `created_at` LIKE '%T%Z';
ALTER TABLE `audit_log` MODIFY COLUMN `created_at` DATETIME(3) DEFAULT NULL;

UPDATE `map_markers` SET `created_at` = REPLACE(REPLACE(`created_at`, 'T', ' '), 'Z', '') WHERE `created_at` LIKE '%T%Z';
ALTER TABLE `map_markers` MODIFY COLUMN `created_at` DATETIME(3) DEFAULT NULL;

UPDATE `marker_photos` SET `uploaded_at` = REPLACE(REPLACE(`uploaded_at`, 'T', ' '), 'Z', '') WHERE `uploaded_at` LIKE '%T%Z';
ALTER TABLE `marker_photos` MODIFY COLUMN `uploaded_at` DATETIME(3) DEFAULT NULL;

UPDATE `observation_logs` SET `created_at` = REPLACE(REPLACE(`created_at`, 'T', ' '), 'Z', '') WHERE `created_at` LIKE '%T%Z';
ALTER TABLE `observation_logs` MODIFY COLUMN `created_at` DATETIME(3) DEFAULT NULL;

UPDATE `tasks` SET `created_at` = REPLACE(REPLACE(`created_at`, 'T', ' '), 'Z', '') WHERE `created_at` LIKE '%T%Z';
ALTER TABLE `tasks` MODIFY COLUMN `created_at` DATETIME(3) DEFAULT NULL;

UPDATE `task_assignments` SET `assigned_at` = REPLACE(REPLACE(`assigned_at`, 'T', ' '), 'Z', '') WHERE `assigned_at` LIKE '%T%Z';
ALTER TABLE `task_assignments` MODIFY COLUMN `assigned_at` DATETIME(3) DEFAULT NULL;

UPDATE `task_assignments` SET `done_at` = REPLACE(REPLACE(`done_at`, 'T', ' '), 'Z', '') WHERE `done_at` LIKE '%T%Z';
ALTER TABLE `task_assignments` MODIFY COLUMN `done_at` DATETIME(3) DEFAULT NULL;

UPDATE `task_logs` SET `created_at` = REPLACE(REPLACE(`created_at`, 'T', ' '), 'Z', '') WHERE `created_at` LIKE '%T%Z';
ALTER TABLE `task_logs` MODIFY COLUMN `created_at` DATETIME(3) DEFAULT NULL;

UPDATE `task_projects` SET `created_at` = REPLACE(REPLACE(`created_at`, 'T', ' '), 'Z', '') WHERE `created_at` LIKE '%T%Z';
ALTER TABLE `task_projects` MODIFY COLUMN `created_at` DATETIME(3) DEFAULT NULL;

UPDATE `tutorials` SET `created_at` = REPLACE(REPLACE(`created_at`, 'T', ' '), 'Z', '') WHERE `created_at` LIKE '%T%Z';
ALTER TABLE `tutorials` MODIFY COLUMN `created_at` DATETIME(3) DEFAULT NULL;

UPDATE `tutorials` SET `updated_at` = REPLACE(REPLACE(`updated_at`, 'T', ' '), 'Z', '') WHERE `updated_at` LIKE '%T%Z';
ALTER TABLE `tutorials` MODIFY COLUMN `updated_at` DATETIME(3) DEFAULT NULL;

UPDATE `user_plant_observation_events` SET `observed_at` = REPLACE(REPLACE(`observed_at`, 'T', ' '), 'Z', '') WHERE `observed_at` LIKE '%T%Z';
ALTER TABLE `user_plant_observation_events` MODIFY COLUMN `observed_at` DATETIME(3) NOT NULL;

UPDATE `user_tutorial_reads` SET `acknowledged_at` = REPLACE(REPLACE(`acknowledged_at`, 'T', ' '), 'Z', '') WHERE `acknowledged_at` LIKE '%T%Z';
ALTER TABLE `user_tutorial_reads` MODIFY COLUMN `acknowledged_at` DATETIME(3) NOT NULL;

UPDATE `visit_markers` SET `created_at` = REPLACE(REPLACE(`created_at`, 'T', ' '), 'Z', '') WHERE `created_at` LIKE '%T%Z';
ALTER TABLE `visit_markers` MODIFY COLUMN `created_at` DATETIME(3) DEFAULT NULL;

UPDATE `visit_markers` SET `updated_at` = REPLACE(REPLACE(`updated_at`, 'T', ' '), 'Z', '') WHERE `updated_at` LIKE '%T%Z';
ALTER TABLE `visit_markers` MODIFY COLUMN `updated_at` DATETIME(3) DEFAULT NULL;

UPDATE `visit_mascot_packs` SET `created_at` = REPLACE(REPLACE(`created_at`, 'T', ' '), 'Z', '') WHERE `created_at` LIKE '%T%Z';
ALTER TABLE `visit_mascot_packs` MODIFY COLUMN `created_at` DATETIME(3) DEFAULT NULL;

UPDATE `visit_mascot_packs` SET `updated_at` = REPLACE(REPLACE(`updated_at`, 'T', ' '), 'Z', '') WHERE `updated_at` LIKE '%T%Z';
ALTER TABLE `visit_mascot_packs` MODIFY COLUMN `updated_at` DATETIME(3) DEFAULT NULL;

UPDATE `visit_mascot_pack_deletions` SET `deleted_at` = REPLACE(REPLACE(`deleted_at`, 'T', ' '), 'Z', '') WHERE `deleted_at` LIKE '%T%Z';
ALTER TABLE `visit_mascot_pack_deletions` MODIFY COLUMN `deleted_at` DATETIME(3) DEFAULT NULL;

UPDATE `visit_mascot_sprite_library` SET `created_at` = REPLACE(REPLACE(`created_at`, 'T', ' '), 'Z', '') WHERE `created_at` LIKE '%T%Z';
ALTER TABLE `visit_mascot_sprite_library` MODIFY COLUMN `created_at` DATETIME(3) DEFAULT NULL;

UPDATE `visit_media` SET `created_at` = REPLACE(REPLACE(`created_at`, 'T', ' '), 'Z', '') WHERE `created_at` LIKE '%T%Z';
ALTER TABLE `visit_media` MODIFY COLUMN `created_at` DATETIME(3) DEFAULT NULL;

UPDATE `visit_media` SET `updated_at` = REPLACE(REPLACE(`updated_at`, 'T', ' '), 'Z', '') WHERE `updated_at` LIKE '%T%Z';
ALTER TABLE `visit_media` MODIFY COLUMN `updated_at` DATETIME(3) DEFAULT NULL;

UPDATE `visit_tutorials` SET `updated_at` = REPLACE(REPLACE(`updated_at`, 'T', ' '), 'Z', '') WHERE `updated_at` LIKE '%T%Z';
ALTER TABLE `visit_tutorials` MODIFY COLUMN `updated_at` DATETIME(3) DEFAULT NULL;

UPDATE `visit_zones` SET `created_at` = REPLACE(REPLACE(`created_at`, 'T', ' '), 'Z', '') WHERE `created_at` LIKE '%T%Z';
ALTER TABLE `visit_zones` MODIFY COLUMN `created_at` DATETIME(3) DEFAULT NULL;

UPDATE `visit_zones` SET `updated_at` = REPLACE(REPLACE(`updated_at`, 'T', ' '), 'Z', '') WHERE `updated_at` LIKE '%T%Z';
ALTER TABLE `visit_zones` MODIFY COLUMN `updated_at` DATETIME(3) DEFAULT NULL;

UPDATE `zone_photos` SET `uploaded_at` = REPLACE(REPLACE(`uploaded_at`, 'T', ' '), 'Z', '') WHERE `uploaded_at` LIKE '%T%Z';
ALTER TABLE `zone_photos` MODIFY COLUMN `uploaded_at` DATETIME(3) DEFAULT NULL;

-- ---------------------------------------------------------------------------
-- Dates sans heure → DATE. `dateStrings: ['DATE']` conserve la forme `YYYY-MM-DD`
-- côté API, identique à ce que renvoyait la colonne texte.
-- ---------------------------------------------------------------------------
UPDATE `tasks` SET `due_date` = NULL WHERE `due_date` = '';
ALTER TABLE `tasks` MODIFY COLUMN `due_date` DATE DEFAULT NULL;

UPDATE `tasks` SET `start_date` = NULL WHERE `start_date` = '';
ALTER TABLE `tasks` MODIFY COLUMN `start_date` DATE DEFAULT NULL;

UPDATE `tasks` SET `recurrence_spawned_for_due_date` = NULL WHERE `recurrence_spawned_for_due_date` = '';
ALTER TABLE `tasks` MODIFY COLUMN `recurrence_spawned_for_due_date` DATE DEFAULT NULL;

-- `zone_history`.`harvested_at` est NOT NULL : pas de vide à neutraliser.
ALTER TABLE `zone_history` MODIFY COLUMN `harvested_at` DATE NOT NULL;
