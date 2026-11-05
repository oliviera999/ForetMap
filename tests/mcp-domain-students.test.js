'use strict';

/**
 * Outil de domaine `foretmap_students` (lot D2) : lectures (liste, fiche de suivi,
 * chronologie, décrochage), écritures par le pont avec leur effet métier (fiche,
 * désactivation, lien de réinitialisation), refus nominatif sans bypass, domaine désactivé ;
 * et la nouvelle route `POST /api/rbac/users/:userType/:userId/reset-password-link`.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const fx = require('./helpers/mcpFixtures');
const { initSchema, queryOne, queryAll, execute } = require('../database');
const { hashResetToken } = require('../lib/passwordReset');

fx.enableMcpEnv();

const { app } = require('../server');

let adminToken;
let admin;
let s1;
let s2;
let groupId;
let tutorialId;

/** JWT applicatif d'un compte (même charge qu'une connexion, comme le pont). */
async function appToken(account, userType = 'teacher') {
  const { buildSessionPayload } = require('../lib/auth/sessionPayload');
  const { signJwtToken } = require('../lib/auth/jwtPipeline');
  const { JWT_SECRET } = require('../middleware/requireTeacher');
  const session = await buildSessionPayload(userType, account.id);
  return signJwtToken(
    { ...session.tokenPayload, sessionStartedAt: Math.floor(Date.now() / 1000) },
    JWT_SECRET,
    { expiresIn: 600 },
  );
}

const call = (name, args) => fx.callTool(app, adminToken, name, args);

test.before(async () => {
  await initSchema();
  admin = await fx.createAccount('admin');
  adminToken = (await fx.obtainTokens(app, admin)).access_token;
  s1 = await fx.createAccount('eleve_novice', { userType: 'student' });
  s2 = await fx.createAccount('eleve_novice', { userType: 'student' });
  groupId = `mcp-grp-${Date.now().toString(36)}`;
  await execute(
    "INSERT INTO `groups` (id, slug, name, kind, is_active) VALUES (?, ?, ?, 'class', 1)",
    [groupId, groupId, `Classe MCP ${groupId}`],
  );
  for (const s of [s1, s2]) {
    await execute(
      "INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, 'student')",
      [groupId, s.id],
    );
  }
  const stamp = Date.now().toString(36);
  const ins = await execute(
    "INSERT INTO tutorials (title, slug, type, html_content, is_active) VALUES (?, ?, 'html', '<p>x</p>', 1)",
    [`Tuto MCP ${stamp}`, `tuto-mcp-${stamp}`],
  );
  tutorialId = ins.insertId;
  const q = await queryOne(
    "SELECT question_code, categorie_slug FROM quiz_questions WHERE statut = 'actif' ORDER BY question_code LIMIT 1",
  );
  // Activité de s1 : une tentative juste, une fausse, une lecture.
  await execute(
    'INSERT INTO user_quiz_attempts (user_id, question_code, categorie_slug, is_correct) VALUES (?, ?, ?, 1), (?, ?, ?, 0)',
    [s1.id, q.question_code, q.categorie_slug, s1.id, q.question_code, q.categorie_slug],
  );
  await execute(
    "INSERT INTO user_tutorial_reads (user_id, tutorial_id, acknowledged_at) VALUES (?, ?, '2026-10-01 10:00:00')",
    [s1.id, tutorialId],
  );
});

test.after(async () => {
  await execute('DELETE FROM password_reset_tokens WHERE user_id IN (?, ?)', [s1.id, s2.id]);
  await execute('DELETE FROM tutorials WHERE id = ?', [tutorialId]);
  await execute('DELETE FROM `groups` WHERE id = ?', [groupId]);
  await fx.cleanupAccounts();
});

test.beforeEach(() => fx.enableMcpEnv());

test('list : recherche, filtre de groupe et actifs', async () => {
  const r = await call('foretmap_students', { action: 'list', q: s1.pseudo });
  assert.equal(r.isError, false, r.text);
  assert.equal(r.data.total, 1);
  assert.equal(r.data.items[0].id, s1.id);
  assert.ok(r.data.items[0].groups.some((g) => g.id === groupId));
  const byGroup = await call('foretmap_students', { action: 'list', group_id: groupId });
  assert.deepEqual(byGroup.data.items.map((u) => u.id).sort(), [s1.id, s2.id].sort());
});

