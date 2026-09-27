-- =====================================================================
-- Sosies des fiches espèces (`plant_lookalikes`) et remarques en une seule zone de texte
-- (`plants.remarks`).
-- Audit du 25/09/2026, § 1.3.6, § 2.3 et § 3.5 (piste C, tranche « sosies et remarques »).
--
-- LE CONSTAT
-- La confusion entre espèces — l'information qui compte quand des élèves récoltent — n'a
-- qu'un champ de texte libre, `lookalike_species`, rempli sur UNE fiche du fixture ; 19
-- fiches parlent de ressemblance et 16 de danger dans leurs REMARQUES, réparties sur trois
-- champs (`remark_1` 326 fiches, `remark_2` 130, `remark_3` 89 ; 330 fiches ont au moins une
-- remarque ; 4 n'ont rien en `remark_1` mais quelque chose en `remark_2` ou `remark_3`).
--
-- LES SOSIES
-- `plant_lookalikes` : une ligne par PAIRE de fiches qui se ressemblent (« ne pas confondre
-- avec… »), avec une note (le critère qui tranche). Paire non orientée, stockée une fois dans
-- l'ordre canonique `plant_id` < `lookalike_plant_id` : l'ordre et la symétrie sont tenus par
-- le service (`lib/biodiv/plantLookalikes.js`), la contrainte CHECK n'étant pas posée (MySQL 8
-- la refuse sur une colonne portant une action de clé étrangère). Les deux fiches sont
-- supprimées en cascade. AUCUNE paire n'est créée ici : ventiler les remarques et le texte
-- libre vers des sosies est un travail éditorial (une personne lit et décide) ; le texte libre
-- `lookalike_species` reste la place d'une ressemblance avec une espèce absente du catalogue.
--
-- LES REMARQUES
-- `plants.remarks` = remarques non vides, dans l'ordre, séparées par une ligne vide :
--   CONCAT_WS('\n\n', remark_1, remark_2, remark_3) (champs vides ignorés).
-- Rien n'est réécrit dans `remark_1..3`.
--
-- IDEMPOTENCE
-- Colonne : erreur 1060 tolérée ; table : IF NOT EXISTS ; reprise bornée à `remarks IS NULL`
-- (un second passage ne change rien, une remarque déjà saisie n'est jamais écrasée).
-- Aucune suppression, aucune table `gl_*`.
--
-- RETRAIT EN TROIS TEMPS (§ 3.5) — remarques seulement (les sosies sont un ajout)
-- T1 et T2 — livrés avec cette migration : la fiche (bloc « Remarques ») lit `remarks`, avec
--   repli sur `remark_1..3` si `remarks` est vide ou ne correspond plus à leur concaténation
--   (écriture sans le nouveau champ : version antérieure du code, migration de contenu,
--   script) ; le formulaire n'a plus qu'une zone de texte. MIROIR gardé jusqu'au T3, règle la
--   plus sûre pour un retour arrière : si le texte enregistré est exactement la concaténation
--   des trois anciens champs, ceux-ci restent INTACTS ; sinon `remark_1` reçoit le texte
--   entier et `remark_2` / `remark_3` sont vidés (ni perte, ni doublon).
-- T3 — migration FUTURE, PAS dans ce lot : retrait du miroir et du repli, puis
--   ALTER TABLE plants DROP COLUMN remark_1, DROP COLUMN remark_2, DROP COLUMN remark_3;
--   Conditions de passage, toutes requises :
--   1. ce code tourne en production depuis au moins un cycle, sans retour arrière ;
--   2. nombre de fiches à remarque non vide identique avant et après :
--        SELECT COUNT(*) FROM plants WHERE NULLIF(TRIM(remark_1),'') IS NOT NULL
--           OR NULLIF(TRIM(remark_2),'') IS NOT NULL OR NULLIF(TRIM(remark_3),'') IS NOT NULL;
--        SELECT COUNT(*) FROM plants WHERE NULLIF(TRIM(remarks),'') IS NOT NULL;
--      (330 et 330 sur le fixture), et aucune fiche lue en repli :
--        SELECT COUNT(*) FROM plants
--         WHERE COALESCE(remarks, '') <> COALESCE(CONCAT_WS(CONCAT(CHAR(10), CHAR(10)),
--               NULLIF(TRIM(remark_1),''), NULLIF(TRIM(remark_2),''), NULLIF(TRIM(remark_3),'')), '');
--      = 0 ;
--   3. plus aucun lecteur de `remark_1..3` hors du repli : `lib/visitorTextCorpus.js`
--      (contrôle des textes visiteurs), le seed de démonstration de `database.js` ;
--   4. sauvegarde vérifiée juste avant.
-- Retour arrière de CETTE migration : DROP TABLE IF EXISTS plant_lookalikes;
--   ALTER TABLE plants DROP COLUMN remarks; (les anciens champs, tenus en miroir, portent
--   tout le texte).
-- =====================================================================

ALTER TABLE plants
  ADD COLUMN remarks TEXT DEFAULT NULL
    COMMENT 'Remarques (une seule zone de texte ; remark_1..3 en miroir jusqu''au retrait)';

UPDATE plants
   SET remarks = CONCAT_WS(CONCAT(CHAR(10), CHAR(10)),
                           NULLIF(TRIM(remark_1), ''),
                           NULLIF(TRIM(remark_2), ''),
                           NULLIF(TRIM(remark_3), ''))
 WHERE remarks IS NULL
   AND (NULLIF(TRIM(remark_1), '') IS NOT NULL
        OR NULLIF(TRIM(remark_2), '') IS NOT NULL
        OR NULLIF(TRIM(remark_3), '') IS NOT NULL);

CREATE TABLE IF NOT EXISTS plant_lookalikes (
  plant_id INT UNSIGNED NOT NULL COMMENT 'Plus petit identifiant de la paire',
  lookalike_plant_id INT UNSIGNED NOT NULL COMMENT 'Plus grand identifiant de la paire',
  note VARCHAR(500) DEFAULT NULL COMMENT 'Critère qui permet de les distinguer',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (plant_id, lookalike_plant_id),
  KEY idx_plant_lookalikes_other (lookalike_plant_id),
  CONSTRAINT fk_plant_lookalikes_plant FOREIGN KEY (plant_id)
    REFERENCES plants (id) ON DELETE CASCADE,
  CONSTRAINT fk_plant_lookalikes_other FOREIGN KEY (lookalike_plant_id)
    REFERENCES plants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
