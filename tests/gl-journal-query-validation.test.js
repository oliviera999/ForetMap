'use strict';

// O7 — vérifie SANS DB que le schéma zod de la query du journal GL (`GET /games/:id`)
// reproduit exactement l'ancienne lecture manuelle :
//   teamFilter = req.query?.teamId != null ? Number(req.query.teamId) : null
//   limit      = Math.min(500, Math.max(1, Number(req.query?.limit) || 100))
// Coercition tolérante, jamais de 400 pour une query invalide (NaN de teamId conservé,
// le handler le filtre via Number.isFinite comme avant).
const test = require('node:test');
const assert = require('node:assert');
const { validate } = require('../lib/validate');
const { journalGameQuerySchema } = require('../routes/gl/journal');

function runQuery(rawQuery) {
  const req = { query: rawQuery };
  const res = {
    statusCode: 200,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json() {
      return this;
    },
  };
  let nextCalled = false;
  validate({ query: journalGameQuerySchema })(req, res, () => {
    nextCalled = true;
  });
  return { nextCalled, status: res.statusCode, parsed: req.validatedQuery };
}

// Ré-implémentation indépendante de l'ancienne logique.
function legacy(query) {
  return {
    teamFilter: query?.teamId != null ? Number(query.teamId) : null,
    limit: Math.min(500, Math.max(1, Number(query?.limit) || 100)),
  };
}

test('limit : équivalence exacte avec la logique historique, jamais de 400', () => {
  const cases = [
    undefined,
    '',
    'abc',
    '0',
    '1',
    '100',
    '499',
    '500',
    '501',
    '999999',
    '-5',
    '50.9',
    '12abc',
  ];
  for (const raw of cases) {
    const query = raw === undefined ? {} : { limit: raw };
    const { nextCalled, status, parsed } = runQuery(query);
    assert.strictEqual(nextCalled, true, `limit=${JSON.stringify(raw)} ne doit jamais être rejeté`);
    assert.strictEqual(status, 200);
    assert.strictEqual(
      parsed.limit,
      legacy(query).limit,
      `limit effectif pour ${JSON.stringify(raw)}`,
    );
  }
});

test('limit borné dans [1, 500] pour toute entrée numérique', () => {
  for (const raw of ['0', '-100', '1', '500', '501', '999999']) {
    const { parsed } = runQuery({ limit: raw });
    assert.ok(
      parsed.limit >= 1 && parsed.limit <= 500,
      `limit ${parsed.limit} hors borne pour ${raw}`,
    );
  }
});

test('teamId : équivalence exacte (Number ou null, NaN conservé), jamais de 400', () => {
  const cases = [undefined, '', 'abc', '0', '7', '-2', '3.5', '12abc'];
  for (const raw of cases) {
    const query = raw === undefined ? {} : { teamId: raw };
    const { nextCalled, parsed } = runQuery(query);
    assert.strictEqual(
      nextCalled,
      true,
      `teamId=${JSON.stringify(raw)} ne doit jamais être rejeté`,
    );
    // strictEqual utilise SameValue : NaN === NaN ici, comme l'ancienne logique le produisait.
    assert.strictEqual(
      parsed.teamFilter,
      legacy(query).teamFilter,
      `teamFilter pour ${JSON.stringify(raw)}`,
    );
  }
});
