SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- =====================================================================
-- Reprise de la dérive de schéma prod → dépôt (flux F7, 22/11/2026).
--
-- La prod a reçu des changements de structure sans migration (écritures directes du
-- connecteur, modifications manuelles, ancien dump). Une base fraîche construite par le dépôt
-- en divergeait. Cette migration amène la base fraîche au schéma de la prod ; **en prod, elle
-- ne change rien** (vérifié en la jouant deux fois sur une copie de la sauvegarde anonymisée
-- du 22/11 : `SHOW CREATE TABLE` identique avant / après).
--
-- Schéma seulement : aucune valeur n'est reprise (les 87 fiches renseignées en domestication,
-- les 24 fiches porteuses d'un des nouveaux risques sanitaires… n'existent qu'en prod).
--
--   1. `plants.domestication`, `plants.wild_ancestor`, `plants.wild_ancestor_plant_id` (clé
--      étrangère `fk_plants_wild_ancestor`, index `idx_plants_domestication`) — types exacts
--      de la prod ;
--   2. `plants.health_risk` : 7 valeurs du SET propres à la prod, ajoutées EN FIN de liste et
--      dans l'ordre de la prod (l'ordre d'un SET est un encodage par bit) ;
--   3. `curriculum_notions.programme_ref` et `valide_jusqu_a` ;
--   4. table `id_key_runs` (parcours d'une clé de détermination, 0 ligne en prod) ;
--   5. écarts connus depuis l'état des lieux du 25/09/2026 (docs/AUDIT_ETAT_DES_LIEUX_2026-09-25.md,
--      tableau « La chaîne complète reproduit-elle… ») : `audit_log.details` en MEDIUMTEXT,
--      défauts de `map_markers.note`, `zones.description` et `visit_tutorials.map_id`, noms des
--      clés et index de `glossary_term_relations` / `glossary_term_tutorials` (ceux de la prod),
--      index `idx_group_members_group_role` et `idx_map_species_status` ;
--   6. vue de contrôle `v_id_key_integrity` (définition de la prod, en SQL SECURITY INVOKER et
--      sans DEFINER).
--
-- Non repris (consigné pour Oliv, journal du flux F7) : `idx_visit_tutorials_active_sort`,
-- dont la définition diffère (prod `(is_active, sort_order)`, dépôt `(map_id, is_active,
-- sort_order)`) — l'aligner changerait la prod ou dégraderait le dépôt.
-- `doksvtal_zz_olution_fb_journal` est étrangère à ForêtMap : jamais reprise (exception connue
-- du contrôle d'écart, lib/schemaFingerprint.js).
--
-- Idempotente : ADD COLUMN / KEY / FOREIGN KEY IF NOT EXISTS, DROP … IF EXISTS sur les seuls
-- anciens noms du dépôt (absents en prod), MODIFY et SET DEFAULT gardés par
-- INFORMATION_SCHEMA sur l'ancienne valeur, CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE VIEW.
-- Rejouée, elle ne change rien. Aucun trigger, aucun DEFINER.
-- =====================================================================

-- 1. Domestication et ancêtre sauvage.
ALTER TABLE plants
  ADD COLUMN IF NOT EXISTS domestication ENUM('sauvage','semi_domestique','domestique','feral') DEFAULT NULL
    COMMENT 'Degré de domestication (distinct de origin_status) ; feral = forme domestique retournée à la vie libre ; NULL = non renseigné'
    AFTER entity_kind;

ALTER TABLE plants
  ADD COLUMN IF NOT EXISTS wild_ancestor VARCHAR(255) DEFAULT NULL
    COMMENT 'Ancêtre ou parent sauvage (texte), pour la notion de domestication'
    AFTER domestication;

ALTER TABLE plants
  ADD COLUMN IF NOT EXISTS wild_ancestor_plant_id INT(10) UNSIGNED DEFAULT NULL
    COMMENT 'Fiche de l''ancêtre sauvage quand elle existe (plants.id)'
    AFTER wild_ancestor;

ALTER TABLE plants ADD KEY IF NOT EXISTS idx_plants_domestication (domestication);
ALTER TABLE plants ADD KEY IF NOT EXISTS fk_plants_wild_ancestor (wild_ancestor_plant_id);

ALTER TABLE plants
  ADD CONSTRAINT fk_plants_wild_ancestor FOREIGN KEY IF NOT EXISTS (wild_ancestor_plant_id)
    REFERENCES plants (id) ON DELETE SET NULL;

-- 2. Risques sanitaires : 7 valeurs en fin de SET (gardé : seulement si `fievre_q` manque).
SET @fm_drift_hr = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'plants' AND COLUMN_NAME = 'health_risk'
    AND COLUMN_TYPE LIKE '%''fievre_q''%');
