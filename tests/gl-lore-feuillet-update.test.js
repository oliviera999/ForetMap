'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { updateFeuilletFields, FEUILLET_EDITABLE_COLUMNS } = require('../lib/glLoreFeuillets');

test('updateFeuilletFields construit un UPDATE paramétré des colonnes éditables', async () => {
  let captured = null;
  const deps = {
    execute: async (sql, params) => {
      captured = { sql, params };
      return { affectedRows: 1 };
    },
  };
  const payload = { titre: 'Nouveau', ordre_voyage: 12 }; // legacy_id absent → NULL
  await updateFeuilletFields(deps, 'cop-cover', payload);

  for (const col of FEUILLET_EDITABLE_COLUMNS) {
    assert.ok(captured.sql.includes(`${col} = ?`), `SET ${col} attendu`);
  }
  assert.ok(/WHERE feuillet_code = \?$/.test(captured.sql.trim()), 'clause WHERE attendue');
  assert.strictEqual(captured.params.length, FEUILLET_EDITABLE_COLUMNS.length + 1);
  assert.strictEqual(captured.params[captured.params.length - 1], 'cop-cover');

  const idxTitre = FEUILLET_EDITABLE_COLUMNS.indexOf('titre');
  assert.strictEqual(captured.params[idxTitre], 'Nouveau');
  const idxLegacy = FEUILLET_EDITABLE_COLUMNS.indexOf('legacy_id');
  assert.strictEqual(captured.params[idxLegacy], null);
});

test('updateFeuilletFields exclut feuillet_code et kingdom_zone_id des colonnes', () => {
  assert.ok(!FEUILLET_EDITABLE_COLUMNS.includes('feuillet_code'));
  assert.ok(!FEUILLET_EDITABLE_COLUMNS.includes('kingdom_zone_id'));
  assert.ok(FEUILLET_EDITABLE_COLUMNS.includes('statut'));
});
