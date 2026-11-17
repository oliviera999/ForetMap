-- =====================================================================
-- 357 — G&L ensemble unifié, PR 1a, étape 1.2 : cases Souffle et cases positives (M3).
--
-- - `gl_teams` : état « un seul dé au prochain tour » (`un_de_prochain_tour`, tour de pose
--   `un_de_round`, tour où le seul dé a été joué `un_de_joue_round` — une Relance relance ce dé) ;
-- - les 13 cases Souffle des plateaux 1 à 4 (`data/gl/tenir/ensemble-unifie/cases-souffle.json`)
--   reçoivent titre, description et un effet unique, le même pour les deux peuples : au tour
--   suivant, l'équipe ne lance qu'un dé (deltaMove 0, deltaPv 0, deltaGems 0, passTurn false,
--   unDeAuProchainTour true) ; `eventMeta.tonalite` reste `souffle` ;
-- - cases Trame : la seule case qui donne une gemme — la branche gnome promettait « +1 cœur »,
--   elle dit et donne « +1 gemme » ;
-- - `gameplay.tenir_cases_positives` : l'option `ressource_peuple` est retirée → `neutre`.
--
-- Chapitres des plateaux 1 à 4 désignés par leur slug de production (`tropiques-africains`,
-- `aride-chaud`, `tempere-atlantique`, `eurasie-continentale`) : une base de test, dont les
-- identifiants 3 à 6 portent des chapitres de fixtures, n'est jamais touchée.
-- Idempotente : ADD COLUMN IF NOT EXISTS ; UPDATE gardés par l'identifiant, le chapitre et la
-- tonalité de la case (chapitres 3 à 6 = plateaux 1 à 4) ; JSON_MERGE_PATCH rejouable.
-- =====================================================================

ALTER TABLE gl_teams
  ADD COLUMN IF NOT EXISTS un_de_prochain_tour TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS un_de_round INT NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS un_de_joue_round INT NULL DEFAULT NULL;

-- Plateau 1, rang 5 : « Chaleur sans soleil »
UPDATE gl_chapter_markers
   SET label = 'Chaleur sans soleil',
       description = 'Une chaleur moite monte du sol alors que le ciel est couvert. Les feuilles pendent, on marche moins vite.',
       event_config_json = JSON_MERGE_PATCH(event_config_json, '{"effects": {"gnome": {"label": "L''air lourd ralentit la caravane → au prochain tour, un seul dé.", "deltaPv": 0, "deltaGems": 0, "deltaMove": 0, "passTurn": false, "unDeAuProchainTour": true}, "unicorn": {"label": "L''air lourd ralentit la caravane → au prochain tour, un seul dé.", "deltaPv": 0, "deltaGems": 0, "deltaMove": 0, "passTurn": false, "unDeAuProchainTour": true}}}')
 WHERE id = 11 AND chapter_id = (SELECT c.id FROM gl_chapters c WHERE c.slug = 'tropiques-africains' LIMIT 1)
   AND JSON_UNQUOTE(JSON_EXTRACT(event_config_json, '$.eventMeta.tonalite')) = 'souffle';

-- Plateau 1, rang 25 : « Le point d'eau tari »
UPDATE gl_chapter_markers
   SET label = 'Le point d''eau tari',
       description = 'La mare a séché bien avant la saison sèche. Les traces des animaux s''arrêtent au bord de la boue craquelée.',
       event_config_json = JSON_MERGE_PATCH(event_config_json, '{"effects": {"gnome": {"label": "Il faut chercher l''eau plus loin → au prochain tour, un seul dé.", "deltaPv": 0, "deltaGems": 0, "deltaMove": 0, "passTurn": false, "unDeAuProchainTour": true}, "unicorn": {"label": "Il faut chercher l''eau plus loin → au prochain tour, un seul dé.", "deltaPv": 0, "deltaGems": 0, "deltaMove": 0, "passTurn": false, "unDeAuProchainTour": true}}}')
 WHERE id = 28 AND chapter_id = (SELECT c.id FROM gl_chapters c WHERE c.slug = 'tropiques-africains' LIMIT 1)
   AND JSON_UNQUOTE(JSON_EXTRACT(event_config_json, '$.eventMeta.tonalite')) = 'souffle';

