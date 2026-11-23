SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- =====================================================================
-- Retraits de schéma, temps 3 : tables `quiz_question_species` (qqs) et
-- `quiz_question_tutorials` (qqt). Audit du 25/09/2026, § 3.5 ; procédure
-- `docs/RUNBOOK_RETRAITS_T3.md`, § « Liens question ↔ ressource ». Flux T3 de l'orchestration
-- de fin novembre 2026 ; suppression décidée par Oliv le 22/11/2026.
--
-- T1 et T2 livrés par la migration `learning_links_single_source` (300) : plus aucune
-- écriture ni lecture applicative, source unique `resource_question_links` (RQL), service
-- `lib/pedago/learningLinks.js`. Les dernières lectures (connecteur MCP : audits, fiche
-- d'espèce, filtre `species_id` des questions ; contrôles de `db:t3-status`) sont retirées
-- dans le même lot que cette migration.
--
-- Prérequis vérifiés le 22/11/2026 en lecture seule sur la production : contrôle de passage
-- de la migration 300 à 0 et 0 (771 et 247 lignes, toutes présentes dans RQL) ; aucune vue,
-- aucune clé étrangère entrante, aucun trigger ne cite ces tables.
--
-- CEINTURE : le contrôle de passage est rejoué ici. Une table n'est supprimée que si elle
-- existe ET si aucun de ses liens ne manque dans RQL ; sinon l'instruction ne fait rien (la
-- table reste, sans erreur). Idempotent : un second passage, tables absentes, ne fait rien.
-- Aucune table `gl_*`, aucune vue, aucun trigger.
--
-- Retour arrière : recréer les deux tables (DDL de la migration `quiz`, 128) et recharger
-- l'export pris avant le déploiement (runbook, étape 2) ; à défaut, les reconstruire depuis
-- RQL (`resource_type` 'plant' / 'tutorial').
-- =====================================================================

-- quiz_question_species
SET @fm_t3_qqs_exists = (
  SELECT COUNT(*) FROM information_schema.tables
   WHERE table_schema = DATABASE() AND table_name = 'quiz_question_species'
);
SET @sql = IF(
  @fm_t3_qqs_exists > 0,
  'SELECT COUNT(*) INTO @fm_t3_qqs_missing FROM quiz_question_species q WHERE NOT EXISTS (SELECT 1 FROM resource_question_links r WHERE r.resource_type = ''plant'' AND r.question_code = q.question_code AND CAST(r.resource_ref AS UNSIGNED) = q.plant_id)',
  'SET @fm_t3_qqs_missing = 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  @fm_t3_qqs_exists > 0 AND @fm_t3_qqs_missing = 0,
  'DROP TABLE IF EXISTS quiz_question_species',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- quiz_question_tutorials
SET @fm_t3_qqt_exists = (
  SELECT COUNT(*) FROM information_schema.tables
   WHERE table_schema = DATABASE() AND table_name = 'quiz_question_tutorials'
);
SET @sql = IF(
  @fm_t3_qqt_exists > 0,
  'SELECT COUNT(*) INTO @fm_t3_qqt_missing FROM quiz_question_tutorials q WHERE NOT EXISTS (SELECT 1 FROM resource_question_links r WHERE r.resource_type = ''tutorial'' AND r.question_code = q.question_code AND CAST(r.resource_ref AS UNSIGNED) = q.tutorial_id)',
  'SET @fm_t3_qqt_missing = 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  @fm_t3_qqt_exists > 0 AND @fm_t3_qqt_missing = 0,
  'DROP TABLE IF EXISTS quiz_question_tutorials',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
