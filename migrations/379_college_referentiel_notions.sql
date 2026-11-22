-- Migration college_referentiel_notions (chantier collège, intégration SI, 22/11/2026).
--
-- Référentiel des notions de programme : six notions et quatorze liaisons catégorie → notion
-- existent en production (créées dans l'application) mais manquent à une base semée par les
-- seules migrations (demandes des flux C6 et D3). Sans elles, une base fraîche n'a pas les
-- mêmes paliers de question que la production, et la migration college_quiz_paliers y pose
-- des exclusions différentes.
--
-- Placée AVANT college_quiz_paliers pour que le retri des questions voie, en base fraîche,
-- les mêmes notions de catégorie qu'en production. En production : aucun effet (tout existe,
-- vérifié sur l'instantané du 21/11). INSERT gardés par NOT EXISTS (clé naturelle) ; une
-- liaison n'est posée que si la catégorie et la notion existent. Le doublon C3-DEV /
-- C3-DEVREPRO et C3-MAT / C3-MATORG est conservé tel qu'en production (décision à Oliv).
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO curriculum_notions (id, niveau, discipline, theme, notion, sort_order)
SELECT 'C3-MAT', 'cycle3', 'Sciences et technologie', 'Le vivant, sa diversité et les fonctions qui le caractérisent',
       'Expliquer l''origine de la matière organique des êtres vivants et son devenir (besoins des plantes vertes, décomposeurs)', 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM curriculum_notions WHERE id = 'C3-MAT');

INSERT INTO curriculum_notions (id, niveau, discipline, theme, notion, sort_order)
SELECT 'C3-DEV', 'cycle3', 'Sciences et technologie', 'Le vivant, sa diversité et les fonctions qui le caractérisent',
       'Décrire comment les êtres vivants se développent et deviennent aptes à se reproduire', 2
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM curriculum_notions WHERE id = 'C3-DEV');

INSERT INTO curriculum_notions (id, niveau, discipline, theme, notion, sort_order)
SELECT 'C4-REPRO', 'cycle4', 'SVT', 'Le vivant et son évolution',
       'Reproduction sexuée et asexuée, influence du milieu sur la survie des individus et dynamique des populations', 6
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM curriculum_notions WHERE id = 'C4-REPRO');

INSERT INTO curriculum_notions (id, niveau, discipline, theme, notion, sort_order)
SELECT 'C4-MICRO', 'cycle4', 'SVT', 'Le corps humain et la santé',
       'Monde microbien : micro-organismes pathogènes, hygiène, vaccination', 7
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM curriculum_notions WHERE id = 'C4-MICRO');

INSERT INTO curriculum_notions (id, niveau, discipline, theme, notion, sort_order)
SELECT '2-PAYS', 'seconde', 'SVT', 'Enjeux contemporains de la planète',
       'Géosciences et dynamique des paysages (érosion, transport, sédimentation)', 11
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM curriculum_notions WHERE id = '2-PAYS');

INSERT INTO curriculum_notions (id, niveau, discipline, theme, notion, sort_order)
SELECT 'T-CLIM', 'terminale_spe', 'SVT', 'Enjeux planétaires contemporains',
       'Les climats de la Terre : comprendre le passé pour agir aujourd''hui et demain', 16
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM curriculum_notions WHERE id = 'T-CLIM');

INSERT INTO quiz_category_notions (categorie_slug, notion_id)
SELECT c.slug, n.id
FROM quiz_categories c
INNER JOIN curriculum_notions n ON n.id = '1-ECO'
WHERE c.slug = 'milieux_terrain'
  AND NOT EXISTS (
    SELECT 1 FROM quiz_category_notions x WHERE x.categorie_slug = c.slug AND x.notion_id = n.id
  );

INSERT INTO quiz_category_notions (categorie_slug, notion_id)
SELECT c.slug, n.id
FROM quiz_categories c
INNER JOIN curriculum_notions n ON n.id = '2-BIODIV'
WHERE c.slug = 'demarche_mesure'
  AND NOT EXISTS (
    SELECT 1 FROM quiz_category_notions x WHERE x.categorie_slug = c.slug AND x.notion_id = n.id
  );

INSERT INTO quiz_category_notions (categorie_slug, notion_id)
SELECT c.slug, n.id
FROM quiz_categories c
INNER JOIN curriculum_notions n ON n.id = '2-MICRO'
WHERE c.slug = 'microbes_sante'
  AND NOT EXISTS (
    SELECT 1 FROM quiz_category_notions x WHERE x.categorie_slug = c.slug AND x.notion_id = n.id
  );

