-- =====================================================================
-- Photos des fiches espèces : une ligne par photo, attribution comprise (`plant_photos`).
-- Audit du 25/09/2026, § 1.3.6, § 2.3 et § 3.5 (piste C, tranche « photos »).
--
-- LE CONSTAT
-- `plants` porte 6 colonnes d'image (`photo`, `photo_species`, `photo_leaf`, `photo_flower`,
-- `photo_fruit`, `photo_harvest_part`, plusieurs liens par colonne séparés par des retours à
-- la ligne) mais un SEUL couple d'attribution (`photo_credit`, `photo_licence`, migration
-- 252), celui de la photo principale. Les photos secondaires n'ont ni auteur ni licence
-- stockés, alors que ≈ 90 % des licences sont CC BY ou BY-SA (attribution obligatoire).
-- Mesure sur le fixture anonymisé (v259) : 534 fiches, 225 photos principales toutes
-- créditées ; 493 liens en tout (photo 225, espèce 174, feuille 21, fleur 29, fruit 9,
-- partie récoltée 35) ; 142 fiches reprennent la photo principale comme photo « espèce ».
--
-- LA TABLE
-- Une ligne par photo : fiche, emplacement (`kind`, nom de l'ancienne colonne), lien, auteur
-- (`credit`), licence, provenance (`source` : televersement, wikimedia_commons,
-- inaturalist…), page source (`source_url`, lien d'attribution), ordre dans l'emplacement.
-- Supprimée avec la fiche (clé étrangère ON DELETE CASCADE).
--
-- LA REPRISE
-- Chaque colonne est découpée comme le fait le code historique (`parseLinkCandidates` :
-- retours à la ligne ET virgules, espaces retirés, segments vides ignorés) ; l'ordre dans la
-- colonne devient `sort_order` (0, 1, 2…). L'attribution de `photo_credit` / `photo_licence`
-- va à la photo principale (premier lien de `photo`) et à toute ligne qui pointe le MÊME
-- lien, quel que soit l'emplacement : même fichier, même auteur, même licence — c'est le cas
-- des 142 photos « espèce » identiques à la photo principale. Aucune autre attribution n'est
-- inventée : les autres photos restent sans auteur ni licence, à compléter à la main (ou par
-- l'API Commons, comme l'a fait la migration 252). Provenance déduite du lien.
-- Découpage borné à 30 liens par colonne (3 au plus sur le fixture) ; le contrôle de
-- passage au T3 (ci-dessous) détecterait un dépassement.
--
-- IDEMPOTENCE
-- `CREATE TABLE IF NOT EXISTS` ; la reprise ne touche qu'une fiche SANS aucune ligne dans la
-- table (`NOT EXISTS`) : un second passage n'insère rien, et une fiche déjà gérée par le code
-- n'est jamais complétée par ses anciennes colonnes. Aucune suppression, aucune table `gl_*`.
--
-- RETRAIT EN TROIS TEMPS (§ 3.5)
-- T1 et T2 — livrés avec cette migration (`lib/biodiv/plantPhotos.js`,
--   `lib/biodiv/speciesService.js`) : la fiche lit la table ; formulaire, téléversement,
--   import et préremplissage écrivent la table, crédit et licence compris. Les 8 anciennes
--   colonnes restent ÉCRITES EN MIROIR (dérivées de la table) pour qu'un retour arrière du
--   code retrouve des colonnes à jour ; une fiche sans ligne, ou dont les colonnes ne
--   correspondent plus au miroir (écrites par une version antérieure, une migration de
--   contenu ou un script), est lue depuis ses colonnes (repli).
-- T3 — migration FUTURE, PAS dans ce lot : retrait du miroir et du repli dans le code, puis
--   ALTER TABLE plants DROP COLUMN photo, DROP COLUMN photo_species, DROP COLUMN photo_leaf,
--     DROP COLUMN photo_flower, DROP COLUMN photo_fruit, DROP COLUMN photo_harvest_part,
--     DROP COLUMN photo_credit, DROP COLUMN photo_licence;
--   Conditions de passage, toutes requises :
--   1. ce code tourne en production depuis au moins un cycle, sans retour arrière ;
--   2. nombre de liens éclatés = nombre de lignes (0 écart), c.-à-d. aucune fiche lue en
--      repli : la requête du test tests/plant-photos-migration.test.js (« contrôle T3 »),
--      rejouée en lecture seule, renvoie 0 fiche dont les colonnes diffèrent du miroir ;
--   3. attribution complète :
--        SELECT COUNT(*) FROM plant_photos
--         WHERE (credit IS NULL OR licence IS NULL)
--           AND COALESCE(licence, '') NOT IN ('Public domain', 'CC0');
--      = 0 (fixture après cette migration : voir le rapport de lot ; les photos non
--      créditées se complètent depuis le formulaire de la fiche) ;
--   4. plus aucun lecteur des colonnes hors du repli : `lib/fmUserJournal.js` (image du
--      carnet), `scripts/resolve-plants-photo-direct-links.js`, `lib/visitorTextCorpus.js`
--      n'en lit pas ; le seed de démonstration de `database.js` ;
--   5. sauvegarde vérifiée juste avant.
-- Retour arrière de CETTE migration : DROP TABLE IF EXISTS plant_photos; (les colonnes,
--   tenues en miroir, portent tout sauf l'attribution des photos secondaires).
-- =====================================================================

CREATE TABLE IF NOT EXISTS plant_photos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  plant_id INT UNSIGNED NOT NULL,
  kind ENUM('photo','photo_species','photo_leaf','photo_flower','photo_fruit','photo_harvest_part') NOT NULL
    COMMENT 'Emplacement sur la fiche (nom de l''ancienne colonne photo)',
  url TEXT NOT NULL COMMENT 'Lien direct vers l''image (HTTPS) ou fichier téléversé (/uploads/…)',
  credit VARCHAR(255) DEFAULT NULL COMMENT 'Auteur / attribution',
  licence VARCHAR(64) DEFAULT NULL COMMENT 'Licence (ex. CC BY-SA 4.0, Public domain, CC0)',
  source VARCHAR(32) DEFAULT NULL COMMENT 'Provenance : televersement, wikimedia_commons, inaturalist…',
  source_url VARCHAR(1024) DEFAULT NULL COMMENT 'Page source de l''image (lien d''attribution)',
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Ordre dans l''emplacement (0 = premier)',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_plant_photos_plant (plant_id, kind, sort_order),
  CONSTRAINT fk_plant_photos_plant FOREIGN KEY (plant_id) REFERENCES plants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reprise des 6 colonnes. `c.raw` : colonne normalisée (retours chariot retirés, virgules
-- changées en retours à la ligne) ; `c.main_url` : premier lien de `photo`.
INSERT INTO plant_photos (plant_id, kind, url, credit, licence, source, sort_order)
SELECT e.plant_id, e.kind, e.url,
       CASE WHEN CAST(e.url AS BINARY) = CAST(e.main_url AS BINARY)
            THEN NULLIF(TRIM(e.photo_credit), '') END,
       CASE WHEN CAST(e.url AS BINARY) = CAST(e.main_url AS BINARY)
            THEN NULLIF(TRIM(e.photo_licence), '') END,
       CASE
         WHEN e.url LIKE '/uploads/%' THEN 'televersement'
         WHEN e.url LIKE 'https://upload.wikimedia.org/%'
           OR e.url LIKE 'https://commons.wikimedia.org/%' THEN 'wikimedia_commons'
         WHEN e.url LIKE '%inaturalist%' THEN 'inaturalist'
         ELSE NULL
       END,
       e.pos - 1
  FROM (
    SELECT c.plant_id, c.kind, c.main_url, c.photo_credit, c.photo_licence, n.pos,
           TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(c.raw, CHAR(10), n.pos), CHAR(10), -1)) AS url
      FROM (
        SELECT b.plant_id, b.kind, b.photo_credit, b.photo_licence,
               REPLACE(REPLACE(b.val, CHAR(13), ''), ',', CHAR(10)) AS raw,
               TRIM(SUBSTRING_INDEX(
                 TRIM(LEADING CHAR(10) FROM REPLACE(REPLACE(b.main_val, CHAR(13), ''), ',', CHAR(10))),
                 CHAR(10), 1)) AS main_url
          FROM (
            SELECT id AS plant_id, 'photo' AS kind, photo AS val, photo AS main_val, photo_credit, photo_licence FROM plants
            UNION ALL
            SELECT id, 'photo_species', photo_species, photo, photo_credit, photo_licence FROM plants
            UNION ALL
            SELECT id, 'photo_leaf', photo_leaf, photo, photo_credit, photo_licence FROM plants
            UNION ALL
            SELECT id, 'photo_flower', photo_flower, photo, photo_credit, photo_licence FROM plants
            UNION ALL
            SELECT id, 'photo_fruit', photo_fruit, photo, photo_credit, photo_licence FROM plants
            UNION ALL
            SELECT id, 'photo_harvest_part', photo_harvest_part, photo, photo_credit, photo_licence FROM plants
          ) b
         WHERE b.val IS NOT NULL AND TRIM(b.val) <> ''
      ) c
      JOIN (
        SELECT 1 AS pos UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
        UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10
        UNION ALL SELECT 11 UNION ALL SELECT 12 UNION ALL SELECT 13 UNION ALL SELECT 14 UNION ALL SELECT 15
        UNION ALL SELECT 16 UNION ALL SELECT 17 UNION ALL SELECT 18 UNION ALL SELECT 19 UNION ALL SELECT 20
        UNION ALL SELECT 21 UNION ALL SELECT 22 UNION ALL SELECT 23 UNION ALL SELECT 24 UNION ALL SELECT 25
        UNION ALL SELECT 26 UNION ALL SELECT 27 UNION ALL SELECT 28 UNION ALL SELECT 29 UNION ALL SELECT 30
      ) n ON n.pos <= 1 + CHAR_LENGTH(c.raw) - CHAR_LENGTH(REPLACE(c.raw, CHAR(10), ''))
  ) e
 WHERE e.url <> ''
   AND NOT EXISTS (SELECT 1 FROM plant_photos pp WHERE pp.plant_id = e.plant_id)
 ORDER BY e.plant_id, e.kind, e.pos;
