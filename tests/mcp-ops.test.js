'use strict';

/**
 * Connecteur MCP — exploitation (lib/mcp/tools/ops.js) :
 * - mémoire : création, mise à jour par sujet, recherche, note périmée, oubli refusé à un autre
 *   compte, refus des secrets et des e-mails, note personnelle invisible aux autres ;
 * - rapport de santé : règles de statut (fonctions pures), outil, stockage et historique,
 *   script cron (e-mail conditionnel, mailer simulé), endpoint `GET /api/health/report`
 *   (sans jeton configuré, jeton absent, faux, bon) ;
 * - fichiers : traversée `..`, lien symbolique sortant, binaire, `.env` masqué, secrets masqués
 *   dans un journal, `tail`, `grep`, refus pour un prof ; `foretmap_cron_status`.
 *
 * Les valeurs factices de secret sont construites à l'exécution (garde-fou
 * `scripts/check-sensitive-files.js`).
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const fx = require('./helpers/mcpFixtures');

fx.enableMcpEnv();

const { app } = require('../server');
const { initSchema, queryOne, execute } = require('../database');
const { evaluateHealth, summarize } = require('../lib/mcp/health/rules');
const { findSecretLike, maskSecrets, maskEnvContent } = require('../lib/mcp/secretMask');

const rnd = (n = 24) => crypto.randomBytes(n).toString('base64url');

let admin;
let admin2;
let prof;
let adminToken;
let admin2Token;
let profToken;
let fileRoot;

/** Arborescence de test : journaux, .env, binaire, lien symbolique sortant. */
function buildFileFixtures() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fmcp-files-'));
  const logs = path.join(dir, 'logs');
  fs.mkdirSync(logs);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'fmcp-outside-'));
  const outsideFile = path.join(outside, 'secret.txt');
  fs.writeFileSync(outsideFile, 'hors racine\n');
  const lines = [];
  for (let i = 1; i <= 120; i += 1)
    lines.push(`[2026-11-03 04:${String(i % 60).padStart(2, '0')}:00] ligne ${i}`);
  // Secrets reconnaissables dans un journal (construits à l'exécution).
  lines.push(`[2026-11-03 05:00:00] appel avec Authorization: Bearer ${rnd()}`);
  lines.push(`[2026-11-03 05:00:01] mysql://deploy:${rnd(9)}@db.local/app`);
  lines.push(`[2026-11-03 05:00:02] GET /cb?token=${rnd()}&x=1`);
  lines.push(`[2026-11-03 05:00:03] DEPLOY_SECRET=${rnd()} contact lea.martin@example.org`);
  lines.push('[2026-11-03 05:00:04] OK : fin');
  fs.writeFileSync(path.join(logs, 'foretmap-auto-deploy.log'), `${lines.join('\n')}\n`);
  fs.writeFileSync(
    path.join(dir, '.env'),
    `DB_PASS=${rnd(10)}\n# ancien : ${rnd(10)}\nexport JWT_SECRET="${rnd()}"\nNODE_ENV=production\n`,
  );
  fs.writeFileSync(path.join(dir, 'image.dat'), Buffer.from([0x89, 0x50, 0x00, 0x01, 0x02, 0x03]));
  fs.writeFileSync(path.join(dir, 'server.key'), `-----BEGIN PRIVATE KEY-----\n${rnd(40)}\n`);
  fs.symlinkSync(outsideFile, path.join(logs, 'evasion.log'));
  fs.symlinkSync(path.join(logs, 'foretmap-auto-deploy.log'), path.join(logs, 'alias.log'));
  return { dir, logs, outside };
}

const testStartedAt = new Date();

test.before(async () => {
  await initSchema();
  fileRoot = buildFileFixtures();
  process.env.MCP_FILE_ROOTS = `logs=${fileRoot.logs},app=${fileRoot.dir}`;
  admin = await fx.createAccount('admin');
  admin2 = await fx.createAccount('admin');
  prof = await fx.createAccount('prof');
  adminToken = (await fx.obtainTokens(app, admin)).access_token;
  admin2Token = (await fx.obtainTokens(app, admin2)).access_token;
  profToken = (await fx.obtainTokens(app, prof)).access_token;
});

