'use strict';

/**
 * Codes d'accès des plans (plan public, plan des personnels, plan e-nov) : règles côté
 * serveur.
 *
 *  - longueur minimale d'un code enregistré (12 caractères) ;
 *  - échéance signée dans le laissez-passer (durée réglable, laissez-passer expiré, modifié ou
 *    au format antérieur refusé) ;
 *  - code d'un lien (`?code=`) : jamais recopié dans les journaux de requêtes ;
 *  - journal des saisies de code (`security_events`) : réussite et refus distingués, motif
 *    (code faux, absent, entrée désactivée, limiteur), jamais le code saisi ;
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const { codePassValue } = require('../lib/accessGate');
const { planAccessGate, enovPlanAccessGate } = require('../lib/planAccess');
const { staffPlanAccessGate } = require('../lib/staffPlanAccess');
const crypto = require('node:crypto');
const { initSchema, initDatabase, execute, queryAll } = require('../database');
const { app } = require('../server');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { setSetting, invalidateSettingsCache } = require('../lib/settings');
const { snapshotSetting, restoreSetting } = require('./helpers/settingsSnapshot');
const fx = require('./helpers/fmFixtures');

const TARGETS = Object.freeze([
  { route: 'plan', hashKey: 'security.plan_access_code_hash' },
  { route: 'staff-plan', hashKey: 'security.staff_plan_access_code_hash' },
  { route: 'enov-plan', hashKey: 'security.enov_plan_access_code_hash' },
]);

/** Les trois plans gardés par un code : routes, cookie, réglages. */
const SURFACES = Object.freeze([
  {
    id: 'plan',
    base: '/api/plan',
    cookie: 'plan_access',
    gate: planAccessGate,
    modeKey: 'ui.plan.access_mode',
    hashKey: 'security.plan_access_code_hash',
    daysKey: 'security.plan_access_pass_days',
    defaultDays: 30,
  },
  {
    id: 'enov',
    base: '/api/enov',
    cookie: 'enov_plan_access',
    gate: enovPlanAccessGate,
    modeKey: 'ui.enov_plan.access_mode',
    hashKey: 'security.enov_plan_access_code_hash',
    daysKey: 'security.enov_plan_access_pass_days',
    defaultDays: 30,
  },
  {
    id: 'staff',
    base: '/api/staff-plan',
    cookie: 'staff_plan_access',
    gate: staffPlanAccessGate,
    modeKey: 'ui.staff_plan.access_mode',
    hashKey: 'security.staff_plan_access_code_hash',
    daysKey: 'security.staff_plan_access_pass_days',
    defaultDays: 7,
  },
]);

const PLAN_CODE = 'code-de-plan-2026';

let adminToken;
let mapId;
const snapshots = [];

function cookieFrom(res, name) {
  const raw = [].concat(res.headers['set-cookie'] || []);
  return raw.find((c) => c.startsWith(`${name}=`)) || '';
}

function cookiePair(header) {
  return String(header || '').split(';')[0];
}

/** Ferme le plan par un code (empreinte posée directement, comme le ferait la console). */
async function closeWithCode(surface, code = PLAN_CODE) {
  const hash = await bcrypt.hash(code, 10);
  await setSetting(surface.modeKey, 'code', { userType: 'teacher', userId: 'test' });
  await setSetting(surface.hashKey, hash, { userType: 'admin', userId: 'test' });
  invalidateSettingsCache();
  return hash;
}

async function reopen(surface) {
  await setSetting(surface.modeKey, surface.id === 'staff' ? 'disabled' : 'public', {
    userType: 'teacher',
    userId: 'test',
  });
  await setSetting(surface.hashKey, '', { userType: 'admin', userId: 'test' });
  invalidateSettingsCache();
}

function setAccessCode(target, code) {
  return request(app)
    .post(`/api/settings/admin/${target}-access-code`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ code });
}

