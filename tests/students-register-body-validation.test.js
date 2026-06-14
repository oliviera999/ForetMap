'use strict';

// O7 — vérifie SANS DB que le schéma zod du corps de `POST /students/register` reproduit
// exactement l'ancienne validation manuelle `if (!studentId) -> 400 'studentId requis'` :
// - rejette uniquement les valeurs falsy (undefined/null/''/0/false) avec 400 et le message exact ;
// - laisse passer toute valeur truthy (y compris les chaînes d'espaces, qui mènent à un 403 plus
//   loin dans le handler — donc PAS un 400 ici).
const test = require('node:test');
const assert = require('node:assert');
const { validate } = require('../lib/validate');
const { registerBodySchema } = require('../routes/students');

function runValidation(body) {
  const req = { body };
  const res = {
    statusCode: 200,
    body: undefined,
    status(c) { this.statusCode = c; return this; },
    json(payload) { this.body = payload; return this; },
  };
  let nextCalled = false;
  validate({ body: registerBodySchema })(req, res, () => { nextCalled = true; });
  return { nextCalled, status: res.statusCode, error: res.body?.error };
}

// `if (!studentId)` côté ancien handler.
function legacyRejects(studentId) {
  return !studentId;
}

test('register : rejet 400 "studentId requis" pour les valeurs falsy', () => {
  const falsyCases = [
    {},
    { studentId: undefined },
    { studentId: null },
    { studentId: '' },
    { studentId: 0 },
    { studentId: false },
  ];
  for (const body of falsyCases) {
    const r = runValidation(body);
    assert.strictEqual(legacyRejects(body.studentId), true, `legacy devrait rejeter ${JSON.stringify(body)}`);
    assert.strictEqual(r.nextCalled, false, `next ne doit pas être appelé pour ${JSON.stringify(body)}`);
    assert.strictEqual(r.status, 400, `status 400 attendu pour ${JSON.stringify(body)}`);
    assert.strictEqual(r.error, 'studentId requis', `message exact attendu pour ${JSON.stringify(body)}`);
  }
});

test('register : laisse passer les valeurs truthy (y compris chaînes d\'espaces)', () => {
  const truthyCases = [
    { studentId: 'abc-123' },
    { studentId: '   ' }, // chaîne d'espaces : truthy → passe ici (403 plus loin, pas 400)
    { studentId: '0' }, // chaîne '0' est truthy
    { studentId: 42 },
    { studentId: 'x', extra: 'toléré' }, // champs supplémentaires tolérés (passthrough)
  ];
  for (const body of truthyCases) {
    const r = runValidation(body);
    assert.strictEqual(legacyRejects(body.studentId), false, `legacy ne devrait pas rejeter ${JSON.stringify(body)}`);
    assert.strictEqual(r.nextCalled, true, `next doit être appelé pour ${JSON.stringify(body)}`);
    assert.strictEqual(r.status, 200, `pas de 400 pour ${JSON.stringify(body)}`);
  }
});
