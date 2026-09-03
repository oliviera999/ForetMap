-- Lot 5 du plan de convergence (`docs/AUDIT_PLAN_LYAUTEY_2026-09.md` §8.3, point 3) :
-- désencombrement des cartes denses. Une catégorie peut être marquée « visible seulement au
-- zoom » : ses lieux disparaissent quand la carte est vue en entier, et réapparaissent dès
-- qu'on zoome. C'est le réglage qui permet de garder les sanitaires ou les points d'eau sans
-- noyer les entrées et les bâtiments.
--
-- La **priorité** entre catégories, elle, ne demande pas de colonne : `sort_order` fait déjà
-- foi pour l'ordre d'affichage, et sert de rang (plus petit = plus important). Idempotent.

ALTER TABLE location_categories
  ADD COLUMN IF NOT EXISTS zoom_only TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Lieux affichés seulement quand la carte est zoomée (désencombrement)';
