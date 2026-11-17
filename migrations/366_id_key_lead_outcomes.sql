-- Clés d'identification : issues « groupe », « clade » et renvoi vers une autre clé.
--
-- La base de production porte depuis octobre 2026 des colonnes et une table qu'aucune
-- migration ne créait (dérive de schéma constatée le 17/11/2026) : `id_key_leads.outcome`,
-- `clade_id`, `result_label`, `next_key_id`, `hint`, la table `id_key_lead_plants`, et
-- `id_keys.tool_required` / `safety_note`. Cette migration les formalise à l'identique pour
-- qu'une base neuve ressemble à la prod. Idempotente : en prod, chaque instruction tombe
-- sur une erreur « déjà présent » ignorée par le chargeur (1060, 1061, 1022, 1826) ou sur
-- une simple note (IF NOT EXISTS).
--
-- Issues d'une proposition (`outcome`) :
--   couplet → couplet suivant (`next_couplet_id`) ;
--   espece  → une espèce (`plant_id`) ;
--   groupe  → plusieurs espèces candidates (`id_key_lead_plants`), nommées par `result_label` ;
--   clade   → un grand groupe de la classification (`clade_id`, table `clades`, migration 274).
-- `next_key_id` (« Pour aller plus loin ») n'existe que sur une feuille (espece, groupe, clade).

ALTER TABLE id_keys
  ADD COLUMN tool_required SET('loupe','boite_loupe','jumelles') DEFAULT NULL
    COMMENT 'Matériel d''observation nécessaire (NULL = aucun)';

ALTER TABLE id_keys
  ADD COLUMN safety_note TEXT DEFAULT NULL
    COMMENT 'Consigne de sécurité affichée avant de commencer la clé';

ALTER TABLE id_key_leads
  ADD COLUMN hint TEXT DEFAULT NULL
    COMMENT 'Aide de vocabulaire ou mise en garde affichée sous la proposition'
    AFTER statement;

ALTER TABLE id_key_leads
  ADD COLUMN outcome ENUM('couplet','espece','groupe','clade') NOT NULL DEFAULT 'couplet'
    COMMENT 'Issue : couplet suivant / une espèce / un groupe d''espèces (id_key_lead_plants) / un clade';

ALTER TABLE id_key_leads
  ADD COLUMN clade_id VARCHAR(64) DEFAULT NULL
    COMMENT 'Clade atteint (outcome=clade) ou clade de rattachement d''un groupe (outcome=groupe, facultatif)';

ALTER TABLE id_key_leads
  ADD COLUMN result_label VARCHAR(160) DEFAULT NULL
    COMMENT 'Nom affiché du groupe d''espèces (outcome=groupe)';

ALTER TABLE id_key_leads
  ADD COLUMN next_key_id INT UNSIGNED DEFAULT NULL
    COMMENT '« Pour aller plus loin » : clé proposée après un résultat (jamais sur outcome=couplet)';

ALTER TABLE id_key_leads ADD KEY idx_leads_clade (clade_id);
ALTER TABLE id_key_leads ADD KEY idx_leads_next_key (next_key_id);

-- Clés étrangères : `FOREIGN KEY IF NOT EXISTS` (MariaDB) plutôt qu'un ajout simple. En prod,
-- `clade_id` figure dans la contrainte CHECK `chk_idkey_lead_outcome` : MariaDB refuse alors
-- tout ALTER qui ajoute une clé étrangère sur cette colonne (errno 1901), même si elle existe
-- déjà sous ce nom — le premier déploiement de cette migration a échoué ainsi le 17/11/2026
-- (retour arrière automatique). Avec IF NOT EXISTS, une clé existante est sautée (note 1061).
-- `fk_lead_clade` est sans action ON DELETE, comme en prod : une colonne d'une contrainte
-- CHECK ne peut pas porter d'action référentielle (SET NULL, CASCADE).
ALTER TABLE id_key_leads
  ADD CONSTRAINT fk_lead_clade FOREIGN KEY IF NOT EXISTS (clade_id) REFERENCES clades (id);

ALTER TABLE id_key_leads
  ADD CONSTRAINT fk_lead_next_key FOREIGN KEY IF NOT EXISTS (next_key_id)
    REFERENCES id_keys (id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS id_key_lead_plants (
  lead_id INT UNSIGNED NOT NULL,
  plant_id INT UNSIGNED NOT NULL,
  sort_order TINYINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (lead_id, plant_id),
  KEY idx_ilp_plant (plant_id),
  CONSTRAINT fk_ilp_lead FOREIGN KEY (lead_id) REFERENCES id_key_leads (id) ON DELETE CASCADE,
  CONSTRAINT fk_ilp_plant FOREIGN KEY (plant_id) REFERENCES plants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Espèces candidates d''une proposition outcome=groupe';

-- Rattrapage : une proposition qui mène à une espèce sans couplet suivant est une feuille
-- « espece », même si la colonne vient d'être créée avec sa valeur par défaut (base neuve),
-- ou si une écriture antérieure à cette migration l'a laissée à « couplet » (prod : 4 lignes
-- le 17/11/2026). Ne touche ni aux groupes ni aux clades.
UPDATE id_key_leads
   SET outcome = 'espece'
 WHERE outcome = 'couplet'
   AND next_couplet_id IS NULL
   AND plant_id IS NOT NULL;

-- Contrainte de forme, identique à celle de la prod : un clade exige `clade_id` ; `clade_id`
-- n'existe que sur un groupe ou un clade ; `result_label` est renseigné si et seulement si
-- l'issue est un groupe. Les règles applicatives (`src/shared/idKeyLeadCore.js`) la respectent.
ALTER TABLE id_key_leads
  ADD CONSTRAINT IF NOT EXISTS chk_idkey_lead_outcome CHECK (
    (outcome <> 'clade' OR clade_id IS NOT NULL)
    AND (outcome IN ('clade', 'groupe') OR clade_id IS NULL)
    AND (outcome = 'groupe') = (result_label IS NOT NULL)
  );
