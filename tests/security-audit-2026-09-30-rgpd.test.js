'use strict';

/**
 * Correctifs RGPD de `docs/AUDIT_SECURITE_RGPD_2026-09-30.md` (§ 5 et « Sous-traitants ») :
 *
 *   - RG2 conservation : nouvelles cibles de `scripts/purge-audit-logs.js`, troncature des IP,
 *     cycle de fin d'année `scripts/purge-inactive-accounts.js` ;
 *   - RG3 effacement : élève, joueur G&L (plus de 409 « sortilège »), enseignant — avec un test
 *     « registre » qui balaie INFORMATION_SCHEMA ;
 *   - RG5 export : sections ajoutées, toutes exécutables sur le schéma réel ;
 *   - RG6 journaux : masquage imbriqué, plus d'e-mail d'administrateur au démarrage ;
 *   - RG7 EXIF : échec fermé, images animées, fixture e2e préservée ;
 *   - RG8 mot de passe : plancher 8 ;
 *   - Pl@ntNet : l'image envoyée est nettoyée côté serveur.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const request = require('supertest');
const sharp = require('sharp');
const pino = require('pino');

const { initSchema, initDatabase, queryAll, queryOne, execute } = require('../database');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { app } = require('../server');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
  createGlGameWithTeams,
  assignPlayerToGameTeam,
  signTokens,
} = require('./helpers/glFixtures');
const { UPLOADS_DIR, writeBufferToDisk, getAbsolutePath } = require('../lib/uploads');
const imageMetadata = require('../lib/imageMetadata');
const { logAudit } = require('../lib/auditLog');

const STAMP = `${Date.now()}${crypto.randomUUID().slice(0, 6)}`;
const SCRATCH = `_test-rgpd-${STAMP}`;
let adminToken;

test.before(async () => {
  await initSchema();
  await initDatabase();
  await ensureRbacBootstrap();
  adminToken = await ensureAdminTeacherAuthToken({ elevated: true });
});

test.after(() => {
  fs.rmSync(path.join(UPLOADS_DIR, SCRATCH), { recursive: true, force: true });
});

// --- Utilitaires ---------------------------------------------------------------------------

/** JPEG portant des coordonnées GPS (la forme exacte du constat S7 / RG7). */
async function jpegWithGps() {
  return sharp({
    create: { width: 32, height: 32, channels: 3, background: { r: 20, g: 120, b: 40 } },
  })
    .jpeg()
    .withExif({
      IFD0: { Make: 'TelephoneEleve', Model: 'X' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '33/1 35/1 0/1' },
    })
    .toBuffer();
}

/** Fixture de `e2e/gl-media-assets.spec.js` : PNG 1×1 que sharp lit mais ne sait pas réécrire. */
const E2E_TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6pJkQAAAAASUVORK5CYII=',
  'base64',
);

function writeUpload(relativePath, content = 'x') {
  const abs = getAbsolutePath(relativePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  return abs;
}

/** Colonnes « de personne » (INFORMATION_SCHEMA) : nom, type SQL, colonne de type sœur. */
async function personColumns() {
  const rows = await queryAll(
    `SELECT TABLE_NAME AS t, COLUMN_NAME AS c, DATA_TYPE AS dt
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND (COLUMN_NAME REGEXP '(^|_)(user_id|student_id|player_id|actor_id|target_id)$'
             OR COLUMN_NAME LIKE 'author\\_%')
        AND COLUMN_NAME NOT LIKE '%\\_type'`,
  );
  const all = await queryAll(
    'SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE()',
  );
  const byTable = new Map();
  for (const r of all) {
    if (!byTable.has(r.t)) byTable.set(r.t, new Set());
    byTable.get(r.t).add(r.c);
  }
  return rows.map((r) => {
    const sibling = r.c.replace(/_id$/, '_type');
    return {
      table: r.t,
      column: r.c,
      numeric: /int$/i.test(String(r.dt)),
      typeColumn: sibling !== r.c && byTable.get(r.t)?.has(sibling) ? sibling : null,
    };
  });
}

/**
 * Lignes qui référencent encore `value` dans une colonne de personne, hors exceptions.
 * `acceptedTypes` restreint les colonnes à type sœur (`author_user_type`…) aux types de la
 * personne : un identifiant entier de joueur ne doit pas matcher celui d'un MJ.
 */
async function leftoverReferences(value, { numeric, acceptedTypes = null, exceptions = [] }) {
  const leftovers = [];
  for (const col of await personColumns()) {
    if (col.numeric !== numeric) continue;
    const key = `${col.table}.${col.column}`;
    if (exceptions.includes(key)) continue;
    let sql = `SELECT COUNT(*) AS n FROM \`${col.table}\` WHERE \`${col.column}\` = ?`;
    const params = [value];
    if (acceptedTypes && col.typeColumn) {
      sql += ` AND \`${col.typeColumn}\` IN (${acceptedTypes.map(() => '?').join(', ')})`;
      params.push(...acceptedTypes);
    }
    const row = await queryOne(sql, params);
    if (Number(row?.n || 0) > 0) leftovers.push(`${key} (${row.n})`);
  }
  return leftovers;
}

async function registerStudent(firstName) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ firstName, lastName: `Rgpd${STAMP}`, password: 'motdepasse8' })
    .expect(201);
  return res.body;
}

