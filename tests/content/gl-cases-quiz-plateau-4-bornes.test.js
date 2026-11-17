'use strict';

/**
 * Plateau 4 « Eurasie continentale » : difficulté des cases quiz à tirage.
 *
 * Ensemble unifié (M9, PR 1a) : en mode « Tenir », la borne de difficulté n'est plus portée par
 * chaque case — c'est le **plafond du plateau** (`tenir_questions_difficulte_max_par_plateau`)
 * qui borne le tirage. Les `difficulteMax` des cases question ont été retirés par la migration
 * 359 ; ce test, qui exigeait une borne par case (migrations 316 et 340), vérifie désormais les
 * deux moitiés de la règle : plus aucun `difficulteMax` résiduel sur une case à tirage, et un
 * plafond réglé pour le plateau 4.
 *
 * Test de CONTENU : sur une base sans ce chapitre (CI, base neuve), le contrôle le dit et passe.
 */

require('../helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../database');
const { resolveMarkerEventConfig } = require('../../lib/glMarkerEventConfig');
const { getGameplaySettings } = require('../../lib/glSettings');

test('plateau 4 : la difficulté des cases quiz à tirage vient du plafond du plateau', async (t) => {
  await db.initSchema();
  const chapter = await db.queryOne(
    "SELECT id FROM gl_chapters WHERE slug = 'eurasie-continentale' AND plateau_number = 4 LIMIT 1",
  );
  if (!chapter) {
    t.diagnostic('Chapitre « eurasie-continentale » absent (base neuve) : contrôle sauté');
    return;
  }
  const markers = await db.queryAll(
    `SELECT id, label, order_index, event_type, event_config_json, qcm_question_code, qcm_categorie_slug
       FROM gl_chapter_markers
      WHERE chapter_id = ? AND event_type IN ('quiz', 'question')
      ORDER BY order_index`,
    [chapter.id],
  );
  const avecPlafondDeCase = [];
  let tirages = 0;
  for (const m of markers) {
    const cfg = resolveMarkerEventConfig(m);
    const question = cfg?.question;
    if (!question || question.set === 'lore' || question.mode === 'fixed') continue;
    tirages += 1;
    if (question.pool?.difficulteMax != null) {
      avecPlafondDeCase.push(`${m.label} (#${m.id}, order_index ${m.order_index})`);
    }
  }
  assert.ok(tirages > 0, 'le plateau 4 a des cases quiz à tirage');
  assert.deepEqual(avecPlafondDeCase, [], 'difficulteMax résiduel sur une case (migration 359)');
  const plafonds = (await getGameplaySettings()).tenirQuestionsDifficulteMaxParPlateau || {};
  const plafond = Number(plafonds[4] ?? plafonds['4']);
  assert.ok(
    Number.isInteger(plafond) && plafond >= 1 && plafond <= 5,
    `plafond de difficulté du plateau 4 réglé (reçu : ${plafond})`,
  );
});
