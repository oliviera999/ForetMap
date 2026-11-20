-- =====================================================================
-- 374 — Packs de mascottes : « Proposé dans la Visite » et variante féminine
-- (audit UI/UX du 19/11/2026, constat U4 ; décision d'Oliv du 20/11/2026).
--
-- `is_published` décidait à la fois de la Visite et du catalogue des mascottes d'équipe de
-- Gnomes & Licornes (`lib/glUnifiedMascotCatalog.js`) : retirer un guide de la Visite le
-- retirait aussi aux équipes qui l'utilisent. Deux colonnes sur la ligne du pack :
--
--  - `visit_listed` : le pack est proposé comme guide de la Visite (sélecteur de la barre,
--    préférence de profil, registre public `GET /api/visit/mascots`). Un pack non publié
--    n'est jamais proposé, quelle que soit cette case. G&L ne la lit pas. Reprend la valeur
--    de `is_published` à la création (aucun changement visible au déploiement), puis 1 par
--    défaut pour les packs créés ensuite. Ce n'est PAS le retour de la liste blanche
--    `ui.visit.mascot.allowed_ids` (retirée volontairement, cf. `lib/visitMascotVisibility.js`) :
--    une propriété de la ligne, qu'un pack ajouté plus tard porte d'emblée.
--  - `variant_of` : `catalog_id` du pack « de base » dont celui-ci est la version féminine
--    (« Gnome néon (femme) » → « Gnome néon »). Le sélecteur de la Visite propose alors une
--    option « version féminine » au lieu de deux cartes. Pré-rempli par le libellé
--    (« X (femme) » / « X (femelle) » → « X ») ; modifiable au studio.
--
-- Idempotente : ADD COLUMN IF NOT EXISTS ; la reprise de `is_published` ne touche que les
-- lignes encore à NULL (premier passage), le pré-remplissage des variantes que les lignes
-- sans variante. Aucune donnée personnelle.
-- =====================================================================

ALTER TABLE visit_mascot_packs
  ADD COLUMN IF NOT EXISTS visit_listed TINYINT(1) NULL DEFAULT NULL AFTER is_published,
  ADD COLUMN IF NOT EXISTS variant_of VARCHAR(80) NULL DEFAULT NULL AFTER visit_listed;

UPDATE visit_mascot_packs SET visit_listed = is_published WHERE visit_listed IS NULL;

ALTER TABLE visit_mascot_packs
  MODIFY COLUMN visit_listed TINYINT(1) NOT NULL DEFAULT 1;

UPDATE visit_mascot_packs AS v
  JOIN visit_mascot_packs AS b
    ON b.catalog_id <> v.catalog_id
   AND (v.label = CONCAT(b.label, ' (femme)') OR v.label = CONCAT(b.label, ' (femelle)'))
   SET v.variant_of = b.catalog_id
 WHERE v.variant_of IS NULL;
