'use strict';

/**
 * Fiche espèce de la Visite, version visiteur (audit UI/UX du 19/11/2026, U6 point 2) : les
 * vignettes d'espèces d'une fiche de lieu ouvrent la fiche du catalogue, lue par la route
 * publique `GET /api/plants` (sans compte). Contrat : rien de réservé n'en sort — aucune
 * `restricted_note`, aucun complément réservé (`notes`), aucune clé « réservée ».
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { initSchema, initDatabase } = require('../database');
const { app } = require('../server');

/** Clés interdites dans une réponse publique destinée au visiteur. */
const FORBIDDEN_KEY = /restricted|^notes$|private|internal/i;

function findForbiddenKeys(value, trail = '$', out = []) {
  if (Array.isArray(value)) {
    value.forEach((item, i) => findForbiddenKeys(item, `${trail}[${i}]`, out));
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEY.test(key)) out.push(`${trail}.${key}`);
      findForbiddenKeys(child, `${trail}.${key}`, out);
    }
  }
  return out;
}

test.before(async () => {
  await initSchema();
  await initDatabase();
});

test('GET /api/plants sans compte : fiche lisible, aucune donnée réservée', async () => {
  const res = await request(app).get('/api/plants').expect(200);
  assert.ok(Array.isArray(res.body));
  assert.ok(res.body.length > 0, 'catalogue semé attendu en base de test');
  assert.deepEqual(findForbiddenKeys(res.body), []);
  const first = res.body[0];
  assert.ok(first.id && first.name, 'une fiche espèce porte au moins id et nom');
});

test('contenu de la Visite sans compte : lieux sans complément réservé', async () => {
  const res = await request(app).get('/api/visit/content?map_id=foret').expect(200);
  const places = [...(res.body.zones || []), ...(res.body.markers || [])];
  for (const place of places) {
    assert.ok(!('restricted_note' in place), `${place.id} : restricted_note exposée`);
    assert.deepEqual(place.notes || [], [], `${place.id} : complément réservé servi à l’anonyme`);
  }
});
