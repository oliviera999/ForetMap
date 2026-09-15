-- Types d'interaction : six ajouts, et le démêlage de deux types qui en cachaient plusieurs.
--
-- Constat sur l'export du 15/09/2026, 323 interactions ForetMap.
--
-- `nitrification` (17 lignes) faisait trois métiers différents :
--   * 6 lignes « Déjections des poissons : source d'ammonium » — poisson → Nitrosomonas.
--     Ce n'est pas de la nitrification, c'est de l'EXCRÉTION, et surtout la matière y va
--     de `from` vers `to`, à l'inverse de l'herbivorie ou de la prédation.
--   * 8 lignes « Nitrates assimilés par les plantes » — Nitrobacter/Nitrospira → élodée,
--     chara, lotus, fougère de Java. C'est de l'ASSIMILATION par un producteur.
--   * 3 lignes d'oxydation proprement dite, qui restent en `nitrification`.
--
-- `decomposition` (57 lignes) mêlait les vrais décomposeurs — bactéries, champignons,
-- actinomycètes, qui minéralisent — et les DÉTRITIVORES, animaux qui fragmentent la
-- matière morte sans la minéraliser (cloporte, ver de compost, collembole, oribates…).
-- La distinction est au programme : fragmenter n'est pas décomposer.
--
-- Et le merle « décomposait » les fruits tombés. Un merle qui picore une figue au sol fait
-- de la frugivorie, pas de la décomposition.
--
-- `parasitisme` et `granivorie` n'ont aucune ligne à reprendre : ce sont des entrées de
-- vocabulaire, pour que la saisie n'ait plus à les ranger sous « herbivorie » faute de
-- mieux.
--
-- Le sens du flux de matière n'est PAS stocké ici : il est déclaré dans
-- `lib/shared/foodWebCore.js` (`matterFlow`), source de vérité unique déjà en place, dont
-- `src/shared/foodWebTypes.js` est le miroir ESM. Une colonne SQL en plus créerait une
-- troisième copie à garder synchronisée ; un test la vérifie à la place.
--
-- L'ENUM est étendu, jamais réduit : aucune valeur existante ne disparaît, la migration ne
-- peut pas orpheliner de ligne. Les UPDATE sont bornés par le type de départ, donc sans
-- effet à un second passage.

-- ---------------------------------------------------------------------------
-- 1) Extension de l'ENUM — ForetMap et son jumeau GL, pour que les deux produits
--    partagent le même vocabulaire (cf. `lib/shared/foodWebCore.js`).
-- ---------------------------------------------------------------------------
ALTER TABLE species_interactions
  MODIFY COLUMN interaction_type ENUM(
    'pollinisation','herbivorie','predation','plante_hote','decomposition',
    'nitrification','symbiose','competition',
    'detritivorie','frugivorie','granivorie','parasitisme','excretion','assimilation'
  ) NOT NULL;

ALTER TABLE gl_species_interactions
  MODIFY COLUMN interaction_type ENUM(
    'pollinisation','herbivorie','predation','plante_hote','decomposition',
    'nitrification','symbiose','competition',
    'detritivorie','frugivorie','granivorie','parasitisme','excretion','assimilation'
  ) NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) Excrétion — les déjections de poisson alimentent les bactéries nitrifiantes.
--    Reconnaissable à sa description : c'est elle qui porte le sens, pas le type.
-- ---------------------------------------------------------------------------
UPDATE species_interactions
   SET interaction_type = 'excretion'
 WHERE interaction_type = 'nitrification'
   AND description LIKE 'Déjections des poissons%';

-- ---------------------------------------------------------------------------
-- 3) Assimilation — les plantes aquatiques prélèvent les nitrates produits.
-- ---------------------------------------------------------------------------
UPDATE species_interactions
   SET interaction_type = 'assimilation'
 WHERE interaction_type = 'nitrification'
   AND description LIKE 'Nitrates assimilés par les plantes%';

-- ---------------------------------------------------------------------------
-- 4) Détritivorie — animaux qui fragmentent la matière morte.
--
--    Liste nominative plutôt qu'un filtre sur `trophic_role` : le rôle trophique est lui
--    aussi approximatif au catalogue (le ver de compost y est « décomposeur »), s'appuyer
--    dessus propagerait l'erreur au lieu de la corriger.
-- ---------------------------------------------------------------------------
UPDATE species_interactions si
  JOIN plants p ON p.id = si.from_plant_id
   SET si.interaction_type = 'detritivorie'
 WHERE si.interaction_type = 'decomposition'
   AND p.name IN (
     'Ver de compost', 'Lombric commun', 'Collembole', 'Cloporte', 'Cloporte poudré',
     'Enchytréide', 'Oribates', 'Iule', 'Géophile', 'Perce-oreille', 'Staphylin odorant',
     'Blatte germanique', 'Mouche domestique', 'Drosophile', 'Sciaride', 'Fourmi',
     'Escargot petit-gris', 'Planorbe', 'Limnée', 'Daphnie'
   );

-- ---------------------------------------------------------------------------
-- 5) Frugivorie — un merle qui picore une figue au sol ne décompose rien. Les fruits
--    consommés sur l'arbre, aujourd'hui en « herbivorie », suivent la même logique :
--    manger un fruit n'est pas brouter une feuille, et la graine y survit souvent.
-- ---------------------------------------------------------------------------
UPDATE species_interactions
   SET interaction_type = 'frugivorie'
 WHERE interaction_type = 'decomposition'
   AND description LIKE '%fruits au sol%';

UPDATE species_interactions si
  JOIN plants pf ON pf.id = si.from_plant_id
  JOIN plants pt ON pt.id = si.to_plant_id
   SET si.interaction_type = 'frugivorie'
 WHERE si.interaction_type = 'herbivorie'
   AND pf.name IN (
     'Merle noir', 'Étourneau unicolore', 'Fauvette à tête noire', 'Bulbul des jardins',
     'Conure veuve', 'Tourterelle turque'
   )
   AND pt.name IN (
     'Mûrier', 'Figuier commun', 'Néflier du Japon', 'Goyavier', 'Sureau noir',
     'Grenadier', 'Raisin', 'Olivier', 'Oléastre (olivier sauvage)', 'Lentisque',
     'Figuier de Barbarie'
   );