-- Plateau 1, rang 37 : « L'air qui tremble »
UPDATE gl_chapter_markers
   SET label = 'L''air qui tremble',
       description = 'Pas un nuage : l''air tremble au-dessus de l''herbe sèche. Même les gnous cherchent l''ombre.',
       event_config_json = JSON_MERGE_PATCH(event_config_json, '{"effects": {"gnome": {"label": "Halte à l''ombre → au prochain tour, un seul dé.", "deltaPv": 0, "deltaGems": 0, "deltaMove": 0, "passTurn": false, "unDeAuProchainTour": true}, "unicorn": {"label": "Halte à l''ombre → au prochain tour, un seul dé.", "deltaPv": 0, "deltaGems": 0, "deltaMove": 0, "passTurn": false, "unDeAuProchainTour": true}}}')
 WHERE id = 187 AND chapter_id = (SELECT c.id FROM gl_chapters c WHERE c.slug = 'tropiques-africains' LIMIT 1)
   AND JSON_UNQUOTE(JSON_EXTRACT(event_config_json, '$.eventMeta.tonalite')) = 'souffle';

-- Plateau 2, rang 5 : « Le terne s'étend »
UPDATE gl_chapter_markers
   SET label = 'Le terne s''étend',
       description = 'L''or du sable et le vert de l''oasis se délavent. Toutes les dunes se ressemblent.',
       event_config_json = JSON_MERGE_PATCH(event_config_json, '{"effects": {"gnome": {"label": "Sans repères, on tourne en rond → au prochain tour, un seul dé.", "deltaPv": 0, "deltaGems": 0, "deltaMove": 0, "passTurn": false, "unDeAuProchainTour": true}, "unicorn": {"label": "Sans repères, on tourne en rond → au prochain tour, un seul dé.", "deltaPv": 0, "deltaGems": 0, "deltaMove": 0, "passTurn": false, "unDeAuProchainTour": true}}}')
 WHERE id = 46 AND chapter_id = (SELECT c.id FROM gl_chapters c WHERE c.slug = 'aride-chaud' LIMIT 1)
   AND JSON_UNQUOTE(JSON_EXTRACT(event_config_json, '$.eventMeta.tonalite')) = 'souffle';

-- Plateau 2, rang 16 : « Piste ensablée »
UPDATE gl_chapter_markers
   SET label = 'Piste ensablée',
       description = 'Un vent de sable recouvre les traces de la caravane. Le chemin disparaît sous les dunes.',
       event_config_json = JSON_MERGE_PATCH(event_config_json, '{"effects": {"gnome": {"label": "On cherche la piste → au prochain tour, un seul dé.", "deltaPv": 0, "deltaGems": 0, "deltaMove": 0, "passTurn": false, "unDeAuProchainTour": true}, "unicorn": {"label": "On cherche la piste → au prochain tour, un seul dé.", "deltaPv": 0, "deltaGems": 0, "deltaMove": 0, "passTurn": false, "unDeAuProchainTour": true}}}')
 WHERE id = 194 AND chapter_id = (SELECT c.id FROM gl_chapters c WHERE c.slug = 'aride-chaud' LIMIT 1)
   AND JSON_UNQUOTE(JSON_EXTRACT(event_config_json, '$.eventMeta.tonalite')) = 'souffle';

-- Plateau 2, rang 25 : « Le terne gagne »
UPDATE gl_chapter_markers
   SET label = 'Le terne gagne',
       description = 'Une poussière terne couvre tout, même les fleurs du maquis. Les couleurs attendent qu''on les retrouve.',
       event_config_json = JSON_MERGE_PATCH(event_config_json, '{"effects": {"gnome": {"label": "Les pas s''alourdissent → au prochain tour, un seul dé.", "deltaPv": 0, "deltaGems": 0, "deltaMove": 0, "passTurn": false, "unDeAuProchainTour": true}, "unicorn": {"label": "Les pas s''alourdissent → au prochain tour, un seul dé.", "deltaPv": 0, "deltaGems": 0, "deltaMove": 0, "passTurn": false, "unDeAuProchainTour": true}}}')
 WHERE id = 63 AND chapter_id = (SELECT c.id FROM gl_chapters c WHERE c.slug = 'aride-chaud' LIMIT 1)
   AND JSON_UNQUOTE(JSON_EXTRACT(event_config_json, '$.eventMeta.tonalite')) = 'souffle';

-- Plateau 3, rang 5 : « Plus un chant »
UPDATE gl_chapter_markers
   SET label = 'Plus un chant',
       description = 'Un matin, la forêt s''est tue : plus un oiseau, plus un insecte. On s''arrête pour écouter.',
       event_config_json = JSON_MERGE_PATCH(event_config_json, '{"effects": {"gnome": {"label": "On tend l''oreille → au prochain tour, un seul dé.", "deltaPv": 0, "deltaGems": 0, "deltaMove": 0, "passTurn": false, "unDeAuProchainTour": true}, "unicorn": {"label": "On tend l''oreille → au prochain tour, un seul dé.", "deltaPv": 0, "deltaGems": 0, "deltaMove": 0, "passTurn": false, "unDeAuProchainTour": true}}}')
 WHERE id = 81 AND chapter_id = (SELECT c.id FROM gl_chapters c WHERE c.slug = 'tempere-atlantique' LIMIT 1)
   AND JSON_UNQUOTE(JSON_EXTRACT(event_config_json, '$.eventMeta.tonalite')) = 'souffle';

