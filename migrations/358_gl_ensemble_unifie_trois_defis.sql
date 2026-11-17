-- =====================================================================
-- 358 — G&L ensemble unifié, PR 1a, étape 1.3 : trois cases Défi par plateau (M7).
--
-- Chapitres 3 à 6 = plateaux 1 à 4 ; rang = ordre des repères, départ = rang 0 (rangs relevés
-- par requête sur le corpus du 17 novembre 2026) :
-- - les cases question des rangs 11 et 29 (30 au plateau 4) deviennent des cases Défi (contenu
--   recopié de la case Défi du rang 20, qui reste) ;
-- - l'ancienne case Défi du rang 41 (plateau 1) ou 40 (plateaux 2 à 4) redevient une case
--   question du biome de la fin de plateau (contenu recopié de la case question du rang 29/30,
--   avant sa conversion ; la position et le sous-biome de la case ne bougent pas).
--
-- Chapitres des plateaux 1 à 4 désignés par leur slug de production (`tropiques-africains`,
-- `aride-chaud`, `tempere-atlantique`, `eurasie-continentale`) : une base de test, dont les
-- identifiants 3 à 6 portent des chapitres de fixtures, n'est jamais touchée.
-- Idempotente : chaque UPDATE est gardé par l'identifiant, le chapitre et l'état d'origine
-- (case Défi `tenir.defi` ou case `quiz`) ; rejouée, elle ne trouve plus rien à changer.
-- =====================================================================