SET @sql = IF(@fm_drift_hr = 0,
  "ALTER TABLE plants MODIFY COLUMN health_risk SET('rage','tetanos','salmonellose','leptospirose','toxoplasmose','vecteur','allergie','ornithose','mycobacteriose','aspergillose','toxocarose','teigne','echinococcose','fievre_q') DEFAULT NULL COMMENT 'Risque sanitaire transmissible, distinct de la toxicité propre à l''espèce'",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. Programmes : texte officiel de référence et fin de validité.
ALTER TABLE curriculum_notions
  ADD COLUMN IF NOT EXISTS programme_ref VARCHAR(160) DEFAULT NULL
    COMMENT 'Texte officiel de référence (BO)'
    AFTER notion;

ALTER TABLE curriculum_notions
  ADD COLUMN IF NOT EXISTS valide_jusqu_a VARCHAR(9) DEFAULT NULL
    COMMENT 'Dernière année scolaire d''application (ex. 2026-2027) ; NULL = en vigueur'
    AFTER programme_ref;

-- 4. Parcours des clés de détermination (structure de la prod, aucune ligne).
CREATE TABLE IF NOT EXISTS id_key_runs (
  id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  key_id INT(10) UNSIGNED NOT NULL,
  user_id VARCHAR(64) DEFAULT NULL COMMENT 'NULL = visiteur anonyme',
  map_id VARCHAR(32) DEFAULT NULL COMMENT 'Site où la clé est utilisée',
  path_json LONGTEXT NOT NULL DEFAULT '[]' COMMENT 'Liste ordonnée des id_key_leads.id choisis (retours arrière compris)',
  final_lead_id INT(10) UNSIGNED DEFAULT NULL COMMENT 'Proposition terminale atteinte',
  status ENUM('en_cours','abouti','abandonne') NOT NULL DEFAULT 'en_cours',
  observation_event_id BIGINT(20) UNSIGNED DEFAULT NULL COMMENT 'Observation créée via « J''ai trouvé »',
  started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  finished_at DATETIME(3) DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_runs_key (key_id, status),
  KEY idx_runs_user (user_id),
  KEY fk_runs_map (map_id),
  KEY fk_runs_final_lead (final_lead_id),
  KEY fk_runs_obs (observation_event_id),
  CONSTRAINT fk_runs_final_lead FOREIGN KEY (final_lead_id) REFERENCES id_key_leads (id) ON DELETE SET NULL,
  CONSTRAINT fk_runs_key FOREIGN KEY (key_id) REFERENCES id_keys (id) ON DELETE CASCADE,
  CONSTRAINT fk_runs_map FOREIGN KEY (map_id) REFERENCES maps (id) ON DELETE SET NULL,
  CONSTRAINT fk_runs_obs FOREIGN KEY (observation_event_id) REFERENCES user_plant_observation_events (id) ON DELETE SET NULL,
  CONSTRAINT fk_runs_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT chk_runs_path_json CHECK (json_valid(path_json))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Parcours des clés de détermination';

-- 5a. Journal d'audit : `details` en MEDIUMTEXT, comme en prod (gardé : seulement si TEXT).
SET @fm_drift_al = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_log' AND COLUMN_NAME = 'details'
    AND DATA_TYPE = 'text');
SET @sql = IF(@fm_drift_al = 1, 'ALTER TABLE audit_log MODIFY COLUMN details MEDIUMTEXT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 5b. Défauts de la prod (gardés : seulement si la colonne n'a encore aucun défaut).
SET @fm_drift_mn = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'map_markers' AND COLUMN_NAME = 'note'
    AND (COLUMN_DEFAULT IS NULL OR COLUMN_DEFAULT = 'NULL'));
