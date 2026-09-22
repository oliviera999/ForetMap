-- Classification en groupes emboîtés (lot 5).
-- Table `clades` (arbre pédagogique : parent_id, shared_attribute = caractère partagé)
-- et rattachement `plants.clade_id` au groupe le plus précis.
-- Idempotent. Amorçage : sql/biodiv_structure_seeds/06_classification.sql

CREATE TABLE IF NOT EXISTS clades (
  id VARCHAR(64) NOT NULL,
  parent_id VARCHAR(64) DEFAULT NULL,
  name VARCHAR(160) NOT NULL,
  shared_attribute VARCHAR(255) NOT NULL COMMENT 'Caractère partagé qui définit le groupe (attribut)',
  description TEXT DEFAULT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_clades_parent (parent_id),
  CONSTRAINT fk_clades_parent FOREIGN KEY (parent_id) REFERENCES clades (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE plants
  ADD COLUMN clade_id VARCHAR(64) DEFAULT NULL COMMENT 'Groupe le plus précis (clades.id)';

ALTER TABLE plants
  ADD CONSTRAINT fk_plants_clade FOREIGN KEY (clade_id) REFERENCES clades (id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Amorçage (sql/biodiv_structure_seeds/06_classification.sql)
-- INSERT IGNORE + UPDATE bornés par clade_id IS NULL : rejouer ne réécrit pas.
-- ---------------------------------------------------------------------------

-- ForêtMap — données d'amorçage : arbre de classification (groupes emboîtés) et rattachement des fiches
-- À exécuter APRÈS la migration : lot 5 (tables clades, plants.clade_id)
-- Idempotent. Données uniquement. Généré le 22/09/2026 à partir de la base corrigée.


INSERT IGNORE INTO clades (id, parent_id, name, shared_attribute, sort_order) VALUES
('vivant', NULL, 'Êtres vivants', 'Constitués de cellules', 0),
('bacteries', 'vivant', 'Bactéries', 'Cellule sans noyau', 1),
('eucaryotes', 'vivant', 'Eucaryotes', 'Cellules à noyau', 2),
('chlorobiontes', 'eucaryotes', 'Chlorobiontes (lignée verte)', 'Chloroplastes à chlorophylles a et b, réserves d’amidon', 3),
('algues_vertes', 'chlorobiontes', 'Algues vertes', 'Pas de tissus conducteurs ni d’embryon protégé', 4),
('embryophytes', 'chlorobiontes', 'Plantes terrestres (embryophytes)', 'Embryon protégé par la plante mère, cuticule', 5),
('tracheophytes', 'embryophytes', 'Plantes vasculaires', 'Vaisseaux conducteurs de sève', 6),
('fougeres', 'tracheophytes', 'Fougères', 'Spores ; feuilles enroulées en crosse à la pousse', 7),
('spermaphytes', 'tracheophytes', 'Plantes à graines', 'Graines', 8),
('gymnospermes', 'spermaphytes', 'Gymnospermes', 'Graines nues, non enfermées dans un fruit', 9),
('angiospermes', 'spermaphytes', 'Plantes à fleurs (angiospermes)', 'Fleurs ; graines enfermées dans un fruit', 10),
('monocotyledones', 'angiospermes', 'Monocotylédones', 'Une seule feuille dans la graine (cotylédon), nervures parallèles', 11),
('rhodophytes', 'eucaryotes', 'Algues rouges', 'Pigments rouges (phycoérythrine)', 12),
('stramenopiles', 'eucaryotes', 'Algues brunes et apparentés', 'Pigment brun (fucoxanthine)', 13),
('cilies', 'eucaryotes', 'Ciliés', 'Cellule unique couverte de cils', 14),
('opisthocontes', 'eucaryotes', 'Opisthocontes', 'Cellules à un flagelle postérieur (spermatozoïde, spores)', 15),
('champignons', 'opisthocontes', 'Champignons', 'Paroi de chitine ; absorbent leur nourriture', 16),
('metazoaires', 'opisthocontes', 'Animaux (métazoaires)', 'Pluricellulaires, se nourrissent d’autres êtres vivants, sans paroi cellulaire', 17),
('cnidaires', 'metazoaires', 'Cnidaires', 'Cellules urticantes', 18),
('bilateriens', 'metazoaires', 'Bilatériens', 'Symétrie bilatérale : un côté droit et un côté gauche', 19),
('echinodermes', 'bilateriens', 'Échinodermes', 'Squelette de plaques calcaires, symétrie d’ordre 5 chez l’adulte', 20),
('vertebres', 'bilateriens', 'Vertébrés', 'Squelette interne avec colonne vertébrale', 21),
('actinopterygiens', 'vertebres', 'Poissons à nageoires rayonnées', 'Nageoires soutenues par des rayons osseux', 22),
('tetrapodes', 'vertebres', 'Tétrapodes', 'Quatre membres', 23),
('amphibiens', 'tetrapodes', 'Amphibiens', 'Peau nue ; larve aquatique', 24),
('amniotes', 'tetrapodes', 'Amniotes', 'Œuf à amnios (protégeant l’embryon hors de l’eau)', 25),
('mammiferes', 'amniotes', 'Mammifères', 'Poils, mamelles', 26),
('sauropsides', 'amniotes', 'Sauropsides', 'Peau couverte d’écailles de kératine (ou de plumes)', 27),
('tortues', 'sauropsides', 'Tortues', 'Carapace', 28),
('squamates', 'sauropsides', 'Lézards et serpents', 'Mue de la peau en lambeaux ou d’un seul tenant', 29),
('oiseaux', 'sauropsides', 'Oiseaux', 'Plumes, bec sans dents', 30),
('mollusques', 'bilateriens', 'Mollusques', 'Corps mou, manteau (souvent une coquille)', 31),
('gasteropodes', 'mollusques', 'Gastéropodes', 'Pied ventral, coquille d’une seule pièce (parfois absente)', 32),
('bivalves', 'mollusques', 'Bivalves', 'Coquille à deux valves', 33),
('cephalopodes', 'mollusques', 'Céphalopodes', 'Bras munis de ventouses autour de la bouche', 34),
('annelides', 'bilateriens', 'Annélides', 'Corps formé d’anneaux', 35),
('nematodes', 'bilateriens', 'Nématodes', 'Ver cylindrique non segmenté', 36),
('arthropodes', 'bilateriens', 'Arthropodes', 'Squelette externe et pattes articulées', 37),
('insectes', 'arthropodes', 'Insectes', 'Six pattes, deux antennes', 38),
('collemboles', 'arthropodes', 'Collemboles', 'Six pattes, organe de saut sous l’abdomen', 39),
('arachnides', 'arthropodes', 'Arachnides', 'Huit pattes, pas d’antennes', 40),
('crustaces', 'arthropodes', 'Crustacés', 'Deux paires d’antennes', 41),
('myriapodes', 'arthropodes', 'Myriapodes', 'Nombreuses paires de pattes', 42);
-- Rattachement des fiches par grand groupe (les reptiles sont traités à part, groupe non monophylétique)
UPDATE plants SET clade_id = 'angiospermes' WHERE taxon_group = 'Angiosperme' AND clade_id IS NULL;
UPDATE plants SET clade_id = 'monocotyledones' WHERE taxon_group = 'Angiosperme (monocotylédone)' AND clade_id IS NULL;
UPDATE plants SET clade_id = 'gymnospermes' WHERE taxon_group = 'Gymnosperme' AND clade_id IS NULL;
UPDATE plants SET clade_id = 'fougeres' WHERE taxon_group = 'Ptéridophytes' AND clade_id IS NULL;
UPDATE plants SET clade_id = 'algues_vertes' WHERE taxon_group = 'Chlorophytes' AND clade_id IS NULL;
UPDATE plants SET clade_id = 'algues_vertes' WHERE taxon_group = 'Charophytes' AND clade_id IS NULL;
UPDATE plants SET clade_id = 'algues_vertes' WHERE taxon_group = 'Algue verte (Trébouxiophycées)' AND clade_id IS NULL;
UPDATE plants SET clade_id = 'rhodophytes' WHERE taxon_group = 'Rhodophytes' AND clade_id IS NULL;
UPDATE plants SET clade_id = 'stramenopiles' WHERE taxon_group = 'Phéophycées' AND clade_id IS NULL;
UPDATE plants SET clade_id = 'bacteries' WHERE taxon_group = 'Bactéries' AND clade_id IS NULL;
UPDATE plants SET clade_id = 'champignons' WHERE taxon_group = 'Champignons' AND clade_id IS NULL;
UPDATE plants SET clade_id = 'cilies' WHERE taxon_group = 'Protozoaires' AND clade_id IS NULL;
UPDATE plants SET clade_id = 'oiseaux' WHERE taxon_group = 'Oiseaux' AND clade_id IS NULL;
UPDATE plants SET clade_id = 'mammiferes' WHERE taxon_group = 'Mammifères' AND clade_id IS NULL;
UPDATE plants SET clade_id = 'amphibiens' WHERE taxon_group = 'Amphibiens' AND clade_id IS NULL;
UPDATE plants SET clade_id = 'actinopterygiens' WHERE taxon_group = 'Téléostéens (groupe de poissons)' AND clade_id IS NULL;
UPDATE plants SET clade_id = 'insectes' WHERE taxon_group = 'Insectes' AND clade_id IS NULL;
UPDATE plants SET clade_id = 'collemboles' WHERE taxon_group = 'Collemboles' AND clade_id IS NULL;
UPDATE plants SET clade_id = 'arachnides' WHERE taxon_group = 'Arachnides' AND clade_id IS NULL;
UPDATE plants SET clade_id = 'crustaces' WHERE taxon_group = 'Crustacés' AND clade_id IS NULL;
UPDATE plants SET clade_id = 'myriapodes' WHERE taxon_group = 'Myriapodes' AND clade_id IS NULL;
UPDATE plants SET clade_id = 'gasteropodes' WHERE taxon_group = 'Gastéropodes' AND clade_id IS NULL;
UPDATE plants SET clade_id = 'bivalves' WHERE taxon_group = 'Bivalves' AND clade_id IS NULL;
UPDATE plants SET clade_id = 'cephalopodes' WHERE taxon_group = 'Céphalopodes' AND clade_id IS NULL;
UPDATE plants SET clade_id = 'annelides' WHERE taxon_group = 'Annélides' AND clade_id IS NULL;
UPDATE plants SET clade_id = 'nematodes' WHERE taxon_group = 'Nématodes' AND clade_id IS NULL;
UPDATE plants SET clade_id = 'cnidaires' WHERE taxon_group = 'Cnidaires' AND clade_id IS NULL;
UPDATE plants SET clade_id = 'echinodermes' WHERE taxon_group = 'Échinodermes' AND clade_id IS NULL;
UPDATE plants SET clade_id = 'tortues' WHERE id IN (532, 533) AND clade_id IS NULL;
UPDATE plants SET clade_id = 'squamates' WHERE id IN (133, 534) AND clade_id IS NULL;
-- Le lichen est une association champignon + algue : rattaché aux champignons (partenaire qui forme la structure)
UPDATE plants SET clade_id = 'champignons' WHERE taxon_group = 'Lichens' AND clade_id IS NULL;
