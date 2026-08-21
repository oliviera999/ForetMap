// Narrateur OLU côté GL : le réglage est **partagé** avec ForetMap
// (`content.help.narrator`), lu par une route GL en lecture seule.
// Voir docs/MASCOT_NARRATEUR_OLU.md §8.2 (arbitrage révisé au lot 6).
'use strict';

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute } = require('../database');
const { HELP_NARRATOR_KEY, saveHelpNarratorToDb } = require('../lib/helpNarrator');

const ENDPOINT = '/api/gl/content/narrator';

test.before(async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await initSchema();
      break;
    } catch (err) {
      if (err?.code !== 'ER_LOCK_DEADLOCK' || attempt === 4) throw err;
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
});

test.after(async () => {
  await execute('DELETE FROM app_settings WHERE `key` = ?', [HELP_NARRATOR_KEY]).catch(() => {});
});

test('GET /api/gl/content/narrator est public et renvoie les défauts avant toute écriture', async () => {
  await execute('DELETE FROM app_settings WHERE `key` = ?', [HELP_NARRATOR_KEY]);
  const res = await request(app).get(ENDPOINT).expect(200);
  assert.deepStrictEqual(res.body, {
    enabled: true,
    speakerName: 'OLU',
    fallbackSilhouette: 'olu',
    portraits: {},
  });
});

test('GL sert le même OLU que ForetMap — portraits compris', async () => {
  await saveHelpNarratorToDb({
    enabled: true,
    speakerName: 'OLU',
    fallbackSilhouette: 'olu',
    portraits: {
      neutre: { bust: '/uploads/media-library/image/olu-neutre.webp' },
      parle: { bust: '/uploads/media-library/image/olu-parle.webp' },
    },
  });

  const gl = await request(app).get(ENDPOINT).expect(200);
  const fm = await request(app).get('/api/settings/public').expect(200);

  assert.deepStrictEqual(gl.body, fm.body?.settings?.content?.help?.narrator);
  assert.strictEqual(gl.body.portraits.parle.bust, '/uploads/media-library/image/olu-parle.webp');
});

test('la charge utile GL se limite au narrateur : aucun autre réglage ne fuit', async () => {
  await saveHelpNarratorToDb({ speakerName: 'OLU', portraits: {} });
  const res = await request(app).get(ENDPOINT).expect(200);
  assert.deepStrictEqual(Object.keys(res.body).sort(), [
    'enabled',
    'fallbackSilhouette',
    'portraits',
    'speakerName',
  ]);
});

// L'édition d'OLU reste au studio ForetMap : côté GL, `PUT /content/:slug` ne vise que les
// pages `gl_content_pages` et exige `gl.content.manage` — il n'atteint jamais le réglage.
test('la route est en lecture seule : aucune écriture du narrateur depuis GL', async () => {
  await request(app).put(ENDPOINT).send({ speakerName: 'PIRATE' }).expect(401);
  const res = await request(app).get(ENDPOINT).expect(200);
  assert.strictEqual(res.body.speakerName, 'OLU');
});

test('réglage illisible en base : repli sur les défauts, jamais d’erreur', async () => {
  await execute(
    "INSERT INTO app_settings (`key`, scope, value_json, updated_at) VALUES (?, 'public', ?, NOW())" +
      ' ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()',
    [HELP_NARRATOR_KEY, JSON.stringify({ speakerName: 42, fallbackSilhouette: 'dragon' })],
  );
  const res = await request(app).get(ENDPOINT).expect(200);
  assert.strictEqual(res.body.fallbackSilhouette, 'olu');
  assert.strictEqual(typeof res.body.speakerName, 'string');
});

test('un narrateur éteint reste servi tel quel — le front décide de l’affichage', async () => {
  await saveHelpNarratorToDb({ enabled: false, speakerName: 'OLU', portraits: {} });
  const res = await request(app).get(ENDPOINT).expect(200);
  assert.strictEqual(res.body.enabled, false);
});