test.after(async () => {
  await execute('DELETE FROM mcp_memory WHERE created_by IS NOT NULL AND subject LIKE ?', [
    'test·%',
  ]);
  // Exécutions simulées (succès, échec, rapport de santé) : ne pas les laisser dans la base de
  // test, où elles fausseraient un rapport ultérieur.
  await execute('DELETE FROM scheduled_job_runs WHERE started_at >= ?', [testStartedAt]);
  await execute('DELETE FROM mcp_health_reports WHERE created_at >= ? - INTERVAL 1 SECOND', [
    testStartedAt,
  ]);
  await fx.cleanupAccounts();
  fs.rmSync(fileRoot.dir, { recursive: true, force: true });
  fs.rmSync(fileRoot.outside, { recursive: true, force: true });
  delete process.env.MCP_FILE_ROOTS;
});

test.beforeEach(() => {
  fx.enableMcpEnv();
  process.env.MCP_FILE_ROOTS = `logs=${fileRoot.logs},app=${fileRoot.dir}`;
});

/* ------------------------------------------------------------------ Mémoire */

test('initialize : instructions renvoient vers foretmap_recall / foretmap_remember', async () => {
  const res = await fx.initialize(app, profToken);
  assert.match(res.body.result.instructions, /foretmap_recall/);
  assert.match(res.body.result.instructions, /foretmap_remember/);
});

test('mémoire : création, mise à jour par sujet, recherche par texte et étiquette', async () => {
  const subject = `test·convention ${Date.now()}`;
  const c = await fx.callTool(app, profToken, 'foretmap_remember', {
    subject,
    content: 'Les cartes de test sont presque vides : beaucoup de fiches sans présence.',
    tags: ['Cartes', 'audit'],
  });
  assert.equal(c.isError, false, c.text);
  assert.equal(c.data.action, 'created');
  const u = await fx.callTool(app, profToken, 'foretmap_remember', {
    subject: `  ${subject.toUpperCase()} `,
    content: 'Version corrigée : cartes de test presque vides.',
    tags: ['cartes'],
  });
  assert.equal(u.data.action, 'updated');
  assert.equal(u.data.id, c.data.id);
  const byText = await fx.callTool(app, admin2Token, 'foretmap_recall', {
    query: 'corrigée presque',
  });
  const found = byText.data.notes.find((n) => n.id === c.data.id);
  assert.ok(found, 'note de site visible par un autre compte');
  assert.equal(found.content, 'Version corrigée : cartes de test presque vides.');
  assert.equal(found.stale, false);
  const byTag = await fx.callTool(app, profToken, 'foretmap_recall', { tags: ['cartes'] });
  assert.ok(byTag.data.notes.some((n) => n.id === c.data.id));
  const seeded = await fx.callTool(app, profToken, 'foretmap_recall', { query: 'BINARY' });
  assert.ok(
    seeded.data.notes.some((n) => n.seeded && /emoji/i.test(n.subject)),
    'note semée',
  );
});

test('mémoire : note non vérifiée depuis N jours signalée « à revérifier »', async () => {
  const subject = `test·périmée ${Date.now()}`;
  const c = await fx.callTool(app, profToken, 'foretmap_remember', {
    subject,
    content: 'Ancienne règle.',
  });
  await execute('UPDATE mcp_memory SET verified_at = NOW() - INTERVAL 200 DAY WHERE id = ?', [
    c.data.id,
  ]);
  const r = await fx.callTool(app, profToken, 'foretmap_recall', {
    query: 'Ancienne règle',
    stale_only: true,
  });
  const note = r.data.notes.find((n) => n.id === c.data.id);
  assert.ok(note && note.stale, 'note périmée');
  assert.match(note.note, /revérifier/);
  assert.ok(r.data.hint);
  await fx.callTool(app, profToken, 'foretmap_remember', {
    subject,
    content: 'Ancienne règle, revue.',
  });
  const again = await fx.callTool(app, profToken, 'foretmap_recall', { query: 'Ancienne règle' });
  assert.equal(again.data.notes.find((n) => n.id === c.data.id).stale, false);
});

