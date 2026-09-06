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
    reused_existing: 0,
  });
  assert.deepStrictEqual(report.errors, []);

  // Le drapeau vit sur le compte `users` lié (unification des identités).
  const withPwd = await queryOne(
    `SELECT u.password_must_reset FROM gl_players p
      INNER JOIN users u ON u.id = p.linked_foretmap_user_id WHERE p.pseudo = ? LIMIT 1`,
    [`lib_avec_${stamp}`],
  );
  assert.strictEqual(Number(withPwd.password_must_reset), 0);
  const withoutPwd = await queryOne(
    `SELECT u.password_must_reset, u.email FROM gl_players p
      INNER JOIN users u ON u.id = p.linked_foretmap_user_id WHERE p.pseudo = ? LIMIT 1`,
    [`lib_sans_${stamp}`],
  );
  assert.strictEqual(Number(withoutPwd.password_must_reset), 1);
  assert.strictEqual(withoutPwd.email, `lib.sans.${stamp}@ecole.local`);

  // Les identifiants sont restitués une fois : mot de passe fourni tel quel, généré sinon.
  assert.strictEqual(report.credentials.length, 2);
  const [first, second] = report.credentials;
  assert.strictEqual(first.pseudo, `lib_avec_${stamp}`);
  assert.strictEqual(first.password, 'motdepasse123');
  assert.strictEqual(first.generated, false);
  assert.strictEqual(second.pseudo, `lib_sans_${stamp}`);
  assert.strictEqual(second.generated, true);
  assert.match(second.password, /^[a-z0-9]{10}$/);
  const bcrypt = require('bcryptjs');
  const generatedHash = await queryOne(
    `SELECT u.password_hash FROM gl_players p
      INNER JOIN users u ON u.id = p.linked_foretmap_user_id WHERE p.pseudo = ? LIMIT 1`,
    [`lib_sans_${stamp}`],
  );
  assert.strictEqual(await bcrypt.compare(second.password, generatedHash.password_hash), true);
});

test('importPlayersFromRows rapproche un élève ForetMap existant au lieu de le dupliquer (C1)', async () => {
  const crypto = require('node:crypto');
  const bcrypt = require('bcryptjs');
  const existingId = crypto.randomUUID();
  const email = `lib.existing.${stamp}@ecole.local`;
  const fmHash = await bcrypt.hash('mot-de-passe-foretmap', 10);
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, first_name, last_name, display_name, affiliation, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'student', ?, ?, 'Existante', ?, 'Existante Eleve', 'both', ?, 'local', 1, NOW(), NOW())`,
    [existingId, email, `fm_existing_${stamp}`, `Eleve-${stamp}`, fmHash],
  );
  const report = await importPlayersFromRows(
    [
      row({
        firstName: 'Existante',
        lastName: `Eleve-${stamp}`,
        email,
        pseudo: `lib_reuse_${stamp}`,
        password: 'ignore-moi',
      }),
    ],
    { dryRun: false },
  );
  assert.deepStrictEqual(report.errors, []);
  assert.strictEqual(report.totals.created, 1);
  assert.strictEqual(report.totals.reused_existing, 1);
  const linked = await queryOne(
    'SELECT linked_foretmap_user_id FROM gl_players WHERE pseudo = ? LIMIT 1',
    [`lib_reuse_${stamp}`],
  );
  assert.strictEqual(String(linked.linked_foretmap_user_id), existingId);
  // Aucun doublon : un seul compte élève porte cet e-mail, et son mot de passe est conservé.
  const count = await queryOne('SELECT COUNT(*) AS c FROM users WHERE LOWER(email) = LOWER(?)', [
    email,
  ]);
  assert.strictEqual(Number(count.c), 1);
  const preserved = await queryOne('SELECT password_hash FROM users WHERE id = ? LIMIT 1', [
    existingId,
  ]);
  assert.strictEqual(await bcrypt.compare('mot-de-passe-foretmap', preserved.password_hash), true);
  assert.strictEqual(report.credentials[0].reusedExisting, true);
  assert.strictEqual(report.credentials[0].password, null);
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
