-- =====================================================================
-- Noms des fiches espèces : sortes de noms (`plant_name_aliases.kind`) et éclatement des
-- anciens `plants.second_name` en noms `nom_secondaire`.
-- Audit du 25/09/2026, § 1.3.6, § 2.3 et § 3.5 (piste C, tranche « noms »).
--
-- LE CONSTAT
-- Deux listes de noms sans lien : `plants.second_name` (texte libre, affiché « Deuxième
-- nom » sur la fiche, jamais lu par la recherche) et `plant_name_aliases` (noms reconnus,
-- apportés par les migrations 123 et 223 à 225, qui ne servaient qu'à rattacher des noms
-- historiques à une fiche). Un élève qui tape un autre nom courant ne trouvait pas la fiche.
-- Mesure sur le fixture anonymisé (v259) : 534 fiches, 149 `second_name` renseignés, 25
-- multiples, TOUS séparés par « , » (aucun « ; », « / », « ou » ni retour à la ligne) ; 3
-- précisions finales entre parenthèses (« Gommier bleu (usage courant) », « rose d’Inde
-- (usage courant) », « Vittina turrita (nom aujourd’hui accepté) ») ; 144 noms reconnus pour
-- 113 fiches. Après découpage : ≈ 178 noms distincts (4 doublons dans une même valeur), dont
-- 8 égaux au nom de la fiche elle-même et 1 égal au nom d'une AUTRE fiche (« Abeille
-- charpentière », nom de la fiche 557, dans les autres noms du Xylocope violet). Résultat de
-- la migration sur le fixture : 66 noms reconnus promus, 103 ajoutés, soit 169 autres noms
-- pour 143 fiches (78 variantes restent) ; contrôle de passage au T3 : 1.
--
-- LES SORTES (`kind`)
--   nom_secondaire : autre nom courant, affiché sur la fiche (« Autres noms ») et saisi dans
--                    le formulaire — la reprise de `second_name` ;
--   variante       : forme reconnue d'un nom (pluriel, forme courte, ancien nom, genre),
--                    cherchable mais pas affichée — la sorte de TOUTES les lignes existantes ;
--   synonyme       : synonyme scientifique, réservé à une saisie éditoriale.
-- `alias` reste la clé primaire (un nom = une fiche : `lib/speciesJunction.js` s'en sert
-- pour rattacher des noms historiques) ; `sort_order` garde l'ordre éditorial des autres noms.
--
-- LA REPRISE
-- `second_name` est découpé comme le fait le code (`lib/biodiv/plantNames.js`) : virgule,
-- point-virgule ou retour à la ligne ; espaces retirés ; précision finale entre parenthèses
-- retirée (le nom reconnu est le nom, pas sa précision) ; ordre conservé (`sort_order`).
--   1. un nom déjà reconnu pour LA MÊME fiche devient `nom_secondaire` (66 sur le fixture) ;
--   2. les autres noms sont ajoutés en `nom_secondaire` (103), SAUF : le nom de la fiche
--      elle-même (inutile : c'est son nom), le nom d'une AUTRE fiche (il détournerait la
--      résolution des noms historiques vers la mauvaise fiche) et un nom déjà reconnu pour
--      une autre fiche (clé primaire, `INSERT IGNORE`). Ces cas restent lisibles sur la fiche
--      (repli sur `second_name`) et sont comptés par le contrôle de passage au T3 : décision
--      éditoriale (fiches en double ? nom à retirer ?).
-- Comparaisons selon la collation de la table (sans casse ni accents). Découpage borné à 30
-- noms par valeur (5 au plus sur le fixture).
--
-- IDEMPOTENCE
-- Colonnes et index : erreurs 1060 / 1061 tolérées par le moteur. Promotion bornée à
-- `kind = 'variante'` ; ajout par `INSERT IGNORE` (clé primaire) : un second passage ne
-- change rien. Aucune suppression, aucune table `gl_*`.
--
-- RETRAIT EN TROIS TEMPS (§ 3.5)
-- T1 et T2 — livrés avec cette migration : la fiche, la recherche du catalogue, la reprise
--   éditoriale des liens (`routes/learning-links.js`) et la recherche du carnet
--   (`lib/fmUserJournal.js`) lisent les noms de la table ; formulaire, import et création
--   écrivent les `nom_secondaire`, et `plants.second_name` reste ÉCRIT EN MIROIR (autres
--   noms séparés par « , ») pour qu'un retour arrière du code retrouve une colonne à jour.
--   Une fiche dont les autres noms de la table ne correspondent plus à la colonne est lue
--   depuis la colonne (repli).
-- T3 — migration FUTURE, PAS dans ce lot : retrait du miroir et du repli, puis
--   ALTER TABLE plants DROP COLUMN second_name;
--   Conditions de passage, toutes requises :
--   1. ce code tourne en production depuis au moins un cycle, sans retour arrière ;
--   2. « second_name absent des alias » = 0 : la requête de contrôle de
--      tests/plant-names.test.js (même découpage que ci-dessous, nom de la fiche exclu,
--      compte des noms sans ligne `nom_secondaire` pour la fiche) renvoie 0 — 1 aujourd'hui
--      sur le fixture (« Abeille charpentière », à trancher) ;
--   3. `scripts/import-biodiv-pedago.js` et `scripts/suggest-learning-links.js` ne lisent
--      plus la colonne ; le seed de démonstration de `database.js` non plus ;
--   4. sauvegarde vérifiée juste avant.
-- Retour arrière de CETTE migration :
--   DELETE FROM plant_name_aliases WHERE kind = 'nom_secondaire' AND <nom absent avant> ;
--   (à défaut d'un export préalable : UPDATE plant_name_aliases SET kind = 'variante';
--   puis ALTER TABLE plant_name_aliases DROP COLUMN kind, DROP COLUMN sort_order;) — les
--   noms ajoutés restent alors des noms reconnus, sans effet de bord.
-- =====================================================================

ALTER TABLE plant_name_aliases
  ADD COLUMN kind ENUM('nom_secondaire','variante','synonyme') NOT NULL DEFAULT 'variante'
    COMMENT 'nom_secondaire : autre nom affiché ; variante : forme reconnue ; synonyme : scientifique';

ALTER TABLE plant_name_aliases
  ADD COLUMN sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0
    COMMENT 'Ordre éditorial des autres noms de la fiche';

ALTER TABLE plant_name_aliases ADD KEY idx_alias_plant_kind (plant_id, kind, sort_order);

-- 1. Noms déjà reconnus pour la même fiche → `nom_secondaire`, à leur place dans la liste.
UPDATE plant_name_aliases a
  JOIN (
    SELECT s.plant_id, s.part, MIN(s.pos) AS pos
      FROM (
        SELECT p.id AS plant_id, p.name, n.pos,
               CASE
                 WHEN TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(p.raw, ',', n.pos), ',', -1)) LIKE '%)'
                  AND LOCATE(' (', TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(p.raw, ',', n.pos), ',', -1))) > 1
                 THEN TRIM(LEFT(
                        TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(p.raw, ',', n.pos), ',', -1)),
                        LOCATE(' (', TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(p.raw, ',', n.pos), ',', -1))) - 1))
                 ELSE TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(p.raw, ',', n.pos), ',', -1))
               END AS part
          FROM (
            SELECT id, name,
                   REPLACE(REPLACE(REPLACE(second_name, CHAR(13), ','), CHAR(10), ','), ';', ',') AS raw
              FROM plants
             WHERE second_name IS NOT NULL AND TRIM(second_name) <> ''
          ) p
          JOIN (
            SELECT 1 AS pos UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
            UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10
            UNION ALL SELECT 11 UNION ALL SELECT 12 UNION ALL SELECT 13 UNION ALL SELECT 14 UNION ALL SELECT 15
            UNION ALL SELECT 16 UNION ALL SELECT 17 UNION ALL SELECT 18 UNION ALL SELECT 19 UNION ALL SELECT 20
            UNION ALL SELECT 21 UNION ALL SELECT 22 UNION ALL SELECT 23 UNION ALL SELECT 24 UNION ALL SELECT 25
            UNION ALL SELECT 26 UNION ALL SELECT 27 UNION ALL SELECT 28 UNION ALL SELECT 29 UNION ALL SELECT 30
          ) n ON n.pos <= 1 + CHAR_LENGTH(p.raw) - CHAR_LENGTH(REPLACE(p.raw, ',', ''))
      ) s
     WHERE s.part <> '' AND s.part <> s.name
     GROUP BY s.plant_id, s.part
  ) x ON x.plant_id = a.plant_id AND x.part = a.alias
   SET a.kind = 'nom_secondaire', a.sort_order = x.pos - 1
 WHERE a.kind = 'variante';

