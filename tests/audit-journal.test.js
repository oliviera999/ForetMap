'use strict';

/**
 * Journal enrichi (historique, sécurité, onglet Utilisateurs) : catalogue d'actions pur,
 * schémas de requête, puis routes `/api/audit/history|catalog|users` sur la base de test.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const { initSchema, execute, queryOne } = require('../database');
const { app } = require('../server');
const request = require('supertest');
const { signAuthToken } = require('../middleware/requireTeacher');
const { ensureAdminTeacherAuthToken, getAdminTeacherUserId } = require('./helpers/adminAuth');
const {
  categoryOf,
  isMajorAction,
  describeAction,
  humanizeAction,
  reasonLabel,
  catalogPayload,
  CATEGORY_IDS,
} = require('../lib/auditJournal/catalog');
const { usersQuerySchema, historyQuerySchema } = require('../routes/audit');
const { securityEventsToCsv } = require('../lib/securityEventsQuery');

// ── Catalogue (sans BDD) ─────────────────────────────────────────────────────

test('catalogue : catégories des actions courantes', () => {
  assert.equal(categoryOf('auth.login'), 'auth');
  assert.equal(categoryOf('auth.login.teacher.oauth_google'), 'auth');
  assert.equal(categoryOf('auth.totp.enroll'), 'security');
  assert.equal(categoryOf('rbac_assign_role'), 'security');
  assert.equal(categoryOf('auth_impersonate_start'), 'security');
  assert.equal(categoryOf('delete_student'), 'users');
  assert.equal(categoryOf('groups_import'), 'users');
  assert.equal(categoryOf('validate_task'), 'tasks');
  assert.equal(categoryOf('validate_task_project'), 'tasks');
  assert.equal(categoryOf('create_zone'), 'content');
  assert.equal(categoryOf('map_category_reorder'), 'content');
  assert.equal(categoryOf('forum_post_create'), 'community');
  assert.equal(categoryOf('settings_update'), 'settings');
  assert.equal(categoryOf('moodle_sync_run'), 'settings');
  assert.equal(categoryOf('mcp.sql.execute'), 'mcp');
  assert.equal(categoryOf('gl.auth.impersonate.start'), 'gl');
  assert.equal(categoryOf('gl_players_import'), 'gl');
  assert.equal(categoryOf('quelque_chose_inconnu'), 'other');
});

test('catalogue : la routine n’est pas principale, un échec l’est toujours', () => {
  assert.equal(isMajorAction('auth.login'), false);
  assert.equal(isMajorAction('assign_task'), false);
  assert.equal(isMajorAction('map_category_reorder'), false);
  assert.equal(isMajorAction('forum_post_reaction_toggle'), false);
  assert.equal(isMajorAction('update_zone'), false);
  assert.equal(isMajorAction('delete_task'), true);
  assert.equal(isMajorAction('validate_task'), true);
  assert.equal(isMajorAction('rbac_update_profile_permissions'), true);
  assert.equal(isMajorAction('auth_impersonate_start'), true);
  assert.equal(describeAction('auth.login', 'success').major, false);
  const failed = describeAction('auth.login', 'failure');
  assert.equal(failed.major, true);
  assert.equal(failed.failure, true);
  assert.equal(failed.action_label, 'Connexion');
  assert.equal(failed.category_label, 'Connexions & inscriptions');
});

test('catalogue : libellé fabriqué pour une action sans entrée explicite', () => {
  assert.equal(humanizeAction('create_species'), 'Création espèce');
  assert.equal(humanizeAction('delete_glossary_term'), 'Suppression glossaire terme');
  assert.match(describeAction('settings_brand_update').action_label, /^Modification/);
  assert.notEqual(describeAction('xyz_inconnu').action_label, '');
});

test('catalogue : motifs traduits', () => {
  assert.equal(reasonLabel('account_not_found'), 'Compte introuvable');
  assert.equal(reasonLabel('password_invalid'), 'Mot de passe incorrect');
  assert.equal(reasonLabel(null), null);
  assert.equal(reasonLabel('motif_maison'), 'Motif maison');
});

test('catalogue : charge sérialisable cohérente', () => {
  const payload = catalogPayload();
  assert.deepEqual(
    payload.categories.map((c) => c.id),
    CATEGORY_IDS,
  );
  assert.ok(payload.actions.length > 50);
  for (const a of payload.actions) {
    assert.ok(CATEGORY_IDS.includes(a.category), a.action);
    assert.ok(a.label);
  }
});

test('schémas : filtres tolérants (valeurs hors liste ignorées, mode par défaut « all »)', () => {
  const h = historyQuerySchema.parse({ mode: 'MAIN', category: 'inconnue', limit: '9999' });
  assert.equal(h.mode, 'main');
  assert.equal(h.category, undefined);
  assert.equal(h.limit, 200);
  const d = historyQuerySchema.parse({});
  assert.equal(d.mode, 'all');
  const u = usersQuerySchema.parse({ source: 'SECURITY', sort: 'count', actorType: 'student' });
  assert.equal(u.source, 'security');
  assert.equal(u.sort, 'count');
  assert.equal(u.actorType, 'student');
  assert.equal(usersQuerySchema.parse({ source: 'autre', sort: 'x' }).source, undefined);
});

test('export CSV : colonnes lisibles (nom, libellé, cible)', () => {
  const csv = securityEventsToCsv([
    {
      id: 1,
      action: 'create_zone',
      action_label: 'Création zone',
      category_label: 'Contenus & cartes',
      actor: { name: 'Alice Martin' },
      target_label: 'Mare',
    },
  ]);
  const [header, line] = csv.split('\n');
  assert.ok(header.includes('actor_name'));
  assert.ok(header.includes('action_label'));
  assert.ok(header.includes('target_label'));
  assert.ok(line.includes('Alice Martin'));
  assert.ok(line.includes('Création zone'));
  assert.ok(line.includes('Mare'));
});

// ── Routes (BDD) ─────────────────────────────────────────────────────────────

let adminToken = '';
let adminUserId = '';
let adminDisplayName = '';

async function createProfToken() {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const teacherId = `teacher-prof-journal-${stamp}`.slice(0, 64);
  const role = await queryOne("SELECT id FROM roles WHERE slug = 'prof' LIMIT 1");
  assert.ok(role?.id, 'Rôle prof introuvable');
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, display_name, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'teacher', ?, ?, ?, 'x', 'local', 1, NOW(), NOW())`,
    [teacherId, `${teacherId}@foretmap.local`, teacherId, `Prof journal ${stamp}`],
  );
  await execute(
    `INSERT INTO user_roles (user_type, user_id, role_id, is_primary)
     VALUES ('teacher', ?, ?, 1)
     ON DUPLICATE KEY UPDATE role_id = VALUES(role_id), is_primary = 1`,
    [teacherId, role.id],
  );
  await execute('UPDATE users SET assigned_role_id = ? WHERE id = ?', [role.id, teacherId]);
  await execute('INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)', [
    role.id,
    'audit.read',
  ]);
  await execute('DELETE FROM role_permissions WHERE role_id = ? AND permission_key = ?', [
    role.id,
    'audit.security.read',
  ]);
  return signAuthToken({
    userType: 'teacher',
    userId: teacherId,
    canonicalUserId: teacherId,
    roleId: role.id,
    roleSlug: 'prof',
    roleDisplayName: 'Prof',
  });
}

let zoneId = '';
let zoneName = '';

test.before(async () => {
  await initSchema();
  adminToken = await ensureAdminTeacherAuthToken();
  adminUserId = await getAdminTeacherUserId();
  adminDisplayName = `Admin Journal ${Date.now()}`;
  await execute('UPDATE users SET display_name = ? WHERE id = ?', [adminDisplayName, adminUserId]);
  zoneName = `Zone journal ${Date.now()}`;
  const res = await request(app)
    .post('/api/zones')
    .set('Authorization', `Bearer ${adminToken}`)
    .set('User-Agent', 'ForetMap-Journal-Test/1.0')
    .send({
      name: zoneName,
      map_id: 'foret',
      points: [
        { xp: 10, yp: 10 },
        { xp: 20, yp: 10 },
        { xp: 15, yp: 20 },
      ],
      color: '#228B22',
    })
    .expect(201);
  zoneId = String(res.body.id);
});

test('GET /api/audit/catalog : catégories pour audit.read', async () => {
  const res = await request(app)
    .get('/api/audit/catalog')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(res.body.categories.some((c) => c.id === 'security'));
  await request(app).get('/api/audit/catalog').expect(401);
});

test('GET /api/audit/history : lignes enrichies (acteur nommé, libellé, cible lisible)', async () => {
  const res = await request(app)
    .get('/api/audit/history?mode=main&category=content&limit=50')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.equal(typeof res.body.total, 'number');
  const row = res.body.rows.find((r) => r.action === 'create_zone' && r.target_id === zoneId);
  assert.ok(row, 'création de zone attendue');
  assert.equal(row.action_label, 'Création zone');
  assert.equal(row.category, 'content');
  assert.equal(row.major, true);
  assert.equal(row.actor.id, String(adminUserId));
  assert.equal(row.actor.name, adminDisplayName);
  assert.equal(row.target_label, zoneName);
  // L'historique ne divulgue ni IP ni navigateur.
  assert.equal(row.ip_address, undefined);
  assert.equal(row.user_agent, undefined);
});

test('GET /api/audit/history : recherche par nom d’utilisateur et catégorie exclusive', async () => {
  const byName = await request(app)
    .get(`/api/audit/history?actorQuery=${encodeURIComponent(adminDisplayName.slice(0, 13))}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(byName.body.rows.length > 0);
  assert.ok(byName.body.rows.every((r) => r.actor?.id === String(adminUserId)));

  const otherCat = await request(app)
    .get('/api/audit/history?category=community&limit=200')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(otherCat.body.rows.every((r) => r.category === 'community'));
});

test('GET /api/audit/security : vue « principaux » sans connexions réussies, échecs gardés', async () => {
  const ua = `Journal-Mode-Test-${Date.now()}`;
  await execute(
    `INSERT INTO security_events (occurred_at, actor_user_id, actor_user_type, action, result, reason, ip_address, user_agent)
     VALUES (NOW(), ?, 'teacher', 'auth.login', 'success', NULL, '10.9.9.9', ?),
            (NOW(), ?, 'teacher', 'auth.login', 'failure', 'password_invalid', '10.9.9.9', ?)`,
    [adminUserId, ua, adminUserId, ua],
  );
  const main = await request(app)
    .get(`/api/audit/security?mode=main&q=${encodeURIComponent(ua)}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.equal(main.body.rows.length, 1);
  assert.equal(main.body.rows[0].result, 'failure');
  assert.equal(main.body.rows[0].reason_label, 'Mot de passe incorrect');
  assert.equal(main.body.rows[0].actor.name, adminDisplayName);

  const all = await request(app)
    .get(`/api/audit/security?mode=all&q=${encodeURIComponent(ua)}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.equal(all.body.rows.length, 2);

  const failures = await request(app)
    .get(`/api/audit/security?result=failure&q=${encodeURIComponent(ua)}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.equal(failures.body.rows.length, 1);
});

test('GET /api/audit/users : agrégat par compte (source sécurité pour un admin)', async () => {
  const res = await request(app)
    .get('/api/audit/users?sort=count')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.equal(res.body.source, 'security');
  const me = res.body.rows.find((r) => r.actor.id === String(adminUserId));
  assert.ok(me, 'admin attendu dans la liste');
  assert.equal(me.actor.name, adminDisplayName);
  assert.ok(me.total >= 1);
  assert.ok(Array.isArray(me.top_actions));
  assert.ok(me.top_actions.every((t) => t.action_label));
});

test('GET /api/audit/users/:id : fiche (catégories, actions, IP)', async () => {
  const res = await request(app)
    .get(`/api/audit/users/${encodeURIComponent(adminUserId)}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.equal(res.body.user.id, String(adminUserId));
  assert.equal(res.body.user.name, adminDisplayName);
  assert.ok(res.body.totals.total >= 1);
  assert.ok(res.body.by_category.length >= 1);
  assert.ok(res.body.top_actions.length >= 1);
  assert.ok(Array.isArray(res.body.ips));
});

test('prof (audit.read sans sécurité) : historique et utilisateurs en source audit, sécurité → 403', async () => {
  const token = await createProfToken();
  await request(app).get('/api/audit/history').set('Authorization', `Bearer ${token}`).expect(200);
  const users = await request(app)
    .get('/api/audit/users')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.equal(users.body.source, 'audit');
  await request(app)
    .get('/api/audit/users?source=security')
    .set('Authorization', `Bearer ${token}`)
    .expect(403);
  const detail = await request(app)
    .get(`/api/audit/users/${encodeURIComponent(adminUserId)}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.equal(detail.body.source, 'audit');
  assert.deepEqual(detail.body.ips, []);
});

test('prise de contrôle : le compte contrôlé (charge `target_user_id`) devient la cible lisible', async () => {
  const stamp = `${Date.now()}`;
  const targetId = `student-journal-${stamp}`;
  await execute(
    `INSERT INTO users (id, user_type, pseudo, display_name, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'student', ?, ?, 'x', 'local', 1, NOW(), NOW())`,
    [targetId, targetId, `Élève contrôlé ${stamp}`],
  );
  await execute(
    `INSERT INTO audit_log (action, target_type, target_id, details, created_at, actor_user_type, actor_user_id, result, occurred_at, payload_json)
     VALUES ('auth_impersonate_stop', 'auth', ?, 'Fin prise de contrôle compte', UTC_TIMESTAMP(3), 'teacher', ?, 'success', UTC_TIMESTAMP(), ?)`,
    [
      adminUserId,
      adminUserId,
      JSON.stringify({ target_user_type: 'student', target_user_id: targetId }),
    ],
  );
  const res = await request(app)
    .get('/api/audit/history?mode=all&action=auth_impersonate_stop')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const row = res.body.rows.find((r) => r.payload?.target_user_id === targetId);
  assert.ok(row);
  assert.equal(row.target_label, `Élève contrôlé ${stamp}`);
  assert.equal(row.action_label, 'Fin de prise de contrôle');
});
