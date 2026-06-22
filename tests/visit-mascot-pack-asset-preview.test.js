'use strict';

const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');
const {
  signVisitMascotPackAssetPreview,
  verifyVisitMascotPackAssetPreview,
  appendPreviewTokenToAssetUrl,
} = require('../lib/visitMascotPackAssetPreview.js');

const PACK_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const FILENAME = 'cell-r0-c1.png';

describe('visitMascotPackAssetPreview', () => {
  it('signe et vérifie un jeton valide', () => {
    const token = signVisitMascotPackAssetPreview(PACK_ID, FILENAME, { ttlSec: 120 });
    assert.ok(token);
    assert.equal(verifyVisitMascotPackAssetPreview(token, PACK_ID, FILENAME), true);
  });

  it('rejette un jeton pour un autre fichier', () => {
    const token = signVisitMascotPackAssetPreview(PACK_ID, FILENAME);
    assert.equal(verifyVisitMascotPackAssetPreview(token, PACK_ID, 'other.png'), false);
  });

  it('rejette un jeton expiré', () => {
    mock.timers.enable({ apis: ['Date'] });
    try {
      mock.timers.setTime(new Date('2026-01-01T12:00:00Z').getTime());
      const token = signVisitMascotPackAssetPreview(PACK_ID, FILENAME, { ttlSec: 120 });
      mock.timers.setTime(new Date('2026-01-01T14:00:00Z').getTime());
      assert.equal(verifyVisitMascotPackAssetPreview(token, PACK_ID, FILENAME), false);
    } finally {
      mock.timers.reset();
    }
  });

  it('appendPreviewTokenToAssetUrl ajoute preview_token', () => {
    const url = appendPreviewTokenToAssetUrl(
      `/api/visit/mascot-packs/${PACK_ID}/assets/${FILENAME}`,
      PACK_ID,
      FILENAME,
    );
    assert.match(url, /preview_token=/);
    const token = decodeURIComponent(url.split('preview_token=')[1]);
    assert.equal(verifyVisitMascotPackAssetPreview(token, PACK_ID, FILENAME), true);
  });
});
