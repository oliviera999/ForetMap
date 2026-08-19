'use strict';

// Normalisation des horodatages hérités (audit docs/AUDIT_BDD_2026-08.md §3.2).
//
// Ce test est le seul endroit où l'expression SQL de conversion est réellement exercée :
// en production elle ne rencontre les valeurs héritées qu'une fois. On lui présente donc
// des lignes fabriquées, en heure d'hiver ET en heure d'été, et on vérifie l'offset
// Europe/Paris, l'idempotence, et le fait que les valeurs déjà ISO ne bougent pas.
// Tests BDD partagée = exécution séquentielle.

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { initSchema, queryOne, execute } = require('../database');
const { normalizeLegacyTimestamps } = require('../lib/legacyTimestampNormalization');

const SUFFIX = crypto.randomBytes(4).toString('hex');
const IDS = {
  winter: `ts-hiver-${SUFFIX}`,
  summer: `ts-ete-${SUFFIX}`,
  already: `ts-iso-${SUFFIX}`,
};
const ISO_ALREADY = '2026-04-05T08:01:46.123Z';

async function createdAt(id) {
  const row = await queryOne('SELECT created_at FROM map_markers WHERE id = ?', [id]);
  return row?.created_at ?? null;
}

before(async () => {
  await initSchema();
  await execute("INSERT IGNORE INTO maps (id, label, sort_order) VALUES ('foret', 'Forêt', 1)");
  for (const [key, id] of Object.entries(IDS)) {
    const value = {
      // 2026-03-15 : heure d'hiver (UTC+1), le changement a lieu le 29 mars.
      winter: '2026-03-15 18:34:36',
      // 2026-04-05 : heure d'été (UTC+2).
      summer: '2026-04-05 18:04:00',
      already: ISO_ALREADY,
    }[key];
    await execute(
      `INSERT INTO map_markers (id, map_id, x_pct, y_pct, label, plant_name, note, emoji, created_at)
       VALUES (?, 'foret', 10, 10, ?, '', '', '', ?)`,
      [id, `Repère ${key} ${SUFFIX}`, value],
    );
  }
});

after(async () => {
  await execute('DELETE FROM map_markers WHERE id IN (?, ?, ?)', [
    IDS.winter,
    IDS.summer,
    IDS.already,
  ]);
});

test("l'offset Europe/Paris est retiré selon la saison de la ligne", async () => {
  const report = await normalizeLegacyTimestamps({ execute });
  assert.ok(
    Number(report.converted['map_markers.created_at'] || 0) >= 2,
    'les deux lignes héritées doivent être converties',
  );

  // Heure d'hiver : UTC+1 → 18:34:36 local = 17:34:36 UTC.
  assert.strictEqual(await createdAt(IDS.winter), '2026-03-15T17:34:36.000Z');
  // Heure d'été : UTC+2 → 18:04:00 local = 16:04:00 UTC.
  assert.strictEqual(await createdAt(IDS.summer), '2026-04-05T16:04:00.000Z');
});

test('une valeur déjà ISO est laissée telle quelle', async () => {
  assert.strictEqual(await createdAt(IDS.already), ISO_ALREADY);
});

test('un second passage ne change plus rien', async () => {
  const before2 = await Promise.all([createdAt(IDS.winter), createdAt(IDS.summer)]);
  const report = await normalizeLegacyTimestamps({ execute });
  assert.strictEqual(
    Number(report.converted['map_markers.created_at'] || 0),
    0,
    'aucune ligne ne doit rester à convertir',
  );
  const after2 = await Promise.all([createdAt(IDS.winter), createdAt(IDS.summer)]);
  assert.deepStrictEqual(after2, before2);
});

test('le tri redevient chronologique une fois les formats unifiés', async () => {
  // Le symptôme d'origine : « 2026-04-05 18:04:00 » (16:04 UTC) passait AVANT
  // « 2026-04-05T08:01:46Z » parce que ' ' (0x20) précède 'T' (0x54).
  const row = await queryOne(
    `SELECT GROUP_CONCAT(id ORDER BY created_at ASC) AS ordre
       FROM map_markers WHERE id IN (?, ?, ?)`,
    [IDS.winter, IDS.summer, IDS.already],
  );
  assert.strictEqual(
    row.ordre,
    [IDS.winter, IDS.already, IDS.summer].join(','),
    'l’ordre doit suivre les instants réels : hiver 17:34Z, puis 08:01Z du 5 avril, puis 16:04Z',
  );
});

test('les colonnes de DATE seule ne sont pas touchées', async () => {
  // tasks.due_date contient 'YYYY-MM-DD' : la convertir en horodatage serait un contresens,
  // elle est volontairement hors de LEGACY_TIMESTAMP_COLUMNS.
  const { LEGACY_TIMESTAMP_COLUMNS } = require('../lib/legacyTimestampNormalization');
  const targets = LEGACY_TIMESTAMP_COLUMNS.map((c) => `${c.table}.${c.column}`);
  for (const dateOnly of [
    'tasks.due_date',
    'tasks.start_date',
    'tasks.recurrence_spawned_for_due_date',
    'zone_history.harvested_at',
  ]) {
    assert.ok(!targets.includes(dateOnly), `${dateOnly} ne doit pas être normalisée`);
  }
});
