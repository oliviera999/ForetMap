'use strict';

// Verifie le contrat de validation O7 (zod) de routes/media-library.js sans toucher la DB :
// on exerce les schemas via le middleware `validate`, exactement comme en production.
const test = require('node:test');
const assert = require('node:assert');
const { validate } = require('../lib/validate');
const { listQuerySchema, uploadBodySchema } = require('../routes/media-library');

function runValidate(schemas, { body, query } = {}) {
  const req = { body, query };
  const res = {
    statusCode: 200,
    jsonBody: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.jsonBody = payload;
      return this;
    },
  };
  let nextCalled = false;
  const next = () => {
    nextCalled = true;
  };
  validate(schemas)(req, res, next);
  return { req, res, nextCalled };
}

test('uploadBodySchema : media_data vide → 400 « media_data requis »', () => {
  for (const value of [undefined, '', '   ']) {
    const { res, nextCalled } = runValidate(
      { body: uploadBodySchema },
      { body: { media_data: value } },
    );
    assert.strictEqual(nextCalled, false, `media_data=${JSON.stringify(value)} doit etre rejete`);
    assert.strictEqual(res.statusCode, 400);
    assert.match(res.jsonBody.error, /media_data requis/);
  }
});

test('uploadBodySchema : media_data valide passe et est trim', () => {
  const { req, res, nextCalled } = runValidate(
    { body: uploadBodySchema },
    { body: { media_data: '  data:image/png;base64,AAAA  ', original_name: '  photo.png  ' } },
  );
  assert.strictEqual(nextCalled, true);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(req.body.media_data, 'data:image/png;base64,AAAA');
  assert.strictEqual(req.body.original_name, 'photo.png');
});

test('listQuerySchema : limit reste permissif et equivalent au comportement historique', () => {
  // La limite effective cote route reste `Number.isFinite(limit) ? limit : 300`, identique a
  // l'ancienne logique `Number(req.query.limit)`. Aucun cas ne doit produire de 400.
  const rawValues = ['5', '400', undefined, 'abc', '', '0', '-3'];
  const effective = (limit) => (Number.isFinite(limit) ? limit : 300);
  const legacyEffective = (raw) => {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 300;
  };
  for (const raw of rawValues) {
    const query = raw === undefined ? {} : { limit: raw };
    const { req, res, nextCalled } = runValidate({ query: listQuerySchema }, { query });
    assert.strictEqual(nextCalled, true, `limit=${JSON.stringify(raw)} ne doit jamais etre rejete`);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(
      effective(req.validatedQuery.limit),
      legacyEffective(raw),
      `limit effective pour ${JSON.stringify(raw)}`,
    );
  }
});
