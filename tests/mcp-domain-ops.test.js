'use strict';

/**
 * Outil `foretmap_ops` (lot D4) : réservé à `mcp.ops` et au réglage `mcp.ops_enabled` ;
 * tâche planifiée lancée à la demande (tracée), migrations (à jour : rien n'est lancé),
 * redémarrage (`tmp/restart.txt` touché), sauvegardes `structure` / `anonymized` / `full` (fichier
 * et lien signé, élèves pseudonymisés), stockage, état du déploiement, purge de conservation
 * (simulation ; réelle verrouillée sans `RETENTION_PURGE_APPLY=1`), caches, scripts d'exploitation
 * (liste blanche, lecture réelle, refus hors catalogue).
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const fx = require('./helpers/mcpFixtures');
const { initSchema, queryOne, execute } = require('../database');

fx.enableMcpEnv();

const { app } = require('../server');

const STAMP = `${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;
const EXPORT_DIR = path.join(__dirname, '..', 'uploads', 'mcp-exports');
const dumpFiles = [];
let token;
let studentId;
let retentionRunsBefore = 0;

const call = (args) => fx.callTool(app, token, 'foretmap_ops', args);

function readDump(file) {
  dumpFiles.push(file);
  return fs.readFileSync(path.join(EXPORT_DIR, file), 'utf8');
}

test.before(async () => {
  await initSchema();
  const admin = await fx.createAccount('admin');
  token = (await fx.obtainTokens(app, admin)).access_token;
  studentId = crypto.randomUUID();
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, first_name, last_name, display_name,
                        is_active, auth_provider, created_at, updated_at)
     VALUES (?, 'student', ?, ?, 'Zéphyrine', ?, ?, 1, 'local', NOW(), NOW())`,
    [
      studentId,
      `zephyrine_${STAMP}@example.test`,
      `zeph_${STAMP}`,
      `Dumpnom${STAMP}`,
      `Zéphyrine Dumpnom${STAMP}`,
    ],
  );
  const row = await queryOne('SELECT COALESCE(MAX(id), 0) AS id FROM retention_purge_runs');
  retentionRunsBefore = Number(row.id);
});

test.after(async () => {
  for (const f of dumpFiles) fs.rmSync(path.join(EXPORT_DIR, f), { force: true });
  if (studentId) await execute('DELETE FROM users WHERE id = ?', [studentId]);
  await execute('DELETE FROM retention_purge_runs WHERE id > ?', [retentionRunsBefore]);
  await fx.cleanupAccounts();
});

test.beforeEach(() => fx.enableMcpEnv());

test('accès : réservé à mcp.ops, retiré par mcp.ops_enabled et par le domaine', async () => {
  let tools = await fx.listTools(app, token);
  assert.ok(tools.includes('foretmap_ops'));
  const prof = await fx.createAccount('prof');
  const profToken = (await fx.obtainTokens(app, prof)).access_token;
  const profTools = await fx.listTools(app, profToken);
  assert.ok(!profTools.includes('foretmap_ops'), 'prof sans mcp.ops');
  const denied = await fx.callTool(app, profToken, 'foretmap_ops', { action: 'deploy_status' });
  assert.equal(denied.isError, true);

  process.env.MCP_OPS_ENABLED = 'false';
  tools = await fx.listTools(app, token);
  assert.ok(!tools.includes('foretmap_ops'));
  fx.enableMcpEnv({ MCP_DOMAINS_DISABLED: 'ops' });
  tools = await fx.listTools(app, token);
  assert.ok(!tools.includes('foretmap_ops'));
  const r = await call({ action: 'cron_jobs' });
  assert.equal(r.isError, true);
});

test('run_cron : tâche lancée tout de suite et tracée ; audit via mcp', async () => {
  const jobs = await call({ action: 'cron_jobs' });
  assert.equal(jobs.isError, false, jobs.text);
  assert.equal(jobs.data.jobs.length, 5);
  const before = await queryOne(
    "SELECT COALESCE(MAX(id), 0) AS id FROM scheduled_job_runs WHERE job = 'notifications_purge'",
  );
  const r = await call({ action: 'run_cron', job: 'notifications_purge' });
  assert.equal(r.isError, false, r.text);
  assert.equal(r.data.job, 'notifications_purge');
  const run = await queryOne(
    "SELECT outcome FROM scheduled_job_runs WHERE job = 'notifications_purge' AND id > ? ORDER BY id DESC LIMIT 1",
    [before.id],
  );
  assert.equal(run.outcome, 'success');
  const audit = await queryOne(
    "SELECT payload_json FROM audit_log WHERE action = 'mcp_ops_run_cron' ORDER BY id DESC LIMIT 1",
  );
  const payload =
    typeof audit.payload_json === 'string' ? JSON.parse(audit.payload_json) : audit.payload_json;
  assert.equal(payload.via, 'mcp');
  assert.equal(payload.job, 'notifications_purge');
  const bad = await call({ action: 'run_cron', job: 'inconnu' });
  assert.equal(bad.isError, true);
});

test('migrate : base à jour, rien n’est lancé ; deploy_status', async () => {
  const dry = await call({ action: 'migrate', dry_run: true });
  assert.equal(dry.isError, false, dry.text);
  assert.equal(dry.data.ran, false);
  assert.equal(dry.data.up_to_date, true);
  const run = await call({ action: 'migrate' });
  assert.equal(run.isError, false, run.text);
  assert.equal(run.data.ran, false);

  const st = await call({ action: 'deploy_status' });
  assert.equal(st.isError, false, st.text);
  assert.equal(st.data.version, require('../package.json').version);
  assert.equal(st.data.schema.upToDate, true);
  assert.ok('git_sha' in st.data.revision);
});

test('restart : tmp/restart.txt touché', async () => {
  const { restartFilePath } = require('../lib/bootJournal');
  const file = restartFilePath();
  const existed = fs.existsSync(file);
  const dirExisted = fs.existsSync(path.dirname(file));
  const before = existed ? fs.statSync(file).mtimeMs : 0;
  try {
    const r = await call({ action: 'restart' });
    assert.equal(r.isError, false, r.text);
    assert.ok(fs.existsSync(file));
    assert.ok(fs.statSync(file).mtimeMs >= before);
    assert.equal(r.data.file, path.join('tmp', 'restart.txt'));
  } finally {
    if (!existed) fs.rmSync(file, { force: true });
    if (!dirExisted) fs.rmSync(path.dirname(file), { recursive: true, force: true });
  }
});

test('dump structure (Node) : DDL seulement, lien signé', async () => {
  const r = await call({ action: 'dump', kind: 'structure', engine: 'node' });
  assert.equal(r.isError, false, r.text);
  assert.equal(r.data.engine, 'node');
  assert.match(r.data.url, /\/uploads\/mcp-exports\//);
  const sql = readDump(r.data.file);
  assert.match(sql, /CREATE TABLE `users`/);
  assert.doesNotMatch(sql, /INSERT INTO/);
});

test('dump anonymized : élèves pseudonymisés, secrets retirés', async () => {
  const r = await call({ action: 'dump', kind: 'anonymized' });
  assert.equal(r.isError, false, r.text);
  assert.equal(r.data.engine, 'node');
  const sql = readDump(r.data.file);
  assert.match(sql, /INSERT INTO `users`/);
  assert.ok(!sql.includes(`Dumpnom${STAMP}`), 'nom de l’élève absent');
  assert.ok(!sql.includes(`zephyrine_${STAMP}@example.test`), 'e-mail absent');
  assert.ok(sql.includes(`anon_${studentId}`), 'pseudo anonyme présent');
  assert.ok(!/\$2[aby]\$\d\d\$/.test(sql), 'aucune empreinte bcrypt');
  assert.ok(r.data.structure_only_tables.includes('app_settings'));
});

test('dump full : tout, y compris l’élève en clair', async () => {
  const r = await call({ action: 'dump', kind: 'full', engine: 'node' });
  assert.equal(r.isError, false, r.text);
  assert.ok(r.data.attention);
  const sql = readDump(r.data.file);
  assert.ok(sql.includes(`Dumpnom${STAMP}`));
  assert.match(sql, /INSERT INTO `app_settings`/);
  const auto = await call({ action: 'dump', kind: 'structure' });
  assert.equal(auto.isError, false, auto.text);
  assert.ok(['mysqldump', 'node'].includes(auto.data.engine));
  assert.match(readDump(auto.data.file), /CREATE TABLE `users`/);
});

test('storage_report, retention (simulation ; réelle verrouillée), clear_caches', async () => {
  const st = await call({ action: 'storage_report', orphans_preview: 5 });
  assert.equal(st.isError, false, st.text);
  assert.equal(typeof st.data.uploads.total_bytes, 'number');
  assert.ok('image_relay_cache' in st.data);
  assert.ok(st.data.orphans.count !== undefined || st.data.orphans.error);

  const prev = await call({ action: 'retention_preview', only: ['mcp_exports'] });
  assert.equal(prev.isError, false, prev.text);
  assert.equal(prev.data.mode, 'simulation');
  assert.ok(prev.data.runId > retentionRunsBefore);

  delete process.env.RETENTION_PURGE_APPLY;
  const real = await call({ action: 'retention_run', only: ['mcp_exports'] });
  assert.equal(real.isError, true);
  assert.match(real.text, /verrouill/);
  assert.match(real.text, /RETENTION_PURGE_APPLY/);

  const caches = await call({ action: 'clear_caches' });
  assert.equal(caches.isError, false, caches.text);
  assert.ok(caches.data.cleared.includes('réglages'));
  assert.ok(caches.data.cleared.includes('vues de tutoriels'));
  assert.deepEqual(caches.data.failed, []);
});

test('scripts : liste blanche, lecture réelle (db_migration_status), refus hors catalogue', async () => {
  const list = await call({ action: 'scripts' });
  assert.equal(list.isError, false, list.text);
  assert.ok(list.data.scripts.some((x) => x.id === 'rewards_backfill' && x.apply_available));

  const dry = await call({ action: 'script_dry_run', script: 'db_migration_status' });
  assert.equal(dry.isError, false, dry.text);
  assert.equal(dry.data.mode, 'lecture');
  assert.equal(dry.data.exit_code, 0, dry.data.stderr);
  const audit = await queryOne(
    "SELECT payload_json FROM audit_log WHERE action = 'mcp_ops_script_dry_run' ORDER BY id DESC LIMIT 1",
  );
  const payload =
    typeof audit.payload_json === 'string' ? JSON.parse(audit.payload_json) : audit.payload_json;
  assert.equal(payload.via, 'mcp');
  assert.equal(payload.script, 'db_migration_status');

  const ro = await call({ action: 'run_script', script: 'db_migration_status' });
  assert.equal(ro.isError, true);
  assert.match(ro.text, /lecture seule/);
  const bad = await call({ action: 'script_dry_run', script: 'totp-admin' });
  assert.equal(bad.isError, true);
  const opt = await call({
    action: 'script_dry_run',
    script: 'rewards_backfill',
    options: { file: '/etc/passwd' },
  });
  assert.equal(opt.isError, true);
  assert.match(opt.text, /Option inconnue/);
});

test('écritures refusées sans portée foretmap.write ; lectures conservées', async () => {
  const admin2 = await fx.createAccount('admin');
  const ro = (await fx.obtainTokens(app, admin2, { scope: 'foretmap.read' })).access_token;
  const w = await fx.callTool(app, ro, 'foretmap_ops', { action: 'clear_caches' });
  assert.equal(w.isError, true);
  assert.match(w.text, /foretmap\.write/);
  const r = await fx.callTool(app, ro, 'foretmap_ops', { action: 'deploy_status' });
  assert.equal(r.isError, false, r.text);
});