-- 2. Autres noms nouveaux → `nom_secondaire` (sauf nom d'une autre fiche ; clé primaire
--    déjà prise : ignoré).
INSERT IGNORE INTO plant_name_aliases (alias, plant_id, kind, sort_order)
SELECT x.part, x.plant_id, 'nom_secondaire', x.pos - 1
  FROM (
    SELECT s.plant_id, s.part, MIN(s.pos) AS pos
      FROM (
        SELECT p.id AS plant_id, p.name, n.pos,
               CASE
                 WHEN TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(p.raw, ',', n.pos), ',', -1)) LIKE '%)'
                  AND LOCATE(' (', TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(p.raw, ',', n.pos), ',', -1))) > 1
                 THEN TRIM(LEFT(
                        TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(p.raw, ',', n.pos), ',', -1)),
                        LOCATE(' (', TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(p.raw, ',', n.pos), ',', -1))) - 1))
                 ELSE TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(p.raw, ',', n.pos), ',', -1))
               END AS part
          FROM (
            SELECT id, name,
                   REPLACE(REPLACE(REPLACE(second_name, CHAR(13), ','), CHAR(10), ','), ';', ',') AS raw
              FROM plants
             WHERE second_name IS NOT NULL AND TRIM(second_name) <> ''
          ) p
          JOIN (
            SELECT 1 AS pos UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
            UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10
            UNION ALL SELECT 11 UNION ALL SELECT 12 UNION ALL SELECT 13 UNION ALL SELECT 14 UNION ALL SELECT 15
            UNION ALL SELECT 16 UNION ALL SELECT 17 UNION ALL SELECT 18 UNION ALL SELECT 19 UNION ALL SELECT 20
            UNION ALL SELECT 21 UNION ALL SELECT 22 UNION ALL SELECT 23 UNION ALL SELECT 24 UNION ALL SELECT 25
            UNION ALL SELECT 26 UNION ALL SELECT 27 UNION ALL SELECT 28 UNION ALL SELECT 29 UNION ALL SELECT 30
          ) n ON n.pos <= 1 + CHAR_LENGTH(p.raw) - CHAR_LENGTH(REPLACE(p.raw, ',', ''))
      ) s
     WHERE s.part <> '' AND s.part <> s.name
     GROUP BY s.plant_id, s.part
  ) x
 WHERE NOT EXISTS (SELECT 1 FROM plants o WHERE o.id <> x.plant_id AND o.name = x.part)
 ORDER BY x.plant_id, x.pos;