test('mémoire : oubli refusé à un autre compte, permis à l’auteur et à un admin', async () => {
  const mine = await fx.callTool(app, admin2Token, 'foretmap_remember', {
    subject: `test·à oublier ${Date.now()}`,
    content: 'Note d’un admin.',
  });
  const refused = await fx.callTool(app, profToken, 'foretmap_forget', { id: mine.data.id });
  assert.equal(refused.isError, true);
  assert.equal(refused.data.code, 'MCP_FORBIDDEN');
  const overwrite = await fx.callTool(app, profToken, 'foretmap_remember', {
    subject: mine.data.subject,
    content: 'Réécriture par un prof.',
  });
  assert.equal(overwrite.isError, true, 'réécriture d’une note de site d’autrui refusée');
  const profNote = await fx.callTool(app, profToken, 'foretmap_remember', {
    subject: `test·note prof ${Date.now()}`,
    content: 'Note d’un prof.',
  });
  const byAdmin = await fx.callTool(app, adminToken, 'foretmap_forget', { id: profNote.data.id });
  assert.equal(byAdmin.isError, false, 'un admin peut oublier');
  const byAuthor = await fx.callTool(app, admin2Token, 'foretmap_forget', { id: mine.data.id });
  assert.equal(byAuthor.data.action, 'forgotten');
  assert.equal(await queryOne('SELECT id FROM mcp_memory WHERE id = ?', [mine.data.id]), undefined);
});

test('mémoire : note personnelle invisible et inoubliable par les autres', async () => {
  const p = await fx.callTool(app, profToken, 'foretmap_remember', {
    subject: `test·perso ${Date.now()}`,
    content: 'Rappel personnel.',
    scope: 'user',
  });
  const other = await fx.callTool(app, adminToken, 'foretmap_recall', {
    query: 'Rappel personnel',
  });
  assert.ok(!other.data.notes.some((n) => n.id === p.data.id));
  const del = await fx.callTool(app, adminToken, 'foretmap_forget', { id: p.data.id });
  assert.equal(del.data.code, 'MCP_NOT_FOUND');
  const own = await fx.callTool(app, profToken, 'foretmap_recall', { query: 'Rappel personnel' });
  assert.ok(own.data.notes.some((n) => n.id === p.data.id && n.scope === 'user'));
});

test('mémoire : secrets, hachages et e-mails refusés ; taille bornée', async () => {
  const bcryptLike = `$2b$10$${'a'.repeat(53)}`;
  const cases = [
    `Le mot de passe admin : password=${rnd(8)}`,
    `jeton ${'gh' + 'p_'}${'A1b2'.repeat(10)}`,
    `hachage ${bcryptLike}`,
    'écrire à lea.martin@example.org',
    `Authorization: Bearer ${rnd()}`,
    `clé ${rnd(32)}A1`,
  ];
  for (const content of cases) {
    const r = await fx.callTool(app, profToken, 'foretmap_remember', {
      subject: `test·secret ${Date.now()}`,
      content,
    });
    assert.equal(r.isError, true, `refus attendu : ${content.slice(0, 20)}`);
    assert.equal(r.data.code, 'MCP_MEMORY_REJECTED');
  }
  const big = await fx.rpc(app, profToken, 'tools/call', {
    name: 'foretmap_remember',
    arguments: { subject: 'test·gros', content: 'x'.repeat(4001) },
  });
  assert.ok(big.body.error || big.body.result?.isError);
  // Contenu technique ordinaire : accepté (chemins, numéros, UUID).
  assert.equal(
    findSecretLike('Voir migrations/325_mcp_exploitation.sql et lib/mcp/files/read.js'),
    null,
  );
  assert.equal(findSecretLike(`plan ${crypto.randomUUID()} appliqué`), null);
});

/* --------------------------------------------------------- Règles de statut */

