-- Intégrité référentielle : huit liens qui n'étaient tenus que par le code.
--
-- Périmètre choisi après inventaire du dump de production (15/09/2026) : toute colonne
-- `*_id` / `*_by` pointant une table connue, sans contrainte. Chaque candidat a été vérifié
-- sans ligne orpheline avant d'être retenu — les huit ci-dessous comptent zéro orphelin, la
-- migration ne peut donc pas échouer sur des données existantes. Un neuvième candidat a été
-- écarté pour une raison que le compte d'orphelins ne pouvait pas montrer (§ 3).
--
-- Règle `ON DELETE` alignée sur l'existant plutôt que choisie au cas par cas :
--   * trace d'audit / d'action → SET NULL, comme `security_events.actor_user_id`. La ligne
--     de journal survit à la suppression du compte, elle perd seulement son auteur.
--   * donnée appartenant au compte → CASCADE, comme `user_roles`, `group_members`…
--   * rattachement optionnel à un groupe → SET NULL : supprimer une classe ne doit pas
--     emporter les tâches ni les fils de forum qui la mentionnaient.
--
-- Volontairement laissé de côté : `user_quiz_attempts.question_code` et
-- `resource_gating_cooldowns.question_code`. Une contrainte y imposerait de choisir entre
-- CASCADE — supprimer une question effacerait silencieusement l'historique de réponses des
-- élèves — et RESTRICT, qui bloquerait la suppression. Les deux changent le comportement
-- métier ; ce n'est pas à une migration d'intégrité de trancher.
--
-- errno 1022 / 1826 / 1005+121 (contrainte déjà présente) sont ignorés instruction par
-- instruction par database.js : la migration est rejouable.

-- ---------------------------------------------------------------------------
-- 0) Dérive de schéma : sept colonnes de `map_species` n'ont jamais été versionnées.
--
-- La migration 239 crée `map_species` avec trois colonnes (map_id, plant_id, created_at).
-- La production en a dix : les sept ci-dessous ont été ajoutées à la main, hors migration.
-- Une base neuve (`npm run db:init`, CI) n'a donc jamais eu le modèle « présence d'espèce
-- sur une carte » que la production utilise pour ses 452 lignes — et la conversion de type
-- qui suit échouerait sur la colonne absente.
--
-- Définitions reprises telles quelles de l'export du 15/09/2026, à une exception près :
-- `first_record_by` est créée directement en VARCHAR(64), son type correct (voir § 1).
--
-- À noter au passage : `validation_status` prévoit bien la valeur `confirme_site`, et
-- aucune des 452 lignes ne la porte. La capacité d'enregistrer une confirmation terrain
-- existe, elle n'a simplement jamais servi.
--
-- Un ALTER par colonne : errno 1060 est ignoré instruction par instruction.
-- ---------------------------------------------------------------------------
ALTER TABLE map_species
  ADD COLUMN presence_status ENUM('resident','nicheur_migrateur','hivernant','passage','erratique','introduit','veille') DEFAULT NULL
    COMMENT 'Statut phénologique de l''espèce sur cette carte';
ALTER TABLE map_species
  ADD COLUMN months_present VARCHAR(32) DEFAULT NULL
    COMMENT 'Mois de présence, format 3-8 ou 10,11,12,1,2';
ALTER TABLE map_species
  ADD COLUMN detection_mode SET('vue','chant','trace','indice','nocturne') DEFAULT NULL
    COMMENT 'Mode de contact sur le terrain';
ALTER TABLE map_species
  ADD COLUMN frequency ENUM('commun','regulier','occasionnel','rare') DEFAULT NULL
    COMMENT 'Fréquence de contact attendue';
ALTER TABLE map_species
  ADD COLUMN validation_status ENUM('confirme_site','attendu','a_confirmer','documentaire') NOT NULL DEFAULT 'attendu'
    COMMENT 'Niveau de certitude de la présence sur le site';
ALTER TABLE map_species
  ADD COLUMN first_record_at DATE DEFAULT NULL
    COMMENT 'Date de la première validation terrain';
ALTER TABLE map_species
  ADD COLUMN first_record_by VARCHAR(64) DEFAULT NULL
    COMMENT 'users.id à l''origine de la validation terrain';

-- ---------------------------------------------------------------------------
-- 1) `map_species.first_record_by` — conversion de type avant contrainte.
--
-- En production la colonne est INT(10) UNSIGNED alors que `users.id` est VARCHAR(64) :
-- aucune clé étrangère n'était possible, et aucune valeur n'aurait pu y être écrite
-- correctement. Elle est NULL sur les 452 lignes, la conversion ne peut rien perdre.
--
-- Sur une base neuve, le § 0 vient de la créer déjà en VARCHAR(64) : ce MODIFY est alors
-- une non-opération.
-- ---------------------------------------------------------------------------
ALTER TABLE map_species
  MODIFY COLUMN first_record_by VARCHAR(64) DEFAULT NULL
    COMMENT 'users.id à l''origine de la validation terrain';

ALTER TABLE map_species
  ADD CONSTRAINT fk_map_species_first_record_by
    FOREIGN KEY (first_record_by) REFERENCES users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 2) Traces d'audit et de synchronisation → SET NULL.
-- ---------------------------------------------------------------------------
ALTER TABLE audit_log
  ADD CONSTRAINT fk_audit_log_actor
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE sync_runs
  ADD CONSTRAINT fk_sync_runs_actor
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE sync_conflicts
  ADD CONSTRAINT fk_sync_conflicts_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 3) `password_reset_tokens` — écartée, et le cas mérite d'être écrit.
--
-- La colonne `user_id` semblait un candidat idéal : NOT NULL, zéro orphelin sur l'export
-- de production. L'export mentait. La table est POLYMORPHE : sa colonne `user_type` vaut
-- `student`, `teacher`… mais aussi `gl_player`, et un joueur GL vit dans `gl_players`, pas
-- dans `users` (`routes/gl/admin.js` purge d'ailleurs explicitement ces lignes). Une clé
-- étrangère vers `users` interdirait toute réinitialisation de mot de passe côté GL.
--
-- L'absence d'orphelin ne prouvait rien : aucun joueur GL n'avait de jeton en cours au
-- moment de l'export. Le test `tests/password-reset-polymorphic.test.js` le dit depuis
-- toujours — « la table est polymorphe : une FK y interdirait les jetons de joueurs GL ».
--
-- Vérifié pour les huit autres : `audit_log` et `security_events` ne portent que des types
-- présents dans `users` (`security_events` a d'ailleurs déjà sa FK), `sync_runs` et
-- `sync_conflicts` n'ont pas de colonne de type du tout.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 4) Rattachements de groupe (colonnes déjà NULLables) → SET NULL.
-- ---------------------------------------------------------------------------
ALTER TABLE tasks
  ADD CONSTRAINT fk_tasks_group
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL;

ALTER TABLE forum_threads
  ADD CONSTRAINT fk_forum_threads_group
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL;

ALTER TABLE observation_logs
  ADD CONSTRAINT fk_observation_logs_group
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 5) Baseline RBAC → CASCADE : la ligne décrit un rôle, elle n'a pas de sens sans lui.
-- ---------------------------------------------------------------------------
ALTER TABLE rbac_seeded_permissions
  ADD CONSTRAINT fk_rbac_seeded_permissions_role
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE;
