'use strict';

// Session d'édition côté client (`src/utils/editRevision.js`) : révision envoyée, adoptée,
// conflit tranché par le prof (écraser ou renoncer).
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () =>
  import(pathToFileURL(path.join(__dirname, '..', 'src', 'utils', 'editRevision.js')).href);

const conflict = () =>
  Object.assign(new Error('modifiée'), { status: 409, body: { code: 'edit_conflict' } });

test('envoie la révision de départ puis adopte celle du serveur', async () => {
  const { createEditRevisionSession } = await load();
  const session = createEditRevisionSession(3);
  const seen = [];
  const send = async (expected) => {
    seen.push(expected);
    return { edit_revision: (expected ?? 0) + 1 };
  };
  await session.save(send);
  await session.save(send);
  assert.deepStrictEqual(seen, [3, 4]);
  assert.strictEqual(session.revision, 5);
});

test('deux enregistrements lancés ensemble partent l’un après l’autre', async () => {
  const { createEditRevisionSession } = await load();
  const session = createEditRevisionSession(0);
  const seen = [];
  const send = async (expected) => {
    seen.push(expected);
    await new Promise((r) => setTimeout(r, 5));
    return { edit_revision: expected + 1 };
  };
  await Promise.all([session.save(send), session.save(send)]);
  assert.deepStrictEqual(seen, [0, 1]);
});

test('conflit accepté : renvoi sans contrôle', async () => {
  const { createEditRevisionSession } = await load();
  const session = createEditRevisionSession(1, { confirmOverwrite: async () => true });
  const seen = [];
  const out = await session.save(async (expected) => {
    seen.push(expected);
    if (expected !== null) throw conflict();
    return { edit_revision: 7 };
  });
  assert.deepStrictEqual(seen, [1, null]);
  assert.strictEqual(out.edit_revision, 7);
  assert.strictEqual(session.revision, 7);
});

test('conflit refusé : plus aucun enregistrement jusqu’à réouverture', async () => {
  const { createEditRevisionSession, EDIT_CONFLICT_DECLINED_MESSAGE } = await load();
  let asked = 0;
  const session = createEditRevisionSession(1, {
    confirmOverwrite: async () => {
      asked += 1;
      return false;
    },
  });
  let calls = 0;
  const send = async () => {
    calls += 1;
    throw conflict();
  };
  await assert.rejects(session.save(send), { message: EDIT_CONFLICT_DECLINED_MESSAGE });
  await assert.rejects(session.save(send), { message: EDIT_CONFLICT_DECLINED_MESSAGE });
  assert.strictEqual(calls, 1, 'pas de nouvel envoi après le refus');
  assert.strictEqual(asked, 1, 'la question n’est pas reposée');
  assert.strictEqual(session.declined, true);
});

test('les autres erreurs passent telles quelles, la session reste utilisable', async () => {
  const { createEditRevisionSession } = await load();
  const session = createEditRevisionSession(2);
  await assert.rejects(
    session.save(async () => {
      throw Object.assign(new Error('Titre requis'), { status: 400 });
    }),
    { message: 'Titre requis' },
  );
  const out = await session.save(async (expected) => ({ edit_revision: expected + 1 }));
  assert.strictEqual(out.edit_revision, 3);
});

test('withExpectedRevision : ajoute le champ seulement si la révision est connue', async () => {
  const { withExpectedRevision } = await load();
  assert.deepStrictEqual(withExpectedRevision({ a: 1 }, 4), { a: 1, expected_revision: 4 });
  assert.deepStrictEqual(withExpectedRevision({ a: 1 }, null), { a: 1 });
  assert.deepStrictEqual(withExpectedRevision({ a: 1 }, undefined), { a: 1 });
  assert.deepStrictEqual(withExpectedRevision({ a: 1 }, 'x'), { a: 1 });
});
