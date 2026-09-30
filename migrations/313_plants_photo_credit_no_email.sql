-- Crédits photo sans adresse e-mail (audit sécurité/RGPD du 30/09/2026, CS2).
--
-- LE CONSTAT
-- La migration 252 a recopié tels quels les champs `Artist` de Wikimedia Commons. Pour deux
-- fiches, ce champ contenait l'adresse électronique personnelle du photographe : elle s'est
-- retrouvée en base (`plants.photo_credit`), affichée sous la photo et exportée avec la fiche.
-- Une licence CC impose de nommer l'auteur, pas de publier ses coordonnées.
--
-- LA RÉPONSE
-- Ne garder que le nom ; la licence reste dans `photo_licence`. Le fichier 252 a été corrigé en
-- même temps pour les installations neuves (le moteur ne tient aucune empreinte des
-- migrations, cf. `database.js`) ; cette migration corrige les bases où 252 est déjà passée.
--
-- IDEMPOTENCE
-- UPDATE ciblés : seule une valeur qui contient encore un « @ » est réécrite. Rejouée, la
-- migration ne trouve plus rien à modifier. Le test de contenu
-- `tests/content/plants-photo-credits.test.js` refuse désormais tout crédit contenant un « @ ».
-- =====================================================================

UPDATE plants SET photo_credit = 'Arch. Attilio Mileto'
 WHERE id = 72 AND photo_credit LIKE 'Arch. Attilio Mileto%' AND photo_credit LIKE '%@%';

UPDATE plants SET photo_credit = 'Kolforn'
 WHERE id = 206 AND photo_credit LIKE 'Kolforn%' AND photo_credit LIKE '%@%';
