-- =====================================================================
-- GL — Feuillets : atteignabilité, équilibre et feuillets d'ouverture
--
-- CONTEXTE. Audit du corpus (205 feuillets actifs) : 82 % seulement étaient
-- atteignables par un canal d'acquisition, la répartition entre pays était très
-- inégale (3 feuillets `espece_pays` pour le pays 1 contre 15 pour le pays 4),
-- et l'entrée en jeu était muette — les feuillets qui posent le cadre (le pacte
-- du seuil, gnome/licorne, le message à la classe) n'étaient rattachés à rien.
--
-- Cette migration corrige la **donnée** ; le code qui l'accompagne corrige les
-- canaux (repli sur le pool du chapitre pour l'étude d'espèce, attribution des
-- feuillets d'ouverture au démarrage, garde sur la présentation directe).
-- La trame du copiste (`cop-*`) est **volontairement laissée de côté** : son
-- rattachement est un choix éditorial à part.
--
-- Idempotente : chaque UPDATE est conditionné à l'anomalie qu'il répare, et
-- l'ADD COLUMN rejoué renvoie l'errno 1060, ignoré par le runner.
-- =====================================================================

-- [1] `effacement = 'oui'` est traité comme `total` par computeEffacementPct() :
--     le texte arrivait vidé à 100 % dès la découverte. Deux feuillets étaient
--     concernés, dont la finale du voyage (`ep-finale`). On repasse sur
--     `partiel`, qui applique la vitesse d'effacement du feuillet au lieu de
--     tout effacer d'un coup — le carnet s'efface, il ne naît pas vide.
UPDATE gl_lore_feuillets SET effacement = 'partiel' WHERE effacement = 'oui';

-- [2] Cinq feuillets portaient un `ordre_voyage` / `ordre_recit` à 80 0xx — un
--     préfixe de saisie. Effet : rejetés en fin de pool (donc quasi jamais servis
--     par le canal générique, qui sert « le premier non trouvé ») et hors ordre de
--     lecture. On restaure la convention du corpus, `ordre_voyage = plateau × 1000
--     + rang`, et l'échelle du récit (1..149) pour `ordre_recit`.
UPDATE gl_lore_feuillets
   SET ordre_voyage = plateau_number * 1000 + (ordre_voyage - 80000)
 WHERE plateau_number IS NOT NULL AND ordre_voyage BETWEEN 80001 AND 89999;

UPDATE gl_lore_feuillets
   SET ordre_recit = ordre_recit - 80000
 WHERE ordre_recit BETWEEN 80001 AND 89999;

-- [3] Quatre feuillets avaient un `lien_pays` contredisant leur biome (une scène
--     de taïga annoncée en pays 3, des landes en pays 4…). Comme le pool d'un
--     chapitre accepte aussi le critère `lien_pays`, ils apparaissaient dans deux
--     chapitres à la fois, et la file de révélation par espèce les servait dans le
--     mauvais pays. Le biome fait foi.
UPDATE gl_lore_feuillets
   SET lien_pays = CASE biome_slug
       WHEN 'jungle_afc' THEN 1
       WHEN 'savane' THEN 1
       WHEN 'sahara' THEN 2
       WHEN 'foret_mediterraneenne' THEN 2
       WHEN 'foret_caducifoliee' THEN 3
       WHEN 'landes' THEN 3
       WHEN 'taiga' THEN 4
       WHEN 'desert_froid' THEN 4
       WHEN 'toundra' THEN 5
     END
 WHERE lien_pays IS NOT NULL
   AND biome_slug IN ('jungle_afc', 'savane', 'sahara', 'foret_mediterraneenne',
                      'foret_caducifoliee', 'landes', 'taiga', 'desert_froid', 'toundra')
   AND lien_pays <> CASE biome_slug
       WHEN 'jungle_afc' THEN 1
       WHEN 'savane' THEN 1
       WHEN 'sahara' THEN 2
       WHEN 'foret_mediterraneenne' THEN 2
       WHEN 'foret_caducifoliee' THEN 3
       WHEN 'landes' THEN 3
       WHEN 'taiga' THEN 4
       WHEN 'desert_froid' THEN 4
       WHEN 'toundra' THEN 5
     END;

-- [4] Les cinq « échos » (liasse E, lus par le passeur) n'avaient ni biome, ni
--     plateau, ni lien : atteignables par aucun canal. Ils ne sont attachés à
--     aucun milieu en particulier — on en pose un par plateau, pour que chaque
--     chapitre en porte un et un seul.
UPDATE gl_lore_feuillets SET plateau_number = 1 WHERE feuillet_code = 'ep-echo-01' AND plateau_number IS NULL;
UPDATE gl_lore_feuillets SET plateau_number = 2 WHERE feuillet_code = 'ep-echo-02' AND plateau_number IS NULL;
UPDATE gl_lore_feuillets SET plateau_number = 3 WHERE feuillet_code = 'ep-echo-03' AND plateau_number IS NULL;
UPDATE gl_lore_feuillets SET plateau_number = 4 WHERE feuillet_code = 'ep-echo-04' AND plateau_number IS NULL;
UPDATE gl_lore_feuillets SET plateau_number = 5 WHERE feuillet_code = 'ep-echo-05' AND plateau_number IS NULL;

-- [5] Feuillets d'ouverture : donnés à chaque équipe au démarrage de la partie,
--     quel que soit le chapitre, sans QCM ni coût. Ils posent la situation (la
--     boîte confiée à la classe, le pacte du seuil, ce que voit un gnome / garde
--     une licorne, les formes de Sélène) — c'est le point de départ commun, pas
--     une récompense d'exploration. Colonne pilotable par l'admin (patch groupé).
ALTER TABLE gl_lore_feuillets
  ADD COLUMN offert_ouverture TINYINT(1) NOT NULL DEFAULT 0
  COMMENT 'Attribue automatiquement ce feuillet a chaque equipe au demarrage de la partie';

UPDATE gl_lore_feuillets
   SET offert_ouverture = 1
 WHERE feuillet_code IN ('message-boite', 'GL2P-01', 'GL2P-02', 'GL2P-03', 'GL2P-04');

-- [6] Provenance « ouverture » : distingue un feuillet donné en début de partie
--     d'un feuillet découvert ou reçu. Comme en migration 175, la valeur est
--     ajoutée **en fin** d'ENUM — MySQL stocke un ENUM par son index, réordonner
--     remapperait les lignes existantes.
ALTER TABLE gl_game_feuillet_states
  MODIFY COLUMN unlocked_via
    ENUM('zone', 'manual', 'story', 'gemme', 'espece', 'echange', 'ouverture') DEFAULT NULL;
