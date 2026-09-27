-- Observations d'espèces validées par un enseignant (piste C, audit du 25/09/2026, § 1.3.5,
-- § 2.3 ligne « Observations » et § 3.2.4).
--
-- Le défaut. Les observations d'élèves étaient dispersées entre cinq tables (ancien carnet
-- `observation_logs`, carnet unifié, « J'ai découvert », individus suivis, rapports de tâche)
-- et AUCUN chemin ne menait d'une observation vérifiée au registre du site : personne n'écrivait
-- `map_species.validation_status = 'confirme_site'`, ni `first_record_at` / `first_record_by`,
-- et `species_interactions.evidence_level = 'observe_site'` n'était qu'une étiquette saisie à la
-- main.
--
-- Le modèle. Une table unique d'observations, chacune SOUMISE par son auteur puis VALIDÉE ou
-- REFUSÉE par un enseignant (permission `observations.validate`). La validation confirme la
-- présence de l'espèce sur la carte (`lib/terrain/observationService.js`) ; une observation
-- validée peut aussi servir de preuve à une interaction du réseau trophique
-- (`interaction_evidence`). Inspiration : le « Research Grade » d'iNaturalist (une observation
-- n'entre dans les données de référence qu'après vérification) et la validation des données des
-- protocoles Vigie-Nature — https://www.inaturalist.org/pages/help#quality et
-- https://www.vigienature.fr — dont on ne retient que le principe « soumise, puis vérifiée par
-- quelqu'un d'autre que l'observateur ».
--
-- « J'ai découvert » (`user_plant_observation_events`) reste un acquis d'apprentissage et n'est
-- PAS repris ici. L'ancien carnet (`observation_logs`) passe aux temps 1 et 2 de son retrait
-- (plus lu, plus écrit par l'application) ; ses tables restent en place.
--
-- Clés étrangères, règle de la migration 253 :
--   * donnée appartenant au compte → CASCADE (l'observation suit la suppression du compte) ;
--   * trace de décision (validateur, auteur d'un rattachement) → SET NULL ;
--   * rattachement facultatif (zone, repère, espèce, article de carnet) → SET NULL ;
--   * carte → CASCADE, comme `map_species` et `zones`.
-- Les fichiers photo ne suivent pas les suppressions en cascade : la réconciliation des
-- fichiers orphelins doit lire `species_observation_photos` (voir le rapport de lot).
--
-- Idempotent : `CREATE TABLE IF NOT EXISTS` (errno 1050 toléré par le moteur de migrations) ;
-- les deux premières tables sont aussi déclarées dans `sql/schema_foretmap.sql`. Aucun trigger,
-- aucune procédure, aucune vue : compatible MariaDB 11.4 mutualisé sans SUPER. Aucune table
-- `gl_*`. Aucune donnée existante n'est modifiée.

-- ---------------------------------------------------------------------------
-- 1) Observations
--
-- `client_uuid` : clé d'idempotence tirée par le client pour la file hors ligne, unique PAR
-- OBSERVATEUR comme en 296 et 299 — un renvoi ne crée qu'une ligne, et la clé d'un autre compte
-- ne rend jamais l'observation de quelqu'un d'autre. Plusieurs `NULL` ne se gênent pas.
-- `observed_at` est une DATE, comme `map_species.first_record_at` qu'elle alimente.
-- `detection_mode` reprend le vocabulaire de `map_species.detection_mode`, une valeur par
-- observation.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS species_observations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  observer_user_id VARCHAR(64) NOT NULL COMMENT 'users.id de l''observateur',
  map_id VARCHAR(32) NOT NULL,
  zone_id VARCHAR(64) DEFAULT NULL,
  marker_id VARCHAR(64) DEFAULT NULL,
  plant_id INT UNSIGNED DEFAULT NULL COMMENT 'Espèce observée (facultative à la soumission, exigée à la validation)',
  observed_at DATE NOT NULL,
  detection_mode ENUM('vue','chant','trace','indice','nocturne') DEFAULT NULL,
  body TEXT DEFAULT NULL COMMENT 'Texte libre de l''observateur',
  status ENUM('soumise','validee','refusee') NOT NULL DEFAULT 'soumise',
  decision_note VARCHAR(1000) DEFAULT NULL COMMENT 'Note de l''enseignant à la décision',
  validated_by VARCHAR(64) DEFAULT NULL COMMENT 'users.id de l''enseignant qui a décidé',
  decided_at DATETIME DEFAULT NULL,
  journal_article_id INT UNSIGNED DEFAULT NULL COMMENT 'Article de carnet associé (facultatif)',
  client_uuid VARCHAR(64) DEFAULT NULL COMMENT 'Clé d''idempotence tirée par le client (file hors ligne)',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_species_obs_observer_client (observer_user_id, client_uuid),
  INDEX idx_species_obs_map_status (map_id, status, created_at),
  INDEX idx_species_obs_observer_created (observer_user_id, created_at),
  INDEX idx_species_obs_plant (plant_id),
  INDEX idx_species_obs_zone (zone_id),
  INDEX idx_species_obs_marker (marker_id),
  INDEX idx_species_obs_validator (validated_by),
  INDEX idx_species_obs_journal (journal_article_id),
  CONSTRAINT fk_species_obs_observer FOREIGN KEY (observer_user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_species_obs_map FOREIGN KEY (map_id) REFERENCES maps (id) ON DELETE CASCADE,
  CONSTRAINT fk_species_obs_zone FOREIGN KEY (zone_id) REFERENCES zones (id) ON DELETE SET NULL,
  CONSTRAINT fk_species_obs_marker FOREIGN KEY (marker_id) REFERENCES map_markers (id) ON DELETE SET NULL,
  CONSTRAINT fk_species_obs_plant FOREIGN KEY (plant_id) REFERENCES plants (id) ON DELETE SET NULL,
  CONSTRAINT fk_species_obs_validator FOREIGN KEY (validated_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_species_obs_journal FOREIGN KEY (journal_article_id) REFERENCES user_journal_articles (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 2) Photos d'observation — un fichier sous `uploads/observations/species/…` (famille privée,
--    servie par la route API qui contrôle les droits) et une ligne, supprimés ensemble par le
--    service. Métadonnées EXIF retirées à l'écriture (`lib/uploads.js`).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS species_observation_photos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  observation_id INT UNSIGNED NOT NULL,
  file_path VARCHAR(512) NOT NULL COMMENT 'Chemin relatif sous uploads/',
  mime_type VARCHAR(64) DEFAULT NULL,
  byte_size INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_species_obs_photos_obs (observation_id),
  CONSTRAINT fk_species_obs_photos_obs FOREIGN KEY (observation_id) REFERENCES species_observations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 3) Preuves d'interaction : une observation documente une relation du réseau trophique.
--    `species_interactions.evidence_level = 'observe_site'` ⇔ au moins une preuve VALIDÉE.
--    Table déclarée ici seulement, comme `species_interactions` elle-même (migration 124).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS interaction_evidence (
  interaction_id INT UNSIGNED NOT NULL,
  observation_id INT UNSIGNED NOT NULL,
  created_by VARCHAR(64) DEFAULT NULL COMMENT 'users.id de l''enseignant qui a rattaché la preuve',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (interaction_id, observation_id),
  INDEX idx_interaction_evidence_obs (observation_id),
  INDEX idx_interaction_evidence_user (created_by),
  CONSTRAINT fk_interaction_evidence_interaction FOREIGN KEY (interaction_id) REFERENCES species_interactions (id) ON DELETE CASCADE,
  CONSTRAINT fk_interaction_evidence_obs FOREIGN KEY (observation_id) REFERENCES species_observations (id) ON DELETE CASCADE,
  CONSTRAINT fk_interaction_evidence_user FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
