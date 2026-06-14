'use strict';

// O7 — vérifie SANS DB que le schéma zod du paramètre `format` de
// `GET /students/import/template` reproduit exactement l'ancienne validation manuelle :
//   const format = asTrimmedString(req.query?.format || 'csv').toLowerCase();
//   if (format === 'xlsx') ...
//   if (format !== 'csv') return res.status(400).json({ error: 'Format invalide (csv ou xlsx)' });
// soit : falsy → 'csv' ; trim + lowercase ; csv/xlsx acceptés (et normalisés) ; sinon 400 message exact.
const test = require('node:test');
const assert = require('node:assert');
const { validate } = require('../lib/validate');
const { importTemplateQuerySchema } = require('../routes/students');

function runValidation(query) {
  const req = { query };
  const res = {
    statusCode: 200,
    body: undefined,
    status(c) { this.statusCode = c; return this; },
    json(payload) { this.body = payload; return this; },
  };
  let nextCalled = false;
  validate({ query: importTemplateQuerySchema })(req, res, () => { nextCalled = true; });
  return { nextCalled, status: res.statusCode, error: res.body?.error, validatedQuery: req.validatedQuery };
}

// Réplique de la normalisation de l'ancien handler.
function legacyFormat(raw) {
  const v = raw == null ? '' : String(raw).trim();
  return (v || 'csv').toLowerCase();
}

test('import/template : valeurs acceptées (csv/xlsx) normalisées, next appelé', () => {
  const cases = [
    {},                      // format absent → csv
    { format: undefined },   // → csv
    { format: '' },          // falsy → csv
    { format: 'csv' },
    { format: 'CSV' },       // lowercase
    { format: '  xlsx  ' },  // trim
    { format: 'XLSX' },
  ];
  for (const query of cases) {
    const r = runValidation(query);
    const expected = legacyFormat(query.format);
    assert.ok(expected === 'csv' || expected === 'xlsx', `cas légitime: ${JSON.stringify(query)}`);
    assert.strictEqual(r.nextCalled, true, `next attendu pour ${JSON.stringify(query)}`);
    assert.strictEqual(r.status, 200, `pas de 400 pour ${JSON.stringify(query)}`);
    assert.strictEqual(r.validatedQuery.format, expected, `format normalisé attendu pour ${JSON.stringify(query)}`);
  }
});

test('import/template : valeurs invalides → 400 "Format invalide (csv ou xlsx)"', () => {
  const cases = [
    { format: 'pdf' },
    { format: 'json' },
    { format: 'cs v' },
    { format: 'xls' },
    { format: '0' }, // '0' est une chaîne truthy → reste '0' (≠ csv) → 400
  ];
  for (const query of cases) {
    const r = runValidation(query);
    const expected = legacyFormat(query.format);
    assert.ok(expected !== 'csv' && expected !== 'xlsx', `cas invalide: ${JSON.stringify(query)}`);
    assert.strictEqual(r.nextCalled, false, `next ne doit pas être appelé pour ${JSON.stringify(query)}`);
    assert.strictEqual(r.status, 400, `status 400 attendu pour ${JSON.stringify(query)}`);
    assert.strictEqual(r.error, 'Format invalide (csv ou xlsx)', `message exact pour ${JSON.stringify(query)}`);
  }
});