test('règles : vert sans alerte, orange et rouge selon les seuils', () => {
  const ok = evaluateHealth({ database: { ok: true, latencyMs: 3 }, schema: { pending: [] } });
  assert.equal(ok.status, 'green');
  assert.match(summarize(ok), /^VERT/);
  assert.equal(evaluateHealth({ database: { ok: true, latencyMs: 700 } }).status, 'orange');
  assert.equal(evaluateHealth({ database: { ok: false } }).status, 'red');
  assert.equal(
    evaluateHealth({ schema: { pending: [326], current: 325, latest: 326 } }).status,
    'red',
  );
  const http = (d) => evaluateHealth({ http: { available: true, last24h: d } }).status;
  assert.equal(http({ requests: 1000, http5xx: 4, http429: 0 }), 'green');
  assert.equal(http({ requests: 1000, http5xx: 6, http429: 0 }), 'orange');
  assert.equal(http({ requests: 1000, http5xx: 60, http429: 0 }), 'red');
  assert.equal(http({ requests: 200, http5xx: 12, http429: 0 }), 'red', '≥ 5 %');
  assert.equal(http({ requests: 10, http5xx: 0, http429: 600 }), 'orange');
  const tls = (h) => evaluateHealth({ tls: { hosts: [h] } }).status;
  assert.equal(tls({ host: 'a', authorized: true, daysRemaining: 60 }), 'green');
  assert.equal(tls({ host: 'a', authorized: true, daysRemaining: 10 }), 'orange');
  assert.equal(tls({ host: 'a', authorized: true, daysRemaining: 3 }), 'red');
  assert.equal(tls({ host: 'a', authorized: false, daysRemaining: 60 }), 'red');
  assert.equal(tls({ host: 'a', error: 'ENOTFOUND' }), 'orange');
  assert.equal(evaluateHealth({ disk: { freePct: 8 } }).status, 'orange');
  assert.equal(evaluateHealth({ disk: { freePct: 3 } }).status, 'red');
  assert.equal(
    evaluateHealth({
      cron: { jobs: [{ job: 'db_backup', state: 'late', ageHours: 50, expectedEveryHours: 24 }] },
    }).status,
    'orange',
  );
  // Tâche jamais tracée : orange seulement si la ligne de crontab attendue est connue (`hint`).
  const never = evaluateHealth({
    cron: { jobs: [{ job: 'db_backup', state: 'never', hint: 'Ligne de crontab attendue : …' }] },
  });
  assert.equal(never.status, 'orange');
  assert.match(
    never.findings[0].message,
    /db_backup : aucune trace d’exécution — Ligne de crontab/,
  );
  assert.equal(
    evaluateHealth({ cron: { jobs: [{ job: 'autre', state: 'never' }] } }).status,
    'green',
  );
  assert.equal(evaluateHealth({ restarts: { counts: { crashes: 1 } } }).status, 'orange');
  assert.equal(evaluateHealth({ app: { reachable: false, error: 'HTTP 502' } }).status, 'red');
  // Une case G&L dont la promesse n'est pas tenue est un défaut visible des élèves : orange.
  const promesses = evaluateHealth({
    audit: { total_findings: 3, byCheck: { gl_marker_promises: 3 } },
  });
  assert.equal(promesses.status, 'orange');
  assert.ok(promesses.findings.some((f) => f.rule === 'audit_gl_marker_promises'));
  const info = evaluateHealth({ audit: { total_findings: 300 } });
  assert.equal(info.status, 'green', 'les constats du corpus n’alertent pas');
  assert.equal(info.findings[0].level, 'info');
  const mixed = evaluateHealth({ disk: { freePct: 8 }, database: { ok: false } });
  assert.equal(mixed.findings[0].level, 'red', 'constats triés par gravité');
});

/* -------------------------------------------------------- Rapport de santé */

test('foretmap_health_report : admin seulement, rapport structuré, stockage et historique', async () => {
  const names = await fx.listTools(app, profToken);
  assert.ok(!names.includes('foretmap_health_report'), 'pas pour un prof');
  const denied = await fx.callTool(app, profToken, 'foretmap_health_report', {});
  assert.equal(denied.isError, true);
  const res = await fx.callTool(app, adminToken, 'foretmap_health_report', {
    skip_tls: true,
    store: true,
  });
  assert.equal(res.isError, false, res.text);
  const r = res.data;
  assert.ok(['green', 'orange', 'red'].includes(r.status));
  assert.match(r.summary, /^(VERT|ORANGE|ROUGE)/);
  assert.equal(r.process.version, require('../package.json').version);
  assert.equal(r.database.ok, true);
  assert.ok(Array.isArray(r.tables.largest) && r.tables.largest.length > 0);
  assert.ok(r.http.last24h && 'http5xx' in r.http.last24h && 'http429' in r.http.last24h);
  assert.ok(r.http.last7d);
  assert.ok(Number.isFinite(r.disk.freePct));
  assert.ok(Number.isFinite(r.mcp.activeConnections) && r.mcp.activeConnections >= 3);
  assert.ok(Number.isFinite(r.audit.total_findings));
  assert.ok(Array.isArray(r.cron.jobs));
  assert.ok(r.thresholds.dbLatencyRedMs > 0, 'règles explicites');
  assert.ok(r.stored.id > 0);
  const hist = await fx.callTool(app, adminToken, 'foretmap_health_history', { days: 7 });
  assert.equal(hist.isError, false, hist.text);
  assert.ok(hist.data.reports.some((x) => x.id === r.stored.id));
  assert.ok(hist.data.current);
  const one = await fx.callTool(app, adminToken, 'foretmap_health_history', { id: r.stored.id });
  assert.equal(one.data.report.status, r.status);
});

