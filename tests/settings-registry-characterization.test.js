'use strict';

/**
 * Caractérisation des réglages (piste B, étape B6 ; ligne 13 du § 3.3 de
 * `docs/AUDIT_ETAT_DES_LIEUX_2026-09-25.md`), écrite **avant** la déclaration des réglages par
 * domaine (`lib/settings/<domaine>.js`, agrégés par `lib/settings.js`).
 *
 * Instantanés, sur une table `app_settings` vidée (« base neuve ») puis après quelques
 * modifications par `PUT /api/settings/admin/:key` :
 *   - `GET /api/settings/public` pour chaque produit (ForêtMap, G&L, plan, plan des
 *     personnels), comparé **au caractère près** (ordre des clés compris) ;
 *   - `GET /api/settings/admin` (liste des réglages ; les cartes, hors du registre, n'y
 *     figurent pas) ;
 *   - réponses des `PUT`, y compris les refus de validation ;
 *   - le registre exporté (`SETTINGS_REGISTRY`), clé par clé.
 * Les sous-arbres enrichis hors registre (aide, narrateur, visites guidées, dialogues de
 * mascotte) sont réduits à une empreinte. Les noms de marque (`lib/brand.js`) sont remplacés
 * par des jetons, pour ne pas dépendre de l'environnement.
 *
 * La table est restaurée à l'identique à la fin.
 *
 * Régénérer la référence (changement de comportement VOULU, à justifier dans la PR) :
 *   B6_CHAR_RECORD=1 node --test tests/settings-registry-characterization.test.js
 *   npx prettier --write tests/fixtures/settings-registry-characterization.golden.json
 */

require('./helpers/setup');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { app } = require('../server');
const { initSchema, queryOne, queryAll, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const {
  SETTINGS_REGISTRY,
  invalidateSettingsCache,
  getSettingValue,
  getAuthJwtTtls,
  getVisitMascotSettings,
} = require('../lib/settings');
const { getBrand } = require('../lib/brand');

const GOLDEN_PATH = path.join(
  __dirname,
  'fixtures',
  'settings-registry-characterization.golden.json',
);
const RECORD = process.env.B6_CHAR_RECORD === '1';
const recorded = {};
let adminToken;
let adminId;
let savedRows = [];

/** Jetons de marque, du nom le plus long au plus court (un nom court est souvent un préfixe). */
function brandReplacements() {
  const brand = getBrand();
  const pairs = [
    [brand.appName, '{app}'],
    [brand.appShortName, '{appShort}'],
    [brand.orgName, '{org}'],
    [brand.orgShortName, '{orgShort}'],
  ].filter(([value]) => String(value || '').length >= 3);
  return pairs.sort((a, b) => b[0].length - a[0].length);
}

function digest(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)}`;
}

/** Remplace les sous-arbres enrichis hors registre par leur empreinte (en place). */
function digestEnriched(settings) {
  const help = settings?.content?.help;
  if (help && 'registry' in help) help.registry = digest(help.registry);
  if (help && 'narrator' in help) help.narrator = digest(help.narrator);
  const tour = settings?.content?.tour;
  if (tour && 'registry' in tour) tour.registry = digest(tour.registry);
  const dialog = settings?.visit?.mascot?.dialog;
  if (dialog) settings.visit.mascot.dialog = digest(dialog);
  return settings;
}

function normalize(value) {
  let text = JSON.stringify(value);
  for (const [raw, token] of brandReplacements()) text = text.split(raw).join(token);
  if (adminId) text = text.split(adminId).join('<admin>');
  return JSON.parse(text);
}

/** Compare à la référence **au caractère près** (ordre des clés compris). */
function expectGolden(name, actual) {
  const normalized = normalize(actual);
  if (RECORD) {
    recorded[name] = normalized;
    return;
  }
  const golden = JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf8'));
  assert.ok(Object.hasOwn(golden, name), `référence absente : ${name}`);
  assert.deepStrictEqual(normalized, golden[name], name);
  assert.equal(
    JSON.stringify(normalized),
    JSON.stringify(golden[name]),
    `${name} (ordre des clés)`,
  );
}

async function publicSettings(product) {
  const req = request(app).get('/api/settings/public');
  if (product) req.set('X-Foretmap-Product', product);
  const res = await req.expect(200);
  return digestEnriched(res.body);
}

async function adminSettings() {
  const res = await request(app)
    .get('/api/settings/admin')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(Array.isArray(res.body.maps));
  return res.body.settings.map((row) => ({
    ...row,
    updated_at: row.updated_at ? '<date>' : null,
  }));
}

async function snapshotAll(prefix) {
  expectGolden(`${prefix}.public.foret`, await publicSettings(null));
  expectGolden(`${prefix}.public.gl`, await publicSettings('gl'));
  expectGolden(`${prefix}.public.plan`, await publicSettings('plan'));
  expectGolden(`${prefix}.public.staff`, await publicSettings('staff'));
  const admin = await adminSettings();
  if (prefix === 'defaults') {
    expectGolden('defaults.admin', admin);
  } else {
    // Après modifications : mêmes clés, dans le même ordre ; seules les lignes qui diffèrent
    // de la base neuve sont gardées dans la référence (la liste complète pèse ≈ 40 Ko).
    const reference = RECORD
      ? recorded['defaults.admin']
      : JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf8'))['defaults.admin'];
    const rows = normalize(admin);
    assert.deepEqual(
      rows.map((r) => r.key),
      reference.map((r) => r.key),
    );
    expectGolden(
      `${prefix}.admin.changed`,
      rows.filter((row, i) => JSON.stringify(row) !== JSON.stringify(reference[i])),
    );
  }
  expectGolden(`${prefix}.lib`, {
    allowRegister: await getSettingValue('ui.auth.allow_register', 'repli'),
    unknown: await getSettingValue('cle.inconnue', 'repli'),
    jwt: await getAuthJwtTtls(),
    mascot: await getVisitMascotSettings(),
  });
}

async function putSetting(key, value) {
  const res = await request(app)
    .put(`/api/settings/admin/${encodeURIComponent(key)}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ value });
  return { key, status: res.status, body: res.body };
}

