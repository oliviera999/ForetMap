'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert');
const {
  parseSpellsWorkbook,
  buildSpellPayload,
  validateSpellPayload,
} = require('../lib/glSpellsImport');

const XLSX_PATH = path.join(__dirname, '..', 'data', 'gl', 'sortileges-gnomes-et-licornes.xlsx');

test('parseSpellsWorkbook lit sortileges et categories_stats', async () => {
  const buffer = fs.readFileSync(XLSX_PATH);
  const { spellRows, categoryRows } = await parseSpellsWorkbook(buffer);
  assert.ok(spellRows.length >= 30);
  assert.ok(categoryRows.length >= 4);
  const payload = buildSpellPayload(spellRows[0]);
  assert.ok(/^SL\d+$/i.test(payload.spell_code));
  assert.ok(payload.nom);
  assert.ok(payload.category_slug);
});

test('validateSpellPayload refuse code manquant', () => {
  const errors = validateSpellPayload(buildSpellPayload({ nom: 'X', categorie: 'vie' }), 2);
  assert.ok(errors.some((e) => e.field === 'spell_code'));
});
