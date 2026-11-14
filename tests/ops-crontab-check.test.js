'use strict';

/**
 * `scripts/ops-crontab-check.sh` — diagnostic en lecture seule de la crontab, avec une fausse
 * crontab (`OPS_CRONTAB_FILE`), un faux `.env` et un faux dossier personnel :
 * - aucune valeur secrète ne sort (inline dans la crontab, dans une URL, en-tête Bearer,
 *   valeur littérale du `.env`, contenu du fichier de clé) ;
 * - rapprochement avec docs/CRONTAB.md : présente / absente / différente (APP_DIR, `bash`,
 *   `--apply`, cadence du keepalive) ;
 * - journaux cherchés dans tous les dossiers candidats, dernière sauvegarde, clés du `.env`
 *   (noms seulement) ;
 * - rien n'est écrit dans l'arborescence.
 *
 * Valeurs factices construites à l'exécution (garde-fou `scripts/check-sensitive-files.js`).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'ops-crontab-check.sh');
const rnd = (n = 18) => crypto.randomBytes(n).toString('hex');

function listTree(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    out.push(p);
    if (e.isDirectory()) out.push(...listTree(p));
  }
  return out.sort();
}

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-cronchk-'));
  const home = path.join(root, 'home');
  const app = path.join(home, 'site.example');
  const other = path.join(home, 'foretmap');
  for (const d of [
    path.join(app, 'logs'),
    path.join(app, 'scripts'),
    path.join(other, 'logs'),
    path.join(other, 'backups'),
  ]) {
    fs.mkdirSync(d, { recursive: true });
  }
  const secrets = {
    deploy: `dep${rnd()}`,
    dbPass: `db${rnd(6)}!`,
    token: `tk${rnd()}`,
    urlPass: `url${rnd(5)}`,
    key: `KEY-${rnd(32)}`,
  };
  fs.writeFileSync(path.join(app, '.htaccess'), `PassengerAppRoot "${app}"\n`);
  const keyFile = path.join(home, '.foretmap-backup.key');
  fs.writeFileSync(keyFile, `${secrets.key}\n`, { mode: 0o600 });
  fs.writeFileSync(
    path.join(app, '.env'),
    [
      `DEPLOY_SECRET=${secrets.deploy}`,
      'DB_NAME=foretmap_x',
      'DB_USER=user_x',
      `DB_PASS='${secrets.dbPass}'`,
      `MCP_HEALTH_TOKEN=${secrets.token}`,
      'PASSENGER_APP_ENV=production',
      `BACKUP_ENCRYPT_KEY_FILE=${keyFile}`,
      'BACKUP_ENCRYPT_REQUIRED=1',
    ].join('\n') + '\n',
  );
  const crontab = path.join(root, 'crontab.txt');
  fs.writeFileSync(
    crontab,
    [
      '# commentaire ignoré',
      `*/2 * * * * APP_DIR=${other} DEPLOY_BASE_URL=https://deploy:${secrets.urlPass}@site.example DEPLOY_SECRET=${secrets.deploy} bash ${other}/scripts/auto-deploy-cron.sh >> ${other}/logs/foretmap-auto-deploy.log 2>&1`,
      `0 3 * * * APP_DIR=${app} bash ${app}/scripts/db-backup.sh >> ${app}/logs/db-backup.log 2>&1`,
      `*/5 7-22 * * * curl -fsS -H "Authorization: Bearer ${secrets.token}" https://site.example/api/health >/dev/null 2>&1`,
      `10 4 * * * APP_DIR=${app} ${app}/scripts/retention-purge-cron.sh >> ${app}/logs/retention-purge.log 2>&1`,
      `40 6 * * * bash ${app}/scripts/with-app-node.sh node scripts/health-report.js --db-pass=${secrets.dbPass} >> ${app}/logs/health-report.log 2>&1`,
    ].join('\n') + '\n',
  );
  fs.writeFileSync(
    path.join(other, 'logs', 'foretmap-auto-deploy.log'),
    `[2026-11-10 12:00:00] [deploy] secret DEPLOY_SECRET=${secrets.deploy}\n`,
  );
  fs.writeFileSync(path.join(other, 'backups', 'foretmap-20261110-030000.sql.gz.enc'), 'x');
  fs.copyFileSync(SCRIPT, path.join(app, 'scripts', 'ops-crontab-check.sh'));
  return { root, home, app, other, crontab, secrets };
}

