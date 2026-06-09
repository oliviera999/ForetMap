'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert');
const {
  buildGlossaryPayload,
  validateGlossaryPayload,
  parseGlossaryWorkbook,
  buildGlossaryUpsertParams,
} = require('../lib/glGlossaryImport');
const {
  normalizeMatchKey,
  matchGlossaryTermsForSpecies,
  buildGlossaryLookupMap,
  resolveRelatedTermCodes,
  buildTermToCodeMap,
} = require('../lib/glGlossaryMatch');

const XLSX_PATH = path.join(__dirname, '..', 'data', 'gl', 'glossaire-gnomes-et-licornes.xlsx');

test('parseGlossaryWorkbook lit le fichier de référence', async () => {
  const buffer = fs.readFileSync(XLSX_PATH);
  const { glossaryRows } = await parseGlossaryWorkbook(buffer);
  assert.ok(glossaryRows.length >= 270);
  const first = buildGlossaryPayload(glossaryRows[0]);
  assert.ok(first.glossary_code);
  assert.ok(first.terme);
  assert.ok(first.categorie);
});

test('validateGlossaryPayload signale les champs manquants', () => {
  const errors = validateGlossaryPayload(buildGlossaryPayload({}), 2);
  assert.ok(errors.some((e) => e.field === 'glossary_code'));
  assert.ok(errors.some((e) => e.field === 'terme'));
  assert.ok(errors.some((e) => e.field === 'categorie'));
});

test('buildGlossaryUpsertParams aligne 13 paramètres', () => {
  const payload = buildGlossaryPayload({
    id: 'GL0001',
    terme: 'Biome',
    categorie: 'biome',
    niveau: 'base',
    biomes_concernes: 'tous',
  });
  const params = buildGlossaryUpsertParams(payload);
  assert.strictEqual(params.length, 13);
  assert.strictEqual(params[0], 'GL0001');
  assert.strictEqual(params[1], 'Biome');
});

test('matchGlossaryTermsForSpecies résout mots_cles CSV', () => {
  const rows = [
    {
      glossary_code: 'GL0001',
      terme: 'Biome',
      variantes: '',
      definition_courte: 'Grande région écologique',
      categorie: 'biome',
    },
    {
      glossary_code: 'GL0002',
      terme: 'Désert',
      variantes: 'desert',
      definition_courte: 'Milieu aride',
      categorie: 'biome',
    },
  ];
  const map = buildGlossaryLookupMap(rows);
  const matched = matchGlossaryTermsForSpecies('biome, desert', map);
  assert.strictEqual(matched.length, 2);
  assert.ok(matched.some((t) => t.glossary_code === 'GL0001'));
  assert.ok(matched.some((t) => t.glossary_code === 'GL0002'));
});

test('resolveRelatedTermCodes résout termes_lies normalisés', () => {
  const rows = [
    { glossary_code: 'GL0001', terme: 'Biome', variantes: '' },
    { glossary_code: 'GL0002', terme: 'Écosystème', variantes: 'ecosysteme' },
  ];
  const termToCode = buildTermToCodeMap(rows);
  const codes = resolveRelatedTermCodes('écosystème', termToCode);
  assert.deepStrictEqual(codes, ['GL0002']);
  assert.strictEqual(normalizeMatchKey('Écosystème'), normalizeMatchKey('ecosysteme'));
});