test('get : fiche de suivi (quiz par catégorie et notion, lectures, dernière activité)', async () => {
  const r = await call('foretmap_students', { action: 'get', student_id: s1.id });
  assert.equal(r.isError, false, r.text);
  assert.equal(r.data.profile.id, s1.id);
  assert.ok(r.data.profile.groups.some((g) => g.id === groupId));
  assert.equal(r.data.quiz.attempts, 2);
  assert.equal(r.data.quiz.correct, 1);
  assert.equal(r.data.quiz.by_category[0].success_rate_percent, 50);
  assert.ok(Array.isArray(r.data.quiz.by_notion));
  assert.equal(r.data.tutorials_read.count, 1);
  assert.equal(r.data.tutorials_read.items[0].tutorial_id, tutorialId);
  assert.equal(r.data.journal_articles.count, 0);
  assert.ok(r.data.last_activity_at);
  // Audit de la lecture nominative.
  const audit = await queryOne(
    "SELECT id FROM audit_log WHERE action = 'mcp.privacy_bypass.read' AND target_id = ? AND details = 'get' ORDER BY id DESC LIMIT 1",
    ['foretmap_students'],
  );
  assert.ok(audit);
});

test('timeline et at_risk', async () => {
  const t = await call('foretmap_students', { action: 'timeline', student_id: s1.id });
  assert.equal(t.isError, false, t.text);
  const types = t.data.events.map((e) => e.type);
  assert.ok(types.includes('quiz'));
  assert.ok(types.includes('tutorial_read'));

  const risk = await call('foretmap_students', {
    action: 'at_risk',
    group_id: groupId,
    inactive_days: 1,
    min_attempts: 2,
    quiz_threshold: 60,
  });
  assert.equal(risk.isError, false, risk.text);
  assert.equal(risk.data.examined, 2);
  const f1 = risk.data.items.find((i) => i.id === s1.id);
  const f2 = risk.data.items.find((i) => i.id === s2.id);
  assert.ok(f1.reasons.includes('quiz_faible'));
  assert.ok(f2.reasons.includes('inactif'));
});

test('update, deactivate / reactivate : effet en base', async () => {
  const u = await call('foretmap_students', {
    action: 'update',
    student_id: s2.id,
    description: 'Suivi MCP',
  });
  assert.equal(u.isError, false, u.text);
  let row = await queryOne('SELECT description, is_active FROM users WHERE id = ?', [s2.id]);
  assert.equal(row.description, 'Suivi MCP');

  const d = await call('foretmap_students', { action: 'deactivate', student_id: s2.id });
  assert.equal(d.isError, false, d.text);
  row = await queryOne('SELECT is_active, deactivated_at FROM users WHERE id = ?', [s2.id]);
  assert.equal(Number(row.is_active), 0);
  const audit = await queryOne(
    "SELECT payload_json FROM audit_log WHERE action = 'user_deactivate' AND target_id = ? ORDER BY id DESC LIMIT 1",
    [s2.id],
  );
  const payload =
    typeof audit.payload_json === 'string' ? JSON.parse(audit.payload_json) : audit.payload_json;
  assert.equal(payload.via, 'mcp');

  const re = await call('foretmap_students', { action: 'reactivate', student_id: s2.id });
  assert.equal(re.isError, false, re.text);
  row = await queryOne('SELECT is_active FROM users WHERE id = ?', [s2.id]);
  assert.equal(Number(row.is_active), 1);
});

test('set_role : profil attribué ; merge en simulation sans effet', async () => {
  const role = await queryOne("SELECT id FROM roles WHERE slug = 'eleve_avance' LIMIT 1");
  const r = await call('foretmap_students', {
    action: 'set_role',
    student_id: s2.id,
    role_id: Number(role.id),
  });
  assert.equal(r.isError, false, r.text);
  const row = await queryOne('SELECT assigned_role_id FROM users WHERE id = ?', [s2.id]);
  assert.equal(Number(row.assigned_role_id), Number(role.id));

  const m = await call('foretmap_students', {
    action: 'merge',
    from_user_id: s2.id,
    into_user_id: s1.id,
  });
  // Simulation par défaut : quel que soit le verdict, les deux comptes restent.
  assert.ok(await queryOne('SELECT id FROM users WHERE id = ?', [s2.id]), m.text);
  assert.ok(await queryOne('SELECT id FROM users WHERE id = ?', [s1.id]));
});

