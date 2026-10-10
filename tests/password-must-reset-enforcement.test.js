'use strict';

/**
 * Mot de passe provisoire ou compromis (`users.password_must_reset = 1`) : le drapeau est
 * **appliqué** par le serveur, plus seulement signalé à la connexion.
 *
 * - routes à session **obligatoire** (`requireAuth`, `requirePermission`) : `403
 *   { code: 'PASSWORD_CHANGE_REQUIRED' }`, sauf la liste blanche minimale de « Mon profil »
 *   (`GET /api/auth/me`, `POST /api/auth/me/password`) ;
 * - routes à session **facultative** (`authenticate`, `parseOptionalForetAuth`, helpers
 *   `hydrateOptionalAuthFromTokenClaims`) : le compte y est traité en anonyme ;
 * - Socket.IO : connexion refusée (`unauthorized`), comme une session révoquée ;
 * - prise de contrôle : l'administrateur qui assiste un compte marqué n'est pas bloqué.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const express = require('express');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const { io: clientIo } = require('socket.io-client');
const { app } = require('../server');
const { initSchema, queryOne, execute } = require('../database');
const {
  JWT_SECRET,
  PASSWORD_CHANGE_REQUIRED_CODE,
  isPasswordChangeAllowedRoute,
  hydrateAuthFromTokenClaims,
  hydrateOptionalAuthFromTokenClaims,
} = require('../middleware/requireTeacher');
const { parseOptionalForetAuth, verifyJwtToken } = require('../lib/auth/jwtPipeline');
const { recomputeUserRole, setAssignedRole } = require('../lib/effectiveRole');
const { initRealtime, shutdownRealtime } = require('../lib/realtime');

test.before(async () => {
  await initSchema();
});

async function createAccount({ userType, password, mustReset = false }) {
  const id = crypto.randomUUID();
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const pseudo = `pmr_${stamp}`;
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, first_name, last_name, display_name,
                        password_hash, auth_provider, password_must_reset, is_active,
                        created_at, updated_at)
     VALUES (?, ?, ?, ?, 'Pmr', ?, ?, ?, 'local', ?, 1, NOW(), NOW())`,
    [
      id,
      userType,
      `${pseudo}@example.com`,
      pseudo,
      stamp,
      `Pmr ${stamp}`,
      await bcrypt.hash(password, 10),
      mustReset ? 1 : 0,
    ],
  );
  await recomputeUserRole(id);
  return { id, pseudo };
}

async function login(pseudo, password) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ identifier: pseudo, password })
    .expect(200);
  assert.ok(res.body.authToken, 'jeton attendu à la connexion');
  return res.body;
}

function expectPasswordChangeRequired(res) {
  assert.equal(res.status, 403, `403 attendu, reçu ${res.status} (${JSON.stringify(res.body)})`);
  assert.equal(res.body.code, PASSWORD_CHANGE_REQUIRED_CODE);
  assert.match(String(res.body.error), /Mon profil/);
}

async function createAdmin() {
  const adminRole = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  assert.ok(adminRole?.id, 'rôle admin requis');
  const password = 'AdminSolide!2026';
  const admin = await createAccount({ userType: 'teacher', password });
  await setAssignedRole(admin.id, adminRole.id);
  return { ...admin, password };
}

test('élève marqué : routes strictes refusées, « Mon profil » ouvert, changement libérateur', async () => {
  const student = await createAccount({
    userType: 'student',
    password: 'provisoire1',
    mustReset: true,
  });
  const session = await login(student.pseudo, 'provisoire1');
  assert.equal(session.passwordMustReset, true);
  const token = session.authToken;
  const bearer = (req) => req.set('Authorization', `Bearer ${token}`);

  // Routes strictes (requireAuth) : refusées avec le code dédié.
  expectPasswordChangeRequired(await bearer(request(app).get(`/api/stats/me/${student.id}`)));
  expectPasswordChangeRequired(await bearer(request(app).get('/api/notifications')));
  // Modifier son profil n'est pas dans la liste blanche : seul le mot de passe se change.
  expectPasswordChangeRequired(
    await bearer(request(app).patch('/api/auth/me/profile').send({ description: 'x' })),
  );

  // Liste blanche : restauration de session et lecture du drapeau.
  const me = await bearer(request(app).get('/api/auth/me')).expect(200);
  assert.equal(me.body.passwordMustReset, true);
  assert.equal(me.body.auth?.userId, student.id);

  const changed = await bearer(
    request(app)
      .post('/api/auth/me/password')
      .send({ currentPassword: 'provisoire1', newPassword: 'definitif1234' }),
  ).expect(200);
  assert.ok(changed.body.authToken, 'jeton neuf attendu');

  const row = await queryOne('SELECT password_must_reset FROM users WHERE id = ?', [student.id]);
  assert.equal(Number(row.password_must_reset), 0);

  // Nouveau jeton : tout fonctionne de nouveau.
  const fresh = (req) => req.set('Authorization', `Bearer ${changed.body.authToken}`);
  await fresh(request(app).get(`/api/stats/me/${student.id}`)).expect(200);
  const meAfter = await fresh(request(app).get('/api/auth/me')).expect(200);
  assert.equal(meAfter.body.passwordMustReset, false);

  // Ancien jeton : révoqué par l'époque (changement de mot de passe).
  const revoked = await bearer(request(app).get('/api/auth/me')).expect(401);
  assert.equal(revoked.body.code, 'SESSION_REVOKED');

  const relogin = await login(student.pseudo, 'definitif1234');
  assert.equal(relogin.passwordMustReset, false);
});

test('enseignant administrateur marqué : permission refusée (prise de contrôle) jusqu’au changement', async () => {
  const admin = await createAdmin();
  await execute('UPDATE users SET password_must_reset = 1 WHERE id = ?', [admin.id]);
  const target = await createAccount({ userType: 'student', password: 'cible12345' });
  const session = await login(admin.pseudo, admin.password);
  assert.equal(session.passwordMustReset, true);

  // `requirePermission('admin.impersonate')` : bloqué avant même le contrôle de permission.
  expectPasswordChangeRequired(
    await request(app)
      .post('/api/auth/admin/impersonate')
      .set('Authorization', `Bearer ${session.authToken}`)
      .send({ userType: 'student', userId: target.id }),
  );

  const changed = await request(app)
    .post('/api/auth/me/password')
    .set('Authorization', `Bearer ${session.authToken}`)
    .send({ currentPassword: admin.password, newPassword: 'NouveauSolide!2026' })
    .expect(200);
  const imp = await request(app)
    .post('/api/auth/admin/impersonate')
    .set('Authorization', `Bearer ${changed.body.authToken}`)
    .send({ userType: 'student', userId: target.id })
    .expect(200);
  assert.equal(imp.body.auth?.impersonating, true);
});

test('prise de contrôle d’un compte marqué : l’administrateur n’est pas bloqué', async () => {
  const admin = await createAdmin();
  const adminSession = await login(admin.pseudo, admin.password);
  const target = await createAccount({
    userType: 'student',
    password: 'cible12345',
    mustReset: true,
  });

  const imp = await request(app)
    .post('/api/auth/admin/impersonate')
    .set('Authorization', `Bearer ${adminSession.authToken}`)
    .send({ userType: 'student', userId: target.id })
    .expect(200);
  const asTarget = (req) => req.set('Authorization', `Bearer ${imp.body.authToken}`);

  await asTarget(request(app).get(`/api/stats/me/${target.id}`)).expect(200);
  const me = await asTarget(request(app).get('/api/auth/me')).expect(200);
  assert.equal(me.body.passwordMustReset, false);
  assert.equal(me.body.auth?.impersonating, true);

  const hydrated = await hydrateAuthFromTokenClaims(verifyJwtToken(imp.body.authToken, JWT_SECRET));
  assert.equal(hydrated.passwordMustReset, false);
  assert.equal(hydrated.impersonating, true);

  // Le compte lui-même, connecté de son côté, reste bloqué.
  const own = await login(target.pseudo, 'cible12345');
  expectPasswordChangeRequired(
    await request(app)
      .get(`/api/stats/me/${target.id}`)
      .set('Authorization', `Bearer ${own.authToken}`),
  );
});

test('routes à session facultative : un compte marqué y est traité en anonyme', async () => {
  const student = await createAccount({
    userType: 'student',
    password: 'provisoire1',
    mustReset: true,
  });
  const session = await login(student.pseudo, 'provisoire1');
  const req = { headers: { authorization: `Bearer ${session.authToken}` } };
  const claims = verifyJwtToken(session.authToken, JWT_SECRET);

  // `authenticate` : la route de préférence mascotte exige un compte → 401 comme un anonyme.
  const mascot = await request(app)
    .put('/api/visit/mascot-preference')
    .set('Authorization', `Bearer ${session.authToken}`)
    .send({ visit_mascot_catalog_id: '' });
  assert.equal(mascot.status, 401);
  assert.equal(mascot.body.error, 'Authentification requise');

  // `parseOptionalForetAuth` (tâches, plan des personnels) et helper des routes publiques.
  assert.equal(
    await parseOptionalForetAuth(req, { jwtSecret: JWT_SECRET, hydrateAuthFromTokenClaims }),
    null,
  );
  assert.equal(await hydrateOptionalAuthFromTokenClaims(claims), null);
  // L'hydratation brute, elle, connaît le compte et porte le drapeau.
  const raw = await hydrateAuthFromTokenClaims(claims);
  assert.equal(raw.userId, student.id);
  assert.equal(raw.passwordMustReset, true);

  // Drapeau levé : la session facultative redevient celle du compte.
  await execute('UPDATE users SET password_must_reset = 0 WHERE id = ?', [student.id]);
  const optional = await parseOptionalForetAuth(req, {
    jwtSecret: JWT_SECRET,
    hydrateAuthFromTokenClaims,
  });
  assert.equal(optional?.userId, student.id);
  assert.equal(optional?.passwordMustReset, false);
  assert.equal((await hydrateOptionalAuthFromTokenClaims(claims))?.userId, student.id);
  await request(app)
    .put('/api/visit/mascot-preference')
    .set('Authorization', `Bearer ${session.authToken}`)
    .send({ visit_mascot_catalog_id: '' })
    .expect(200);
});

test('liste blanche : méthode et chemin exacts (casse et barre finale tolérées)', () => {
  const at = (method, baseUrl, path) => isPasswordChangeAllowedRoute({ method, baseUrl, path });
  assert.equal(at('GET', '/api/auth', '/me'), true);
  assert.equal(at('get', '/API/Auth', '/ME/'), true);
  assert.equal(at('POST', '/api/auth', '/me/password'), true);
  assert.equal(at('POST', '/api/auth', '/me'), false);
  assert.equal(at('GET', '/api/auth', '/me/password'), false);
  assert.equal(at('PATCH', '/api/auth', '/me/profile'), false);
  assert.equal(at('GET', '/api/auth', '/me/export'), false);
  assert.equal(at('GET', '/api/stats', '/me/42'), false);
  assert.equal(at('GET', '', '/api/auth/me'), true);
  assert.equal(at('GET', '/api/gl/auth', '/me'), false);
});

test('Socket.IO : connexion refusée à un compte marqué', async () => {
  const student = await createAccount({
    userType: 'student',
    password: 'provisoire1',
    mustReset: true,
  });
  const session = await login(student.pseudo, 'provisoire1');
  const server = http.createServer(express());
  initRealtime(server);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  const socket = clientIo(`http://127.0.0.1:${port}`, {
    path: '/socket.io',
    transports: ['polling'],
    upgrade: false,
    timeout: 4000,
    reconnection: false,
    auth: { token: session.authToken },
  });
  try {
    await new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('timeout connect_error attendu')), 6000);
      socket.once('connect', () => {
        clearTimeout(to);
        reject(new Error('la connexion d’un compte marqué ne devrait pas aboutir'));
      });
      socket.once('connect_error', (err) => {
        clearTimeout(to);
        assert.match(String(err?.message || err), /unauthorized/i);
        resolve();
      });
    });
  } finally {
    socket.close();
    await new Promise((resolve) => server.close(() => resolve()));
    await shutdownRealtime();
  }
});
