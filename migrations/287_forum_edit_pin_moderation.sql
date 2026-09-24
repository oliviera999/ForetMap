-- Forum ForetMap : modification d'un message et traitement des signalements.
--
-- `edited_at` : marqueur « modifié ». `updated_at` ne peut pas servir : la suppression d'un
-- message le met aussi à jour, et il bouge à chaque UPDATE (ON UPDATE CURRENT_TIMESTAMP).
--
-- Signalements : ils étaient enregistrés (`status = 'open'`) sans qu'aucun écran ne permette
-- de les traiter. Statuts désormais : `open`, `resolved` (message traité), `dismissed`
-- (classé sans suite), avec la trace de la personne qui a tranché.
--
-- Idempotente : les ALTER déjà appliqués sont tolérés (ER_DUP_FIELDNAME / ER_DUP_KEYNAME).

ALTER TABLE forum_posts ADD COLUMN edited_at DATETIME NULL DEFAULT NULL AFTER is_deleted;

ALTER TABLE forum_reports ADD COLUMN resolved_at DATETIME NULL DEFAULT NULL AFTER status;
ALTER TABLE forum_reports ADD COLUMN resolved_by_user_type VARCHAR(16) NULL DEFAULT NULL AFTER resolved_at;
ALTER TABLE forum_reports ADD COLUMN resolved_by_user_id VARCHAR(64) NULL DEFAULT NULL AFTER resolved_by_user_type;