test('stockage : évolution du statut et purge des rapports anciens', async () => {
  const store = require('../lib/mcp/health/store');
  const base = { summary: 's', findings: [] };
  const a = await store.storeReport({ ...base, status: 'green' }, 'tool');
  const b = await store.storeReport({ ...base, status: 'red' }, 'tool');
  const h = await store.listReports({ days: 1, limit: 200 });
  assert.equal(h.current.status, 'red');
  assert.ok(h.changes.some((c) => c.to === 'red'));
  await execute(
    'UPDATE mcp_health_reports SET created_at = NOW() - INTERVAL 400 DAY WHERE id = ?',
    [a.id],
  );
  const purged = await store.purgeOldReports(90);
  assert.ok(purged >= 1);
  assert.equal(await queryOne('SELECT id FROM mcp_health_reports WHERE id = ?', [a.id]), undefined);
  assert.ok(await queryOne('SELECT id FROM mcp_health_reports WHERE id = ?', [b.id]));
});

test('TLS : hôte injoignable → erreur gérée, sans exception', async () => {
  const { checkTlsHost } = require('../lib/mcp/health/collect');
  const r = await checkTlsHost('127.0.0.1', { port: 1, timeoutMs: 1000 });
  assert.ok(r.error, 'erreur renvoyée');
  process.env.MCP_PUBLIC_BASE_URL = 'https://foretmap.example.org';
  const { tlsHosts } = require('../lib/mcp/health/collect');
  assert.deepEqual(tlsHosts(), ['foretmap.example.org', 'gl.example.org']);
});

test('GET /api/health/report : 404 sans jeton configuré, 401 sans/faux jeton, 200 avec le bon', async () => {
  delete process.env.MCP_HEALTH_TOKEN;
  assert.equal((await request(app).get('/api/health/report')).status, 404);
  const token = rnd();
  process.env.MCP_HEALTH_TOKEN = token;
  try {
    assert.equal((await request(app).get('/api/health/report')).status, 401);
    const wrong = await request(app).get('/api/health/report').set('X-Health-Token', `${token}x`);
    assert.equal(wrong.status, 401);
    const ok = await request(app)
      .get('/api/health/report?tls=0&audit=0')
      .set('X-Health-Token', token);
    assert.equal(ok.status, 200, ok.text);
    assert.ok(['green', 'orange', 'red'].includes(ok.body.status));
    assert.equal(ok.headers['cache-control'], 'no-store');
    assert.equal(ok.body.audit.skipped, true);
  } finally {
    delete process.env.MCP_HEALTH_TOKEN;
  }
  const { healthTokenMatches } = require('../routes/health');
  assert.equal(healthTokenMatches('', ''), false);
  assert.equal(healthTokenMatches('a', 'a'), true);
});