-- Plateau 1 (chapitre 3) : la case Défi du rang 41 (#40) redevient une case question.
UPDATE gl_chapter_markers d
  JOIN (SELECT event_type, label, description, effet_mecanique, event_config_json, qcm_categorie_slug, qcm_question_code, display_mode, emoji, icon_url
          FROM gl_chapter_markers
         WHERE id = 31 AND chapter_id = (SELECT c.id FROM gl_chapters c WHERE c.slug = 'tropiques-africains' LIMIT 1) AND event_type = 'quiz') q
   SET d.event_type = q.event_type,
       d.label = q.label,
       d.description = q.description,
       d.effet_mecanique = q.effet_mecanique,
       d.event_config_json = q.event_config_json,
       d.qcm_categorie_slug = q.qcm_categorie_slug,
       d.qcm_question_code = q.qcm_question_code,
       d.display_mode = q.display_mode,
       d.emoji = q.emoji,
       d.icon_url = q.icon_url
 WHERE d.id = 40 AND d.chapter_id = (SELECT c.id FROM gl_chapters c WHERE c.slug = 'tropiques-africains' LIMIT 1) AND d.event_config_json LIKE '%"defi":true%';

-- Plateau 1 : les cases question des rangs 11 (#16) et 29 (#31) deviennent des cases Défi.
UPDATE gl_chapter_markers t
  JOIN (SELECT event_type, label, description, effet_mecanique, event_config_json, qcm_categorie_slug, qcm_question_code, display_mode, emoji, icon_url
          FROM gl_chapter_markers
         WHERE id = 23 AND chapter_id = (SELECT c.id FROM gl_chapters c WHERE c.slug = 'tropiques-africains' LIMIT 1) AND event_config_json LIKE '%"defi":true%') d
   SET t.event_type = d.event_type,
       t.label = d.label,
       t.description = d.description,
       t.effet_mecanique = d.effet_mecanique,
       t.event_config_json = d.event_config_json,
       t.qcm_categorie_slug = d.qcm_categorie_slug,
       t.qcm_question_code = d.qcm_question_code,
       t.display_mode = d.display_mode,
       t.emoji = d.emoji,
       t.icon_url = d.icon_url
 WHERE t.id IN (16, 31) AND t.chapter_id = (SELECT c.id FROM gl_chapters c WHERE c.slug = 'tropiques-africains' LIMIT 1) AND t.event_type = 'quiz';

-- Plateau 2 (chapitre 4) : la case Défi du rang 40 (#75) redevient une case question.
UPDATE gl_chapter_markers d
  JOIN (SELECT event_type, label, description, effet_mecanique, event_config_json, qcm_categorie_slug, qcm_question_code, display_mode, emoji, icon_url
          FROM gl_chapter_markers
         WHERE id = 66 AND chapter_id = (SELECT c.id FROM gl_chapters c WHERE c.slug = 'aride-chaud' LIMIT 1) AND event_type = 'quiz') q
   SET d.event_type = q.event_type,
       d.label = q.label,
       d.description = q.description,
       d.effet_mecanique = q.effet_mecanique,
       d.event_config_json = q.event_config_json,
       d.qcm_categorie_slug = q.qcm_categorie_slug,
       d.qcm_question_code = q.qcm_question_code,
       d.display_mode = q.display_mode,
       d.emoji = q.emoji,
       d.icon_url = q.icon_url
 WHERE d.id = 75 AND d.chapter_id = (SELECT c.id FROM gl_chapters c WHERE c.slug = 'aride-chaud' LIMIT 1) AND d.event_config_json LIKE '%"defi":true%';

-- Plateau 2 : les cases question des rangs 11 (#51) et 29 (#66) deviennent des cases Défi.
UPDATE gl_chapter_markers t
  JOIN (SELECT event_type, label, description, effet_mecanique, event_config_json, qcm_categorie_slug, qcm_question_code, display_mode, emoji, icon_url
          FROM gl_chapter_markers
         WHERE id = 58 AND chapter_id = (SELECT c.id FROM gl_chapters c WHERE c.slug = 'aride-chaud' LIMIT 1) AND event_config_json LIKE '%"defi":true%') d
   SET t.event_type = d.event_type,
       t.label = d.label,
       t.description = d.description,
       t.effet_mecanique = d.effet_mecanique,
       t.event_config_json = d.event_config_json,
       t.qcm_categorie_slug = d.qcm_categorie_slug,
       t.qcm_question_code = d.qcm_question_code,
       t.display_mode = d.display_mode,
       t.emoji = d.emoji,
       t.icon_url = d.icon_url
 WHERE t.id IN (51, 66) AND t.chapter_id = (SELECT c.id FROM gl_chapters c WHERE c.slug = 'aride-chaud' LIMIT 1) AND t.event_type = 'quiz';

-- Plateau 3 (chapitre 5) : la case Défi du rang 40 (#110) redevient une case question.
UPDATE gl_chapter_markers d
  JOIN (SELECT event_type, label, description, effet_mecanique, event_config_json, qcm_categorie_slug, qcm_question_code, display_mode, emoji, icon_url
          FROM gl_chapter_markers
         WHERE id = 101 AND chapter_id = (SELECT c.id FROM gl_chapters c WHERE c.slug = 'tempere-atlantique' LIMIT 1) AND event_type = 'quiz') q
   SET d.event_type = q.event_type,
       d.label = q.label,
       d.description = q.description,
       d.effet_mecanique = q.effet_mecanique,
       d.event_config_json = q.event_config_json,
       d.qcm_categorie_slug = q.qcm_categorie_slug,
       d.qcm_question_code = q.qcm_question_code,
       d.display_mode = q.display_mode,
       d.emoji = q.emoji,
       d.icon_url = q.icon_url
 WHERE d.id = 110 AND d.chapter_id = (SELECT c.id FROM gl_chapters c WHERE c.slug = 'tempere-atlantique' LIMIT 1) AND d.event_config_json LIKE '%"defi":true%';

-- Plateau 3 : les cases question des rangs 11 (#86) et 29 (#101) deviennent des cases Défi.
UPDATE gl_chapter_markers t
  JOIN (SELECT event_type, label, description, effet_mecanique, event_config_json, qcm_categorie_slug, qcm_question_code, display_mode, emoji, icon_url
          FROM gl_chapter_markers
         WHERE id = 93 AND chapter_id = (SELECT c.id FROM gl_chapters c WHERE c.slug = 'tempere-atlantique' LIMIT 1) AND event_config_json LIKE '%"defi":true%') d
   SET t.event_type = d.event_type,
       t.label = d.label,
       t.description = d.description,
       t.effet_mecanique = d.effet_mecanique,
       t.event_config_json = d.event_config_json,
       t.qcm_categorie_slug = d.qcm_categorie_slug,
       t.qcm_question_code = d.qcm_question_code,
       t.display_mode = d.display_mode,
       t.emoji = d.emoji,
       t.icon_url = d.icon_url
 WHERE t.id IN (86, 101) AND t.chapter_id = (SELECT c.id FROM gl_chapters c WHERE c.slug = 'tempere-atlantique' LIMIT 1) AND t.event_type = 'quiz';

-- Plateau 4 (chapitre 6) : la case Défi du rang 40 (#232) redevient une case question.
UPDATE gl_chapter_markers d
  JOIN (SELECT event_type, label, description, effet_mecanique, event_config_json, qcm_categorie_slug, qcm_question_code, display_mode, emoji, icon_url
          FROM gl_chapter_markers
         WHERE id = 225 AND chapter_id = (SELECT c.id FROM gl_chapters c WHERE c.slug = 'eurasie-continentale' LIMIT 1) AND event_type = 'quiz') q
   SET d.event_type = q.event_type,
       d.label = q.label,
       d.description = q.description,
       d.effet_mecanique = q.effet_mecanique,
       d.event_config_json = q.event_config_json,
       d.qcm_categorie_slug = q.qcm_categorie_slug,
       d.qcm_question_code = q.qcm_question_code,
       d.display_mode = q.display_mode,
       d.emoji = q.emoji,
       d.icon_url = q.icon_url
 WHERE d.id = 232 AND d.chapter_id = (SELECT c.id FROM gl_chapters c WHERE c.slug = 'eurasie-continentale' LIMIT 1) AND d.event_config_json LIKE '%"defi":true%';

-- Plateau 4 : les cases question des rangs 11 (#121) et 30 (#225) deviennent des cases Défi.
UPDATE gl_chapter_markers t
  JOIN (SELECT event_type, label, description, effet_mecanique, event_config_json, qcm_categorie_slug, qcm_question_code, display_mode, emoji, icon_url
          FROM gl_chapter_markers
         WHERE id = 128 AND chapter_id = (SELECT c.id FROM gl_chapters c WHERE c.slug = 'eurasie-continentale' LIMIT 1) AND event_config_json LIKE '%"defi":true%') d
   SET t.event_type = d.event_type,
       t.label = d.label,
       t.description = d.description,
       t.effet_mecanique = d.effet_mecanique,
       t.event_config_json = d.event_config_json,
       t.qcm_categorie_slug = d.qcm_categorie_slug,
       t.qcm_question_code = d.qcm_question_code,
       t.display_mode = d.display_mode,
       t.emoji = d.emoji,
       t.icon_url = d.icon_url
 WHERE t.id IN (121, 225) AND t.chapter_id = (SELECT c.id FROM gl_chapters c WHERE c.slug = 'eurasie-continentale' LIMIT 1) AND t.event_type = 'quiz';