// --- RG6 — journaux ------------------------------------------------------------------------

test('RG6 — le masquage Pino descend dans les objets et couvre les nouveaux champs', () => {
  const { REDACT_PATHS } = require('../lib/logger');
  assert.ok(Array.isArray(REDACT_PATHS), 'lib/logger.js doit exposer ses chemins masqués');
  const lines = [];
  const probe = pino(
    { redact: { paths: [...REDACT_PATHS], remove: true } },
    { write: (s) => lines.push(s) },
  );
  probe.info(
    {
      user: { email: 'eleve@ecole.test', profile: { password: 'secret-imbrique' } },
      body: { code: 'CODEPLAN8', currentPassword: 'ancien-mdp', newPassword: 'nouveau-mdp' },
      ctx: { payload: { resetToken: 'jeton-reset', password_hash: '$2a$10$xyz' } },
      req: { headers: { authorization: 'Bearer abc', cookie: 'sid=1' }, body: { name: 'Ada' } },
      err: { code: 'ER_DUP_ENTRY' },
      token: 'jeton-racine',
      email: 'racine@ecole.test',
      accessCode: 'CODE-ACCES',
    },
    'sonde',
  );
  const text = lines.join('');
  for (const secret of [
    'eleve@ecole.test',
    'secret-imbrique',
    'CODEPLAN8',
    'ancien-mdp',
    'nouveau-mdp',
    'jeton-reset',
    '$2a$10$xyz',
    'Bearer abc',
    'sid=1',
    'Ada',
    'jeton-racine',
    'racine@ecole.test',
    'CODE-ACCES',
  ]) {
    assert.ok(!text.includes(secret), `« ${secret} » ne doit pas apparaître dans le journal`);
  }
  assert.equal(JSON.parse(lines[0]).err.code, 'ER_DUP_ENTRY', 'le code d’erreur reste lisible');
});

test('RG6 — le contrôle admin au démarrage journalise l’identifiant, pas l’e-mail', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.doesNotMatch(src, /admin:\s*state\.email/);
  assert.match(src, /adminId:\s*state\.teacherId/);
});

// --- RG8 — longueur minimale ---------------------------------------------------------------

test('RG8 — plancher des mots de passe à 8 (réglage, défaut, inscription)', async () => {
  const { IDENTITY_SETTINGS } = require('../lib/settings/identity');
  const meta = IDENTITY_SETTINGS['security.password_min_length'];
  assert.equal(meta.min, 8);
  assert.equal(meta.default, 8);
  const { PASSWORD_RESET_MIN_LEN } = require('../lib/passwordReset');
  assert.equal(PASSWORD_RESET_MIN_LEN, 8);

  const tooShort = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Court', lastName: `Mdp${STAMP}`, password: '1234567' });
  assert.equal(tooShort.status, 400);
  assert.match(tooShort.body.error, /8/);
  await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Long', lastName: `Mdp${STAMP}`, password: '12345678' })
    .expect(201);
});

// --- RG7 — métadonnées des images ----------------------------------------------------------

test('RG7 — sans sharp, une image est refusée (422) au lieu d’être écrite telle quelle', async () => {
  const gps = await jpegWithGps();
  imageMetadata.__setSharpUnavailableForTests(true);
  try {
    await assert.rejects(imageMetadata.stripImageMetadata(gps), (err) => {
      assert.equal(err.status, 422);
      assert.equal(err.message, 'Image illisible ou non nettoyable');
      assert.equal(err.code, 'IMAGE_NOT_SANITIZABLE');
      return true;
    });
    const json = Buffer.from('{"a":1}');
    assert.ok((await imageMetadata.stripImageMetadata(json)).equals(json), 'non-image intact');
    await assert.rejects(writeBufferToDisk(`${SCRATCH}/sans-sharp.jpg`, gps), { status: 422 });
    assert.equal(fs.existsSync(getAbsolutePath(`${SCRATCH}/sans-sharp.jpg`)), false);
  } finally {
    imageMetadata.__setSharpUnavailableForTests(false);
  }
});