test('script cron : stocke, trace, e-mail seulement si orange/rouge (ou daily)', async () => {
  const { runHealthReportJob, shouldEmail, emailMode } = require('../scripts/health-report');
  assert.equal(shouldEmail('green', 'alert'), false);
  assert.equal(shouldEmail('orange', 'alert'), true);
  assert.equal(shouldEmail('red', 'alert'), true);
  assert.equal(shouldEmail('green', 'daily'), true);
  assert.equal(shouldEmail('red', 'off'), false);
  assert.equal(emailMode({ MCP_HEALTH_REPORT_EMAIL: 'daily' }), 'daily');
  assert.equal(emailMode({}), 'alert');

  const sent = [];
  const sendAlert = async (m) => {
    sent.push(m);
    return true;
  };
  const token = rnd();
  const greenReport = {
    status: 'green',
    summary: 'VERT',
    findings: [],
    database: { ok: true, latencyMs: 2 },
    schema: { pending: [] },
  };
  // 1. Application qui répond vert : pas d'e-mail.
  let r = await runHealthReportJob({
    env: { HEALTH_REPORT_BASE_URL: 'https://site.test', MCP_HEALTH_TOKEN: token },
    fetchImpl: async (url, opts) => {
      assert.equal(url, 'https://site.test/api/health/report');
      assert.equal(opts.headers['X-Health-Token'], token);
      return { status: 200, json: async () => ({ ...greenReport }) };
    },
    sendAlert,
    log: () => {},
  });
  assert.equal(r.status, 'green');
  assert.equal(r.via, 'endpoint');
  assert.equal(r.emailed, false);
  assert.equal(sent.length, 0);
  const row = await queryOne('SELECT source, status FROM mcp_health_reports WHERE id = ?', [
    r.stored.id,
  ]);
  assert.deepEqual({ ...row }, { source: 'cron', status: 'green' });
  // 2. Même rapport, mode quotidien : e-mail.
  r = await runHealthReportJob({
    env: {
      HEALTH_REPORT_BASE_URL: 'https://site.test',
      MCP_HEALTH_TOKEN: token,
      MCP_HEALTH_REPORT_EMAIL: 'daily',
    },
    fetchImpl: async () => ({ status: 200, json: async () => ({ ...greenReport }) }),
    sendAlert,
    log: () => {},
  });
  assert.equal(r.emailed, true);
  assert.equal(sent.length, 1);
  // 3. Application injoignable : rouge, e-mail, rapport construit localement.
  r = await runHealthReportJob({
    env: {
      HEALTH_REPORT_BASE_URL: 'https://site.test',
      MCP_HEALTH_TOKEN: token,
      MCP_HEALTH_TLS_HOSTS: '',
    },
    fetchImpl: async () => ({ status: 502, json: async () => ({}) }),
    sendAlert,
    log: () => {},
  });
  assert.equal(r.status, 'red');
  assert.equal(r.via, 'local');
  assert.ok(r.report.findings.some((f) => f.rule === 'app_unreachable'));
  assert.equal(sent.length, 2);
  assert.match(sent[1].subject, /ROUGE/);
  assert.doesNotMatch(sent[1].text, /@[a-z0-9-]+\./i, 'aucune adresse dans l’e-mail');
  // Exécution tracée pour foretmap_cron_status.
  const run = await queryOne(
    "SELECT outcome, detail FROM scheduled_job_runs WHERE job = 'health_report' ORDER BY id DESC LIMIT 1",
  );
  assert.equal(run.outcome, 'success');
  assert.match(run.detail, /status=red/);
});

/* ------------------------------------------------------------------ Fichiers */

test('fichiers : outils absents pour un prof et refusés à l’appel', async () => {
  const names = await fx.listTools(app, profToken);
  for (const n of [
    'foretmap_list_files',
    'foretmap_read_file',
    'foretmap_grep_files',
    'foretmap_cron_status',
  ]) {
    assert.ok(!names.includes(n), `${n} réservé à l’admin`);
    const r = await fx.callTool(
      app,
      profToken,
      n,
      n === 'foretmap_read_file'
        ? { root: 'logs', path: 'foretmap-auto-deploy.log' }
        : n === 'foretmap_grep_files'
          ? { root: 'logs', pattern: 'x' }
          : {},
    );
    assert.equal(r.isError, true, `${n} refusé`);
  }
  const adminNames = await fx.listTools(app, adminToken);
  for (const n of [
    'foretmap_list_files',
    'foretmap_read_file',
    'foretmap_grep_files',
    'foretmap_cron_status',
    'foretmap_recall',
    'foretmap_health_report',
  ]) {
    assert.ok(adminNames.includes(n), `${n} pour l’admin`);
  }
  process.env.MCP_FILES_ENABLED = 'false';
  assert.ok(!(await fx.listTools(app, adminToken)).includes('foretmap_read_file'), 'drapeau');
  delete process.env.MCP_FILES_ENABLED;
});

test('fichiers : racines, liste, lecture offset/limit et tail', async () => {
  const roots = await fx.callTool(app, adminToken, 'foretmap_list_files', {});
  assert.deepEqual(
    roots.data.roots.map((r) => r.name),
    ['logs', 'app', 'pino'],
  );
  const list = await fx.callTool(app, adminToken, 'foretmap_list_files', { root: 'logs' });
  assert.ok(
    list.data.entries.some((e) => e.name === 'foretmap-auto-deploy.log' && e.type === 'file'),
  );
  const page = await fx.callTool(app, adminToken, 'foretmap_read_file', {
    root: 'logs',
    path: 'foretmap-auto-deploy.log',
    offset: 10,
    limit: 5,
  });
  assert.equal(page.isError, false, page.text);
  assert.equal(page.data.returned_lines, 5);
  assert.match(page.data.content.split('\n')[0], /ligne 10$/);
  assert.equal(page.data.next_offset, 15);
  const tail = await fx.callTool(app, adminToken, 'foretmap_read_file', {
    root: 'logs',
    path: 'foretmap-auto-deploy.log',
    tail: 3,
  });
  assert.equal(tail.data.returned_lines, 3);
  assert.match(tail.data.content, /OK : fin$/);
  const pino = await fx.callTool(app, adminToken, 'foretmap_read_file', { root: 'pino', tail: 5 });
  assert.equal(pino.isError, false, pino.text);
  assert.ok(Array.isArray(pino.data.entries));
});