INSERT INTO quiz_category_notions (categorie_slug, notion_id)
SELECT c.slug, n.id
FROM quiz_categories c
INNER JOIN curriculum_notions n ON n.id = '2-PAYS'
WHERE c.slug = 'milieux_terrain'
  AND NOT EXISTS (
    SELECT 1 FROM quiz_category_notions x WHERE x.categorie_slug = c.slug AND x.notion_id = n.id
  );

INSERT INTO quiz_category_notions (categorie_slug, notion_id)
SELECT c.slug, n.id
FROM quiz_categories c
INNER JOIN curriculum_notions n ON n.id = 'C3-DEV'
WHERE c.slug = 'semis_recolte'
  AND NOT EXISTS (
    SELECT 1 FROM quiz_category_notions x WHERE x.categorie_slug = c.slug AND x.notion_id = n.id
  );

INSERT INTO quiz_category_notions (categorie_slug, notion_id)
SELECT c.slug, n.id
FROM quiz_categories c
INNER JOIN curriculum_notions n ON n.id = 'C3-ENV'
WHERE c.slug = 'milieux_terrain'
  AND NOT EXISTS (
    SELECT 1 FROM quiz_category_notions x WHERE x.categorie_slug = c.slug AND x.notion_id = n.id
  );

INSERT INTO quiz_category_notions (categorie_slug, notion_id)
SELECT c.slug, n.id
FROM quiz_categories c
INNER JOIN curriculum_notions n ON n.id = 'C4-MICRO'
WHERE c.slug = 'microbes_sante'
  AND NOT EXISTS (
    SELECT 1 FROM quiz_category_notions x WHERE x.categorie_slug = c.slug AND x.notion_id = n.id
  );

INSERT INTO quiz_category_notions (categorie_slug, notion_id)
SELECT c.slug, n.id
FROM quiz_categories c
INNER JOIN curriculum_notions n ON n.id = 'C4-REPRO'
WHERE c.slug = 'populations_equilibres'
  AND NOT EXISTS (
    SELECT 1 FROM quiz_category_notions x WHERE x.categorie_slug = c.slug AND x.notion_id = n.id
  );

INSERT INTO quiz_category_notions (categorie_slug, notion_id)
SELECT c.slug, n.id
FROM quiz_categories c
INNER JOIN curriculum_notions n ON n.id = 'C4-REPRO'
WHERE c.slug = 'semis_recolte'
  AND NOT EXISTS (
    SELECT 1 FROM quiz_category_notions x WHERE x.categorie_slug = c.slug AND x.notion_id = n.id
  );

INSERT INTO quiz_category_notions (categorie_slug, notion_id)
SELECT c.slug, n.id
FROM quiz_categories c
INNER JOIN curriculum_notions n ON n.id = 'C4-TERRE'
WHERE c.slug = 'demarche_mesure'
  AND NOT EXISTS (
    SELECT 1 FROM quiz_category_notions x WHERE x.categorie_slug = c.slug AND x.notion_id = n.id
  );

INSERT INTO quiz_category_notions (categorie_slug, notion_id)
SELECT c.slug, n.id
FROM quiz_categories c
INNER JOIN curriculum_notions n ON n.id = 'C4-TERRE'
WHERE c.slug = 'milieux_terrain'
  AND NOT EXISTS (
    SELECT 1 FROM quiz_category_notions x WHERE x.categorie_slug = c.slug AND x.notion_id = n.id
  );

INSERT INTO quiz_category_notions (categorie_slug, notion_id)
SELECT c.slug, n.id
FROM quiz_categories c
INNER JOIN curriculum_notions n ON n.id = 'EST-DEMO'
WHERE c.slug = 'populations_equilibres'
  AND NOT EXISTS (
    SELECT 1 FROM quiz_category_notions x WHERE x.categorie_slug = c.slug AND x.notion_id = n.id
  );

INSERT INTO quiz_category_notions (categorie_slug, notion_id)
SELECT c.slug, n.id
FROM quiz_categories c
INNER JOIN curriculum_notions n ON n.id = 'EST-EVOL'
WHERE c.slug = 'evolution_biodiversite'
  AND NOT EXISTS (
    SELECT 1 FROM quiz_category_notions x WHERE x.categorie_slug = c.slug AND x.notion_id = n.id
  );

INSERT INTO quiz_category_notions (categorie_slug, notion_id)
SELECT c.slug, n.id
FROM quiz_categories c
INNER JOIN curriculum_notions n ON n.id = 'T-EVO'
WHERE c.slug = 'evolution_biodiversite'
  AND NOT EXISTS (
    SELECT 1 FROM quiz_category_notions x WHERE x.categorie_slug = c.slug AND x.notion_id = n.id
  );
