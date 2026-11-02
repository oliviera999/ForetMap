'use strict';

/**
 * Mot de passe des plans (plan public, plan e-nov, plan des personnels) : troisième mode
 * d'accès, à côté du code d'accès (`lib/accessSecret.js`).
 *
 *  - règles d'enregistrement : 12 à 64 caractères, au moins une lettre et un chiffre ;
 *  - empreinte propre, distincte de celle du code, jamais écrite par `PUT /admin/:key` ;
 *  - saisie : casse respectée, réponse qui dit « mot de passe » (`access_kind`) ;
 *  - jamais par un lien : `?code=` ignoré, `POST /access` avec `via: 'link'` refusé (403), et
 *    le refus est inscrit au journal (`link_disabled`) ;
 *  - cloisonnement : un laissez-passer obtenu avec le code n'ouvre pas la porte du mot de
 *    passe ;
 *  - plan des personnels : la voie secondaire accepte le mot de passe à la place du code.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const { initSchema, initDatabase, execute, queryAll } = require('../database');
const { app } = require('../server');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { setSetting, invalidateSettingsCache } = require('../lib/settings');
const { snapshotSetting, restoreSetting } = require('./helpers/settingsSnapshot');
const {
  ACCESS_SECRET_HASH_KEYS,
  accessSecretKindForMode,
  validateAccessSecret,
} = require('../lib/accessSecret');
const fx = require('./helpers/fmFixtures');

const SURFACES = Object.freeze([
  {
    id: 'plan',
    route: 'plan',
    base: '/api/plan',
    cookie: 'plan_access',
    modeKey: 'ui.plan.access_mode',
    openMode: 'public',
    codeKey: 'security.plan_access_code_hash',
    passwordKey: 'security.plan_access_password_hash',
    journalPrefix: 'plan.access',
  },
  {
    id: 'enov',
    route: 'enov-plan',
    base: '/api/enov',
    cookie: 'enov_plan_access',
    modeKey: 'ui.enov_plan.access_mode',
    openMode: 'public',
    codeKey: 'security.enov_plan_access_code_hash',
    passwordKey: 'security.enov_plan_access_password_hash',
    journalPrefix: 'enov_plan.access',
  },
  {
    id: 'staff',
    route: 'staff-plan',
    base: '/api/staff-plan',
    cookie: 'staff_plan_access',
    modeKey: 'ui.staff_plan.access_mode',
    openMode: 'disabled',
    codeKey: 'security.staff_plan_access_code_hash',
    passwordKey: 'security.staff_plan_access_password_hash',
    journalPrefix: 'staff_plan.access',
  },
]);

const PUBLIC_SURFACES = SURFACES.filter((s) => s.id !== 'staff');
const STAFF = SURFACES.find((s) => s.id === 'staff');

const PASSWORD = 'Enov2026Jury';
const CODE = 'code-de-diffusion-2026';

let adminToken;
let mapId;
const snapshots = [];

function cookieFrom(res, name) {
  const raw = [].concat(res.headers['set-cookie'] || []);
  return String(raw.find((c) => c.startsWith(`${name}=`)) || '').split(';')[0];
}

async function configure(surface, { mode, code = '', password = '' }) {
  const by = { userType: 'admin', userId: 'test' };
  await setSetting(surface.modeKey, mode, by);
  await setSetting(surface.codeKey, code ? await bcrypt.hash(code, 10) : '', by);
  await setSetting(surface.passwordKey, password ? await bcrypt.hash(password, 10) : '', by);
  invalidateSettingsCache();
}

async function reopen(surface) {
  await configure(surface, { mode: surface.openMode });
}

function setPassword(route, value) {
  return request(app)
    .post(`/api/settings/admin/${route}-access-password`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ code: value });
}

function newRequestId(label) {
  return `mdp-${label}-${crypto.randomUUID().slice(0, 8)}`;
}

async function journalRow(requestId) {
  const rows = await queryAll(
    `SELECT action, result, reason, payload_json
       FROM security_events
      WHERE JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.requestId')) = ?
      ORDER BY id ASC`,
    [requestId],
  );
  assert.equal(rows.length, 1, `une ligne attendue pour ${requestId}, ${rows.length} trouvée(s)`);
  const row = rows[0];
  assert.ok(!JSON.stringify(row).includes(PASSWORD), 'le mot de passe n’est jamais journalisé');
  const raw = row.payload_json;
  return { ...row, payload: typeof raw === 'string' ? JSON.parse(raw) : raw || {} };
}

test.before(async () => {
  await initSchema();
  await initDatabase();
  await ensureRbacBootstrap();
  adminToken = await ensureAdminTeacherAuthToken({ elevated: true });
  mapId = (await fx.createMap({ label: 'Plan mots de passe' })).id;
  for (const key of [
    'ui.plan.map_id',
    ...SURFACES.flatMap((s) => [s.modeKey, s.codeKey, s.passwordKey]),
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

// --- Règles (pures) -------------------------------------------------------------------------

test('règles : un mot de passe fait 12 caractères et mêle lettres et chiffres', () => {
  assert.equal(validateAccessSecret('password', ''), null, 'vide = effacement');
  assert.match(validateAccessSecret('password', 'Court2026'), /12 caractères minimum/);
  assert.match(validateAccessSecret('password', 'QueDesLettresIci'), /lettres et chiffres/);
  assert.match(validateAccessSecret('password', '123456789012'), /lettres et chiffres/);
  assert.match(validateAccessSecret('password', `A1${'x'.repeat(63)}`), /64 caractères maximum/);
  assert.equal(validateAccessSecret('password', PASSWORD), null);
  assert.equal(
    validateAccessSecret('password', 'Forêt-Lyautey-2026!'),
    null,
    'accents, ponctuation',
  );
  // Le code d'accès garde sa règle : la longueur seule.
  assert.equal(validateAccessSecret('code', 'que-des-lettres'), null);
  assert.match(validateAccessSecret('code', 'onze-carac.'), /Code trop court/);
});

test('règles : nature du secret selon le mode d’accès', () => {
  assert.equal(accessSecretKindForMode('code'), 'code');
  assert.equal(accessSecretKindForMode('password'), 'password');
  for (const mode of ['public', 'disabled', '', undefined, 'autre']) {
    assert.equal(accessSecretKindForMode(mode), null, String(mode));
  }
});

// --- Enregistrement -------------------------------------------------------------------------

test('enregistrement : règle de composition appliquée sur les trois plans', async () => {
  for (const surface of SURFACES) {
    for (const bad of ['Court2026', 'QueDesLettresIci', '123456789012']) {
      const res = await setPassword(surface.route, bad);
      assert.equal(res.status, 400, `${surface.id} : « ${bad} » refusé`);
    }
  }
});

test('enregistrement : empreinte propre, distincte du code, effaçable', async () => {
  for (const surface of SURFACES) {
    await configure(surface, { mode: surface.openMode, code: CODE });
    try {
      const res = await setPassword(surface.route, PASSWORD);
      assert.equal(res.status, 200, surface.id);
      assert.equal(res.body.kind, 'password');
      assert.equal(res.body.hasCode, true);
      assert.equal(res.body.key, surface.passwordKey);
      const [codeRow] = await queryAll('SELECT value_json FROM app_settings WHERE `key` = ?', [
        surface.codeKey,
      ]);
      const [passwordRow] = await queryAll('SELECT value_json FROM app_settings WHERE `key` = ?', [
        surface.passwordKey,
      ]);
      const stored = String(JSON.parse(passwordRow.value_json));
      assert.ok(
        await bcrypt.compare(PASSWORD, stored),
        `${surface.id} : empreinte du mot de passe`,
      );
      assert.ok(!stored.includes(PASSWORD), 'jamais en clair');
      assert.ok(
        await bcrypt.compare(CODE, String(JSON.parse(codeRow.value_json))),
        `${surface.id} : le code n’a pas été touché`,
      );
      const cleared = await setPassword(surface.route, '');
      assert.equal(cleared.status, 200);
      assert.equal(cleared.body.hasCode, false);
    } finally {
      await reopen(surface);
    }
  }
});

test('enregistrement : `PUT /admin/:key` refuse d’écrire une empreinte de mot de passe', async () => {
  for (const surface of SURFACES) {
    const res = await request(app)
      .put(`/api/settings/admin/${surface.passwordKey}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 'pas-une-empreinte' });
    assert.equal(res.status, 400, surface.id);
    assert.match(res.body.error, new RegExp(`${surface.route}-access-password`));
  }
  assert.equal(ACCESS_SECRET_HASH_KEYS.length, 6, 'trois codes, trois mots de passe');
});

// --- Plans publics (plan Lyautey, plan e-nov) -----------------------------------------------

test('plans publics : le mot de passe ouvre le plan, saisi tel quel (casse respectée)', async () => {
  for (const surface of PUBLIC_SURFACES) {
    await configure(surface, { mode: 'password', password: PASSWORD });
    try {
      const closed = await request(app).get(`${surface.base}/content`).expect(401);
      assert.equal(closed.body.access_required, true);
      assert.equal(closed.body.access_kind, 'password', surface.id);
      assert.equal(closed.body.error, 'Mot de passe requis');

      const wrongCase = await request(app)
        .post(`${surface.base}/access`)
        .send({ code: PASSWORD.toLowerCase() })
        .expect(401);
      assert.equal(wrongCase.body.error, 'Mot de passe incorrect');
      assert.equal(wrongCase.body.access_kind, 'password');

      const granted = await request(app)
        .post(`${surface.base}/access`)
        .send({ code: PASSWORD })
        .expect(200);
      const pass = cookieFrom(granted, surface.cookie);
      assert.ok(pass, `${surface.id} : laissez-passer posé`);
      const open = await request(app)
        .get(`${surface.base}/content`)
        .set('Cookie', pass)
        .expect(200);
      assert.match(String(open.headers['cache-control']), /^private/, 'charge gardée : privée');
    } finally {
      await reopen(surface);
    }
  }
});

test('plans publics : un mot de passe ne s’ouvre jamais par un lien (journalisé)', async () => {
  for (const surface of PUBLIC_SURFACES) {
    await configure(surface, { mode: 'password', password: PASSWORD });
    try {
      // Lien de lecture `?code=` : le bon mot de passe n'ouvre pas.
      const readId = newRequestId(`${surface.id}-lecture`);
      const viaQuery = await request(app)
        .get(`${surface.base}/content?code=${encodeURIComponent(PASSWORD)}`)
        .set('X-Request-Id', readId)
        .expect(401);
      assert.equal(viaQuery.body.access_kind, 'password');
      assert.equal(cookieFrom(viaQuery, surface.cookie), '', 'aucun laissez-passer');
      const readRow = await journalRow(readId);
      assert.equal(readRow.action, `${surface.journalPrefix}.code_refused`);
      assert.equal(readRow.reason, 'link_disabled');
      assert.equal(readRow.payload.via, 'link');
      assert.equal(readRow.payload.kind, 'password');

      // Échange d'un lien par le plan (`via: 'link'`) : refusé aussi.
      const linkId = newRequestId(`${surface.id}-echange`);
      const viaLink = await request(app)
        .post(`${surface.base}/access`)
        .set('X-Request-Id', linkId)
        .send({ code: PASSWORD, via: 'link' })
        .expect(403);
      assert.equal(viaLink.body.access_kind, 'password');
      assert.equal(cookieFrom(viaLink, surface.cookie), '');
      assert.equal((await journalRow(linkId)).reason, 'link_disabled');

      // Saisie : réussite inscrite avec la nature du secret.
      const formId = newRequestId(`${surface.id}-saisie`);
      await request(app)
        .post(`${surface.base}/access`)
        .set('X-Request-Id', formId)
        .send({ code: PASSWORD })
        .expect(200);
      const granted = await journalRow(formId);
      assert.equal(granted.result, 'success');
      assert.equal(granted.payload.kind, 'password');
      assert.equal(granted.payload.via, 'form');
    } finally {
      await reopen(surface);
    }
  }
});

test('plans publics : le code d’accès garde son lien (`via: link`), journalisé comme tel', async () => {
  for (const surface of PUBLIC_SURFACES) {
    await configure(surface, { mode: 'code', code: CODE });
    try {
      const id = newRequestId(`${surface.id}-code-lien`);
      await request(app)
        .post(`${surface.base}/access`)
        .set('X-Request-Id', id)
        .send({ code: CODE, via: 'link' })
        .expect(200);
      const row = await journalRow(id);
      assert.equal(row.result, 'success');
      assert.equal(row.payload.via, 'link');
      assert.equal(row.payload.kind, 'code');
    } finally {
      await reopen(surface);
    }
  }
});

test('plans publics : passer du code au mot de passe referme la porte aux porteurs du code', async () => {
  for (const surface of PUBLIC_SURFACES) {
    await configure(surface, { mode: 'code', code: CODE, password: PASSWORD });
    try {
      const withCode = await request(app)
        .post(`${surface.base}/access`)
        .send({ code: CODE })
        .expect(200);
      const codePass = cookieFrom(withCode, surface.cookie);
      await request(app).get(`${surface.base}/content`).set('Cookie', codePass).expect(200);

      await setSetting(surface.modeKey, 'password', { userType: 'admin', userId: 'test' });
      invalidateSettingsCache();
      await request(app).get(`${surface.base}/content`).set('Cookie', codePass).expect(401);
      // Le code ne vaut pas mot de passe.
      await request(app).post(`${surface.base}/access`).send({ code: CODE }).expect(401);
    } finally {
      await reopen(surface);
    }
  }
});

test('plans publics : mode « mot de passe » sans mot de passe enregistré = plan ouvert', async () => {
  for (const surface of PUBLIC_SURFACES) {
    // Un code enregistré ne ferme pas le mode « mot de passe » : chaque mode a son secret.
    await configure(surface, { mode: 'password', code: CODE });
    try {
      await request(app).get(`${surface.base}/content`).expect(200);
      const res = await request(app).post(`${surface.base}/access`).send({}).expect(200);
      assert.equal(res.body.required, false);
    } finally {
      await reopen(surface);
    }
  }
});

// --- Plan des personnels ---------------------------------------------------------------------

test('plan des personnels : le mot de passe partagé remplace le code dans la voie secondaire', async () => {
  await configure(STAFF, { mode: 'password', code: CODE, password: PASSWORD });
  try {
    const shell = await request(app).get('/api/staff-plan/settings').expect(200);
    assert.equal(shell.body.code_enabled, true);
    assert.equal(shell.body.access_kind, 'password');

    const closed = await request(app).get('/api/staff-plan/content').expect(401);
    assert.equal(closed.body.auth_required, true);
    assert.equal(closed.body.code_available, true);
    assert.equal(closed.body.access_kind, 'password');

    const withCode = await request(app)
      .post('/api/staff-plan/access')
      .send({ code: CODE })
      .expect(401);
    assert.equal(withCode.body.error, 'Mot de passe incorrect');

    const id = newRequestId('staff');
    const granted = await request(app)
      .post('/api/staff-plan/access')
      .set('X-Request-Id', id)
      .send({ code: PASSWORD })
      .expect(200);
    assert.equal(granted.body.role_slug, 'personnel');
    const row = await journalRow(id);
    assert.equal(row.action, 'staff_plan.access.code_granted');
    assert.equal(row.payload.kind, 'password');

    const pass = cookieFrom(granted, STAFF.cookie);
    await request(app).get('/api/staff-plan/content').set('Cookie', pass).expect(200);

    // Retour au code : le laissez-passer du mot de passe ne vaut plus.
    await setSetting(STAFF.modeKey, 'code', { userType: 'admin', userId: 'test' });
    invalidateSettingsCache();
    await request(app).get('/api/staff-plan/content').set('Cookie', pass).expect(401);
  } finally {
    await reopen(STAFF);
  }
});

test('plan des personnels : mode « mot de passe » sans mot de passe enregistré = personne', async () => {
  await configure(STAFF, { mode: 'password', code: CODE });
  try {
    const shell = await request(app).get('/api/staff-plan/settings').expect(200);
    assert.equal(shell.body.code_enabled, false);
    await request(app).post('/api/staff-plan/access').send({ code: CODE }).expect(403);
  } finally {
    await reopen(STAFF);
  }
});