test.before(async () => {
  await initSchema();
  await initDatabase();
  await ensureRbacBootstrap();
  adminToken = await ensureAdminTeacherAuthToken({ elevated: true });
  mapId = (await fx.createMap({ label: 'Plan codes d’accès' })).id;
  for (const key of [
    'ui.plan.map_id',
    'ui.plan.access_mode',
    'ui.staff_plan.access_mode',
    'ui.enov_plan.access_mode',
    ...TARGETS.map((t) => t.hashKey),
    ...SURFACES.map((t) => t.daysKey),
  ]) {
    snapshots.push(await snapshotSetting(key));
  }
  await setSetting('ui.plan.map_id', mapId, { userType: 'teacher', userId: 'test' });
  invalidateSettingsCache();
});

test.beforeEach(async () => {
  adminToken = await ensureAdminTeacherAuthToken({ elevated: true });
  invalidateSettingsCache();
});

test.after(async () => {
  for (const snap of snapshots) await restoreSetting(snap);
  await execute('DELETE FROM maps WHERE id = ?', [mapId]);
  invalidateSettingsCache();
});

// --- Longueur minimale ---------------------------------------------------------------------

test('un code de moins de 12 caractères est refusé à l’enregistrement, sur les trois plans', async () => {
  for (const { route } of TARGETS) {
    const res = await setAccessCode(route, 'onze-carac.');
    assert.equal(res.status, 400, route);
    assert.match(res.body.error, /12 caractères minimum/, route);
  }
});

test('un code de 12 caractères est accepté (et l’effacement reste possible)', async () => {
  for (const { route, hashKey } of TARGETS) {
    const res = await setAccessCode(route, 'douze-carac.');
    assert.equal(res.status, 200, route);
    assert.equal(res.body.hasCode, true, route);
    const cleared = await setAccessCode(route, '');
    assert.equal(cleared.status, 200, route);
    assert.equal(cleared.body.hasCode, false, route);
    await setSetting(hashKey, '', { userType: 'admin', userId: 'test' });
  }
});

// --- Échéance signée du laissez-passer -----------------------------------------------------

test('laissez-passer : échéance signée, 30 jours (plan, e-nov) ou 7 jours (personnels)', async () => {
  for (const surface of SURFACES) {
    await closeWithCode(surface);
    try {
      const before = Math.floor(Date.now() / 1000);
      const granted = await request(app)
        .post(`${surface.base}/access`)
        .send({ code: PLAN_CODE })
        .expect(200);
      const header = cookieFrom(granted, surface.cookie);
      const ttl = surface.defaultDays * 24 * 3600;
      assert.match(header, new RegExp(`Max-Age=${ttl};`), surface.id);
      const value = decodeURIComponent(cookiePair(header).split('=').slice(1).join('='));
      const exp = Number(/~(\d+)\./.exec(value)?.[1]);
      assert.ok(exp >= before + ttl && exp <= before + ttl + 60, `${surface.id} : échéance ${exp}`);
      await request(app)
        .get(`${surface.base}/content`)
        .set('Cookie', cookiePair(header))
        .expect(200);
    } finally {
      await reopen(surface);
    }
  }
});

