SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- =====================================================================
-- Socle de l'affichage « collège » simplifié (chantier collège de novembre 2026).
--
-- Structure seule : aucune donnée n'est posée ici. Les valeurs arrivent par les migrations de
-- contenu du chantier (groupes d'usage, espèces phares, étiquettes simples, descriptions
-- collège) ; le code lit ces colonnes et retombe sur le comportement actuel tant qu'elles sont
-- vides (NULL ou 0).
--
--   - `clades.label_simple`, `clades.attribute_simple`, `clades.visible_college` : libellé et
--     attribut en mots simples d'une boîte de l'arbre des groupes, et marque des boîtes gardées
--     dans l'arbre réduit du collège (« groupes d'usage ») ;
--   - `map_species.is_featured` : espèce phare d'une carte (mise en tête au collège) ;
--   - `plants.usage_label` : étiquette simple (« une araignée sauteuse ») ;
--   - `plants.description_college` : description courte pour le collège, posée sur les espèces
--     phares seulement ;
--   - `quiz_categories.description_college` : description d'une catégorie partagée avec le
--     lycée, réécrite pour le collège.
--
-- Idempotent : ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS. Rejouable deux fois sans
-- erreur. Aucun trigger, aucun DEFINER, aucune donnée personnelle, aucune table `gl_*`.
-- =====================================================================

ALTER TABLE clades
  ADD COLUMN IF NOT EXISTS label_simple VARCHAR(160) NULL
    COMMENT 'Libellé en mots simples affiché au collège (repli : name)'
    AFTER name,
  ADD COLUMN IF NOT EXISTS attribute_simple VARCHAR(255) NULL
    COMMENT 'Attribut observable en mots simples affiché au collège (repli : shared_attribute)'
    AFTER shared_attribute,
  ADD COLUMN IF NOT EXISTS visible_college TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Boîte gardée dans l''arbre réduit du collège (groupe d''usage) : 1 = visible'
    AFTER sort_order;

ALTER TABLE map_species
  ADD COLUMN IF NOT EXISTS is_featured TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Espèce phare de la carte, mise en tête au collège : 1 = phare'
    AFTER validation_status;

CREATE INDEX IF NOT EXISTS idx_map_species_featured ON map_species (map_id, is_featured);

ALTER TABLE plants
  ADD COLUMN IF NOT EXISTS usage_label VARCHAR(120) NULL
    COMMENT 'Étiquette simple pour le collège (article + nom commun courant), ex. « une araignée sauteuse »',
  ADD COLUMN IF NOT EXISTS description_college TEXT NULL
    COMMENT 'Description courte pour le collège (espèces phares), remplace la description au collège';

ALTER TABLE quiz_categories
  ADD COLUMN IF NOT EXISTS description_college VARCHAR(255) NULL
    COMMENT 'Description de la catégorie réécrite pour le collège (repli : description)'
    AFTER description;
