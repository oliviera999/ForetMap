-- Rôle trophique : la valeur `detritivore` rejoint `producteur`, `consommateur` et
-- `decomposeur`.
--
-- Décision du mainteneur du 25/09/2026 (« crée la valeur détritivore »), à la suite de
-- l'état des lieux docs/AUDIT_ETAT_DES_LIEUX_2026-09-25.md (§ 1.3.6, décision 7).
--
-- Pourquoi. Quatorze animaux du catalogue — vers de terre et enchytréides, cloportes,
-- ligie et talitre, limnée et planorbe, blatte, fourmi, oribates, collembole, iule — étaient
-- classés `decomposeur`. En écologie, le DÉTRITIVORE ingère et fragmente la matière
-- organique morte : c'est un consommateur, et une proie. Le DÉCOMPOSEUR au sens strict
-- (bactéries, champignons) la minéralise et rend les sels minéraux aux producteurs. Le cycle
-- de la matière n'est lisible que si l'élève voit qui fragmente et qui minéralise. La
-- migration 255 avait déjà fait ce tri sur les INTERACTIONS (`detritivorie` /
-- `decomposition`) ; le rôle trophique des fiches était resté en arrière.
--
-- Effet visible : le réseau trophique ne donne aucun niveau aux décomposeurs, si bien qu'un
-- prédateur de détritivores s'affichait « consommateur primaire ». Un détritivore prend
-- désormais le niveau 2, son prédateur le suivant (`computeTrophicLevels`,
-- src/components/pedago/foodWebGraphModel.js). Mesuré sur le fixture anonymisé : Étourneau
-- unicolore 2 → 3 (il mange des lombrics), Pseudoscorpion 2 → 3, Géophile 2 → 2,7.
--
-- ---------------------------------------------------------------------------
-- 1) Extension de l'ENUM.
--
--    Étendu, jamais réduit : aucune valeur existante ne disparaît, aucune ligne ne peut être
--    orpheline. Définition reprise à l'identique (nullable, défaut NULL) ; la valeur s'insère
--    avant `decomposeur` pour suivre la chaîne de la matière (producteur → consommateur →
--    détritivore → décomposeur) — MODIFY réécrit l'ENUM par libellé, pas par rang, donc
--    l'ordre ne touche aucune donnée. Le commentaire de colonne, présent en production et
--    absent d'une base neuve, est reposé à jour : sans lui, MODIFY l'effacerait.
--    Rejouer l'instruction est sans effet.
-- ---------------------------------------------------------------------------
ALTER TABLE plants
  MODIFY COLUMN trophic_role ENUM('producteur','consommateur','detritivore','decomposeur') DEFAULT NULL
    COMMENT 'Niveau trophique écologique (producteur/consommateur/détritivore/décomposeur)';

-- ---------------------------------------------------------------------------
-- 2) Reclassement des animaux « décomposeurs ».
--
--    Un animal ne minéralise pas : tout animal encore en `decomposeur` est un détritivore.
--    Filtre sur le règne plutôt que liste nominative — contrairement à la migration 255,
--    qui devait trier des INTERACTIONS mêlées, ici la règle est sans exception et couvre
--    aussi une fiche animale saisie d'ici au déploiement. Le règne vaut
--    « Animal (Métazoaires) » dans tout le catalogue (seed, fixture, migrations 223 et 225).
--
--    Bactéries et champignons restent `decomposeur`. Les nitrifiantes (Nitrosomonas,
--    Nitrobacter, Nitrospira), chimiolithoautotrophes, n'y sont pas touchées : leur cas est
--    laissé à l'équipe de SVT (même audit, question 7).
--
--    Borné par la valeur de départ : un second passage ne trouve plus rien.
-- ---------------------------------------------------------------------------
UPDATE plants
   SET trophic_role = 'detritivore'
 WHERE trophic_role = 'decomposeur'
   AND taxon_kingdom LIKE 'Anim%';

-- ---------------------------------------------------------------------------
-- 3) Vue `v_food_web` : rien à faire.
--
--    Elle expose `pf.trophic_role AS from_role` et `pt.trophic_role AS to_role` par
--    référence de colonne : MariaDB relit le type à chaque accès, la nouvelle valeur remonte
--    donc telle quelle dans `GET /api/food-web` sans recréer la vue (dernière définition :
--    migration 272). Vérifié par tests/plants-trophic-role-detritivore.test.js.
-- ---------------------------------------------------------------------------