test('RG7 — une photo illisible est refusée ; un PNG propre non réencodable passe', async () => {
  const gps = await jpegWithGps();
  const truncated = gps.subarray(0, 40);
  await assert.rejects(imageMetadata.stripImageMetadata(truncated), { status: 422 });
  await assert.rejects(writeBufferToDisk(`${SCRATCH}/tronquee.jpg`, truncated), {
    status: 422,
  });
  // e2e/gl-media-assets.spec.js : sharp échoue à le réécrire, mais il ne porte rien.
  const out = await imageMetadata.stripImageMetadata(E2E_TINY_PNG);
  assert.ok(out.equals(E2E_TINY_PNG));
  await writeBufferToDisk(`${SCRATCH}/tiny.png`, E2E_TINY_PNG);
  assert.ok(fs.existsSync(getAbsolutePath(`${SCRATCH}/tiny.png`)));
});

test('RG7 — une image animée porteuse d’EXIF est nettoyée sans perdre ses images', async () => {
  const frame = (r) =>
    sharp({ create: { width: 8, height: 8, channels: 4, background: { r, g: 0, b: 0, alpha: 1 } } })
      .png()
      .toBuffer();
  const animated = await sharp([await frame(255), await frame(10)], { join: { animated: true } })
    .webp()
    .toBuffer();
  const tagged = await sharp(animated, { animated: true })
    .withExif({ IFD0: { Copyright: 'GPS eleve' } })
    .webp()
    .toBuffer();
  assert.ok((await sharp(tagged, { animated: true }).metadata()).exif, 'le cas porte de l’EXIF');
  const out = await imageMetadata.stripImageMetadata(tagged);
  const meta = await sharp(out, { animated: true }).metadata();
  assert.equal(meta.pages, 2, 'les deux images sont conservées');
  assert.equal(meta.exif, undefined, 'EXIF retiré');
});

test('RG7 — check:runtime exige sharp', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'check-runtime.js'), 'utf8');
  assert.match(src, /checkModule\('sharp', \{\s*required: true/);
});

// --- Pl@ntNet ------------------------------------------------------------------------------

test('Pl@ntNet — l’image envoyée au sous-traitant ne porte plus de métadonnées', async () => {
  const { plantnetIdentifyFromImages } = require('../lib/speciesAutofillPlantnet');
  const prevF = process.env.SPECIES_AUTOFILL_PLANTNET;
  const prevK = process.env.PLANTNET_API_KEY;
  process.env.SPECIES_AUTOFILL_PLANTNET = '1';
  process.env.PLANTNET_API_KEY = 'pk-test';
  try {
    const gps = await jpegWithGps();
    assert.ok((await sharp(gps).metadata()).exif, 'la photo source porte de l’EXIF');
    let sent = null;
    const out = await plantnetIdentifyFromImages({
      images: [{ organ: 'leaf', imageData: `data:image/jpeg;base64,${gps.toString('base64')}` }],
      fetchImpl: async (_url, opts) => {
        const blob = opts.body.getAll('images')[0];
        sent = Buffer.from(await blob.arrayBuffer());
        return { ok: true, status: 200, json: async () => ({ results: [] }) };
      },
    });
    assert.equal(out.ok, true);
    assert.ok(sent && sent.length > 0);
    assert.equal((await sharp(sent).metadata()).exif, undefined, 'EXIF/GPS retirés avant envoi');
  } finally {
    process.env.SPECIES_AUTOFILL_PLANTNET = prevF;
    process.env.PLANTNET_API_KEY = prevK;
  }
});

// --- RG5 — export --------------------------------------------------------------------------