test('fichiers : secrets d’un journal masqués (Bearer, URL, token=, CLE=, e-mail)', async () => {
  const raw = fs.readFileSync(path.join(fileRoot.logs, 'foretmap-auto-deploy.log'), 'utf8');
  const secrets = [
    /Bearer (\S+)/.exec(raw)[1],
    /deploy:([^@]+)@/.exec(raw)[1],
    /token=([^&]+)&/.exec(raw)[1],
    /DEPLOY_SECRET=(\S+)/.exec(raw)[1],
    'lea.martin@example.org',
  ];
  const r = await fx.callTool(app, adminToken, 'foretmap_read_file', {
    root: 'logs',
    path: 'foretmap-auto-deploy.log',
    tail: 10,
  });
  for (const s of secrets) assert.ok(!r.text.includes(s), `secret transmis : ${s.slice(0, 4)}…`);
  assert.match(r.data.content, /Bearer \*\*\*\*/);
  assert.match(r.data.content, /DEPLOY_SECRET=\*\*\*\*/);
  assert.match(r.data.content, /deploy:\*\*\*\*@/);
  const g = await fx.callTool(app, adminToken, 'foretmap_grep_files', {
    root: 'logs',
    pattern: 'DEPLOY_SECRET',
  });
  assert.equal(g.data.count >= 1, true);
  for (const s of secrets) assert.ok(!g.text.includes(s), 'grep : secret transmis');
  const search = await fx.callTool(app, adminToken, 'foretmap_grep_files', {
    root: 'logs',
    pattern: secrets[3].slice(0, 12),
  });
  assert.equal(search.data.count, 0, 'un secret masqué ne se retrouve pas par motif');
});

test('fichiers : .env réduit aux noms de variables, clé jamais transmise', async () => {
  const raw = fs.readFileSync(path.join(fileRoot.dir, '.env'), 'utf8');
  const r = await fx.callTool(app, adminToken, 'foretmap_read_file', { root: 'app', path: '.env' });
  assert.equal(r.isError, false, r.text);
  assert.equal(
    r.data.content,
    'DB_PASS=****\n# [commentaire masqué]\nJWT_SECRET=****\nNODE_ENV=****',
  );
  for (const v of raw.match(/[A-Za-z0-9_-]{10,}/g).filter((v) => !/^[A-Z_]+$/.test(v))) {
    assert.ok(!r.text.includes(v), 'valeur du .env transmise');
  }
  const key = await fx.callTool(app, adminToken, 'foretmap_read_file', {
    root: 'app',
    path: 'server.key',
  });
  assert.equal(key.data.masked, 'key');
  assert.doesNotMatch(key.text, /BEGIN PRIVATE KEY/);
  const g = await fx.callTool(app, adminToken, 'foretmap_grep_files', {
    root: 'app',
    pattern: 'DB_PASS',
  });
  assert.ok(!g.data.results.some((x) => x.file === '.env'), '.env exclu de la recherche');
  assert.equal(
    maskEnvContent('A=1\n\n[client]\nmot de passe libre'),
    'A=****\n\n[client]\n[ligne masquée]',
  );
});

test('fichiers : traversée « .. », chemin absolu, lien symbolique sortant, binaire refusés', async () => {
  const cases = [
    [{ root: 'logs', path: '../.env' }, 'MCP_FILE_TRAVERSAL'],
    [{ root: 'logs', path: '../../../../etc/passwd' }, 'MCP_FILE_TRAVERSAL'],
    [{ root: 'logs', path: '/etc/passwd' }, 'MCP_FILE_REFUSED'],
    [{ root: 'logs', path: 'evasion.log' }, 'MCP_FILE_TRAVERSAL'],
    [{ root: 'app', path: 'image.dat' }, 'MCP_FILE_BINARY'],
    [{ root: 'inconnue', path: 'x' }, 'MCP_FILE_UNKNOWN_ROOT'],
  ];
  for (const [args, code] of cases) {
    const r = await fx.callTool(app, adminToken, 'foretmap_read_file', args);
    assert.equal(r.isError, true, JSON.stringify(args));
    assert.equal(r.data.code, code, JSON.stringify(args));
  }
  const inside = await fx.callTool(app, adminToken, 'foretmap_read_file', {
    root: 'logs',
    path: 'alias.log',
    tail: 1,
  });
  assert.equal(inside.isError, false, 'lien interne à la racine admis');
  const g = await fx.callTool(app, adminToken, 'foretmap_grep_files', {
    root: 'logs',
    pattern: 'hors racine',
  });
  assert.equal(g.data.count, 0, 'grep ne suit pas un lien sortant');
  const bad = await fx.callTool(app, adminToken, 'foretmap_grep_files', {
    root: 'logs',
    pattern: '(a+)+$',
    regex: true,
  });
  assert.equal(bad.isError, true, 'motif catastrophique refusé');
});