test.before(async () => {
  await initSchema();
  const admin = await queryOne(
    "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
    [String(process.env.TEACHER_ADMIN_EMAIL || '').trim()],
  );
  adminId = admin.id;
  const adminRole = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  adminToken = await signAuthToken(
    {
      userType: 'teacher',
      userId: admin.id,
      canonicalUserId: admin.id,
      roleId: adminRole.id,
      roleSlug: 'admin',
      roleDisplayName: 'Administrateur',
      elevated: false,
    },
    false,
  );
  savedRows = await queryAll(
    'SELECT `key`, scope, value_json, updated_by_user_type, updated_by_user_id, updated_at FROM app_settings',
  );
  await execute('DELETE FROM app_settings');
  invalidateSettingsCache();
});

test.after(async () => {
  await execute('DELETE FROM app_settings');
  for (const row of savedRows) {
    await execute(
      'INSERT INTO app_settings (`key`, scope, value_json, updated_by_user_type, updated_by_user_id, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [
        row.key,
        row.scope,
        row.value_json,
        row.updated_by_user_type,
        row.updated_by_user_id,
        row.updated_at,
      ],
    );
  }
  invalidateSettingsCache();
  if (RECORD) fs.writeFileSync(GOLDEN_PATH, `${JSON.stringify(recorded, null, 2)}\n`);
});

test('registre exporté : mêmes clés, mêmes descripteurs', () => {
  const sortedEntries = Object.keys(SETTINGS_REGISTRY)
    .sort()
    .map((key) => [key, SETTINGS_REGISTRY[key]]);
  expectGolden('registry', Object.fromEntries(sortedEntries));
});

test('base neuve : réglages publics par produit, réglages admin, lectures serveur', async () => {
  await snapshotAll('defaults');
});

test('valeurs modifiées : réponses des PUT (refus compris) puis instantanés', async () => {
  const puts = [];
  for (const [key, value] of [
    ['ui.auth.allow_register', false],
    ['ui.auth.default_mode', 'register'],
    ['ui.auth.default_mode', 'inconnu'],
    ['content.auth.title', 'Titre de caractérisation'],
    ['content.auth.title', 'x'.repeat(81)],
    ['content.brand.org_name', ''],
    ['ui.map.overlay_emoji_size_percent', 130],
    ['ui.modules.forum_enabled', false],
    ['runtime.rest_poll_floor_ms', 5000],
    ['tasks.student_max_active_assignments', 3],
    ['tasks.student_max_active_assignments', 100000],
    ['ui.plan.title', 'Plan de caractérisation'],
    ['ui.staff_plan.access_mode', 'code'],
    ['security.jwt_ttl_base_seconds', 7200],
    ['learning.gating.retry_cooldown_hours', 2],
    ['ui.visit.mascot.default_id', 'mascotte-carac'],
    ['integration.google.enabled', false],
    ['cle.inconnue', 1],
    ['security.plan_access_code_hash', 'x'],
  ]) {
    puts.push(await putSetting(key, value));
  }
  expectGolden('modified.puts', puts);
  await snapshotAll('modified');
});