test('create_bulk en simulation : rapport sans écriture', async () => {
  const last = `Mcpbulk${Date.now().toString(36)}`;
  const r = await call('foretmap_students', {
    action: 'create_bulk',
    dry_run: true,
    rows: [{ role: 'eleve_novice', first_name: 'Alix', last_name: last, password: 'Abcdef12!x' }],
  });
  assert.equal(r.isError, false, r.text);
  assert.equal(r.data.report.dryRun, true);
  assert.equal(r.data.report.totals.received, 1);
  assert.equal(await queryOne('SELECT id FROM users WHERE last_name = ?', [last]), undefined);
});

test('reset_password_link par l’outil : jeton créé, journal sans jeton', async () => {
  const r = await call('foretmap_students', { action: 'reset_password_link', student_id: s1.id });
  assert.equal(r.isError, false, r.text);
  assert.match(String(r.data.reset_link), /resetType=student/);
  const rows = await queryAll(
    'SELECT id FROM password_reset_tokens WHERE user_type = ? AND user_id = ? AND used_at IS NULL',
    ['student', s1.id],
  );
  assert.ok(rows.length >= 1);
  const audit = await queryOne(
    "SELECT payload_json, details FROM audit_log WHERE action = 'rbac_password_reset_link' AND target_id = ? ORDER BY id DESC LIMIT 1",
    [s1.id],
  );
  assert.ok(audit);
  assert.doesNotMatch(JSON.stringify(audit), /resetToken|reset_link/);
});

test('route reset-password-link : lien valide, gardes (soi-même, élève)', async () => {
  const token = await appToken(admin);
  const res = await request(app)
    .post(`/api/rbac/users/student/${s2.id}/reset-password-link`)
    .set('Authorization', `Bearer ${token}`)
    .send({});
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.user_type, 'student');
  const url = new URL(res.body.reset_link);
  const raw = url.searchParams.get('resetToken');
  assert.ok(raw && raw.length >= 32);
  const row = await queryOne(
    'SELECT user_id FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL',
    [hashResetToken(raw)],
  );
  assert.equal(row.user_id, s2.id);

  const self = await request(app)
    .post(`/api/rbac/users/teacher/${admin.id}/reset-password-link`)
    .set('Authorization', `Bearer ${token}`)
    .send({});
  assert.equal(self.status, 403);

  const studentToken = await appToken(s1, 'student');
  const denied = await request(app)
    .post(`/api/rbac/users/student/${s2.id}/reset-password-link`)
    .set('Authorization', `Bearer ${studentToken}`)
    .send({});
  assert.equal(denied.status, 403);

  const missing = await request(app)
    .post('/api/rbac/users/student/inconnu-xyz/reset-password-link')
    .set('Authorization', `Bearer ${token}`)
    .send({});
  assert.equal(missing.status, 404);
});

test('nominatif refusé sans bypass ; paramètre inattendu refusé', async () => {
  process.env.MCP_PRIVACY_BYPASS = 'false';
  const r = await call('foretmap_students', { action: 'list' });
  assert.equal(r.isError, true);
  assert.match(r.text, /bypass/);
  delete process.env.MCP_PRIVACY_BYPASS;
  const bad = await call('foretmap_students', { action: 'get', student_id: s1.id, q: 'x' });
  assert.equal(bad.isError, true);
});

test('domaine désactivé : outil absent et appel refusé', async () => {
  process.env.MCP_DOMAINS_DISABLED = 'students';
  const tools = await fx.listTools(app, adminToken);
  assert.ok(!tools.includes('foretmap_students'));
  const r = await call('foretmap_students', { action: 'list' });
  assert.equal(r.isError, true);
});
