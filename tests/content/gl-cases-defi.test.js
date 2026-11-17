'use strict';

/**
 * Ensemble unifié (M7, migration 358) : trois cases Défi par plateau, à l'arrêt exact, aux rangs
 * 11, 20 et 29 (30 au plateau 4) ; l'ancienne case Défi de fin de plateau est redevenue une case
 * question. Rang = ordre des repères du chapitre, départ = rang 0.
 *
 * Porte sur les DONNÉES semées en production : une base neuve sans plateau le dit et passe.
 */

require('../helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../database');
const { isDefiMarker } = require('../../lib/shared/glMarkerEventConfigCore');

const RANGS_ATTENDUS = { 1: [11, 20, 29], 2: [11, 20, 29], 3: [11, 20, 29], 4: [11, 20, 30] };

test('trois cases Défi par plateau, aux rangs 11, 20 et 29 (30 au plateau 4)', async (t) => {
  await db.initSchema();
  // Chapitres de production des plateaux 1 à 4 (jamais les chapitres de fixtures).
  const chapitres = await db.queryAll(
    `SELECT id, plateau_number FROM gl_chapters
      WHERE slug IN ('tropiques-africains', 'aride-chaud', 'tempere-atlantique', 'eurasie-continentale')
      ORDER BY plateau_number`,
  );
  if (chapitres.length < 4) {
    t.diagnostic('Plateaux 1 à 4 absents (base neuve) : contrôle sauté');
    return;
  }
  for (const ch of chapitres) {
    const markers = await db.queryAll(
      'SELECT id, event_type, event_config_json FROM gl_chapter_markers WHERE chapter_id = ? ORDER BY order_index ASC, id ASC',
      [ch.id],
    );
    const rangs = markers
      .map((m, rang) => (isDefiMarker(m) ? rang : null))
      .filter((r) => r != null);
    assert.deepEqual(rangs, RANGS_ATTENDUS[ch.plateau_number], `plateau ${ch.plateau_number}`);
  }
});
