'use strict';

/**
 * Cohérence des cases des plateaux 1-4 (simulation du 7 novembre 2026, migration 335) :
 * - une case `behavior` avec effet de déplacement n'a pas de description interrogative
 *   (« ? », « Identifie », « Nomme », « Démêle ») — une case de déplacement ne pose pas de question ;
 * - deux cases d'un même chapitre ne partagent pas un `order_index` (le chemin du plateau
 *   serait ambigu : la case 217 doublonnait la case 35).
 * Porte sur les DONNÉES semées en production : une base neuve de CI sans plateau le dit et passe.
 */

require('../helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../database');
const { resolveMarkerEventConfig } = require('../../lib/glMarkerEventConfig');

const INTERROGATIVE_RE = /\?|\bIdentifie\b|\bNomme\b|\bDémêle\b/u;

async function loadPlateauMarkers() {
  await db.initSchema();
  return db.queryAll(
    `SELECT m.id, m.chapter_id, m.label, m.event_type, m.description, m.event_config_json,
            m.order_index, ch.plateau_number
       FROM gl_chapter_markers m INNER JOIN gl_chapters ch ON ch.id = m.chapter_id
      WHERE ch.plateau_number BETWEEN 1 AND 4 AND ch.slug NOT LIKE 'tenir-ex-%'
        AND ch.slug NOT LIKE 'ch-concu-%' AND ch.slug NOT LIKE 'fst-%' AND ch.slug NOT LIKE 'locks-ch-%'
      ORDER BY ch.plateau_number, m.order_index, m.id`,
  );
}

/** Effet de déplacement (une branche au moins avec `deltaMove ≠ 0`). */
function hasMoveEffect(marker) {
  const effects = resolveMarkerEventConfig(marker)?.effects || null;
  if (!effects) return false;
  return Object.values(effects).some((branch) => Number(branch?.deltaMove) !== 0);
}

test('aucune case de déplacement ne porte une description interrogative', async (t) => {
  const markers = await loadPlateauMarkers();
  if (!markers.length) {
    t.diagnostic('Aucun repère de plateau 1-4 en base (base neuve) : contrôle sauté');
    return;
  }
  const failures = markers
    .filter((m) => String(m.event_type) === 'behavior' && hasMoveEffect(m))
    .filter((m) => INTERROGATIVE_RE.test(String(m.description || '')))
    .map((m) => `${m.label} (#${m.id}, p${m.plateau_number}) : « ${m.description} »`);
  assert.deepEqual(failures, []);
});

test('deux cases d’un même chapitre ne partagent jamais un order_index', async (t) => {
  const markers = await loadPlateauMarkers();
  if (!markers.length) {
    t.diagnostic('Aucun repère de plateau 1-4 en base (base neuve) : contrôle sauté');
    return;
  }
  const seen = new Map();
  const duplicates = [];
  for (const m of markers) {
    const key = `${m.chapter_id}:${m.order_index}`;
    if (seen.has(key)) {
      duplicates.push(
        `p${m.plateau_number} order_index ${m.order_index} : #${seen.get(key)} et #${m.id} (${m.label})`,
      );
    } else seen.set(key, m.id);
  }
  assert.deepEqual(duplicates, []);
});