test('grep : motif, glob et plafond de résultats', async () => {
  const r = await fx.callTool(app, adminToken, 'foretmap_grep_files', {
    root: 'logs',
    pattern: 'ligne 1\\d$',
    regex: true,
    glob: '*.log',
    max_results: 3,
  });
  assert.equal(r.isError, false, r.text);
  assert.equal(r.data.count, 3);
  assert.ok(r.data.results.every((x) => /\.log$/.test(x.file) && x.line > 0));
});

test('masquage : formes de secrets courantes', () => {
  const t = rnd();
  const out = maskSecrets(
    `Authorization: Bearer ${t} https://u:${t}@h/ ?password=${t} "apiKey": "${t}" SMTP_PASS=${t}`,
  );
  assert.ok(!out.includes(t), out);
  assert.equal(maskSecrets('NODE_ENV=production status=200'), 'NODE_ENV=production status=200');
});

test('foretmap_cron_status : jobs connus, traces en base et journaux', async () => {
  const { trackJobRun } = require('../lib/scheduledJobs');
  await trackJobRun('recurring_tasks', async () => ({ created: [1, 2], errors: [] }));
  await assert.rejects(
    trackJobRun('auto_archive', async () => {
      throw new Error(`échec ${crypto.randomUUID()}`);
    }),
  );
  process.env.MCP_CRON_LOG_DIR = fileRoot.logs;
  try {
    const r = await fx.callTool(app, adminToken, 'foretmap_cron_status', {});
    assert.equal(r.isError, false, r.text);
    const by = Object.fromEntries(r.data.jobs.map((j) => [j.job, j]));
    assert.equal(by.recurring_tasks.state, 'ok');
    assert.match(by.recurring_tasks.detail, /created=2/);
    assert.equal(by.auto_archive.state, 'failure');
    assert.doesNotMatch(by.auto_archive.detail, /[0-9a-f]{8}-[0-9a-f]{4}/, 'identifiant retiré');
    assert.ok(by.auto_deploy, 'journal de déploiement lu');
    assert.ok(['ok', 'late'].includes(by.auto_deploy.state));
    assert.equal(by.auto_deploy.hint, undefined, 'une tâche tracée ne porte pas de hint');
    // Aucun `db-backup.log` dans l'arborescence de test : la ligne de crontab attendue
    // (docs/CRONTAB.md) est servie telle quelle, gabarit USER / <domaine-foretmap> compris.
    assert.equal(by.db_backup.state, 'never');
    assert.match(by.db_backup.hint, /docs\/CRONTAB\.md/);
    assert.match(
      by.db_backup.hint,
      /0 3 \* \* \* APP_DIR=\/home\/USER\/foretmap bash .*db-backup\.sh/,
    );
    assert.equal(by.uptime_check.state, 'never');
    assert.match(by.uptime_check.hint, /<domaine-foretmap>.*uptime-check\.sh/);
    assert.equal(by.moodle_sync.state, 'not_configured');
    assert.equal(by.moodle_sync.hint, undefined, 'tâche facultative : pas de ligne imposée');
    const { CRONTAB_HINTS } = require('../lib/mcp/files/cron');
    for (const job of [
      'health_report',
      'db_backup',
      'retention_purge',
      'auto_deploy',
      'uptime_check',
    ]) {
      assert.ok(CRONTAB_HINTS[job], `ligne de crontab connue pour ${job}`);
    }
    assert.ok(!r.text.includes('lea.martin@example.org'));
    assert.equal(r.data.crontab.available, false);
    assert.match(r.data.crontab.reason, /MCP_CRON_READ_CRONTAB/);
    assert.ok(r.data.problems.includes('auto_archive'));
  } finally {
    delete process.env.MCP_CRON_LOG_DIR;
  }
});