test('laissez-passer : durée réglable par plan, bornée à l’écriture', async () => {
  for (const surface of SURFACES) {
    await setSetting(surface.daysKey, 2, { userType: 'admin', userId: 'test' });
    await closeWithCode(surface);
    try {
      const granted = await request(app)
        .post(`${surface.base}/access`)
        .send({ code: PLAN_CODE })
        .expect(200);
      assert.match(cookieFrom(granted, surface.cookie), /Max-Age=172800;/, surface.id);
      for (const value of [0, 400]) {
        const res = await request(app)
          .put(`/api/settings/admin/${surface.daysKey}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ value });
        assert.equal(res.status, 400, `${surface.id} : ${value} jour(s) refusé`);
      }
    } finally {
      await reopen(surface);
      await execute('DELETE FROM app_settings WHERE `key` = ?', [surface.daysKey]);
      invalidateSettingsCache();
    }
  }
});

test('laissez-passer expiré, ou au format sans échéance : la porte reste fermée', async () => {
  for (const surface of SURFACES) {
    const hash = await closeWithCode(surface);
    try {
      const value = codePassValue(hash);
      const nowSeconds = Math.floor(Date.now() / 1000);
      const expired = surface.gate.build(value, { expiresAt: nowSeconds - 10 });
      const legacy = `${value}.${surface.gate.sign(value)}`;
      const valid = surface.gate.build(value, { expiresAt: nowSeconds + 3600 });
      for (const [label, raw] of [
        ['expiré', expired],
        ['sans échéance', legacy],
      ]) {
        const res = await request(app)
          .get(`${surface.base}/content`)
          .set('Cookie', `${surface.cookie}=${encodeURIComponent(raw)}`);
        assert.equal(res.status, 401, `${surface.id} : laissez-passer ${label}`);
      }
      // Témoin : le même laissez-passer avec une échéance à venir ouvre bien le plan.
      await request(app)
        .get(`${surface.base}/content`)
        .set('Cookie', `${surface.cookie}=${encodeURIComponent(valid)}`)
        .expect(200);
    } finally {
      await reopen(surface);
    }
  }
});

// --- Code d'un lien (?code=) et journaux de requêtes ----------------------------------------

test('journal des requêtes HTTP : le code d’un lien n’y figure pas (chemin seul)', async () => {
  // Garde de non-régression : `lib/httpRequestLog.js` journalise `req.path`, sans la chaîne
  // de requête. Un passage à `originalUrl` recopierait le code de chaque lien dans les logs.
  const express = require('express');
  const logger = require('../lib/logger');
  const logMetrics = require('../lib/logMetrics');
  const previousMode = process.env.FORETMAP_HTTP_LOG;
  process.env.FORETMAP_HTTP_LOG = 'full';
  const captured = [];
  const original = { info: logger.info, warn: logger.warn };
  logger.info = (...args) => captured.push(args);
  logger.warn = (...args) => captured.push(args);
  const originalRecord = logMetrics.recordHttpEnd;
  logMetrics.recordHttpEnd = (payload) => captured.push([payload]);
  try {
    const { createHttpRequestLogMiddleware } = require('../lib/httpRequestLog');
    const probe = express();
    probe.use(createHttpRequestLogMiddleware());
    probe.get('/api/plan/content', (req, res) => res.status(401).json({ access_required: true }));
    await request(probe).get(`/api/plan/content?code=${PLAN_CODE}&map_id=x`).expect(401);
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(captured.length > 0, 'la requête est bien journalisée');
    const serialized = JSON.stringify(captured);
    assert.ok(serialized.includes('/api/plan/content'));
    assert.ok(!serialized.includes(PLAN_CODE), 'le code ne figure dans aucune ligne');
  } finally {
    logger.info = original.info;
    logger.warn = original.warn;
    logMetrics.recordHttpEnd = originalRecord;
    if (previousMode === undefined) delete process.env.FORETMAP_HTTP_LOG;
    else process.env.FORETMAP_HTTP_LOG = previousMode;
  }
});

// --- Journal des saisies de code ------------------------------------------------------------

const WRONG_CODE = 'pas-le-bon-code-42';

/** Identifiant de requête propre à un appel : il retrouve la ligne du journal qu'il a écrite. */
function newRequestId(label) {
  return `codes-${label}-${crypto.randomUUID().slice(0, 8)}`;
}

/** Lignes `security_events` écrites par la requête `requestId`. */
async function journalRows(requestId) {
  return queryAll(
    `SELECT action, target_type, result, reason, ip_address, payload_json
       FROM security_events
      WHERE JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.requestId')) = ?
      ORDER BY id ASC`,
    [requestId],
  );
}

/** `payload_json` : objet (pilote mysql2, colonne JSON) ou chaîne selon le serveur. */
function payloadOf(row) {
  const raw = row?.payload_json;
  return typeof raw === 'string' ? JSON.parse(raw) : raw || {};
}

/** Le limiteur journalise sans retenir sa réponse 429 : on attend que la ligne arrive. */
async function waitForJournalRows(requestId, { attempts = 40 } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    const rows = await journalRows(requestId);
    if (rows.length) return rows;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return [];
}

async function journalRow(requestId, { wait = false } = {}) {
  const rows = wait ? await waitForJournalRows(requestId) : await journalRows(requestId);
  assert.equal(rows.length, 1, `une ligne attendue pour ${requestId}, ${rows.length} trouvée(s)`);
  const row = rows[0];
  const serialized = JSON.stringify(row);
  assert.ok(!serialized.includes(PLAN_CODE), 'le code saisi n’est jamais journalisé');
  assert.ok(!serialized.includes(WRONG_CODE), 'un code faux non plus');
  return row;
}

const JOURNAL_SURFACES = Object.freeze([
  { ...SURFACES[0], prefix: 'plan.access', targetType: 'plan' },
  { ...SURFACES[1], prefix: 'enov_plan.access', targetType: 'enov_plan' },
]);

test('journal des saisies (plan public, plan e-nov) : réussite et refus, motif, jamais le code', async () => {
  for (const surface of JOURNAL_SURFACES) {
    await closeWithCode(surface);
    try {
      const wrong = newRequestId(`${surface.id}-faux`);
      await request(app)
        .post(`${surface.base}/access`)
        .set('X-Request-Id', wrong)
        .send({ code: WRONG_CODE })
        .expect(401);
      const refused = await journalRow(wrong);
      assert.equal(refused.action, `${surface.prefix}.code_refused`, surface.id);
      assert.equal(refused.target_type, surface.targetType);
      assert.equal(refused.result, 'failure');
      assert.equal(refused.reason, 'code_invalid');
      assert.ok(refused.ip_address, 'adresse IP dans sa colonne');

      const empty = newRequestId(`${surface.id}-vide`);
      await request(app)
        .post(`${surface.base}/access`)
        .set('X-Request-Id', empty)
        .send({})
        .expect(400);
      const missing = await journalRow(empty);
      assert.equal(missing.result, 'failure');
      assert.equal(missing.reason, 'code_missing');

      const good = newRequestId(`${surface.id}-bon`);
      await request(app)
        .post(`${surface.base}/access`)
        .set('X-Request-Id', good)
        .send({ code: PLAN_CODE })
        .expect(200);
      const granted = await journalRow(good);
      assert.equal(granted.action, `${surface.prefix}.code_granted`);
      assert.equal(granted.result, 'success');
      assert.equal(granted.reason, null);

      // Lien porteur du code (clients antérieurs) : même journal, voie « link ».
      const linkWrong = newRequestId(`${surface.id}-lien-faux`);
      await request(app)
        .get(`${surface.base}/content?code=${WRONG_CODE}`)
        .set('X-Request-Id', linkWrong)
        .expect(401);
      const linkRefused = await journalRow(linkWrong);
      assert.equal(linkRefused.reason, 'code_invalid');
      assert.equal(payloadOf(linkRefused).via, 'link');

      const linkGood = newRequestId(`${surface.id}-lien-bon`);
      await request(app)
        .get(`${surface.base}/content?code=${PLAN_CODE}`)
        .set('X-Request-Id', linkGood)
        .expect(200);
      const linkGranted = await journalRow(linkGood);
      assert.equal(linkGranted.result, 'success');
      assert.equal(payloadOf(linkGranted).via, 'link');
    } finally {
      await reopen(surface);
    }
  }
});

test('journal des saisies (plan des personnels) : refus en échec, avec motif', async () => {
  const staff = SURFACES[2];
  // Entrée par code désactivée : refus « code_disabled ».
  await reopen(staff);
  const disabled = newRequestId('staff-desactive');
  await request(app)
    .post(`${staff.base}/access`)
    .set('X-Request-Id', disabled)
    .send({ code: PLAN_CODE })
    .expect(403);
  const off = await journalRow(disabled);
  assert.equal(off.action, 'staff_plan.access.code_refused');
  assert.equal(off.result, 'failure');
  assert.equal(off.reason, 'code_disabled');

  await closeWithCode(staff);
  try {
    const wrong = newRequestId('staff-faux');
    await request(app)
      .post(`${staff.base}/access`)
      .set('X-Request-Id', wrong)
      .send({ code: WRONG_CODE })
      .expect(401);
    const refused = await journalRow(wrong);
    assert.equal(refused.action, 'staff_plan.access.code_refused');
    assert.equal(refused.result, 'failure', 'un refus n’est plus inscrit comme une réussite');
    assert.equal(refused.reason, 'code_invalid');
    assert.ok(refused.ip_address, 'adresse IP dans sa colonne, plus dans le détail');
    assert.equal(payloadOf(refused).ip, undefined);
    // Le journal d'audit (lu par `audit.read`) porte le même résultat.
    const audit = await queryAll(
      `SELECT result FROM audit_log
        WHERE action = 'staff_plan.access.code_refused'
          AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.requestId')) = ?`,
      [wrong],
    );
    assert.deepEqual(
      audit.map((r) => r.result),
      ['failure'],
    );

    const good = newRequestId('staff-bon');
    await request(app)
      .post(`${staff.base}/access`)
      .set('X-Request-Id', good)
      .send({ code: PLAN_CODE })
      .expect(200);
    const granted = await journalRow(good);
    assert.equal(granted.action, 'staff_plan.access.code_granted');
    assert.equal(granted.result, 'success');
  } finally {
    await reopen(staff);
  }
});

test('journal des saisies : un refus du limiteur est inscrit (une fois par fenêtre)', async () => {
  const express = require('express');
  const rateLimit = require('express-rate-limit');
  const { authLimiterHandler } = require('../lib/rateLimit');
  const { resetCodeAccessLimiterJournal } = require('../lib/codeAccessJournal');
  resetCodeAccessLimiterJournal();
  // Un limiteur par chemin : ils compteraient sinon la même adresse ensemble.
  const strictLimiter = () =>
    rateLimit({
      windowMs: 60_000,
      limit: 1,
      standardHeaders: true,
      legacyHeaders: false,
      handler: authLimiterHandler,
    });
  const probe = express();
  probe.use(require('../lib/requestId').assignRequestId);
  // Comme `server.js` (plan des personnels, plan e-nov) et comme les routeurs (plan public).
  probe.use('/api/staff-plan/access', strictLimiter());
  probe.post('/api/plan/access', strictLimiter(), (req, res) => res.json({ ok: true }));
  probe.post('/api/staff-plan/access', (req, res) => res.json({ ok: true }));

  for (const [path, action] of [
    ['/api/plan/access', 'plan.access.code_refused'],
    ['/api/staff-plan/access', 'staff_plan.access.code_refused'],
  ]) {
    await request(probe).post(path).send({ code: WRONG_CODE }).expect(200);
    const limited = newRequestId('limiteur');
    await request(probe)
      .post(path)
      .set('X-Request-Id', limited)
      .send({ code: WRONG_CODE })
      .expect(429);
    const row = await journalRow(limited, { wait: true });
    assert.equal(row.action, action);
    assert.equal(row.result, 'failure');
    assert.equal(row.reason, 'rate_limited');

    // Les refus suivants de la même fenêtre ne remplissent pas le journal.
    const again = newRequestId('limiteur-bis');
    await request(probe)
      .post(path)
      .set('X-Request-Id', again)
      .send({ code: WRONG_CODE })
      .expect(429);
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal((await journalRows(again)).length, 0);
  }
  resetCodeAccessLimiterJournal();
});