test('RG5 — sections ajoutées, chaque requête du registre s’exécute sur le schéma réel', async () => {
  const { FORET_EXPORT_ENTRIES, GL_EXPORT_ENTRIES } = require('../lib/accounts/exportRegistry');
  const sections = new Map(
    [...FORET_EXPORT_ENTRIES, ...GL_EXPORT_ENTRIES].map((e) => [e.section, e]),
  );
  for (const section of [
    'journal_audit_actions',
    'groupes_externes',
    'synchro_conflits',
    'synchro_rapprochements',
    'gl_marche_transactions',
    'gl_marche_feuillets_proposes',
    'gl_parties_evenements',
    'gl_demandes_action',
    'gl_sorts_brouillons',
  ]) {
    assert.ok(sections.has(section), `section ${section}`);
  }
  assert.ok(sections.get('synchro_rapprochements').exclude.includes('candidates_json'));
  assert.ok(sections.get('journal_audit_actions').exclude.includes('details'));
  const subject = { userId: 'x', userType: 'student', firstName: 'A', lastName: 'B', playerId: 0 };
  for (const entry of [...FORET_EXPORT_ENTRIES, ...GL_EXPORT_ENTRIES]) {
    await queryAll(
      `SELECT * FROM ${entry.table} WHERE ${entry.where} LIMIT 0`,
      entry.params({ ...subject }),
    );
  }
});

// --- RG2 — conservation ---------------------------------------------------------------------

test('RG2 — purge : jetons, synchro, visites, invités G&L ; IP tronquées à 3 mois', async () => {
  const { runPurge, parseArgs } = require('../scripts/purge-audit-logs');
  const user = await registerStudent('Purge');
  const tag = `rgpd-${STAMP}`;

  // Jetons de réinitialisation : utilisé il y a 2 j, expiré il y a 2 j, valide.
  const tokens = ['used', 'expired', 'fresh'].map((k) => `${tag}-${k}`);
  await execute(
    `INSERT INTO password_reset_tokens (id, user_type, user_id, token_hash, expires_at, used_at, created_at) VALUES
      (?, 'student', ?, ?, NOW() + INTERVAL 1 HOUR, NOW() - INTERVAL 2 DAY, NOW() - INTERVAL 3 DAY),
      (?, 'student', ?, ?, NOW() - INTERVAL 2 DAY, NULL, NOW() - INTERVAL 3 DAY),
      (?, 'student', ?, ?, NOW() + INTERVAL 1 HOUR, NULL, NOW())`,
    tokens.flatMap((t) => [t, user.id, `hash-${t}`]),
  );
  // Synchronisation : un run terminé il y a 400 j (et son action), un run « running » ancien.
  const oldRun = await execute(
    `INSERT INTO sync_runs (provider, mode, status, started_at, finished_at)
     VALUES (?, 'apply', 'succeeded', NOW() - INTERVAL 401 DAY, NOW() - INTERVAL 400 DAY)`,
    [tag],
  );
  await execute(
    `INSERT INTO sync_actions (run_id, seq, kind, target_type, target_id) VALUES (?, 1, 'x', 'user', ?)`,
    [oldRun.insertId, user.id],
  );
  const runningRun = await execute(
    `INSERT INTO sync_runs (provider, mode, status, started_at) VALUES (?, 'dry_run', 'running', NOW() - INTERVAL 400 DAY)`,
    [tag],
  );
  await execute(
    `INSERT INTO sync_pending_matches (provider, issuer, external_id, reason, detected_at, resolved_at, resolution)
     VALUES (?, 'i', 'resolu', 'ambiguous', NOW() - INTERVAL 500 DAY, NOW() - INTERVAL 400 DAY, 'ignore'),
            (?, 'i', 'ouvert', 'ambiguous', NOW() - INTERVAL 500 DAY, NULL, NULL)`,
    [tag, tag],
  );
  await execute(
    `INSERT INTO user_product_visits (user_id, product, first_seen_at, last_seen_at)
     VALUES (?, 'foret', NOW() - INTERVAL 500 DAY, NOW() - INTERVAL 400 DAY),
            (?, 'gl', NOW() - INTERVAL 10 DAY, NOW() - INTERVAL 10 DAY)`,
    [user.id, user.id],
  );
  await execute(
    `INSERT INTO gl_qcm_attempts (reader_user_type, reader_user_id, question_dataset, question_code, answered_at)
     VALUES ('gl_guest', ?, 'd', 'q1', NOW() - INTERVAL 40 DAY),
            ('gl_player', ?, 'd', 'q1', NOW() - INTERVAL 40 DAY)`,
    [tag, tag],
  );
  // Journal de sécurité : IPv4, IPv4 encapsulée, IPv6 anciennes ; une IP récente.
  for (const [ip, days] of [
    ['203.0.113.77', 200],
    ['::ffff:198.51.100.9', 200],
    ['2001:db8:85a3:12::7334', 200],
    ['192.0.2.55', 10],
  ]) {
    await execute(
      `INSERT INTO security_events (occurred_at, action, ip_address, user_agent)
       VALUES (NOW() - INTERVAL ? DAY, ?, ?, 'Navigateur/1.0')`,
      [days, tag, ip],
    );
  }

  const logs = [];
  const report = await runPurge(
    { ...parseArgs([]), apply: true },
    { queryAll, queryOne, execute },
    (line) => logs.push(line),
  );
  assert.ok(Array.isArray(report.missing));

  const remainingTokens = await queryAll(
    'SELECT id FROM password_reset_tokens WHERE id IN (?, ?, ?) ORDER BY id',
    tokens,
  );
  assert.deepEqual(
    remainingTokens.map((r) => r.id),
    [tokens[2]],
  );
  assert.equal(
    (await queryOne('SELECT COUNT(*) AS n FROM sync_runs WHERE id = ?', [oldRun.insertId])).n,
    0,
  );
  assert.equal(
    (await queryOne('SELECT COUNT(*) AS n FROM sync_actions WHERE run_id = ?', [oldRun.insertId]))
      .n,
    0,
  );
  assert.equal(
    (await queryOne('SELECT COUNT(*) AS n FROM sync_runs WHERE id = ?', [runningRun.insertId])).n,
    1,
    'un run en cours n’est jamais purgé',
  );
  const matches = await queryAll(
    'SELECT external_id FROM sync_pending_matches WHERE provider = ?',
    [tag],
  );
  assert.deepEqual(
    matches.map((m) => m.external_id),
    ['ouvert'],
  );
  const visits = await queryAll('SELECT product FROM user_product_visits WHERE user_id = ?', [
    user.id,
  ]);
  assert.deepEqual(
    visits.map((v) => v.product),
    ['gl'],
  );
  const attempts = await queryAll(
    'SELECT reader_user_type FROM gl_qcm_attempts WHERE reader_user_id = ?',
    [tag],
  );
  assert.deepEqual(
    attempts.map((a) => a.reader_user_type),
    ['gl_player'],
  );
  const events = await queryAll(
    'SELECT ip_address, user_agent FROM security_events WHERE action = ? ORDER BY id',
    [tag],
  );
  assert.deepEqual(events, [
    { ip_address: '203.0.113.0', user_agent: null },
    { ip_address: '198.51.100.0', user_agent: null },
    { ip_address: '2001:db8:85a3::', user_agent: null },
    { ip_address: '192.0.2.55', user_agent: 'Navigateur/1.0' },
  ]);
});