-- Plateau 3, rang 25 : « Le bruit qui remplace »
UPDATE gl_chapter_markers
   SET label = 'Le bruit qui remplace',
       description = 'À la place des chants, un bruit sourd et continu couvre tout. On ne s''entend plus parler.',
       event_config_json = JSON_MERGE_PATCH(event_config_json, '{"effects": {"gnome": {"label": "Impossible de se parler → au prochain tour, un seul dé.", "deltaPv": 0, "deltaGems": 0, "deltaMove": 0, "passTurn": false, "unDeAuProchainTour": true}, "unicorn": {"label": "Impossible de se parler → au prochain tour, un seul dé.", "deltaPv": 0, "deltaGems": 0, "deltaMove": 0, "passTurn": false, "unDeAuProchainTour": true}}}')
 WHERE id = 98 AND chapter_id = (SELECT c.id FROM gl_chapters c WHERE c.slug = 'tempere-atlantique' LIMIT 1)
   AND JSON_UNQUOTE(JSON_EXTRACT(event_config_json, '$.eventMeta.tonalite')) = 'souffle';

-- Plateau 3, rang 36 : « Silence soudain »
UPDATE gl_chapter_markers
   SET label = 'Silence soudain',
       description = 'Le merle s''arrête au milieu de sa chanson. Tout le sous-bois se tait d''un coup.',
       event_config_json = JSON_MERGE_PATCH(event_config_json, '{"effects": {"gnome": {"label": "On attend que le chant revienne → au prochain tour, un seul dé.", "deltaPv": 0, "deltaGems": 0, "deltaMove": 0, "passTurn": false, "unDeAuProchainTour": true}, "unicorn": {"label": "On attend que le chant revienne → au prochain tour, un seul dé.", "deltaPv": 0, "deltaGems": 0, "deltaMove": 0, "passTurn": false, "unDeAuProchainTour": true}}}')
 WHERE id = 201 AND chapter_id = (SELECT c.id FROM gl_chapters c WHERE c.slug = 'tempere-atlantique' LIMIT 1)
   AND JSON_UNQUOTE(JSON_EXTRACT(event_config_json, '$.eventMeta.tonalite')) = 'souffle';

-- Plateau 4, rang 5 : « Un fil lâche »
UPDATE gl_chapter_markers
   SET label = 'Un fil lâche',
       description = 'Le lac gèle trop tôt : les oiseaux pêcheurs ne trouvent plus de poissons et partent, les renards maigrissent. Ce fil-là, les Gnomes savent le renouer.',
       event_config_json = JSON_MERGE_PATCH(event_config_json, '{"effects": {"gnome": {"label": "On remonte le fil → au prochain tour, un seul dé.", "deltaPv": 0, "deltaGems": 0, "deltaMove": 0, "passTurn": false, "unDeAuProchainTour": true}, "unicorn": {"label": "On remonte le fil → au prochain tour, un seul dé.", "deltaPv": 0, "deltaGems": 0, "deltaMove": 0, "passTurn": false, "unDeAuProchainTour": true}}}')
 WHERE id = 116 AND chapter_id = (SELECT c.id FROM gl_chapters c WHERE c.slug = 'eurasie-continentale' LIMIT 1)
   AND JSON_UNQUOTE(JSON_EXTRACT(event_config_json, '$.eventMeta.tonalite')) = 'souffle';

-- Plateau 4, rang 16 : « Moins de lièvres »
UPDATE gl_chapter_markers
   SET label = 'Moins de lièvres',
       description = 'Cet hiver, les lièvres variables se font rares : le lynx boréal doit chasser beaucoup plus loin.',
       event_config_json = JSON_MERGE_PATCH(event_config_json, '{"effects": {"gnome": {"label": "On fait un détour par la forêt → au prochain tour, un seul dé.", "deltaPv": 0, "deltaGems": 0, "deltaMove": 0, "passTurn": false, "unDeAuProchainTour": true}, "unicorn": {"label": "On fait un détour par la forêt → au prochain tour, un seul dé.", "deltaPv": 0, "deltaGems": 0, "deltaMove": 0, "passTurn": false, "unDeAuProchainTour": true}}}')
 WHERE id = 208 AND chapter_id = (SELECT c.id FROM gl_chapters c WHERE c.slug = 'eurasie-continentale' LIMIT 1)
   AND JSON_UNQUOTE(JSON_EXTRACT(event_config_json, '$.eventMeta.tonalite')) = 'souffle';

