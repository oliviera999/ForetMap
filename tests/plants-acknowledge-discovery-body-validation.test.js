'use strict';

// O7 — vérifie SANS DB que le schéma zod du corps de
// `POST /plants/:id/acknowledge-discovery` reproduit exactement l'ancienne validation manuelle
// `if (!req.body || req.body.confirm !== true) -> 400 'Confirmation explicite requise (confirm: true)'` :
// - rejette tout corps dont `confirm` n'est pas le booléen `true` (400 + message exact) ;
// - laisse passer uniquement `{ confirm: true }` (avec champs supplémentaires tolérés via passthrough).
const test = require('node:test');
const assert = require('node:assert');
const { validate } = require('../lib/validate');
const { acknowledgeDiscoveryBodySchema } = require('../routes/plants');

function runValidation(body) {
  const req = { body };
  const res = {
    statusCode: 200,
    body: undefined,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  let nextCalled = false;
  validate({ body: acknowledgeDiscoveryBodySchema })(req, res, () => {
    nextCalled = true;
  });
  return { nextCalled, status: res.statusCode, error: res.body?.error };
}

// `if (!req.body || req.body.confirm !== true)` côté ancien handler.
function legacyRejects(body) {
  return !body || body.confirm !== true;
}

test('acknowledge-discovery : rejet 400 quand confirm !== true', () => {
  const rejectCases = [
    {},
    { confirm: undefined },
    { confirm: null },
    { confirm: false },
    { confirm: 'true' },
    { confirm: 1 },
    { confirm: 0 },
  ];
  for (const body of rejectCases) {
    const r = runValidation(body);
    assert.strictEqual(legacyRejects(body), true, `legacy devrait rejeter ${JSON.stringify(body)}`);
    assert.strictEqual(
      r.nextCalled,
      false,
      `next ne doit pas être appelé pour ${JSON.stringify(body)}`,
    );
    assert.strictEqual(r.status, 400, `status 400 attendu pour ${JSON.stringify(body)}`);
    assert.strictEqual(
      r.error,
      'Confirmation explicite requise (confirm: true)',
      `message exact attendu pour ${JSON.stringify(body)}`,
    );
  }
});

test('acknowledge-discovery : laisse passer uniquement confirm === true', () => {
  const passCases = [
    { confirm: true },
    { confirm: true, extra: 'toléré' }, // champs supplémentaires tolérés (passthrough)
  ];
  for (const body of passCases) {
    const r = runValidation(body);
    assert.strictEqual(
      legacyRejects(body),
      false,
      `legacy ne devrait pas rejeter ${JSON.stringify(body)}`,
    );
    assert.strictEqual(r.nextCalled, true, `next doit être appelé pour ${JSON.stringify(body)}`);
    assert.strictEqual(r.status, 200, `pas de 400 pour ${JSON.stringify(body)}`);
  }
});