function run(t, extraEnv = {}) {
  const r = spawnSync('bash', [path.join(t.app, 'scripts', 'ops-crontab-check.sh')], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HOME: t.home,
      OPS_CRONTAB_FILE: t.crontab,
      OPS_CHECK_SKIP_DB: '1',
      ...extraEnv,
    },
  });
  return { ...r, all: `${r.stdout}\n${r.stderr}` };
}

test('aucune valeur secrète ne sort', () => {
  const t = setup();
  const r = run(t);
  assert.equal(r.status, 0, r.all);
  for (const [name, value] of Object.entries(t.secrets)) {
    assert.ok(!r.all.includes(value), `valeur ${name} présente dans la sortie`);
  }
  assert.match(r.stdout, /DEPLOY_SECRET=\*\*\*\*/);
  assert.match(r.stdout, /:\/\/\*\*\*\*:\*\*\*\*@site\.example/);
  assert.match(r.stdout, /Bearer \*\*\*\*/);
  // Le journal n'est jamais recopié : seule sa date l'est.
  assert.match(
    r.stdout,
    /foretmap-auto-deploy\.log .*dernière ligne datée : \[2026-11-10 12:00:00\]/,
  );
  assert.doesNotMatch(r.stdout, /\[deploy\] secret/);
});

test('rapprochement avec docs/CRONTAB.md', () => {
  const t = setup();
  const { stdout } = run(t);
  assert.match(stdout, /\[1\] déploiement automatique .*présente/);
  assert.match(stdout, /APP_DIR=~\/foretmap ≠ dossier de l'application \(~\/site\.example\)/);
  assert.match(stdout, /\[2\] sauvegarde de la base .*présente/);
  assert.match(stdout, /\[3\] sonde de disponibilité\s+ABSENTE/);
  assert.match(stdout, /cadence > 4 min/);
  assert.match(stdout, /sans « bash »/);
  assert.match(stdout, /sans --apply/);
  assert.match(stdout, /\[9\] rapport de santé .*présente/);
  assert.match(stdout, /\[6\] simulation Moodle \(facultatif\)\s+absente \(facultative\)/);
  assert.match(stdout, /PassengerAppRoot \(\.htaccess\) : ~\/site\.example/);
});

test('crontab vide signalée', () => {
  const t = setup();
  fs.writeFileSync(t.crontab, '# rien\n\n');
  const { stdout } = run(t);
  assert.match(stdout, /CRONTAB VIDE/);
  assert.match(stdout, /\[1\] déploiement automatique\s+ABSENTE/);
});

test('clés du .env (noms), clé de sauvegarde, journaux, dernière sauvegarde', () => {
  const t = setup();
  const { stdout } = run(t);
  assert.match(stdout, /DEPLOY_SECRET\s+présente/);
  assert.match(stdout, /RETENTION_PURGE_APPLY\s+absente/);
  assert.match(stdout, /OPS_ALERT_TO\s+absente/);
  assert.match(stdout, /Fichier de clé : ~\/\.foretmap-backup\.key — présent, droits 600/);
  assert.match(stdout, /dossier ~\/foretmap\/logs : existe/);
  assert.match(stdout, /db-backup\.log\s+introuvable/);
  assert.match(stdout, /~\/foretmap\/backups\/foretmap-20261110-030000\.sql\.gz\.enc/);
  assert.match(stdout, /Traces en base ==\nignorées/);
});

test('lecture seule : aucun fichier créé ni modifié', () => {
  const t = setup();
  const before = listTree(t.root).map((p) => `${p}:${fs.statSync(p).mtimeMs}`);
  run(t);
  const after = listTree(t.root).map((p) => `${p}:${fs.statSync(p).mtimeMs}`);
  assert.deepEqual(after, before);
});
