-- Surface « personnel » (proflyautey) : quatrième surface d'affichage des lieux, à côté de la
-- carte de travail (`map`), la Visite (`visit`) et le Plan Lyautey public (`plan`).
-- Voir `lib/locationSurfaces.js` et `docs/reference/plan/presentation.md`.
--
-- Le plan public reste ouvert à tous ; proflyautey s'adresse aux personnels authentifiés et
-- montre en plus les lieux retirés du plan public, ainsi que les compléments confidentiels
-- déjà portés par `restricted_note` (`lib/locationAudience.js`).
--
-- IMPORTANT — `staff` est ajouté **en fin** de chaque `SET(...)`. MySQL encode un SET par
-- position de bit : insérer une valeur au milieu réécrirait silencieusement toutes les lignes
-- existantes (un lieu masqué sur `plan` deviendrait masqué sur `staff`). Toute surface future
-- s'ajoute donc elle aussi à la fin.
--
-- Idempotent : les `MODIFY COLUMN` reposent la même définition, les `UPDATE` reposent la même
-- valeur (`FIND_IN_SET` garde les lignes déjà traitées hors du lot).

ALTER TABLE location_categories
  MODIFY COLUMN surfaces SET('map','visit','plan','staff') NOT NULL DEFAULT 'map,visit,plan,staff'
    COMMENT 'Surfaces où la catégorie (et ses lieux) apparaît';

ALTER TABLE zones
  MODIFY COLUMN hidden_surfaces SET('map','visit','plan','staff') NOT NULL DEFAULT ''
    COMMENT 'Surfaces où cette zone est masquée';

ALTER TABLE map_markers
  MODIFY COLUMN hidden_surfaces SET('map','visit','plan','staff') NOT NULL DEFAULT ''
    COMMENT 'Surfaces où ce repère est masqué';

ALTER TABLE map_routes
  MODIFY COLUMN surfaces SET('map','visit','plan','staff') NOT NULL DEFAULT 'plan'
    COMMENT 'Surfaces où le parcours est publié';

-- Continuité : toute catégorie existante apparaît aussi sur la surface personnel. Un personnel
-- authentifié voit donc, au minimum, ce que voit le public — et les catégories volontairement
-- tenues hors du plan public (locaux techniques, logistique…) lui deviennent visibles, ce qui
-- est précisément l'objet du sous-domaine. Le tri fin se fait ensuite dans « Revue des
-- surfaces » de la console.
UPDATE location_categories
   SET surfaces = CONCAT_WS(',', NULLIF(surfaces, ''), 'staff')
 WHERE FIND_IN_SET('staff', surfaces) = 0;

-- Un lieu retiré de **toutes** les surfaces existantes a été retiré délibérément : il ne doit
-- pas réapparaître sur la surface personnel à la faveur de cette migration. Les autres gardent
-- leur masquage tel quel, donc un lieu masqué sur le seul plan public devient visible sur
-- proflyautey — l'effet recherché.
UPDATE zones
   SET hidden_surfaces = CONCAT_WS(',', NULLIF(hidden_surfaces, ''), 'staff')
 WHERE FIND_IN_SET('map', hidden_surfaces) > 0
   AND FIND_IN_SET('visit', hidden_surfaces) > 0
   AND FIND_IN_SET('plan', hidden_surfaces) > 0
   AND FIND_IN_SET('staff', hidden_surfaces) = 0;

UPDATE map_markers
   SET hidden_surfaces = CONCAT_WS(',', NULLIF(hidden_surfaces, ''), 'staff')
 WHERE FIND_IN_SET('map', hidden_surfaces) > 0
   AND FIND_IN_SET('visit', hidden_surfaces) > 0
   AND FIND_IN_SET('plan', hidden_surfaces) > 0
   AND FIND_IN_SET('staff', hidden_surfaces) = 0;

-- Parcours : continuité stricte. Ce qui est publié sur le plan public l'est aussi côté
-- personnel ; un parcours réservé aux personnels se publie ensuite depuis la console en
-- cochant la seule surface personnel.
UPDATE map_routes
   SET surfaces = CONCAT_WS(',', NULLIF(surfaces, ''), 'staff')
 WHERE FIND_IN_SET('plan', surfaces) > 0
   AND FIND_IN_SET('staff', surfaces) = 0;
