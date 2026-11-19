'use strict';

/**
 * Audit des bugs G&L du 19/11/2026 — lot 6 : comptes, classes, import de joueurs.
 * Un test par constat (A1, A2, A3, A5, A7) ; A4 et A10 sont couverts dans
 * `gl-profile.test.js`, `gl-auth-forgot-password.test.js` et `gl-demo-game.test.js`.
 * Toutes les valeurs sont factices et construites à l'exécution.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
  createGlChapterWithMarker,
  createGlGameWithTeams,
  assignPlayerToGameTeam,
  signTokens,
} = require('./helpers/glFixtures');
const { buildPlayerImportPayload, validatePlayerImportPayload } = require('../lib/glPlayersImport');

const stamp = Date.now();
let admin;
let adminToken = '';

function auth(req) {
  return req.set('Authorization', `Bearer ${adminToken}`);
}

before(async () => {
  await initSchema();
  admin = await createGlAdmin({ email: `gl-lot6-${stamp}@ecole.local` });
  const tokens = await signTokens({
    adminId: admin.id,
    adminPermissions: ['gl.read', 'gl.players.manage', 'gl.game.manage'],
  });
  adminToken = tokens.adminToken;
});

// ---------------------------------------------------------------------------------------------
// A1 — import : ligne sans pseudo
// ---------------------------------------------------------------------------------------------

test('A1 : validatePlayerImportPayload réclame le pseudo', () => {
  const payload = buildPlayerImportPayload({
    firstName: 'Prenom',
    lastName: 'Nom',
    pseudo: '',
    className: 'Classe',
  });
  const errors = validatePlayerImportPayload(payload, 2);
  assert.ok(
    errors.some((e) => e.field === 'pseudo' && /requis/i.test(e.error)),
    `erreur « Pseudo requis » attendue, reçu ${JSON.stringify(errors)}`,
  );
});

test('A1 : une ligne sans pseudo est signalée à blanc, et ne fait plus tomber l’import réel', async () => {
  const cls = await createGlClass({ name: `Lot6 Import ${stamp}`, adminId: admin.id });
  const csv = [
    'Prénom;Nom;Email;Pseudo;Mot de passe;Classe',
    `Un;Lot6-${stamp};;lot6_a_${stamp};;${cls.name}`,
    `Deux;Lot6-${stamp};;;;${cls.name}`,
    `Trois;Lot6-${stamp};;lot6_c_${stamp};;${cls.name}`,
  ].join('\n');
  const fileDataBase64 = Buffer.from(csv, 'utf8').toString('base64');

  const dry = await auth(request(app).post('/api/gl/admin/players/import'))
    .send({ fileName: 'joueurs.csv', fileDataBase64, dryRun: true })
    .expect(200);
  assert.strictEqual(dry.body?.report?.totals?.valid, 2);
  const dryErrors = dry.body?.report?.errors || [];
  assert.ok(
    dryErrors.some((e) => e.row === 3 && e.field === 'pseudo'),
    `ligne 3 attendue en erreur de pseudo, reçu ${JSON.stringify(dryErrors)}`,
  );

  const real = await auth(request(app).post('/api/gl/admin/players/import'))
    .send({ fileName: 'joueurs.csv', fileDataBase64, dryRun: false })
    .expect(200);
  assert.strictEqual(real.body?.report?.totals?.created, 2);
  const credentials = real.body?.report?.credentials || [];
  assert.deepStrictEqual(credentials.map((c) => c.pseudo).sort(), [
    `lot6_a_${stamp}`,
    `lot6_c_${stamp}`,
  ]);
  // Le mot de passe généré du premier joueur est bien restitué.
  assert.ok(credentials.every((c) => typeof c.password === 'string' && c.password.length > 0));
});

test('A1 : une erreur SQL sur une ligne devient une entrée errors[], le rapport est renvoyé', async () => {
  const { importPlayersFromRows } = require('../lib/gl/importPlayers');
  const cls = await createGlClass({ name: `Lot6 Import SQL ${stamp}`, adminId: admin.id });
  // Prénom trop long pour la colonne : passe la validation, échoue à l'écriture.
  const tooLong = 'x'.repeat(400);
  const report = await importPlayersFromRows(
    [
      { firstName: 'Un', lastName: 'Sql', pseudo: `lot6_s1_${stamp}`, className: cls.name },
      { firstName: tooLong, lastName: 'Sql', pseudo: `lot6_s2_${stamp}`, className: cls.name },
      { firstName: 'Trois', lastName: 'Sql', pseudo: `lot6_s3_${stamp}`, className: cls.name },
    ],
    { dryRun: false },
  );
  assert.strictEqual(report.totals.created, 2);
  assert.strictEqual(report.credentials.length, 2);
  assert.ok(
    report.errors.some((e) => e.row === 3),
    `ligne 3 attendue en erreur, reçu ${JSON.stringify(report.errors)}`,
  );
  // Pas de message SQL brut dans le rapport.
  assert.ok(report.errors.every((e) => !/column|sql|ER_/i.test(String(e.error))));
  // Ni profil ni compte miroir orphelin pour la ligne en échec.
  const ghost = await queryOne('SELECT id FROM gl_players WHERE pseudo = ? LIMIT 1', [
    `lot6_s2_${stamp}`,
  ]);
  assert.ok(!ghost);
});

// ---------------------------------------------------------------------------------------------
// A2 — suppression d'une classe qui garde des joueurs inactifs
// ---------------------------------------------------------------------------------------------

test('A2 : DELETE /classes/:id refuse tant qu’il reste un joueur, même inactif', async () => {
  const cls = await createGlClass({ name: `Lot6 Suppr ${stamp}`, adminId: admin.id });
  const player = await createGlPlayer({
    classId: cls.id,
    pseudo: `lot6_inactif_${stamp}`,
    isActive: false,
  });

  const res = await auth(request(app).delete(`/api/gl/admin/classes/${cls.id}`)).expect(409);
  assert.match(String(res.body?.error || ''), /joueur/i);

  const stillThere = await queryOne('SELECT id FROM gl_players WHERE id = ? LIMIT 1', [player.id]);
  assert.ok(stillThere, 'le joueur inactif ne doit pas partir par la cascade SQL');
  const mirror = await queryOne('SELECT id FROM users WHERE id = ? LIMIT 1', [
    player.linked_foretmap_user_id,
  ]);
  assert.ok(mirror);

  // Une fois le joueur supprimé (purge complète), la classe part.
  await auth(request(app).delete(`/api/gl/admin/players/${player.id}`)).expect(200);
  await auth(request(app).delete(`/api/gl/admin/classes/${cls.id}`)).expect(200);
});

// ---------------------------------------------------------------------------------------------
// A3 — changement de classe d'un joueur engagé dans une partie
// ---------------------------------------------------------------------------------------------

test('A3 : PUT /players/:id refuse le changement de classe si le joueur est dans une partie non terminée de l’ancienne', async () => {
  const classA = await createGlClass({ name: `Lot6 A ${stamp}`, adminId: admin.id });
  const classB = await createGlClass({ name: `Lot6 B ${stamp}`, adminId: admin.id });
  const player = await createGlPlayer({ classId: classA.id, pseudo: `lot6_move_${stamp}` });
  const { chapter } = await createGlChapterWithMarker({ createdBy: admin.id });
  const { game, teams } = await createGlGameWithTeams({
    classId: classA.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    status: 'live',
    name: `Lot6 Partie ${stamp}`,
    teams: [{ name: 'Equipe', type: 'gnome' }],
  });
  await assignPlayerToGameTeam({ gameId: game.id, teamId: teams[0].id, playerId: player.id });

  const res = await auth(request(app).put(`/api/gl/admin/players/${player.id}`))
    .send({ classId: classB.id })
    .expect(409);
  assert.match(String(res.body?.error || ''), /partie/i);
  const unchanged = await queryOne('SELECT class_id FROM gl_players WHERE id = ?', [player.id]);
  assert.strictEqual(Number(unchanged.class_id), Number(classA.id));

  // Renvoyer la même classe, ou modifier autre chose, reste permis.
  await auth(request(app).put(`/api/gl/admin/players/${player.id}`))
    .send({ classId: classA.id, firstName: 'Autre' })
    .expect(200);

  // Partie terminée : le changement de classe passe.
  await execute("UPDATE gl_games SET status = 'ended' WHERE id = ?", [game.id]);
  await auth(request(app).put(`/api/gl/admin/players/${player.id}`))
    .send({ classId: classB.id })
    .expect(200);
  const moved = await queryOne('SELECT class_id FROM gl_players WHERE id = ?', [player.id]);
  assert.strictEqual(Number(moved.class_id), Number(classB.id));
});

// ---------------------------------------------------------------------------------------------
// A5 — activer / désactiver une classe n'efface pas son établissement
// ---------------------------------------------------------------------------------------------

test('A5 : PUT /classes/:id { isActive } conserve l’établissement ; une chaîne vide explicite le vide', async () => {
  const cls = await createGlClass({
    name: `Lot6 Ecole ${stamp}`,
    school: 'Ecole Test',
    adminId: admin.id,
  });
  const toggled = await auth(request(app).put(`/api/gl/admin/classes/${cls.id}`))
    .send({ isActive: false })
    .expect(200);
  assert.strictEqual(Number(toggled.body?.is_active), 0);
  assert.strictEqual(toggled.body?.school, 'Ecole Test');

  const cleared = await auth(request(app).put(`/api/gl/admin/classes/${cls.id}`))
    .send({ school: '' })
    .expect(200);
  assert.strictEqual(cleared.body?.school, null);
  assert.strictEqual(Number(cleared.body?.is_active), 0);
});

// ---------------------------------------------------------------------------------------------
// A7 — profil joueur : pseudo vide
// ---------------------------------------------------------------------------------------------

test('A7 : PATCH /api/gl/auth/me/profile avec un pseudo vide répond 400', async () => {
  const cls = await createGlClass({ name: `Lot6 Profil ${stamp}`, adminId: admin.id });
  const pseudo = `lot6_profil_${stamp}`;
  const password = `pw-${stamp}`;
  await createGlPlayer({ classId: cls.id, pseudo, password });
  const login = await request(app)
    .post('/api/gl/auth/login')
    .send({ pseudo, password })
    .expect(200);

  for (const empty of ['', '   ']) {
    const res = await request(app)
      .patch('/api/gl/auth/me/profile')
      .set('Authorization', `Bearer ${login.body.authToken}`)
      .send({ pseudo: empty, currentPassword: password })
      .expect(400);
    assert.match(String(res.body?.error || ''), /pseudo/i);
  }
  const row = await queryOne('SELECT pseudo FROM gl_players WHERE pseudo = ? LIMIT 1', [pseudo]);
  assert.ok(row);
});
