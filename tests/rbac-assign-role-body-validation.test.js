'use strict';

// O7 — vérifie SANS DB que le schéma zod du corps de PUT
// /rbac/users/:userType/:userId/role reproduit exactement l'ancienne validation manuelle :
//   const roleId = parseInt(req.body?.role_id, 10);
//   if (!Number.isFinite(roleId) || roleId <= 0) -> 400 'role_id invalide'
// Le refine racine (message sans préfixe de chemin) exige que parseInt(role_id, 10) soit un
// entier fini strictement positif. Le corps n'est PAS transformé : le handler continue de lire
// et parser req.body?.role_id lui-même.
const test = require('node:test');
const assert = require('node:assert');
const { validate } = require('../lib/validate');
const { assignRoleBodySchema } = require('../routes/rbac');

function run(body) {
  const req = { body };
  const res = {
    statusCode: 200,
    payload: undefined,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(p) {
      this.payload = p;
      return this;
    },
  };
  let nextCalled = false;
  validate({ body: assignRoleBodySchema })(req, res, () => {
    nextCalled = true;
  });
  return {
    nextCalled,
    status: res.statusCode,
    error: res.payload && res.payload.error,
    body: req.body,
  };
}

// Parité avec l'ancien : `const roleId = parseInt(req.body?.role_id, 10);`
// puis `Number.isFinite(roleId) && roleId > 0`. Cas acceptés.
test('role_id valide (entier positif, string numérique, décimal tronqué) -> next, corps inchangé', () => {
  const cases = [
    [5, 5],
    ['5', 5],
    ['5abc', 5], // parseInt('5abc', 10) === 5
    [3.9, 3], // parseInt(3.9, 10) === 3
    ['  7 ', 7], // parseInt('  7 ', 10) === 7
    [1, 1],
  ];
  for (const [input, expected] of cases) {
    const r = run({ role_id: input });
    assert.strictEqual(r.nextCalled, true, `input=${String(input)}`);
    assert.strictEqual(r.status, 200);
    // Corps non transformé : le handler refait parseInt(req.body?.role_id, 10).
    assert.deepStrictEqual(r.body, { role_id: input });
    assert.strictEqual(parseInt(r.body.role_id, 10), expected);
  }
});

// Cas rejetés : tout ce qui donne NaN ou <= 0 avec parseInt(v, 10).
test('role_id invalide -> 400 message exact (sans préfixe de chemin)', () => {
  const cases = [undefined, null, '', 'abc', true, false, {}, [], 0, '0', -1, '-3', NaN];
  for (const input of cases) {
    const r = run({ role_id: input });
    assert.strictEqual(r.nextCalled, false, `input=${JSON.stringify(input)}`);
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error, 'role_id invalide');
  }
});

test('corps null/undefined -> 400 message exact (parité avec req.body?.role_id)', () => {
  for (const b of [null, undefined]) {
    const r = run(b);
    assert.strictEqual(r.nextCalled, false);
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error, 'role_id invalide');
  }
});
