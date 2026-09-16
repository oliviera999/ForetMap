'use strict';

require('./helpers/setup');
const { test, before, afterEach } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { ensureAdminTeacherAuthToken, getAdminTeacherUserId } = require('./helpers/adminAuth');
const {
  recordAuthenticatedTouch,
  listActivityEvents,
  listUserPassageSummary,
  resetUserTrackingThrottleForTests,
  ACTIVITY_ACTIONS,
  normalizeAction,
} = require('../lib/userTracking');
const { buildAdminPresenceSnapshot } = require('../lib/adminPresence');
const { usageDay } = require('../lib/usage');
const { nowDbTimestamp } = require('../lib/shared/isoTimestamp');

before(async () => {
  await initSchema();
});

afterEach(() => {
  resetUserTrackingThrottleForTests();
});

test('liste blanche activité : actions connues seulement', () => {
  assert.ok(ACTIVITY_ACTIONS.includes('login'));
  assert.strictEqual(normalizeAction('LOGIN'), 'login');
  assert.strictEqual(normalizeAction('hack'), null);
});

test('GET /api/admin/presence : 401 sans auth, 200 admin, snapshot cohérent', async () => {
  const anonymous = await request(app).get('/api/admin/presence');
  assert.strictEqual(anonymous.status, 401);

  const token = await ensureAdminTeacherAuthToken();
  const adminId = await getAdminTeacherUserId();
  await execute('UPDATE users SET last_seen = ? WHERE id = ?', [nowDbTimestamp(), adminId]);

  const res = await request(app).get('/api/admin/presence').set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.counts);
  assert.ok(Array.isArray(res.body.users));
  assert.ok(res.body.users.some((u) => String(u.userId) === String(adminId)));

  const filtered = await request(app)
    .get('/api/admin/presence')
    .query({ product: 'gl' })
    .set('Authorization', `Bearer ${token}`);
  assert.strictEqual(filtered.status, 200);
  assert.ok(filtered.body.users.every((u) => u.product === 'gl'));
});

test('buildAdminPresenceSnapshot : online via refcount, recent via last_seen', async () => {
  const adminId = await getAdminTeacherUserId();
  await execute('UPDATE users SET last_seen = ? WHERE id = ?', [nowDbTimestamp(), adminId]);
  const snapshot = await buildAdminPresenceSnapshot({
    listOnlineEntries: () => [{ product: 'foret', userId: String(adminId) }],
  });
  const row = snapshot.users.find((u) => String(u.userId) === String(adminId));
  assert.ok(row);
  assert.strictEqual(row.status, 'online');
});

test('recordAuthenticatedTouch : login écrit activité + passage ; session_start throttle', async () => {
  const adminId = await getAdminTeacherUserId();
  await execute('DELETE FROM user_activity_events WHERE user_id = ?', [adminId]);
  await execute('DELETE FROM user_product_visits WHERE user_id = ?', [adminId]);

  await recordAuthenticatedTouch({
    product: 'foret',
    userType: 'teacher',
    userId: adminId,
    action: 'login',
  });
  await recordAuthenticatedTouch({
    product: 'foret',
    userType: 'teacher',
    userId: adminId,
    action: 'session_start',
  });
  await recordAuthenticatedTouch({
    product: 'foret',
    userType: 'teacher',
    userId: adminId,
    action: 'session_start',
  });

  const today = usageDay();
  const activity = await listActivityEvents({ from: today, to: today, userId: adminId });
  const logins = activity.filter((r) => r.action === 'login');
  const sessions = activity.filter((r) => r.action === 'session_start');
  assert.ok(logins.length >= 1);
  assert.strictEqual(sessions.length, 0, 'session_start throttlé après login');

  const visit = await queryOne(
    'SELECT open_count, product FROM user_product_visits WHERE user_id = ? AND product = ?',
    [adminId, 'foret'],
  );
  assert.ok(visit);
  assert.strictEqual(Number(visit.open_count), 1);
});

test('passage multi-produits + APIs admin activity / user-passage', async () => {
  const token = await ensureAdminTeacherAuthToken();
  const adminId = await getAdminTeacherUserId();
  resetUserTrackingThrottleForTests();

  await recordAuthenticatedTouch({
    product: 'gl',
    userType: 'teacher',
    userId: adminId,
    action: 'login',
  });

  const today = usageDay();
  const summary = await listUserPassageSummary({ from: today, to: today });
  assert.ok(summary.byProduct.some((p) => p.product === 'foret' || p.product === 'gl'));
  assert.ok(summary.multiProductUsers >= 1);

  const activityRes = await request(app)
    .get('/api/admin/activity')
    .query({ from: today, to: today })
    .set('Authorization', `Bearer ${token}`);
  assert.strictEqual(activityRes.status, 200);
  assert.ok(Array.isArray(activityRes.body.rows));

  const passageRes = await request(app)
    .get('/api/admin/user-passage')
    .query({ from: today, to: today })
    .set('Authorization', `Bearer ${token}`);
  assert.strictEqual(passageRes.status, 200);
  assert.ok(passageRes.body.multiProductUsers >= 1);

  const denied = await request(app).get('/api/admin/activity');
  assert.strictEqual(denied.status, 401);
});

test('invité / sans compte canonique : pas de ligne user_product_visits', async () => {
  const before = await queryOne('SELECT COUNT(*) AS n FROM user_product_visits');
  await recordAuthenticatedTouch({
    product: 'plan',
    userType: 'gl_player',
    userId: '999999001',
    action: 'login',
  });
  const after = await queryOne('SELECT COUNT(*) AS n FROM user_product_visits');
  assert.strictEqual(Number(after.n), Number(before.n));
});
