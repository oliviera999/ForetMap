'use strict';

/**
 * Sauvegardes BDD chiffrées (audit RGPD du 28/09/2026, constat S-7) : scripts/db-backup.sh,
 * scripts/db-restore.sh, scripts/encrypt-existing-backups.sh et scripts/lib/backup-crypto.sh.
 *
 * Les scripts tournent pour de vrai sur un faux `mariadb-dump` (aucune base requise). Ignoré
 * si bash, gzip ou un openssl connaissant -pbkdf2 manque (sous Windows : Git Bash).
 */

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const EMAIL = 'eleve.test@example.org';

function resolveBash() {
  if (process.platform === 'win32') {
    const gitBash = 'C:\\Program Files\\Git\\bin\\bash.exe';
    return fs.existsSync(gitBash) ? gitBash : null;
  }
  return 'bash';
}

const BASH = resolveBash();

/** Chemin lisible par bash (Git Bash attend /c/… sous Windows). */
function bashPath(p) {
  if (process.platform !== 'win32') return p;
  return p.replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`).replace(/\\/g, '/');
}

function toolsAvailable() {
  if (!BASH) return false;
  const probe = spawnSync(
    BASH,
    ['-c', 'command -v gzip >/dev/null && openssl enc -help 2>&1 | grep -q -- -pbkdf2'],
    { encoding: 'utf8' },
  );
  return probe.status === 0;
}

const AVAILABLE = toolsAvailable();

describe(
  'sauvegardes BDD chiffrées',
  { skip: AVAILABLE ? false : 'bash/openssl indisponibles' },
  () => {
    let work;
    let fakeBin;
    let keyFile;
    let wrongKeyFile;

    function writeFakeDump(complete = true) {
      const lines = [
        '#!/usr/bin/env bash',
        "cat <<'SQL'",
        '-- MariaDB dump 10.19',
        'CREATE ALGORITHM=UNDEFINED DEFINER=`foretmap`@`localhost` SQL SECURITY INVOKER VIEW v AS SELECT 1;',
        `INSERT INTO users VALUES (1,'${EMAIL}');`,
      ];
      if (complete) lines.push('-- Dump completed on 2026-09-28 03:00:00');
      lines.push('SQL', '');
      const file = path.join(fakeBin, 'mariadb-dump');
      fs.writeFileSync(file, lines.join('\n'));
      fs.chmodSync(file, 0o755);
    }

    function run(script, args = [], env = {}) {
      const merged = {
        APP_DIR: bashPath(work),
        DEPLOY_ENV_FILE: bashPath(path.join(work, 'absent.env')),
        BACKUP_DIR: bashPath(path.join(work, 'backups')),
        DB_NAME: 'foretmap_fake',
        DB_USER: 'fake',
        ...env,
      };
      const exports = Object.entries(merged)
        .map(([k, v]) => `export ${k}='${String(v).replace(/'/g, "'\\''")}'`)
        .join('; ');
      const quotedArgs = args.map((a) => `'${String(a).replace(/'/g, "'\\''")}'`).join(' ');
      const scriptPath = bashPath(path.join(ROOT, 'scripts', script));
      const cmd = `${exports}; export PATH='${bashPath(fakeBin)}':"$PATH"; bash '${scriptPath}' ${quotedArgs}`;
      return spawnSync(BASH, ['-c', cmd], { encoding: 'utf8' });
    }

    function backups() {
      const dir = path.join(work, 'backups');
      return fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
    }

    function resetBackups() {
      fs.rmSync(path.join(work, 'backups'), { recursive: true, force: true });
    }

    before(() => {
      work = fs.mkdtempSync(path.join(os.tmpdir(), 'foretmap-backup-'));
      fakeBin = path.join(work, 'bin');
      fs.mkdirSync(fakeBin);
      keyFile = path.join(work, 'backup.key');
      wrongKeyFile = path.join(work, 'wrong.key');
      fs.writeFileSync(keyFile, 'phrase-secrete-de-test-suffisamment-longue\n', { mode: 0o600 });
      fs.writeFileSync(wrongKeyFile, 'une-autre-phrase\n', { mode: 0o600 });
    });

    after(() => {
      fs.rmSync(work, { recursive: true, force: true });
    });

    test('avec clé : un seul fichier .sql.gz.enc, sans donnée lisible, restaurable', () => {
      resetBackups();
      writeFakeDump();
      const res = run('db-backup.sh', [], { BACKUP_ENCRYPT_KEY_FILE: bashPath(keyFile) });
      assert.equal(res.status, 0, res.stdout + res.stderr);
      const files = backups();
      assert.equal(files.length, 1, files.join(','));
      assert.match(files[0], /^foretmap-\d{8}-\d{6}\.sql\.gz\.enc$/);
      const raw = fs.readFileSync(path.join(work, 'backups', files[0]));
      assert.equal(raw.subarray(0, 8).toString('latin1'), 'Salted__');
      assert.ok(!raw.includes(Buffer.from(EMAIL)));

      const enc = bashPath(path.join(work, 'backups', files[0]));
      const check = run('db-restore.sh', [enc, '--check'], {
        BACKUP_ENCRYPT_KEY_FILE: bashPath(keyFile),
      });
      assert.equal(check.status, 0, check.stderr);

      const out = path.join(work, 'restored.sql');
      const toFile = run('db-restore.sh', [enc, '--to-file', bashPath(out)], {
        BACKUP_ENCRYPT_KEY_FILE: bashPath(keyFile),
      });
      assert.equal(toFile.status, 0, toFile.stderr);
      const sql = fs.readFileSync(out, 'utf8');
      assert.match(sql, new RegExp(EMAIL.replace(/\./g, '\\.')));
      assert.match(sql, /Dump completed/);
      assert.doesNotMatch(sql, /DEFINER=/);
    });

    test('mauvaise clé : la vérification échoue', () => {
      resetBackups();
      writeFakeDump();
      assert.equal(
        run('db-backup.sh', [], { BACKUP_ENCRYPT_KEY_FILE: bashPath(keyFile) }).status,
        0,
      );
      const enc = bashPath(path.join(work, 'backups', backups()[0]));
      const res = run('db-restore.sh', [enc, '--check'], {
        BACKUP_ENCRYPT_KEY_FILE: bashPath(wrongKeyFile),
      });
      assert.equal(res.status, 1, res.stderr);
      assert.match(res.stderr, /clé incorrecte/);
    });

    test('restauration non interactive sans --yes : refusée avant tout accès à la base', () => {
      resetBackups();
      writeFakeDump();
      assert.equal(
        run('db-backup.sh', [], { BACKUP_ENCRYPT_KEY_FILE: bashPath(keyFile) }).status,
        0,
      );
      const enc = bashPath(path.join(work, 'backups', backups()[0]));
      fs.writeFileSync(path.join(fakeBin, 'mariadb'), '#!/usr/bin/env bash\nexit 0\n', {
        mode: 0o755,
      });
      const res = run('db-restore.sh', [enc], { BACKUP_ENCRYPT_KEY_FILE: bashPath(keyFile) });
      assert.equal(res.status, 2, res.stderr);
      assert.match(res.stderr, /--yes/);
    });

    test('BACKUP_ENCRYPT_REQUIRED=1 sans clé : échec, aucune sauvegarde en clair', () => {
      resetBackups();
      writeFakeDump();
      const res = run('db-backup.sh', [], { BACKUP_ENCRYPT_REQUIRED: '1' });
      assert.equal(res.status, 1, res.stdout);
      assert.match(res.stdout, /chiffrement exigé/);
      assert.deepEqual(backups(), []);
    });

    test('sans clé et sans exigence : sauvegarde en clair, avec avertissement', () => {
      resetBackups();
      writeFakeDump();
      const res = run('db-backup.sh');
      assert.equal(res.status, 0, res.stdout + res.stderr);
      assert.match(res.stdout, /NON chiffrée/);
      const files = backups();
      assert.equal(files.length, 1);
      assert.match(files[0], /\.sql\.gz$/);
    });

    test('dump tronqué (sans marque de fin) : rien n’est gardé', () => {
      resetBackups();
      writeFakeDump(false);
      const res = run('db-backup.sh', [], { BACKUP_ENCRYPT_KEY_FILE: bashPath(keyFile) });
      assert.equal(res.status, 1, res.stdout);
      assert.deepEqual(backups(), []);
    });

    test('rotation : les anciennes sauvegardes chiffrées et en clair sont purgées', () => {
      resetBackups();
      writeFakeDump();
      const dir = path.join(work, 'backups');
      fs.mkdirSync(dir, { recursive: true });
      const old = new Date(Date.now() - 30 * 24 * 3600 * 1000);
      for (const name of [
        'foretmap-20260801-030000.sql.gz.enc',
        'foretmap-20260801-030000.sql.gz',
      ]) {
        fs.writeFileSync(path.join(dir, name), 'x');
        fs.utimesSync(path.join(dir, name), old, old);
      }
      const res = run('db-backup.sh', [], { BACKUP_ENCRYPT_KEY_FILE: bashPath(keyFile) });
      assert.equal(res.status, 0, res.stdout + res.stderr);
      const files = backups();
      assert.equal(files.length, 1, files.join(','));
      assert.match(files[0], /\.sql\.gz\.enc$/);
    });

    test('encrypt-existing-backups : chiffre les anciens dumps, supprime le clair, garde la date', () => {
      resetBackups();
      writeFakeDump();
      assert.equal(run('db-backup.sh').status, 0);
      const [plainName] = backups();
      const plain = path.join(work, 'backups', plainName);
      const old = new Date('2026-09-20T03:00:00Z');
      fs.utimesSync(plain, old, old);

      const dry = run('encrypt-existing-backups.sh', ['--dry-run'], {
        BACKUP_ENCRYPT_KEY_FILE: bashPath(keyFile),
      });
      assert.equal(dry.status, 0, dry.stdout);
      assert.deepEqual(backups(), [plainName]);

      const res = run('encrypt-existing-backups.sh', [], {
        BACKUP_ENCRYPT_KEY_FILE: bashPath(keyFile),
      });
      assert.equal(res.status, 0, res.stdout + res.stderr);
      assert.deepEqual(backups(), [`${plainName}.enc`]);
      const enc = path.join(work, 'backups', `${plainName}.enc`);
      assert.equal(Math.round(fs.statSync(enc).mtimeMs / 1000), Math.round(old.getTime() / 1000));
      const check = run('db-restore.sh', [bashPath(enc), '--check'], {
        BACKUP_ENCRYPT_KEY_FILE: bashPath(keyFile),
      });
      assert.equal(check.status, 0, check.stderr);
    });

    test('encrypt-existing-backups sans clé : refus explicite', () => {
      const res = run('encrypt-existing-backups.sh');
      assert.equal(res.status, 1);
      assert.match(res.stdout, /BACKUP_ENCRYPT_KEY_FILE non défini/);
    });
  },
);
