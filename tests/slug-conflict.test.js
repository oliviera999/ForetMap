'use strict';

// O8 — vérifie SANS DB le patron « mapping spécial » rethrowSlugConflict : un conflit d'unicité
// MySQL (errno 1062 / ER_DUP_ENTRY) est traduit en erreur `.status = 409` que le handler central
// renvoie telle quelle ; toute autre erreur est relancée à l'identique (→ 500 générique).
const test = require('node:test');
const assert = require('node:assert');
const { rethrowSlugConflict } = require('../lib/slugConflict');

/** Exécute `fn`, renvoie `{ threw, value }` (capture aussi un `throw null`). */
function capture(fn) {
  try {
    fn();
    return { threw: false, value: undefined };
  } catch (e) {
    return { threw: true, value: e };
  }
}

test('errno 1062 → Error .status=409 « Slug déjà utilisé »', () => {
  const { threw, value } = capture(() => rethrowSlugConflict({ errno: 1062 }));
  assert.ok(threw);
  assert.strictEqual(value.status, 409);
  assert.strictEqual(value.message, 'Slug déjà utilisé');
});

test('code ER_DUP_ENTRY → Error .status=409', () => {
  const { value } = capture(() => rethrowSlugConflict({ code: 'ER_DUP_ENTRY' }));
  assert.strictEqual(value.status, 409);
});

test('autre erreur → relancée à l’identique (même référence, sans .status)', () => {
  const original = new Error('boom');
  original.code = 'ER_NO_SUCH_TABLE';
  const { value } = capture(() => rethrowSlugConflict(original));
  assert.strictEqual(value, original);
  assert.strictEqual(value.status, undefined);
});

test('erreur falsy (null) → relancée telle quelle (pas de mapping 409)', () => {
  const { threw, value } = capture(() => rethrowSlugConflict(null));
  assert.ok(threw);
  assert.strictEqual(value, null);
});
