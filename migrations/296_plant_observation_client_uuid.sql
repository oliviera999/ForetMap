-- Clé d'idempotence des observations d'espèce (« Espèce observée »).
--
-- Le défaut (audit du 25/09/2026, § 1.4.6 ; piste D). `POST /api/plants/:id/acknowledge-discovery`
-- insère un événement à chaque appel. Sur le terrain, une réponse perdue (réseau faible) pousse
-- l'élève — ou la file hors ligne — à renvoyer la même observation : elle était comptée deux fois.
--
-- Le correctif. Le client joint un identifiant tiré au hasard par observation (`client_uuid`) ;
-- le serveur ne l'enregistre qu'une fois par utilisateur et rejoue la réponse sur un doublon.
-- Colonne facultative : les anciens clients (sans clé) gardent le comportement d'avant, et
-- plusieurs `NULL` ne se gênent pas dans l'index unique.
--
-- Idempotent : colonne ou index déjà présents → 1060 / 1061, tolérés par le moteur de migrations.
-- Aucune donnée personnelle nouvelle ; aucune table `gl_*`.

ALTER TABLE user_plant_observation_events
  ADD COLUMN client_uuid VARCHAR(64) NULL DEFAULT NULL
    COMMENT 'Clé d''idempotence tirée par le client (migration 296) ; NULL pour les anciens clients';

ALTER TABLE user_plant_observation_events
  ADD UNIQUE KEY uq_upoe_user_client (user_id, client_uuid);
