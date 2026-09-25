-- Clés d'idempotence des écritures élèves mises en file hors ligne (piste D).
--
-- Le défaut (audit du 25/09/2026, § 1.4.6 et § 2.4). Sur le terrain, une réponse perdue
-- (réseau faible) pousse l'élève — ou la file hors ligne du client — à renvoyer la même
-- écriture. Même modèle que la migration 296 (observations d'espèce) : le client tire un
-- identifiant au hasard par écriture (`client_uuid`), le serveur ne l'enregistre qu'une fois
-- par utilisateur et rejoue la réponse sur un doublon, y compris pour deux envois simultanés
-- (l'index unique tranche).
--
-- « Tâche faite » : `POST /api/tasks/:id/done` insère un rapport (`task_logs`) quand l'élève
-- laisse un commentaire — un renvoi le publiait deux fois.
--
-- Colonnes facultatives : les anciens clients (sans clé) gardent le comportement d'avant, et
-- plusieurs `NULL` ne se gênent pas dans un index unique.
--
-- Idempotent : colonne ou index déjà présents → 1060 / 1061, tolérés par le moteur de migrations.
-- Aucune donnée personnelle nouvelle ; aucune table `gl_*`.

ALTER TABLE task_logs
  ADD COLUMN client_uuid VARCHAR(64) NULL DEFAULT NULL
    COMMENT 'Clé d''idempotence tirée par le client (migration 299) ; NULL pour les anciens clients';

ALTER TABLE task_logs
  ADD UNIQUE KEY uq_task_logs_student_client (student_id, client_uuid);