test('RG2 — fin d’année : les comptes élèves inactifs passent par l’effacement d’élève', async () => {
  const {
    purgeInactiveAccounts,
    assertMonths,
    parseArgs,
  } = require('../scripts/purge-inactive-accounts');
  assert.throws(() => assertMonths(3), /Minimum 6 mois/);
  assert.deepEqual(parseArgs([]), { apply: false, months: 13, limit: null });

  const inactive = await registerStudent('Inactif');
  const active = await registerStudent('Actif');
  await execute(
    "UPDATE users SET last_seen = '1990-01-01', created_at = '1990-01-01' WHERE id = ?",
    [inactive.id],
  );
  const lines = [];
  const dry = await purgeInactiveAccounts({ months: 13, limit: 1 }, { log: (l) => lines.push(l) });
  assert.ok(dry.candidates >= 1);
  assert.deepEqual(dry.deleted, []);
  assert.ok(
    lines.some((l) => l.includes(inactive.id)),
    'le compte est listé à blanc',
  );
  assert.ok(!lines.some((l) => l.includes('Inactif')), 'jamais de nom dans le journal');
  assert.ok(await queryOne('SELECT id FROM users WHERE id = ?', [inactive.id]));

  const applied = await purgeInactiveAccounts(
    { months: 13, limit: 1, apply: true },
    { log: () => {} },
  );
  assert.deepEqual(applied.deleted, [inactive.id]);
  assert.ok(!(await queryOne('SELECT id FROM users WHERE id = ?', [inactive.id])));
  assert.ok(await queryOne('SELECT id FROM users WHERE id = ?', [active.id]));
  const audit = await queryOne(
    "SELECT details FROM audit_log WHERE action = 'purge_inactive_account' AND target_id = ?",
    [inactive.id],
  );
  assert.equal(audit?.details, inactive.id);
});