-- Plateau 4, rang 25 : « Le mot oublié »
UPDATE gl_chapter_markers
   SET label = 'Le mot oublié',
       description = 'Au bivouac, plus personne ne se souvient du nom de cette petite fleur. On le cherchera ensemble demain.',
       event_config_json = JSON_MERGE_PATCH(event_config_json, '{"effects": {"gnome": {"label": "On s''arrête pour retrouver le mot → au prochain tour, un seul dé.", "deltaPv": 0, "deltaGems": 0, "deltaMove": 0, "passTurn": false, "unDeAuProchainTour": true}, "unicorn": {"label": "On s''arrête pour retrouver le mot → au prochain tour, un seul dé.", "deltaPv": 0, "deltaGems": 0, "deltaMove": 0, "passTurn": false, "unDeAuProchainTour": true}}}')
 WHERE id = 221 AND chapter_id = (SELECT c.id FROM gl_chapters c WHERE c.slug = 'eurasie-continentale' LIMIT 1)
   AND JSON_UNQUOTE(JSON_EXTRACT(event_config_json, '$.eventMeta.tonalite')) = 'souffle';

-- Plateau 4, rang 32 : « La nuit qui tombe »
UPDATE gl_chapter_markers
   SET label = 'La nuit qui tombe',
       description = 'Le soleil se couche et ne se lèvera plus avant des semaines : c''est la nuit polaire. On avance à la lueur des étoiles.',
       event_config_json = JSON_MERGE_PATCH(event_config_json, '{"effects": {"gnome": {"label": "Dans le noir, on avance pas à pas → au prochain tour, un seul dé.", "deltaPv": 0, "deltaGems": 0, "deltaMove": 0, "passTurn": false, "unDeAuProchainTour": true}, "unicorn": {"label": "Dans le noir, on avance pas à pas → au prochain tour, un seul dé.", "deltaPv": 0, "deltaGems": 0, "deltaMove": 0, "passTurn": false, "unDeAuProchainTour": true}}}')
 WHERE id = 227 AND chapter_id = (SELECT c.id FROM gl_chapters c WHERE c.slug = 'eurasie-continentale' LIMIT 1)
   AND JSON_UNQUOTE(JSON_EXTRACT(event_config_json, '$.eventMeta.tonalite')) = 'souffle';

-- Cases Trame : la branche gnome dit et donne « +1 gemme » (la Trame est la seule case qui donne
-- une gemme, aux deux peuples).
UPDATE gl_chapter_markers
   SET event_config_json = JSON_SET(
         event_config_json,
         '$.effects.gnome.label',
         REPLACE(JSON_UNQUOTE(JSON_EXTRACT(event_config_json, '$.effects.gnome.label')), '+1 cœur', '+1 gemme'),
         '$.effects.gnome.deltaPv', 0,
         '$.effects.gnome.deltaGems', 1)
 WHERE chapter_id IN (SELECT id FROM gl_chapters WHERE slug IN ('tropiques-africains', 'aride-chaud', 'tempere-atlantique', 'eurasie-continentale'))
   AND JSON_UNQUOTE(JSON_EXTRACT(event_config_json, '$.eventMeta.tonalite')) = 'trame'
   AND JSON_UNQUOTE(JSON_EXTRACT(event_config_json, '$.effects.gnome.label')) LIKE '%+1 cœur%';

UPDATE gl_settings SET value_json = '"neutre"', updated_at = NOW()
 WHERE `key` = 'gameplay.tenir_cases_positives' AND value_json = '"ressource_peuple"';

-- … et la branche licorne de deux cases Trame (« +1 gemme » affiché, 2 en données) s'aligne.
UPDATE gl_chapter_markers
   SET event_config_json = JSON_SET(event_config_json, '$.effects.unicorn.deltaGems', 1)
 WHERE chapter_id IN (SELECT id FROM gl_chapters WHERE slug IN ('tropiques-africains', 'aride-chaud', 'tempere-atlantique', 'eurasie-continentale'))
   AND JSON_UNQUOTE(JSON_EXTRACT(event_config_json, '$.eventMeta.tonalite')) = 'trame'
   AND JSON_EXTRACT(event_config_json, '$.effects.unicorn.deltaGems') > 1
   AND JSON_UNQUOTE(JSON_EXTRACT(event_config_json, '$.effects.unicorn.label')) LIKE '%+1 gemme%';
