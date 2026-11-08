'use strict';

/**
 * Plateau 4 « Eurasie continentale » : chaque case quiz à tirage porte une borne de difficulté
 * (`difficulteMin` ou `difficulteMax`), comme la grammaire du plateau le prévoit (migration
 * 316 : approfondissement = `difficulteMin 2`, base = `difficulteMax 2`). Les cases 251 et 253,
 * ajoutées sans borne, la reçoivent par la migration 339. Test de CONTENU : sur une base sans
 * ce chapitre (CI, base neuve), le contrôle le dit et passe.
 */

require('../helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../database');
const { resolveMarkerEventConfig } = require('../../lib/glMarkerEventConfig');

test('plateau 4 : aucune case quiz à tirage sans borne de difficulté', async (t) => {
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
  const sansBorne = [];
  for (const m of markers) {
    const cfg = resolveMarkerEventConfig(m);
    const question = cfg?.question;
    if (!question || question.set === 'lore' || question.mode === 'fixed') continue;
    const pool = question.pool || {};
    if (pool.difficulteMin == null && pool.difficulteMax == null) {
      sansBorne.push(`${m.label} (#${m.id}, order_index ${m.order_index})`);
    }
  }
  assert.deepEqual(sansBorne, [], 'case quiz du plateau 4 sans borne de difficulté');
});
