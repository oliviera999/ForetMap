-- =====================================================================
-- Liens question <-> ressource : une seule source, `resource_question_links` (RQL).
-- Audit du 25/09/2026, § 1.3.3, § 3.2.3 et § 3.5 (piste C, tranche « liens »).
--
-- LE CONSTAT
-- Les liens vivaient dans trois tables : RQL (source du verrouillage, des statistiques, du
-- glossaire et de l'écran « Rattacher des questions aux contenus »), `quiz_question_species`
-- (qqs, lue par la fiche espèce) et `quiz_question_tutorials` (qqt, lue par
-- `GET /api/tutorials/:id/quiz-questions` et par la reprise « éditoriale » de
-- `POST /api/learning-links/suggest`). Aucune synchronisation depuis la copie unique de la
-- migration 144. Mesure sur le fixture anonymisé migré en v297 : RQL 1 580 liens (plant 702,
-- tutorial 250, glossary 628), qqs 709, qqt 250 ; 0 lien RQL absent de qqs ou de qqt ;
-- **7 liens qqs absents de RQL**, 0 lien qqt absent de RQL.
--
-- LES 7 ÉCARTS (tous qqs -> RQL ; questions créées les 14 et 15/09, chacune déjà rattachée
-- dans RQL à l'espèce principale de son énoncé ; les liens qqs en plus désignent une espèce
-- secondaire citée par la question ou sa réponse ; aucun code du dépôt ne les a écrits) :
--   QF9307 -> Enchytréide                     (RQL : Carton de lombricompost)
--   QF9408 -> Bactérie thermophile du compost (RQL : Oribates)
--   QF9455 -> Aspergillus du compost          (RQL : Trichoderma)
--   QF9456 -> Étourneau unicolore             (RQL : Conure veuve)
--   QF9457 -> Criquet marocain                (RQL : Faucon crécerelle)
--   QF9459 -> Actinomycète du compost         (RQL : Collembole)
--   QF9459 -> Trichoderma                     (RQL : Collembole)
-- Effet avant cette migration : ces 7 questions s'affichaient sur la fiche de l'espèce
-- secondaire mais ne comptaient pas pour son verrouillage (qui lit RQL).
--
-- LE TRAITEMENT
-- Tout lien qqs ou qqt sans jumeau dans RQL (même ressource, même question, quel que soit
-- le statut du jumeau) y est repris :
--   origin = 'editorial'  (reprise des tables historiques, jamais purgée par un traitement
--                          automatique — seul origin = 'keyword' l'est, règle du lot P0) ;
--   status = 'approved'   (la fiche lit les liens approuvés : la question reste affichée) ;
--   is_gating = 0         (non bloquant : le verrouillage est inchangé, comme avant) ;
--   note                  (« migration 300 : reprise de … », pour tracer et pour défaire).
-- Un lien qqs ou qqt dont le jumeau RQL est « suggested » ou « rejected » n'est PAS modifié :
-- la décision prise dans l'écran des liens l'emporte (0 cas sur le fixture). Contrôle :
--   SELECT COUNT(*) FROM quiz_question_species q
--     JOIN resource_question_links r ON r.resource_type = 'plant'
--      AND r.question_code = q.question_code
--      AND r.resource_ref = CAST(q.plant_id AS CHAR) COLLATE utf8mb4_unicode_ci
--    WHERE r.status <> 'approved';
-- (et la requête symétrique sur quiz_question_tutorials / 'tutorial').
--
-- Idempotente (INSERT IGNORE + NOT EXISTS : un second passage n'insère rien). Ne supprime
-- rien, ne modifie aucune ligne existante, aucune DDL, aucune table `gl_*`.
--
-- RETRAIT EN TROIS TEMPS (§ 3.5)
-- T1 et T2 — livrés avec cette migration : le code ne lit plus ni n'écrit plus qqs ni qqt
--   (fiche espèce, tutoriel, reprise éditoriale de /suggest, fusion des tutoriels en double,
--   domaine de synchronisation `tutorials`). Service unique : `lib/pedago/learningLinks.js`.
--   Les deux tables restent en place, figées.
-- T3 — migration FUTURE (numéro à réserver), PAS dans ce lot :
--   DROP TABLE IF EXISTS quiz_question_species;
--   DROP TABLE IF EXISTS quiz_question_tutorials;
--   Conditions de passage, toutes requises :
--   1. cette migration et le code T1/T2 tournent en production depuis au moins un cycle de
--      déploiement, sans retour arrière ;
--   2. contrôles de passage à 0 (ils le sont sur le fixture après cette migration) :
--        SELECT COUNT(*) FROM quiz_question_species q WHERE NOT EXISTS (
--          SELECT 1 FROM resource_question_links r WHERE r.resource_type = 'plant'
--             AND r.question_code = q.question_code
--             AND CAST(r.resource_ref AS UNSIGNED) = q.plant_id);
--        SELECT COUNT(*) FROM quiz_question_tutorials q WHERE NOT EXISTS (
--          SELECT 1 FROM resource_question_links r WHERE r.resource_type = 'tutorial'
--             AND r.question_code = q.question_code
--             AND CAST(r.resource_ref AS UNSIGNED) = q.tutorial_id);
--      (test de contenu : tests/content/learning-links-single-source.test.js) ;
--   3. `grep -rn "quiz_question_species\|quiz_question_tutorials"` hors `migrations/`,
--      `docs/` et `sql/quiz_foretmap_data.sql` ne renvoie plus que les références
--      retirées dans le même lot T3 : l'expression `SYNC_IGNORED_TABLES_RE` de `database.js`
--      (ligne partagée avec les tables `gl_*`, à modifier avec l'accord du mainteneur G&L),
--      les contrôles d'alignement (`tests/content/pedago-tutorial-links.test.js`,
--      `tests/content/learning-links-single-source.test.js`) et les tests qui simulent une
--      base d'avant la bascule (`tests/learning-links-sheet.test.js`,
--      `tests/learning-links-migration-300.test.js`, à réduire ou retirer) ;
--   4. sauvegarde vérifiée juste avant (script `db-backup.sh` corrigé : charset utf8mb4,
--      `mariadb-dump`), plus un export des deux tables seules
--      (`mariadb-dump --no-create-info <base> quiz_question_species quiz_question_tutorials`).
--   Retour arrière du T3 : recréer les deux tables avec la DDL de la migration 128, puis
--   recharger l'export (ou, à défaut, les reconstruire depuis RQL :
--   INSERT IGNORE INTO quiz_question_species (question_code, plant_id)
--     SELECT r.question_code, p.id FROM resource_question_links r
--       JOIN plants p ON CAST(p.id AS CHAR) COLLATE utf8mb4_unicode_ci = r.resource_ref
--      WHERE r.resource_type = 'plant' AND r.status = 'approved';
--   et de même pour les tutoriels). Le code T1/T2 n'en a pas besoin : il lit RQL.
-- Retour arrière de CETTE migration (si jamais) :
--   DELETE FROM resource_question_links
--    WHERE origin = 'editorial' AND note LIKE 'migration 300 :%';
-- =====================================================================

INSERT IGNORE INTO resource_question_links
  (resource_type, resource_ref, question_code, is_gating, weight, origin, status, note)
SELECT 'plant', CAST(qqs.plant_id AS CHAR) COLLATE utf8mb4_unicode_ci, qqs.question_code,
       0, 1, 'editorial', 'approved',
       'migration 300 : reprise de quiz_question_species (lien absent de la source unique)'
  FROM quiz_question_species qqs
 WHERE NOT EXISTS (
         SELECT 1 FROM resource_question_links r
          WHERE r.resource_type = 'plant'
            AND r.resource_ref = CAST(qqs.plant_id AS CHAR) COLLATE utf8mb4_unicode_ci
            AND r.question_code = qqs.question_code
       );

INSERT IGNORE INTO resource_question_links
  (resource_type, resource_ref, question_code, is_gating, weight, origin, status, note)
SELECT 'tutorial', CAST(qqt.tutorial_id AS CHAR) COLLATE utf8mb4_unicode_ci, qqt.question_code,
       0, 1, 'editorial', 'approved',
       'migration 300 : reprise de quiz_question_tutorials (lien absent de la source unique)'
  FROM quiz_question_tutorials qqt
 WHERE NOT EXISTS (
         SELECT 1 FROM resource_question_links r
          WHERE r.resource_type = 'tutorial'
            AND r.resource_ref = CAST(qqt.tutorial_id AS CHAR) COLLATE utf8mb4_unicode_ci
            AND r.question_code = qqt.question_code
       );
