SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- =====================================================================
-- Nature d'une fiche du catalogue : `plants.entity_kind`.
--
-- Le défaut. La production porte cette colonne depuis une écriture directe (hors dépôt) ; une
-- base construite par les migrations ne l'avait pas. Le code ne pouvait donc pas s'y appuyer.
-- Or le catalogue contient des fiches qui ne sont pas des espèces :
--   - `groupe_fonctionnel` : un ensemble d'êtres vivants défini par son rôle (plancton,
--     champignons de litière…) ;
--   - `consortium` : une association d'êtres vivants (lichen, biofilm, mycorhize) ;
--   - `ressource` : de la matière non vivante, nécessaire au réseau trophique (litière,
--     compost, bois mort…).
-- Les fiches « ressource » restent dans le réseau trophique, les liens, les clés et la gestion ;
-- elles sortent de la liste et de la recherche des élèves (ce ne sont pas des êtres vivants).
--
-- Type, valeur par défaut, commentaire et index : identiques à la production (relevé du
-- 21/11/2026, lecture seule). En production, ce fichier ne change rien.
--
-- Idempotent : ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS ; chaque valeur n'est posée
-- que sur une fiche encore à la valeur par défaut (`<=>`), désignée par son nom. Une fiche
-- absente est simplement sautée (aucune création de contenu). Aucun trigger, aucun DEFINER,
-- aucune donnée personnelle, aucune table `gl_*`.
--
-- Hors de ce fichier, volontairement : le reste de l'écart de schéma de `plants`
-- (domestication, ancêtre sauvage, risques sanitaires supplémentaires).
-- =====================================================================

ALTER TABLE plants
  ADD COLUMN IF NOT EXISTS entity_kind
    ENUM('taxon','groupe_fonctionnel','consortium','ressource') NOT NULL DEFAULT 'taxon'
    COMMENT 'Nature de la fiche : taxon, groupe fonctionnel (plancton…), consortium (lichen, biofilm, mycorhize) ou ressource non vivante (litière, compost…)'
    AFTER clade_id;

CREATE INDEX IF NOT EXISTS idx_plants_entity_kind ON plants (entity_kind);

UPDATE plants
   SET entity_kind = 'ressource'
 WHERE entity_kind <=> 'taxon'
   AND name IN (
     'Litière de feuilles',
     'Compost et épluchures',
     'Bois mort',
     'Fruits et légumes tombés',
     'Carton de lombricompost',
     'Crottes et fientes'
   );

UPDATE plants
   SET entity_kind = 'groupe_fonctionnel'
 WHERE entity_kind <=> 'taxon'
   AND name IN (
     'Champignons de litière',
     'Ciliés et amibes du compost',
     'Phytoplancton',
     'Zooplancton'
   );

UPDATE plants
   SET entity_kind = 'consortium'
 WHERE entity_kind <=> 'taxon'
   AND name IN (
     'Biofilm',
     'Mycorhizes à Glomus',
     'Lichen noir des rochers',
     'Xanthorie des murailles'
   );
