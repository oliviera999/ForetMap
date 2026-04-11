'use strict';

require('./helpers/setup');
const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const { join } = require('path');

let safeVisitProgressPayload;

before(async () => {
  const mod = await import(pathToFileURL(join(__dirname, '../src/utils/visitProgressClient.js')).href);
  safeVisitProgressPayload = mod.safeVisitProgressPayload;
});

describe('visitProgressClient', () => {
  it('extrait seen valides depuis une réponse API typique', () => {
    const { seen } = safeVisitProgressPayload({
      mode: 'anonymous',
      seen: [
        { target_type: 'zone', target_id: 'z1' },
        { target_type: 'marker', target_id: 'm2' },
      ],
    });
    assert.deepEqual(seen, [
      { target_type: 'zone', target_id: 'z1' },
      { target_type: 'marker', target_id: 'm2' },
    ]);
  });

  it('renvoie seen vide si corps null ou non-objet', () => {
    assert.deepEqual(safeVisitProgressPayload(null).seen, []);
    assert.deepEqual(safeVisitProgressPayload(undefined).seen, []);
    assert.deepEqual(safeVisitProgressPayload([]).seen, []);
    assert.deepEqual(safeVisitProgressPayload('x').seen, []);
  });

  it('renvoie seen vide si seen absent ou non-tableau', () => {
    assert.deepEqual(safeVisitProgressPayload({ mode: 'student' }).seen, []);
    assert.deepEqual(safeVisitProgressPayload({ seen: null }).seen, []);
    assert.deepEqual(safeVisitProgressPayload({ seen: {} }).seen, []);
  });

  it('filtre les entrées invalides sans rejeter le lot', () => {
    const { seen } = safeVisitProgressPayload({
      seen: [
        { target_type: 'zone', target_id: 'ok' },
        null,
        { target_type: '', target_id: 'x' },
        { target_type: 'marker', target_id: '' },
        { target_type: 'marker', target_id: '  good  ' },
      ],
    });
    assert.deepEqual(seen, [
      { target_type: 'zone', target_id: 'ok' },
      { target_type: 'marker', target_id: 'good' },
    ]);
  });
});