SET @sql = IF(@fm_drift_mn = 1, "ALTER TABLE map_markers ALTER COLUMN note SET DEFAULT ''", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fm_drift_zd = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'zones' AND COLUMN_NAME = 'description'
    AND (COLUMN_DEFAULT IS NULL OR COLUMN_DEFAULT = 'NULL'));
SET @sql = IF(@fm_drift_zd = 1, "ALTER TABLE zones ALTER COLUMN description SET DEFAULT ''", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fm_drift_vt = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'visit_tutorials' AND COLUMN_NAME = 'map_id'
    AND (COLUMN_DEFAULT IS NULL OR COLUMN_DEFAULT = 'NULL'));
SET @sql = IF(@fm_drift_vt = 1, "ALTER TABLE visit_tutorials ALTER COLUMN map_id SET DEFAULT 'foret'", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 5c. Glossaire : noms de clés et d'index de la prod. Les anciens noms du dépôt
-- (`fk_glossary_rel_*`, `idx_glossary_rel_from`, `fk_gtt_tutorial`, `idx_gtt_tutorial`)
-- n'existent pas en prod : leurs DROP … IF EXISTS n'y font rien, et les ajouts IF NOT EXISTS
-- y trouvent les clés déjà présentes. Sur une base fraîche, la clé est recréée à l'identique
-- (mêmes colonnes, mêmes actions) sous le nom de la prod.
ALTER TABLE glossary_term_relations DROP FOREIGN KEY IF EXISTS fk_glossary_rel_from;
ALTER TABLE glossary_term_relations DROP FOREIGN KEY IF EXISTS fk_glossary_rel_to;
ALTER TABLE glossary_term_relations ADD KEY IF NOT EXISTS idx_gtr_to (to_code);
ALTER TABLE glossary_term_relations DROP INDEX IF EXISTS fk_glossary_rel_to;
ALTER TABLE glossary_term_relations DROP INDEX IF EXISTS idx_glossary_rel_from;
ALTER TABLE glossary_term_relations
  ADD CONSTRAINT fk_gtr_from FOREIGN KEY IF NOT EXISTS (from_code)
    REFERENCES glossary_terms (glossary_code) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE glossary_term_relations
  ADD CONSTRAINT fk_gtr_to FOREIGN KEY IF NOT EXISTS (to_code)
    REFERENCES glossary_terms (glossary_code) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE glossary_term_tutorials DROP FOREIGN KEY IF EXISTS fk_gtt_tutorial;
ALTER TABLE glossary_term_tutorials ADD KEY IF NOT EXISTS idx_gtt_tuto (tutorial_id);
ALTER TABLE glossary_term_tutorials DROP INDEX IF EXISTS idx_gtt_tutorial;
ALTER TABLE glossary_term_tutorials
  ADD CONSTRAINT fk_gtt_tuto FOREIGN KEY IF NOT EXISTS (tutorial_id)
    REFERENCES tutorials (id) ON DELETE CASCADE;

-- 5d. Index propres à la prod.
ALTER TABLE group_members ADD KEY IF NOT EXISTS idx_group_members_group_role (group_id);
ALTER TABLE map_species
  ADD KEY IF NOT EXISTS idx_map_species_status (map_id, validation_status, presence_status);

-- 6. Vue de contrôle des clés de détermination (définition de la prod, lue dans la sauvegarde
-- du 22/11). Une ligne par défaut de forme : couplet de départ absent, couplet à moins de deux
-- propositions, couplet jamais atteint, proposition incohérente, retour vers un couplet de
-- numéro inférieur, espèce sans critères d'identification.
CREATE OR REPLACE SQL SECURITY INVOKER VIEW v_id_key_integrity AS
SELECT k.id AS key_id, k.slug AS slug, NULL AS couplet_number, NULL AS lead_id,
       'erreur' AS severity, 'Pas de couplet n°1 (point de départ)' AS issue
  FROM id_keys k
 WHERE NOT EXISTS (SELECT 1 FROM id_key_couplets c WHERE c.key_id = k.id AND c.number = 1 LIMIT 1)
   AND EXISTS (SELECT 1 FROM id_key_couplets c WHERE c.key_id = k.id LIMIT 1)
UNION ALL
SELECT k.id, k.slug, c.number, NULL, 'erreur', 'Couplet avec moins de 2 propositions'
  FROM id_key_couplets c
  JOIN id_keys k ON k.id = c.key_id
 WHERE (SELECT COUNT(*) FROM id_key_leads l WHERE l.couplet_id = c.id) < 2
UNION ALL
SELECT k.id, k.slug, c.number, NULL, 'avertissement', 'Couplet jamais atteint'
  FROM id_key_couplets c
  JOIN id_keys k ON k.id = c.key_id
 WHERE c.number <> 1
   AND NOT EXISTS (SELECT 1 FROM id_key_leads l WHERE l.next_couplet_id = c.id LIMIT 1)
UNION ALL
SELECT k.id, k.slug, c.number, l.id, 'erreur',
       CASE
         WHEN l.outcome = 'couplet' AND l.next_couplet_id IS NULL
           THEN 'Branche coupée : couplet suivant manquant'
         WHEN l.outcome = 'couplet' AND l.plant_id IS NOT NULL
           THEN 'Proposition vers un couplet qui porte aussi une espèce'
         WHEN l.outcome <> 'couplet' AND l.next_couplet_id IS NOT NULL
           THEN 'Résultat qui pointe aussi vers un couplet'
         WHEN l.outcome = 'espece' AND l.plant_id IS NULL
           THEN 'Espèce manquante'
         WHEN l.outcome IN ('groupe', 'clade') AND l.plant_id IS NOT NULL
           THEN 'Groupe ou clade qui porte aussi une espèce'
         WHEN l.outcome = 'couplet' AND l.next_key_id IS NOT NULL
           THEN '« Pour aller plus loin » sur une proposition non terminale'
         WHEN l.outcome = 'groupe'
              AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants p WHERE p.lead_id = l.id LIMIT 1)
           THEN 'Groupe sans espèce'
         WHEN l.outcome <> 'groupe'
              AND EXISTS (SELECT 1 FROM id_key_lead_plants p WHERE p.lead_id = l.id LIMIT 1)
           THEN 'Espèces de groupe sur une proposition non-groupe'
         WHEN nc.key_id IS NOT NULL AND nc.key_id <> c.key_id
           THEN 'Couplet suivant appartenant à une autre clé'
       END
  FROM id_key_leads l
  JOIN id_key_couplets c ON c.id = l.couplet_id
  JOIN id_keys k ON k.id = c.key_id
  LEFT JOIN id_key_couplets nc ON nc.id = l.next_couplet_id
 WHERE (l.outcome = 'couplet'
        AND (l.next_couplet_id IS NULL OR l.plant_id IS NOT NULL OR l.next_key_id IS NOT NULL))
    OR (l.outcome <> 'couplet' AND l.next_couplet_id IS NOT NULL)
    OR (l.outcome = 'espece' AND l.plant_id IS NULL)
    OR (l.outcome IN ('groupe', 'clade') AND l.plant_id IS NOT NULL)
    OR (l.outcome = 'groupe'
        AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants p WHERE p.lead_id = l.id LIMIT 1))
    OR (l.outcome <> 'groupe'
        AND EXISTS (SELECT 1 FROM id_key_lead_plants p WHERE p.lead_id = l.id LIMIT 1))
    OR (nc.key_id IS NOT NULL AND nc.key_id <> c.key_id)
UNION ALL
SELECT k.id, k.slug, c.number, l.id, 'avertissement',
       'Retour vers un couplet de numéro inférieur (risque de boucle)'
  FROM id_key_leads l
  JOIN id_key_couplets c ON c.id = l.couplet_id
  JOIN id_keys k ON k.id = c.key_id
  JOIN id_key_couplets nc ON nc.id = l.next_couplet_id
 WHERE nc.number <= c.number
UNION ALL
SELECT k.id, k.slug, c.number, l.id, 'avertissement',
       CONCAT('Fiche sans critères d''identification : ', p.name)
  FROM id_key_leads l
  JOIN id_key_couplets c ON c.id = l.couplet_id
  JOIN id_keys k ON k.id = c.key_id
  JOIN plants p ON p.id = l.plant_id
 WHERE l.outcome = 'espece'
   AND (p.identification_criteria IS NULL OR p.identification_criteria = '');
