-- =====================================================================
-- 361 — G&L : relecture scientifique de deux cases Souffle (suite de la PR 1a, migration 357).
--
-- - Plateau 3, rang 36 « Silence soudain » (landes) : une lande n'a pas de sous-bois et le merle
--   n'est pas au catalogue des landes → la fauvette pitchou (SP0233, landes) ;
-- - Plateau 4, rang 5 « Un fil lâche » (taïga) : ni renard ni oiseau pêcheur au catalogue de la
--   taïga → l'ours brun (SP0138) et le saumon atlantique (SP0150), tous deux de la taïga.
--
-- Source : `data/gl/tenir/ensemble-unifie/cases-souffle.json`. Seule la description change ;
-- titre et effet (un seul dé au prochain tour) restent ceux de la migration 357.
-- Chapitres désignés par leur slug de production (cf. 357) : une base de test n'est pas touchée.
-- Idempotente : UPDATE gardés par l'identifiant, le chapitre et la tonalité `souffle`.
-- =====================================================================

-- Plateau 3, rang 36 : « Silence soudain »
UPDATE gl_chapter_markers
   SET description = 'La fauvette pitchou s''arrête au milieu de sa chanson. Toute la lande se tait d''un coup.'
 WHERE id = 201 AND chapter_id = (SELECT c.id FROM gl_chapters c WHERE c.slug = 'tempere-atlantique' LIMIT 1)
   AND JSON_UNQUOTE(JSON_EXTRACT(event_config_json, '$.eventMeta.tonalite')) = 'souffle';

-- Plateau 4, rang 5 : « Un fil lâche »
UPDATE gl_chapter_markers
   SET description = 'La rivière gèle trop tôt : l''ours brun ne peut plus pêcher les saumons et maigrit. Ce fil-là, les Gnomes savent le renouer.'
 WHERE id = 116 AND chapter_id = (SELECT c.id FROM gl_chapters c WHERE c.slug = 'eurasie-continentale' LIMIT 1)
   AND JSON_UNQUOTE(JSON_EXTRACT(event_config_json, '$.eventMeta.tonalite')) = 'souffle';
