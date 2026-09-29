-- =====================================================================
-- Révision d'édition des fiches modifiables par les profs (verrou optimiste).
--
-- LE CONSTAT
-- Deux profs qui modifient la même tâche, zone, repère ou fiche espèce : le dernier qui
-- enregistre écrase l'autre, sans avertissement (les formulaires de tâche et d'espèce
-- s'enregistrent même tout seuls au fil de la frappe).
--
-- LA RÉPONSE
-- `edit_revision` : compteur incrémenté à chaque enregistrement par le formulaire
-- (`PUT`, `lib/editRevision.js`). Le formulaire renvoie la révision qu'il a ouverte ; si elle
-- a changé entre-temps, le serveur répond 409 et n'écrit rien. Un compteur plutôt qu'une
-- date : pas de question de précision ni de fuseau, et les écritures qui ne passent pas par
-- le formulaire (élève qui marque une tâche faite, archivage…) ne comptent pas comme un
-- conflit d'édition.
--
-- IDEMPOTENCE
-- Colonnes : erreur 1060 tolérée par le lanceur. Aucune donnée réécrite.
-- Retour arrière : ALTER TABLE <table> DROP COLUMN edit_revision; (quatre tables).
-- =====================================================================

ALTER TABLE tasks
  ADD COLUMN edit_revision INT UNSIGNED NOT NULL DEFAULT 0
    COMMENT 'Révision d''édition (verrou optimiste, lib/editRevision.js)';

ALTER TABLE zones
  ADD COLUMN edit_revision INT UNSIGNED NOT NULL DEFAULT 0
    COMMENT 'Révision d''édition (verrou optimiste, lib/editRevision.js)';

ALTER TABLE map_markers
  ADD COLUMN edit_revision INT UNSIGNED NOT NULL DEFAULT 0
    COMMENT 'Révision d''édition (verrou optimiste, lib/editRevision.js)';

ALTER TABLE plants
  ADD COLUMN edit_revision INT UNSIGNED NOT NULL DEFAULT 0
    COMMENT 'Révision d''édition (verrou optimiste, lib/editRevision.js)';
