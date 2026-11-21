# Fichier préparé du `DROP` T3 — `quiz_question_species`, `quiz_question_tutorials`

> Flux **F4** du chantier CPT, 21/11/2026. **Ce n'est pas une migration** et ce flux ne la
> verse pas. Le SQL ci-dessous est à copier **tel quel** dans
> `migrations/NNN_drop_quiz_question_species_tutorials.sql` le jour du T3, `NNN` étant le
> premier numéro libre au-dessus de `main` ce jour-là (décision D2 de la fiche de coordination :
> un numéro réservé à l'avance serait sauté sans erreur par le runner).
>
> Il est livré en Markdown parce que `.gitignore` écarte tout `*.sql` hors des jeux déclarés
> (garde contre les dumps) : aucun fichier `.sql` n'est ajouté par ce flux.
>
> Procédure et prérequis : `docs/RUNBOOK_RETRAITS_T3.md`, § « Liens question ↔ ressource ».
> Essai fait sur une base jetable (trois passages) : un lien absent de
> `resource_question_links` → la table concernée **reste** ; contrôle à 0 → les deux tables
> sont supprimées ; tables absentes → aucun effet, aucune erreur.

```sql
-- =====================================================================
-- FICHIER PRÉPARÉ, PAS UNE MIGRATION. Il vit hors de `migrations/` et ne porte pas de numéro :
-- `NNN` est attribué le jour où il est versé (premier numéro libre au-dessus de `main`), parce
-- qu'un numéro réservé à l'avance serait sauté sans erreur par le runner dès qu'une migration
-- de numéro supérieur est passée (`runMigrations`, curseur `schema_version`).
-- Préparé par le flux F4 du chantier CPT (21/11/2026). Procédure : docs/RUNBOOK_RETRAITS_T3.md.
--
-- Retraits de schéma, temps 3 : tables `quiz_question_species` (qqs) et
-- `quiz_question_tutorials` (qqt). Audit du 25/09/2026, § 3.5. T1 et T2 livrés par la
-- migration 300 (`300_learning_links_single_source.sql`) : plus aucune écriture, source unique
-- `resource_question_links` (RQL), service `lib/pedago/learningLinks.js`.
--
-- CONTRÔLE DE PASSAGE DE LA MIGRATION 300 — à lancer AVANT de verser ce fichier, sur la
-- production, en lecture seule (`npm run db:t3-status`, candidat « Tables
-- quiz_question_species et quiz_question_tutorials », ou les deux requêtes ci-dessous).
-- Les deux résultats doivent valoir 0 :
--
--   SELECT COUNT(*) FROM quiz_question_species q WHERE NOT EXISTS (
--     SELECT 1 FROM resource_question_links r WHERE r.resource_type = 'plant'
--        AND r.question_code = q.question_code
--        AND CAST(r.resource_ref AS UNSIGNED) = q.plant_id);
--   SELECT COUNT(*) FROM quiz_question_tutorials q WHERE NOT EXISTS (
--     SELECT 1 FROM resource_question_links r WHERE r.resource_type = 'tutorial'
--        AND r.question_code = q.question_code
--        AND CAST(r.resource_ref AS UNSIGNED) = q.tutorial_id);
--
-- Un résultat non nul désigne des liens que la suppression ferait perdre : ne pas verser,
-- rejouer d'abord la reprise de la migration 300 (ses deux `INSERT IGNORE … NOT EXISTS`).
--
-- AUTRES CONDITIONS, toutes requises (migration 300, « T3 ») :
--   1. le code T1/T2 tourne en production depuis au moins un cycle, sans retour arrière ;
--   2. plus aucune LECTURE des deux tables dans le code. Relevé du 21/11/2026 — à retirer
--      avant, ou dans la même PR :
--        lib/mcp/audits/index.js   chargeur `quizQuestionSpecies` (lu par audits/checks.js)
--        lib/mcp/tools/content.js  fiche d'une espèce (UNION) et filtre `species_id` des
--                                  questions ForetMap
--        lib/mcp/sqlGuard.js       les deux tables dans la liste des tables de contenu
--        lib/schemaRetirements.js  candidat `quiz_question_links` (ses contrôles les lisent)
--        database.js               `SYNC_IGNORED_TABLES_RE` — ligne partagée avec les tables
--                                  `gl_*` : accord du mainteneur G&L
--        tests                     tests/content/pedago-tutorial-links.test.js,
--                                  tests/content/learning-links-single-source.test.js,
--                                  tests/learning-links-sheet.test.js,
--                                  tests/learning-links-migration-300.test.js,
--                                  tests/learning-links-suggest.test.js
--      Vérification : `grep -rn "quiz_question_species\|quiz_question_tutorials"` hors
--      `migrations/`, `docs/` et `sql/quiz_foretmap_data.sql` ne renvoie plus rien ;
--   3. sauvegarde vérifiée juste avant (`bash scripts/db-backup.sh --label avant-t3`), plus
--      l'export des deux tables seules (runbook, étape 2) ;
--   4. T3 dans sa propre PR, avec le retrait du code — jamais avec un T1/T2.
--
-- CEINTURE : le contrôle de passage est rejoué ici. Une table n'est supprimée que si elle
-- existe ET si aucun de ses liens ne manque dans RQL ; sinon l'instruction ne fait rien
-- (la table reste, `db:t3-status` continue de la signaler). Idempotent : un second passage,
-- tables absentes, ne fait rien. Aucune table `gl_*`.
--
-- Retour arrière : recréer les deux tables (DDL de la migration 128) et recharger l'export ;
-- à défaut, les reconstruire depuis RQL (requête dans la migration 300).
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
  'DROP TABLE quiz_question_species',
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
  'DROP TABLE quiz_question_tutorials',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
```
