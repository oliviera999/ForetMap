'use strict';

/**
 * Sauvegardes vérifiables et copie hors du serveur (exploitation, lot 2) :
 * - `scripts/db-backup-verify.sh` sur des sauvegardes chiffrées de test (clé de test) :
 *   valide, tronquée, table manquante, en-tête absent, mauvaise clé, chute de taille ;
 *   aucun fichier clair écrit, aucune ligne de données affichée ;
 * - branchement dans `scripts/db-backup.sh` (`BACKUP_VERIFY`, défaut 1) ;
 * - `scripts/db-backup-offsite.sh` : désactivé par défaut, sans rclone, refus d'un fichier en
 *   clair, copie et rotation distante (faux rclone).
 *
 * Ignoré si bash, gzip ou un openssl connaissant -pbkdf2 manque.
 */

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { resolveBash, bashPath } = require('./helpers/resolveBash');

const ROOT = path.join(__dirname, '..');
const BASH = resolveBash();
const EMAIL = 'eleve.verif@example.org';
const TABLES = ['users', 'plants', 'tasks', 'quiz_questions', 'schema_version'];

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
  'vérification et copie hors serveur des sauvegardes',
  { skip: AVAILABLE ? false : 'bash/openssl indisponibles' },
  () => {
    let work;
    let keyFile;
    let wrongKeyFile;
    let fakeBin;

    const backupDir = () => path.join(work, 'backups');

    function sql({ tables = TABLES, complete = true, header = true, rows = 5 } = {}) {
      const lines = [];
      if (header) lines.push('-- MariaDB dump 10.19  Distrib 11.4', '--');
      for (const t of tables) {
        lines.push(`DROP TABLE IF EXISTS \`${t}\`;`, `CREATE TABLE \`${t}\` (id int);`);
        for (let i = 0; i < rows; i += 1) {
          lines.push(`INSERT INTO \`${t}\` VALUES (${i},'${EMAIL}','${'x'.repeat(40)}');`);
        }
      }
      if (complete) lines.push('', '-- Dump completed on 2026-11-11  3:00:01');
      return lines.join('\n') + '\n';
    }

    /** Écrit une sauvegarde chiffrée (gzip | openssl, comme db-backup.sh) ; mtime imposé. */
    function writeBackup(name, content, { key = keyFile, ageHours = 0, encrypt = true } = {}) {
      fs.mkdirSync(backupDir(), { recursive: true });
      const out = path.join(backupDir(), name);
      const src = path.join(work, `src-${crypto.randomUUID()}.sql`);
      fs.writeFileSync(src, content);
      const cmd = encrypt
        ? `gzip -c '${bashPath(src)}' | openssl enc -e -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass 'file:${bashPath(key)}' > '${bashPath(out)}'`
        : `gzip -c '${bashPath(src)}' > '${bashPath(out)}'`;
      const r = spawnSync(BASH, ['-c', cmd], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      fs.rmSync(src);
      const t = new Date(Date.now() - ageHours * 3600 * 1000);
      fs.utimesSync(out, t, t);
      return out;
    }

    function run(script, args = [], env = {}) {
      const merged = {
        APP_DIR: bashPath(work),
        DEPLOY_ENV_FILE: bashPath(path.join(work, 'absent.env')),
        BACKUP_DIR: bashPath(backupDir()),
        BACKUP_ENCRYPT_KEY_FILE: bashPath(keyFile),
        BACKUP_VERIFY_ALERT: '0',
        ...env,
      };
      const exports = Object.entries(merged)
        .map(([k, v]) => `export ${k}='${String(v).replace(/'/g, "'\\''")}'`)
        .join('; ');
      const quoted = args.map((a) => `'${String(a).replace(/'/g, "'\\''")}'`).join(' ');
      const scriptPath = bashPath(path.join(ROOT, 'scripts', script));
      const cmd = `${exports}; export PATH='${bashPath(fakeBin)}':"$PATH"; bash '${scriptPath}' ${quoted}`;
      const r = spawnSync(BASH, ['-c', cmd], { encoding: 'utf8' });
      return { ...r, all: `${r.stdout}${r.stderr}` };
    }

    function reset() {
      fs.rmSync(backupDir(), { recursive: true, force: true });
      for (const f of fs.readdirSync(fakeBin)) fs.rmSync(path.join(fakeBin, f));
    }

    before(() => {
      work = fs.mkdtempSync(path.join(os.tmpdir(), 'foretmap-verify-'));
      fakeBin = path.join(work, 'bin');
      fs.mkdirSync(fakeBin);
      keyFile = path.join(work, 'backup.key');
      wrongKeyFile = path.join(work, 'wrong.key');
      fs.writeFileSync(keyFile, `${crypto.randomBytes(24).toString('base64')}\n`, { mode: 0o600 });
      fs.writeFileSync(wrongKeyFile, `${crypto.randomBytes(24).toString('base64')}\n`, {
        mode: 0o600,
      });
    });

    after(() => {
      fs.rmSync(work, { recursive: true, force: true });
    });

    test('sauvegarde valide : OK, sans donnée affichée ni fichier clair', () => {
      reset();
      writeBackup('foretmap-20261111-030000.sql.gz.enc', sql());
      const before = fs.readdirSync(backupDir()).sort();
      const r = run('db-backup-verify.sh');
      assert.equal(r.status, 0, r.all);
      assert.match(r.stdout, /OK : foretmap-20261111-030000\.sql\.gz\.enc/);
      assert.match(r.stdout, /5 tables/);
      assert.ok(!r.all.includes(EMAIL), 'aucune ligne de données affichée');
      assert.deepEqual(fs.readdirSync(backupDir()).sort(), before, 'aucun fichier écrit');
    });

    test('fichier passé en argument plutôt que le dernier', () => {
      reset();
      const good = writeBackup('foretmap-20261110-030000.sql.gz.enc', sql(), { ageHours: 24 });
      writeBackup('foretmap-20261111-030000.sql.gz.enc', sql({ complete: false }));
      assert.equal(run('db-backup-verify.sh').status, 1, 'le dernier est tronqué');
      const r = run('db-backup-verify.sh', [bashPath(good)]);
      assert.equal(r.status, 0, r.all);
    });

    test('sauvegarde tronquée : échec', () => {
      reset();
      writeBackup('foretmap-20261111-030000.sql.gz.enc', sql({ complete: false }));
      const r = run('db-backup-verify.sh');
      assert.equal(r.status, 1);
      assert.match(r.stdout, /ÉCHEC : .*tronqué/);
    });

    test('archive coupée en plein milieu : échec de lecture', () => {
      reset();
      const f = writeBackup('foretmap-20261111-030000.sql.gz.enc', sql({ rows: 400 }));
      const buf = fs.readFileSync(f);
      fs.writeFileSync(f, buf.subarray(0, Math.floor(buf.length / 2)));
      const r = run('db-backup-verify.sh');
      assert.equal(r.status, 1);
      assert.match(r.stdout, /ÉCHEC/);
    });

    test('table clé manquante : échec qui la nomme', () => {
      reset();
      writeBackup(
        'foretmap-20261111-030000.sql.gz.enc',
        sql({ tables: TABLES.filter((t) => t !== 'quiz_questions') }),
      );
      const r = run('db-backup-verify.sh');
      assert.equal(r.status, 1);
      assert.match(r.stdout, /table\(s\) absente\(s\) : quiz_questions/);
    });

    test('en-tête absent : échec', () => {
      reset();
      writeBackup('foretmap-20261111-030000.sql.gz.enc', sql({ header: false }));
      const r = run('db-backup-verify.sh');
      assert.equal(r.status, 1);
      assert.match(r.stdout, /en-tête/);
    });

    test('mauvaise clé : échec', () => {
      reset();
      writeBackup('foretmap-20261111-030000.sql.gz.enc', sql());
      const r = run('db-backup-verify.sh', [], { BACKUP_ENCRYPT_KEY_FILE: bashPath(wrongKeyFile) });
      assert.equal(r.status, 1);
      assert.match(r.stdout, /ÉCHEC : lecture impossible/);
    });

    test('chute de taille de plus de 30 % : échec ; seuil réglable', () => {
      reset();
      writeBackup('foretmap-20261110-030000.sql.gz.enc', sql({ rows: 3000 }), { ageHours: 24 });
      writeBackup('foretmap-20261111-030000.sql.gz.enc', sql({ rows: 5 }));
      const r = run('db-backup-verify.sh');
      assert.equal(r.status, 1);
      assert.match(r.stdout, /en baisse de \d+ % sur la précédente/);
      assert.equal(run('db-backup-verify.sh', [], { BACKUP_VERIFY_MAX_DROP_PCT: '0' }).status, 0);
    });

    test('aucune sauvegarde : échec explicite', () => {
      reset();
      const r = run('db-backup-verify.sh');
      assert.equal(r.status, 1);
      assert.match(r.stdout, /aucune sauvegarde/);
    });

    test('db-backup.sh : vérification branchée par défaut, coupée par BACKUP_VERIFY=0', () => {
      reset();
      const dump = path.join(fakeBin, 'mariadb-dump');
      fs.writeFileSync(dump, `#!/usr/bin/env bash\ncat <<'SQL'\n${sql()}SQL\n`);
      fs.chmodSync(dump, 0o755);
      const env = { DB_NAME: 'foretmap_fake', DB_USER: 'fake' };
      const ok = run('db-backup.sh', [], env);
      assert.equal(ok.status, 0, ok.all);
      assert.match(ok.stdout, /\[db-backup-verify\] OK/);

      // Faux dump sans table clé : sauvegarde gardée, mais sortie en erreur.
      fs.writeFileSync(
        dump,
        `#!/usr/bin/env bash\ncat <<'SQL'\n${sql({ tables: ['plants'] })}SQL\n`,
      );
      const bad = run('db-backup.sh', [], env);
      assert.equal(bad.status, 1, bad.all);
      assert.match(bad.stdout, /rotation suspendue/);
      const off = run('db-backup.sh', [], { ...env, BACKUP_VERIFY: '0' });
      assert.equal(off.status, 0, off.all);
      assert.doesNotMatch(off.stdout, /db-backup-verify/);
    });

    test('offsite : désactivé par défaut, puis sans rclone', () => {
      reset();
      writeBackup('foretmap-20261111-030000.sql.gz.enc', sql());
      const off = run('db-backup-offsite.sh');
      assert.equal(off.status, 0);
      assert.match(off.stdout, /désactivée/);
      const noRclone = run('db-backup-offsite.sh', [], {
        BACKUP_OFFSITE_REMOTE: 'test:dossier',
        HOME: bashPath(work),
        PATH: '/usr/bin:/bin',
      });
      assert.equal(noRclone.status, 0);
      assert.match(noRclone.stdout, /rclone introuvable/);
    });

    /** Faux rclone : un dossier local tient lieu de dépôt distant. */
    function fakeRclone() {
      const remote = path.join(work, 'remote');
      fs.rmSync(remote, { recursive: true, force: true });
      fs.mkdirSync(remote);
      const script = [
        '#!/usr/bin/env bash',
        `R='${bashPath(remote)}'`,
        'p() { printf "%s" "$R/${1#*:}"; }',
        'case "$1" in',
        '  copyto) cp "$2" "$(p "$3")" ;;',
        '  size) f="$(p "$3")"; printf \'{"count":1,"bytes":%s}\\n\' "$(stat -c %s "$f")" ;;',
        '  lsf) d="$(p "${@: -1}")"; ls -1 "$d" | grep -E "^foretmap-.*\\.sql\\.gz\\.enc$" ;;',
        '  deletefile) rm -f "$(p "$2")" ;;',
        '  *) exit 9 ;;',
        'esac',
      ].join('\n');
      const bin = path.join(fakeBin, 'rclone');
      fs.writeFileSync(bin, `${script}\n`);
      fs.chmodSync(bin, 0o755);
      return remote;
    }

    test('offsite : copie la dernière sauvegarde chiffrée, rotation distante', () => {
      reset();
      const remote = fakeRclone();
      for (let d = 1; d <= 3; d += 1) {
        fs.writeFileSync(path.join(remote, `foretmap-2026110${d}-030000.sql.gz.enc`), 'ancien');
      }
      writeBackup('foretmap-20261111-030000.sql.gz.enc', sql());
      const r = run('db-backup-offsite.sh', [], {
        BACKUP_OFFSITE_REMOTE: 'test:',
        BACKUP_OFFSITE_KEEP: '2',
      });
      assert.equal(r.status, 0, r.all);
      assert.match(r.stdout, /OK : foretmap-20261111-030000\.sql\.gz\.enc copié/);
      assert.deepEqual(fs.readdirSync(remote).sort(), [
        'foretmap-20261103-030000.sql.gz.enc',
        'foretmap-20261111-030000.sql.gz.enc',
      ]);
    });

    test('offsite : refuse de copier une sauvegarde en clair', () => {
      reset();
      const remote = fakeRclone();
      writeBackup('foretmap-20261111-030000.sql.gz', sql(), { encrypt: false });
      const r = run('db-backup-offsite.sh', [], { BACKUP_OFFSITE_REMOTE: 'test:' });
      assert.equal(r.status, 1);
      assert.match(r.stdout, /n'est pas chiffrée/);
      assert.deepEqual(fs.readdirSync(remote), []);
    });
  },
);