// --- RG3 — effacement ----------------------------------------------------------------------

test('RG3 — effacement d’un élève : registre de toutes les tables à colonne de personne', async () => {
  const student = await registerStudent('Efface');
  const S = String(student.id);
  const fakeReq = { ip: '198.51.100.23', headers: { 'user-agent': 'NavigateurEleve/2.0' } };

  // Social.
  const threadId = `th-${STAMP}`;
  await execute(
    `INSERT INTO forum_threads (id, title, author_user_type, author_user_id) VALUES (?, 'Sujet', 'student', ?)`,
    [threadId, S],
  );
  await execute(
    `INSERT INTO forum_posts (id, thread_id, body, author_user_type, author_user_id) VALUES (?, ?, 'msg', 'student', ?)`,
    [`po-${STAMP}`, threadId, S],
  );
  await execute(
    `INSERT INTO context_comments (id, context_type, context_id, body, author_user_type, author_user_id)
     VALUES (?, 'zone', 'z1', 'com', 'student', ?)`,
    [`cc-${STAMP}`, S],
  );
  // Journaux et traces.
  await logAudit('student_update', 'student', S, 'Efface Rgpd (nom en clair)', {
    req: fakeReq,
    actorUserType: 'student',
    actorUserId: S,
  });
  await execute(
    "INSERT INTO user_activity_events (user_id, user_type, product, action) VALUES (?, 'student', 'foret', 'open')",
    [S],
  );
  await execute("INSERT INTO user_product_visits (user_id, product) VALUES (?, 'foret')", [S]);
  await execute("INSERT INTO notifications (user_id, kind, title) VALUES (?, 'info', 'Bonjour')", [
    S,
  ]);
  await execute(
    `INSERT INTO password_reset_tokens (id, user_type, user_id, token_hash, expires_at)
     VALUES (?, 'student', ?, ?, NOW() + INTERVAL 1 HOUR)`,
    [`tok-${STAMP}`, S, `hash-tok-${STAMP}`],
  );
  await execute(
    "INSERT INTO learning_acknowledgements (user_id, target_type, target_code) VALUES (?, 'term', 'x')",
    [S],
  );
  await execute("INSERT INTO user_quiz_attempts (user_id, question_code) VALUES (?, 'Q1')", [S]);
  await execute("INSERT INTO user_rewards (user_id, reward_key) VALUES (?, 'r1')", [S]);
  // Carnet personnel avec fichier sur disque.
  const article = await execute(
    "INSERT INTO user_journal_articles (user_id, body_markdown) VALUES (?, 'mon carnet')",
    [S],
  );
  const assetRel = `user-journal/${S}/${article.insertId}-photo.jpg`;
  writeUpload(assetRel, 'photo carnet');
  await execute(
    'INSERT INTO user_journal_article_assets (article_id, user_id, asset_path) VALUES (?, ?, ?)',
    [article.insertId, S, assetRel],
  );

  await request(app)
    .delete(`/api/students/${S}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);

  // Fichiers du carnet effacés (dossier compris).
  assert.equal(fs.existsSync(getAbsolutePath(assetRel)), false);
  assert.equal(fs.existsSync(getAbsolutePath(`user-journal/${S}`)), false);
  // Audit de l'effacement : identifiant seul ; libellés antérieurs vidés.
  const del = await queryOne(
    "SELECT details FROM audit_log WHERE action = 'delete_student' AND target_id = ? ORDER BY id DESC LIMIT 1",
    [S],
  );
  assert.equal(del.details, S);
  const earlier = await queryOne(
    "SELECT details FROM audit_log WHERE action = 'student_update' AND target_id = ?",
    [S],
  );
  assert.equal(earlier.details, null, 'le nom ne survit pas dans un libellé d’audit');
  // IP et navigateur effacés sur toutes ses lignes de sécurité.
  const withIp = await queryOne(
    `SELECT COUNT(*) AS n FROM security_events
      WHERE target_id = ? AND (ip_address IS NOT NULL OR user_agent IS NOT NULL)
        AND action <> 'delete_student'`,
    [S],
  );
  assert.equal(Number(withIp.n), 0);

  // Registre : plus aucune ligne ne référence l'élève, hors exceptions justifiées.
  const leftovers = await leftoverReferences(S, {
    numeric: false,
    exceptions: [
      // Trace pseudonyme des actions QUI VISENT la personne (dont son effacement) : conservée
      // pour la responsabilité de l'établissement (art. 5-2), sans IP, navigateur ni libellé.
      'audit_log.target_id',
      'security_events.target_id',
    ],
  });
  assert.deepEqual(leftovers, [], `lignes restantes : ${leftovers.join(', ')}`);
});

test('RG3 — effacement d’un joueur G&L : plus de 409 « sortilège », registre vide, fichiers supprimés', async () => {
  const admin = await createGlAdmin({ email: `gl.rgpd.${STAMP}@ecole.local` });
  const glClass = await createGlClass({ name: `Classe RGPD ${STAMP}`, adminId: admin.id });
  const player = await createGlPlayer({
    classId: glClass.id,
    pseudo: `rgpd-${STAMP}`,
    firstName: 'Joueur',
    lastName: `Efface${STAMP}`,
  });
  const P = Number(player.id);
  const mirrorUserId = String(player.linked_foretmap_user_id);
  const chapter = await queryOne("SELECT id FROM gl_chapters WHERE slug = 'foret-magique' LIMIT 1");
  const { game, teams } = await createGlGameWithTeams({
    classId: glClass.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    status: 'ended',
    name: `Partie RGPD ${STAMP}`,
    teams: [{ name: 'Gnomes' }],
  });
  const teamId = teams[0].id;
  await assignPlayerToGameTeam({ gameId: game.id, teamId, playerId: P });

  // Partie terminée : contribution à un sortilège (ancien 409), événements, demande d'action.
  const draft = await execute(
    `INSERT INTO gl_spell_cast_drafts
       (game_id, team_id, spell_code, status, created_by_player_id, created_by_actor_type,
        created_by_actor_id, launched_by_player_id, launched_by_actor_type, launched_by_actor_id)
     VALUES (?, ?, 'S1', 'cast', ?, 'team', ?, ?, 'team', ?)`,
    [game.id, teamId, P, String(P), P, String(P)],
  );
  await execute(
    `INSERT INTO gl_spell_cast_contributions (draft_id, player_id, gems, hearts, updated_by_player_id)
     VALUES (?, ?, 2, 1, ?)`,
    [draft.insertId, P, P],
  );
  await execute(
    `INSERT INTO gl_game_events (game_id, team_id, actor_type, actor_id, event_type)
     VALUES (?, ?, 'team', ?, 'move')`,
    [game.id, teamId, String(P)],
  );
  await execute(
    `INSERT INTO gl_action_requests (game_id, team_id, player_id, action_type) VALUES (?, ?, ?, 'move')`,
    [game.id, teamId, P],
  );
  // Forum, commentaires, QCM, accusés.
  const thread = await execute(
    `INSERT INTO gl_forum_threads (title, author_user_type, author_user_id) VALUES ('Sujet', 'gl_player', ?)`,
    [String(P)],
  );
  const imageRel = `gl-forum-posts/${STAMP}/0.jpg`;
  writeUpload(imageRel, 'image forum');
  const post = await execute(
    `INSERT INTO gl_forum_posts (thread_id, body, image_paths_json, author_user_type, author_user_id)
     VALUES (?, 'msg', ?, 'gl_player', ?)`,
    [thread.insertId, JSON.stringify([imageRel]), String(P)],
  );
  await execute(
    `INSERT INTO gl_forum_post_reactions (post_id, reactor_user_type, reactor_user_id, emoji)
     VALUES (?, 'gl_player', ?, '👍')`,
    [post.insertId, String(P)],
  );
  await execute(
    `INSERT INTO context_comments (id, context_type, context_id, body, author_user_type, author_user_id)
     VALUES (?, 'gl_chapter', '1', 'com', 'gl_player', ?)`,
    [`glcc-${STAMP}`, String(P)],
  );
  await execute(
    `INSERT INTO gl_qcm_attempts (reader_user_type, reader_user_id, question_dataset, question_code)
     VALUES ('gl_player', ?, 'd', 'q1')`,
    [String(P)],
  );
  await execute(
    `INSERT INTO gl_learning_acknowledgements (reader_user_type, reader_user_id, target_type, target_code)
     VALUES ('gl_player', ?, 'tutorial', 't1')`,
    [String(P)],
  );
  // Journal et avatar sur disque.
  const journal = await execute(
    "INSERT INTO gl_player_journal_articles (player_id, body_markdown) VALUES (?, 'journal')",
    [P],
  );
  const journalRel = `gl-player-journal/${P}/${journal.insertId}-img.jpg`;
  writeUpload(journalRel, 'journal');
  await execute(
    'INSERT INTO gl_player_journal_article_assets (article_id, player_id, asset_path) VALUES (?, ?, ?)',
    [journal.insertId, P, journalRel],
  );
  const avatarRel = `gl_players/${P}/avatar-1.jpg`;
  writeUpload(avatarRel, 'avatar');
  await execute('UPDATE gl_players SET avatar_path = ? WHERE id = ?', [avatarRel, P]);

  const { adminToken: glToken } = await signTokens({
    adminId: admin.id,
    adminPermissions: ['gl.read', 'gl.players.manage'],
  });
  const res = await request(app)
    .delete(`/api/gl/admin/players/${P}`)
    .set('Authorization', `Bearer ${glToken}`);
  assert.equal(res.status, 200, `réponse ${res.status} : ${JSON.stringify(res.body)}`);
  assert.equal(res.body.accountDeleted, true, 'compte miroir supprimé');

  for (const rel of [
    imageRel,
    journalRel,
    avatarRel,
    `gl-player-journal/${P}`,
    `gl_players/${P}`,
  ]) {
    assert.equal(fs.existsSync(getAbsolutePath(rel)), false, `${rel} supprimé`);
  }
  // Historique collectif conservé, sans auteur.
  const d = await queryOne(
    'SELECT created_by_player_id, created_by_actor_id, launched_by_player_id, launched_by_actor_id FROM gl_spell_cast_drafts WHERE id = ?',
    [draft.insertId],
  );
  assert.deepEqual(d, {
    created_by_player_id: null,
    created_by_actor_id: '',
    launched_by_player_id: null,
    launched_by_actor_id: null,
  });
  assert.ok(await queryOne('SELECT id FROM gl_game_events WHERE game_id = ? LIMIT 1', [game.id]));

  const glLeftoversNumeric = await leftoverReferences(P, { numeric: true });
  assert.deepEqual(glLeftoversNumeric, [], `lignes restantes : ${glLeftoversNumeric.join(', ')}`);
  const glLeftoversText = await leftoverReferences(String(P), {
    numeric: false,
    acceptedTypes: ['gl_player', 'team'],
    exceptions: [
      // Trace pseudonyme de l'effacement lui-même (`gl_player_delete`), voir le cas élève.
      'audit_log.target_id',
      'security_events.target_id',
    ],
  });
  assert.deepEqual(glLeftoversText, [], `lignes restantes : ${glLeftoversText.join(', ')}`);
  const mirrorLeftovers = await leftoverReferences(mirrorUserId, {
    numeric: false,
    exceptions: ['audit_log.target_id', 'security_events.target_id'],
  });
  assert.deepEqual(mirrorLeftovers, [], `compte miroir : ${mirrorLeftovers.join(', ')}`);
});

test('RG3 — suppression d’un enseignant : avatar effacé, ni nom ni e-mail dans l’audit', async () => {
  const id = crypto.randomUUID();
  const email = `prof.rgpd.${STAMP}@ecole.test`;
  const avatarRel = `${SCRATCH}/prof-avatar.jpg`;
  writeUpload(avatarRel, 'avatar prof');
  await execute(
    `INSERT INTO users (id, user_type, first_name, last_name, display_name, email, password_hash,
       auth_provider, is_active, avatar_path, created_at, updated_at)
     VALUES (?, 'teacher', 'Prof', 'Efface', 'Prof Efface', ?, 'x', 'local', 1, ?, NOW(), NOW())`,
    [id, email, avatarRel],
  );
  await logAudit('login', 'user', id, null, {
    req: { ip: '203.0.113.5', headers: { 'user-agent': 'NavProf/1' } },
    actorUserType: 'teacher',
    actorUserId: id,
  });
  await request(app)
    .delete(`/api/rbac/users/teacher/${id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.equal(fs.existsSync(getAbsolutePath(avatarRel)), false, 'avatar supprimé du disque');
  const audit = await queryOne(
    "SELECT details, payload_json FROM audit_log WHERE action = 'delete_teacher' AND target_id = ? ORDER BY id DESC LIMIT 1",
    [id],
  );
  assert.equal(audit.details, id);
  assert.ok(!String(audit.payload_json || '').includes(email), 'pas d’e-mail dans le payload');
  const ip = await queryOne(
    "SELECT COUNT(*) AS n FROM security_events WHERE target_id = ? AND action = 'login' AND ip_address IS NOT NULL",
    [id],
  );
  assert.equal(Number(ip.n), 0);
});
