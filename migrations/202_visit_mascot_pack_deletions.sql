-- Suppression **définitive** d'une mascotte livrée (suite de la fusion catalogue / packs,
-- docs/AUDIT_MASCOTTES_2026-08.md, piste P3).
--
-- Jusqu'ici le studio refusait de supprimer une ligne `origin = 'builtin'`, et le refus avait une
-- bonne raison : le semis réinsère toute mascotte livrée absente de `visit_mascot_packs`. Un
-- bouton « Supprimer » aurait donc rendu la main puis se serait annulé tout seul au prochain
-- `npm run db:migrate` — une réussite qui ment.
--
-- Cette table est la mémoire qui manquait. Le semis consulte les identifiants qu'elle contient et
-- ne les réinsère plus : la suppression tient dans le temps, et le bouton dit vrai.
--
-- On garde `catalog_id` plutôt qu'une clé étrangère vers `visit_mascot_packs` : la ligne
-- supprimée n'existe justement plus, et c'est l'identifiant catalogue — stable, porté par le code
-- — que le semis interroge.
--
-- Le retour en arrière n'est pas une fatalité : `npm run visit:mascots:restore` vide cette table
-- et resème. Il est volontairement hors du studio, pour que la liste y reste unique.
--
-- Idempotente : `CREATE TABLE IF NOT EXISTS`.
CREATE TABLE IF NOT EXISTS visit_mascot_pack_deletions (
  catalog_id VARCHAR(80) NOT NULL PRIMARY KEY,
  deleted_at VARCHAR(32) DEFAULT NULL,
  deleted_by VARCHAR(64) DEFAULT NULL,
  CONSTRAINT fk_visit_mascot_pack_deletions_user FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
