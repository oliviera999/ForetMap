-- =====================================================================
-- Plan e-nov (`enov.*`) : cinquième surface d'affichage des lieux, dédiée au label e-nov.
-- Voir `lib/locationSurfaces.js`, `routes/enov-plan.js` et `docs/reference/plan/plan-enov.md`.
--
-- LE BESOIN
-- Présenter, sur le plan de l'établissement, les zones et repères retenus pour leur caractère
-- innovant (label e-nov). Ces lieux existent déjà : ils doivent ressortir au premier coup
-- d'œil sur le plan e-nov, et porter un texte propre (« en quoi c'est une innovation »),
-- sans rien changer à ce qu'affichent la carte ForetMap, la Visite et les deux autres plans.
--
-- LA RÉPONSE
-- 1. Surface `enov` ajoutée **en fin** de chaque `SET(...)` (même contrainte que la
--    migration 260 : MySQL encode un SET par position de bit ; insérer au milieu réécrirait
--    silencieusement toutes les lignes existantes).
-- 2. Continuité : le plan e-nov montre **le même plan** que le Plan Lyautey public. Toute
--    catégorie visible sur `plan` l'est aussi sur `enov`, et un lieu masqué sur `plan` l'est
--    aussi sur `enov` — le plan e-nov est public, il ne doit pas faire réapparaître un lieu
--    retiré du public (lieux sensibles au titre du PPMS).
-- 3. `location_categories.is_distinction` : catégorie-**label**. Elle signale un lieu sans
--    jamais décider de sa visibilité hors de ses surfaces (`isVisibleOnSurface`). Sans ce
--    drapeau, poser la catégorie e-nov (visible sur `enov` seulement) sur un lieu jusque-là
--    sans catégorie — une entrée, la loge — le faisait disparaître de tous les autres plans.
-- 4. Catégorie `cat-enov` semée : visible sur la seule surface `enov`, drapeau label posé.
--    Les gestionnaires de lieux (administrateur, n3boss) la voient et l'éditent dans
--    ForetMap, comme tout lieu masqué (`lib/surfaceAccess.js`, lecture non filtrée).
-- 5. `zones.enov_description` / `map_markers.enov_description` : le texte e-nov, affiché en
--    tête de fiche sur le plan e-nov, et nulle part ailleurs.
--
-- IDEMPOTENCE
-- Colonnes : erreur 1060 tolérée par le lanceur. Les `MODIFY COLUMN` reposent la même
-- définition ; les `UPDATE` sont gardés par `FIND_IN_SET` ; la catégorie est un
-- `INSERT IGNORE`.
-- Retour arrière : DROP des trois colonnes, puis `MODIFY COLUMN` sans `enov` (après avoir
-- retiré `enov` des valeurs stockées), et `DELETE FROM location_categories WHERE id = 'cat-enov'`.
-- =====================================================================

ALTER TABLE location_categories
  MODIFY COLUMN surfaces SET('map','visit','plan','staff','enov') NOT NULL DEFAULT 'map,visit,plan,staff,enov'
    COMMENT 'Surfaces où la catégorie (et ses lieux) apparaît';

ALTER TABLE zones
  MODIFY COLUMN hidden_surfaces SET('map','visit','plan','staff','enov') NOT NULL DEFAULT ''
    COMMENT 'Surfaces où cette zone est masquée';

ALTER TABLE map_markers
  MODIFY COLUMN hidden_surfaces SET('map','visit','plan','staff','enov') NOT NULL DEFAULT ''
    COMMENT 'Surfaces où ce repère est masqué';

ALTER TABLE map_routes
  MODIFY COLUMN surfaces SET('map','visit','plan','staff','enov') NOT NULL DEFAULT 'plan'
    COMMENT 'Surfaces où le parcours est publié';

ALTER TABLE location_categories
  ADD COLUMN is_distinction TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Catégorie-label (e-nov…) : signale le lieu sans décider de sa visibilité ailleurs';

ALTER TABLE zones
  ADD COLUMN enov_description TEXT DEFAULT NULL
    COMMENT 'Texte e-nov : en quoi ce lieu est une innovation (plan e-nov seulement)';

ALTER TABLE map_markers
  ADD COLUMN enov_description TEXT DEFAULT NULL
    COMMENT 'Texte e-nov : en quoi ce lieu est une innovation (plan e-nov seulement)';

-- Continuité des catégories : ce que montre le plan public, le plan e-nov le montre aussi.
UPDATE location_categories
   SET surfaces = CONCAT_WS(',', NULLIF(surfaces, ''), 'enov')
 WHERE FIND_IN_SET('plan', surfaces) > 0
   AND FIND_IN_SET('enov', surfaces) = 0;

-- Continuité des masquages : un lieu retiré du plan public reste hors du plan e-nov.
UPDATE zones
   SET hidden_surfaces = CONCAT_WS(',', NULLIF(hidden_surfaces, ''), 'enov')
 WHERE FIND_IN_SET('plan', hidden_surfaces) > 0
   AND FIND_IN_SET('enov', hidden_surfaces) = 0;

UPDATE map_markers
   SET hidden_surfaces = CONCAT_WS(',', NULLIF(hidden_surfaces, ''), 'enov')
 WHERE FIND_IN_SET('plan', hidden_surfaces) > 0
   AND FIND_IN_SET('enov', hidden_surfaces) = 0;

-- Parcours : aucun report automatique. Un parcours du plan public n'a pas vocation à être
-- repris tel quel sur le plan e-nov ; un « parcours des innovations » se publie depuis la
-- console en cochant la surface e-nov.

-- Catégorie e-nov : visible sur la seule surface `enov`, catégorie-label, en tête de liste.
INSERT IGNORE INTO location_categories
  (id, map_id, slug, label, emoji, color, description, applies_to, is_infrastructure,
   sort_order, is_active, surfaces, zoom_only, is_distinction)
VALUES
  ('cat-enov', NULL, 'enov', 'e-nov', '💡', '#f59e0b90',
   'Lieu présenté pour son caractère innovant (label e-nov). Visible sur le seul plan e-nov.',
   'both', 0, 0, 1, 'enov', 0, 1);
