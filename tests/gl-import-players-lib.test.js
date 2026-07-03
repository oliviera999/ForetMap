'use strict';

// Tests directs de lib/gl/importPlayers.js (extraction de POST /api/gl/admin/players/import) :
// rapport identique au contrat historique et unicité pseudo/email vérifiée via des requêtes
// bornées aux valeurs importées (correction N+1 de l'audit).

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const { initSchema, execute, queryOne } = require('../database');
const { importPlayersFromRows } = require('../lib/gl/importPlayers');

const stamp = Date.now();
const className = `Classe ImportLib ${stamp}`;

function row({
  firstName = 'Aurore',
  lastName = `Nom-${stamp}`,
  email = '',
  pseudo,
  password = '',
  classe = className,
}) {
  return {
    Prénom: firstName,
    Nom: lastName,
    Email: email,
    Pseudo: pseudo,
    'Mot de passe': password,
    Classe: classe,
  };
}

before(async () => {
  await initSchema();
  await execute(
    `INSERT INTO gl_classes (name, school, created_by, is_active, created_at, updated_at)
     VALUES (?, 'Ecole', NULL, 1, NOW(), NOW())`,
    [className],
  );
});

test('importPlayersFromRows crée les lignes valides et renvoie le rapport attendu', async () => {
  const report = await importPlayersFromRows(
    [
      row({ pseudo: `lib_avec_${stamp}`, password: 'motdepasse123' }),
      row({ pseudo: `lib_sans_${stamp}`, email: `lib.sans.${stamp}@ecole.local` }),
    ],
    { dryRun: false },
  );
  assert.deepStrictEqual(report.totals, {
    received: 2,
    valid: 2,
    skipped_invalid: 0,
    created: 2,
  });
  assert.deepStrictEqual(report.errors, []);

  const withPwd = await queryOne(
    'SELECT password_must_reset FROM gl_players WHERE pseudo = ? LIMIT 1',
    [`lib_avec_${stamp}`],
  );
  assert.strictEqual(Number(withPwd.password_must_reset), 0);
  const withoutPwd = await queryOne(
    'SELECT password_must_reset FROM gl_players WHERE pseudo = ? LIMIT 1',
    [`lib_sans_${stamp}`],
  );
  assert.strictEqual(Number(withoutPwd.password_must_reset), 1);
});

test('importPlayersFromRows (dryRun) détecte pseudo et email déjà pris en base', async () => {
  const report = await importPlayersFromRows(
    [
      // Pseudo déjà créé au test précédent (comparaison insensible à la casse).
      row({ pseudo: `LIB_AVEC_${stamp}`.toUpperCase(), password: 'motdepasse123' }),
      // Email déjà pris par lib_sans_….
      row({
        pseudo: `lib_autre_${stamp}`,
        email: `lib.sans.${stamp}@ecole.local`,
        password: 'motdepasse123',
      }),
    ],
    { dryRun: true },
  );
  assert.strictEqual(report.totals.received, 2);
  assert.strictEqual(report.totals.valid, 0);
  assert.strictEqual(report.totals.skipped_invalid, 2);
  assert.strictEqual(report.totals.created, 0);
  assert.deepStrictEqual(
    report.errors.map((e) => e.error),
    ['Pseudo déjà utilisé', 'Email déjà utilisé'],
  );
});

test('importPlayersFromRows détecte les doublons internes au fichier importé', async () => {
  const report = await importPlayersFromRows(
    [
      row({ pseudo: `lib_dup_${stamp}`, password: 'motdepasse123' }),
      row({ pseudo: `lib_dup_${stamp}`, password: 'motdepasse123' }),
    ],
    { dryRun: true },
  );
  assert.strictEqual(report.totals.valid, 1);
  assert.strictEqual(report.totals.skipped_invalid, 1);
  assert.deepStrictEqual(report.errors, [
    { row: 3, field: 'pseudo', error: 'Pseudo déjà utilisé' },
  ]);
});

test('importPlayersFromRows signale une classe introuvable', async () => {
  const report = await importPlayersFromRows(
    [row({ pseudo: `lib_cls_${stamp}`, password: 'motdepasse123', classe: 'Classe-Inconnue-Lib' })],
    { dryRun: true },
  );
  assert.strictEqual(report.totals.valid, 0);
  assert.deepStrictEqual(report.errors, [
    { row: 2, field: 'className', error: 'Classe introuvable' },
  ]);
});
