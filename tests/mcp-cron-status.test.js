'use strict';

/**
 * `foretmap_cron_status` — recherche des journaux dans **plusieurs** dossiers
 * (`lib/mcp/files/cron.js`, `lib/mcp/files/roots.js`) :
 * - le journal le plus récent l'emporte, quel que soit le dossier ;
 * - un dossier `logs/` d'application qui existe (journal de cycle de vie) ne masque plus un
 *   dossier de crontab situé ailleurs ;
 * - journal introuvable mais fichier de sauvegarde présent → `log_not_found` (ou `late` si la
 *   sauvegarde est trop vieille), avec `searched_dirs` ;
 * - aucune trace nulle part → `never`, avec `searched_dirs` et la ligne de crontab attendue.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { initSchema } = require('../database');
const {
  collectEvidence,
  fileJobs,
  getCronStatus,
  latestBackupFile,
} = require('../lib/mcp/files/cron');
const { cronLogDirCandidates, existingDirs, getFileRoots } = require('../lib/mcp/files/roots');
const { evaluateHealth } = require('../lib/mcp/health/rules');

const H = 3600 * 1000;
const NOW = Date.parse('2026-11-11T10:00:00');

function stamp(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `[${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}]`;
}

function tmpTree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-cron-'));
  const appLogs = path.join(root, 'app', 'logs');
  const cronLogs = path.join(root, 'home', 'foretmap', 'logs');
  const backups = path.join(root, 'home', 'foretmap', 'backups');
  for (const d of [appLogs, cronLogs, backups]) fs.mkdirSync(d, { recursive: true });
  // L'application écrit elle-même dans son `logs/` : c'est ce qui masquait l'autre dossier.
  fs.writeFileSync(path.join(appLogs, 'boot-journal.ndjson'), '{}\n');
  return { root, appLogs, cronLogs, backups, missing: path.join(root, 'absent') };
}

test.before(async () => {
  await initSchema();
});

test('journal hors du premier dossier : trouvé, dossier indiqué', () => {
  const t = tmpTree();
  fs.writeFileSync(
    path.join(t.cronLogs, 'uptime.log'),
    `${stamp(NOW - 2 * 60 * 1000)} [uptime] OK\n`,
  );
  const jobs = fileJobs(NOW, { logDirs: [t.appLogs, t.cronLogs] });
  const uptime = jobs.find((j) => j.job === 'uptime_check');
  assert.equal(uptime.state, 'ok');
  assert.equal(uptime.log_dir, t.cronLogs);
  assert.equal(uptime.searched_dirs, undefined, 'tâche tracée : pas de liste de dossiers');
});

test('même journal dans deux dossiers : le plus récent l’emporte', () => {
  const t = tmpTree();
  const old = path.join(t.appLogs, 'db-backup.log');
  const recent = path.join(t.cronLogs, 'db-backup.log');
  fs.writeFileSync(old, `${stamp(NOW - 30 * 24 * H)} [db-backup] OK : ancien\n`);
  fs.utimesSync(old, new Date(NOW - 30 * 24 * H), new Date(NOW - 30 * 24 * H));
  fs.writeFileSync(recent, `${stamp(NOW - 7 * H)} [db-backup] OK : récent\n`);
  fs.utimesSync(recent, new Date(NOW - 7 * H), new Date(NOW - 7 * H));
  const job = fileJobs(NOW, { logDirs: [t.appLogs, t.cronLogs] }).find(
    (j) => j.job === 'db_backup',
  );
  assert.equal(job.state, 'ok');
  assert.equal(job.log_dir, t.cronLogs);
  assert.match(job.detail, /récent/);
});

test('aucune trace : never, searched_dirs et ligne de crontab attendue', () => {
  const t = tmpTree();
  const job = fileJobs(NOW, { logDirs: [t.appLogs, t.missing] }).find((j) => j.job === 'db_backup');
  assert.equal(job.state, 'never');
  assert.deepEqual(job.searched_dirs, [t.appLogs, t.missing]);
  assert.match(job.hint, /db-backup\.sh/);
});

test('journal absent mais sauvegarde récente : log_not_found', async () => {
  const t = tmpTree();
  const f = path.join(t.backups, 'foretmap-20261111-030000.sql.gz.enc');
  fs.writeFileSync(f, 'x');
  fs.utimesSync(f, new Date(NOW - 7 * H), new Date(NOW - 7 * H));
  // Un fichier partiel ou étranger n'est pas une sauvegarde.
  fs.writeFileSync(path.join(t.backups, 'foretmap-20261111-040000.sql.gz.enc.partial'), 'x');
  fs.writeFileSync(path.join(t.backups, 'notes.txt'), 'x');

  const latest = latestBackupFile([t.missing, t.backups]);
  assert.equal(latest.name, 'foretmap-20261111-030000.sql.gz.enc');

  const evidence = await collectEvidence({ backupDirs: [t.backups] });
  assert.equal(evidence.db_backup.kind, 'backup_file');
  const job = fileJobs(NOW, { logDirs: [t.appLogs], evidence }).find((j) => j.job === 'db_backup');
  assert.equal(job.state, 'log_not_found');
  assert.equal(job.evidence, 'backup_file');
  assert.equal(job.ageHours, 7);
  assert.deepEqual(job.searched_dirs, [t.appLogs]);
  assert.match(job.detail, /foretmap-20261111-030000\.sql\.gz\.enc/);
  assert.match(job.hint, /MCP_CRON_LOG_DIR/);
});

test('journal absent et sauvegarde trop vieille : late (pas log_not_found)', () => {
  const evidence = { db_backup: { kind: 'backup_file', atMs: NOW - 5 * 24 * H, detail: 'x' } };
  const job = fileJobs(NOW, { logDirs: [], evidence }).find((j) => j.job === 'db_backup');
  assert.equal(job.state, 'late');
  assert.equal(job.evidence, 'backup_file');
});

test('déploiement prouvé par le schéma seul : log_not_found sans date', () => {
  const evidence = {
    auto_deploy: { kind: 'schema_up_to_date', atMs: null, detail: 'schéma à jour (migration 342)' },
  };
  const job = fileJobs(NOW, { logDirs: [], evidence }).find((j) => j.job === 'auto_deploy');
  assert.equal(job.state, 'log_not_found');
  assert.equal(job.ageHours, null);
  assert.equal(job.last_at, undefined);
});

test('tâche facultative sans journal : not_configured, même sans preuve', () => {
  const jobs = fileJobs(NOW, { logDirs: [] });
  assert.equal(jobs.find((j) => j.job === 'moodle_sync').state, 'not_configured');
});

test('getCronStatus : log_not_found listé à part, pas dans problems', async () => {
  const t = tmpTree();
  const f = path.join(t.backups, 'foretmap-20261111-030000.sql.gz.enc');
  fs.writeFileSync(f, 'x');
  const r = await getCronStatus({
    includeCrontab: false,
    logDirs: [t.appLogs],
    backupDirs: [t.backups],
  });
  const by = Object.fromEntries(r.jobs.map((j) => [j.job, j]));
  assert.equal(by.db_backup.state, 'log_not_found');
  assert.ok(r.log_not_found.includes('db_backup'));
  assert.ok(!r.problems.includes('db_backup'));
  assert.equal(by.uptime_check.state, 'never');
  assert.deepEqual(by.uptime_check.searched_dirs, [t.appLogs]);
  assert.match(r.note, /log_not_found/);
});

test('règles de santé : log_not_found est une information, pas une alerte', () => {
  const r = evaluateHealth({
    cron: { jobs: [{ job: 'db_backup', state: 'log_not_found', detail: 'fichier' }] },
  });
  assert.equal(r.status, 'green');
  assert.ok(r.findings.some((f) => f.level === 'info' && /db_backup/.test(f.message)));
});

test('roots : MCP_CRON_LOG_DIR multiple, gabarit ~/foretmap/logs, dossiers en plus exposés', () => {
  const t = tmpTree();
  const prev = process.env.MCP_CRON_LOG_DIR;
  process.env.MCP_CRON_LOG_DIR = `${t.cronLogs}, ${t.missing}`;
  try {
    const c = cronLogDirCandidates();
    assert.equal(c[0], t.cronLogs);
    assert.equal(c[1], t.missing);
    assert.ok(c.includes(path.join(os.homedir(), 'foretmap', 'logs')));
    assert.deepEqual(existingDirs([t.cronLogs, t.missing, t.cronLogs]), [t.cronLogs]);
    const roots = getFileRoots().roots;
    const logs = roots.find((r) => r.name === 'logs');
    assert.equal(logs.path, t.cronLogs, 'premier dossier existant = racine logs');
  } finally {
    if (prev === undefined) delete process.env.MCP_CRON_LOG_DIR;
    else process.env.MCP_CRON_LOG_DIR = prev;
  }
});
