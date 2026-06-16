'use strict';

// O7 — vérifie SANS DB que le schéma zod du `class_id` de GET /api/gl/stats/class reproduit
// exactement l'ancien début de resolveClassIdForAuth : `String(raw || '').trim()` puis Number
// si non vide (NaN CONSERVÉ — il partait déjà en lookup DB et échouait → 400 « Classe
// introuvable » du handler), sinon null (replis token / joueur / première classe active,
// inchangés). Le schéma ne produit jamais de 400.
const test = require('node:test');
const assert = require('node:assert');
const { validate } = require('../lib/validate');
const { glStatsClassQuerySchema } = require('../routes/gl/stats');

function runQuery(query) {
  const req = { query };
  let nextCalled = false;
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
  validate({ query: glStatsClassQuerySchema })(req, res, () => {
    nextCalled = true;
  });
  return { nextCalled, status: res.statusCode, validated: req.validatedQuery };
}

// Ré-implémentation indépendante de la logique historique : la valeur que l'ancien
// resolveClassIdForAuth passait au lookup DB (`Number(requested)`), ou null si la branche
// « demandé » n'était pas prise (`!String(raw || '').trim()`).
function legacyRequestedClassId(raw) {
  const requested = String(raw || '').trim();
  return requested ? Number(requested) : null;
}

const EDGE_CASES = [
  undefined,
  '',
  '  ',
  'abc',
  '0',
  '3',
  ' 7 ',
  '-1',
  '2.5',
  '999999',
  'Infinity',
  '12abc',
  ['1', '2'],
  [' 4 '],
];

test('class_id : équivalence exacte avec la logique historique (NaN conservé), jamais de 400 issu du schéma', () => {
  for (const raw of EDGE_CASES) {
    const query = raw === undefined ? {} : { class_id: raw };
    const { nextCalled, status, validated } = runQuery(query);
    const label = `class_id=${JSON.stringify(raw)}`;
    assert.strictEqual(nextCalled, true, `${label} ne doit jamais être rejeté par le schéma`);
    assert.strictEqual(status, 200, label);
    // Object.is : NaN doit rester NaN (pas replié sur null, sinon on changerait de branche —
    // l'ancien code tentait le lookup DB avec NaN au lieu de retomber sur la classe du token).
    assert.ok(
      Object.is(validated.class_id, legacyRequestedClassId(raw)),
      `${label} : attendu ${legacyRequestedClassId(raw)}, obtenu ${validated.class_id}`,
    );
  }
});

test('class_id : branches notables conservées (absent/vide → replis, NaN → lookup qui échoue, trim, 0/-1 transmis)', () => {
  // Absent ou vide/blanc → null → replis historiques (token, joueur, première classe active).
  assert.strictEqual(runQuery({}).validated.class_id, null);
  assert.strictEqual(runQuery({ class_id: '' }).validated.class_id, null);
  assert.strictEqual(runQuery({ class_id: '  ' }).validated.class_id, null);
  // Non numérique → NaN conservé : la branche « demandé » est prise (NaN != null) et le lookup
  // DB ne trouve rien, comme avant → 400 du handler.
  assert.ok(Number.isNaN(runQuery({ class_id: 'abc' }).validated.class_id));
  assert.ok(Number.isNaN(runQuery({ class_id: ['1', '2'] }).validated.class_id)); // String(['1','2']) → '1,2'
  // Trim conservé (y compris via String() d'un paramètre répété à un seul élément).
  assert.strictEqual(runQuery({ class_id: ' 7 ' }).validated.class_id, 7);
  assert.strictEqual(runQuery({ class_id: [' 4 '] }).validated.class_id, 4);
  // '0'/-1 : chaînes non vides → transmis au lookup tels quels (échec DB → 400, comme avant).
  assert.strictEqual(runQuery({ class_id: '0' }).validated.class_id, 0);
  assert.strictEqual(runQuery({ class_id: '-1' }).validated.class_id, -1);
});
