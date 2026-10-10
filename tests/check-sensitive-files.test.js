'use strict';

/**
 * Garde-fou contre les fuites (scripts/check-sensitive-files.js).
 *
 * Un export complet de la base de production a déjà été versionné par erreur. Le hook
 * pre-commit ne vérifiait que lint et format ; `.gitignore` ne protège pas d'un `git add -f`.
 *
 * Les valeurs factices sont construites à l'exécution : écrites en clair, elles feraient
 * échouer le balayage du dépôt par ce même script.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { execFileSync, spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'check-sensitive-files.js');
const { scanFile, sqlSetKind } = require('../scripts/check-sensitive-files');

const FAKE_BCRYPT = (c = 'a') => `$2b$10$${c.repeat(53)}`;
const FAKE_GITHUB_TOKEN = `gh${'p'}_${'A1b2C3d4'.repeat(5)}`;
const FAKE_JWT = ['eyJhbGciOiJIUzI1NiJ9', 'eyJ1c2VySWQiOiJ4eXoifQ', 'x'.repeat(43)].join('.');
const PEM_BODY = 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQ'.repeat(2);
const FAKE_PEM = `-----BEGIN ${'PRIVATE'} KEY-----\n${PEM_BODY}\n-----END PRIVATE KEY-----`;

const rules = (findings) => findings.map((f) => f.rule).sort();
const scan = (p, text) => scanFile(p, Buffer.from(text, 'utf8'));

test('contenus : hachage bcrypt, clé privée, jeton GitHub, JWT signé', () => {
  assert.deepEqual(rules(scan('lib/x.js', `const h = '${FAKE_BCRYPT()}';`)), ['bcrypt']);
  assert.deepEqual(rules(scan('notes/x.md', FAKE_PEM)), ['cle-privee']);
  assert.deepEqual(rules(scan('config/x.json', `{"t":"${FAKE_GITHUB_TOKEN}"}`)), ['jeton-github']);
  assert.deepEqual(rules(scan('tests/x.test.js', `const t = '${FAKE_JWT}';`)), ['jwt-signe']);
});

test('contenus : gabarits et valeurs tronquées ne sont pas des secrets', () => {
  // Modèle d'environnement (`\n...\n`), PEM de test sans corps, JWT non signé.
  const placeholder = `KEY="-----BEGIN ${'PRIVATE'} KEY-----\\n...\\n-----END PRIVATE KEY-----"`;
  assert.deepEqual(scan('env.local.example', placeholder), []);
  assert.deepEqual(scan('tests/x.test.js', `-----BEGIN ${'PRIVATE'} KEY-----\nMIIEtest\n`), []);
  assert.deepEqual(scan('tests/x.test.js', 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOjF9.'), []);
});

test('exception justifiée : le hachage factice d’égalisation du temps de réponse', () => {
  assert.deepEqual(scan('lib/auth/timingEqualizer.js', `'${FAKE_BCRYPT()}'`), []);
  // L'exception ne vaut que pour ce fichier et cette règle.
  assert.deepEqual(rules(scan('lib/auth/other.js', `'${FAKE_BCRYPT()}'`)), ['bcrypt']);
});

test('noms : .env, clés privées, dumps et sauvegardes', () => {
  for (const p of [
    '.env',
    'config/.env.production',
    'deploy/server.pem',
    'lti-keys/tool.key',
    'home/id_rsa',
    'sql/foretmap_bdd_complete.sql',
    'oliviera_foretmap-dump.sql',
    'backups/2026-10-01.sql',
    'exports/base.sql.gz',
    'base.dump',
  ]) {
    assert.ok(scan(p, '').length > 0, `${p} devrait être refusé`);
  }
  for (const p of [
    '.env.example',
    'env.local.example',
    'home/id_rsa.pub',
    'scripts/db-backup.sh',
  ]) {
    assert.deepEqual(scan(p, ''), [], `${p} devrait passer`);
  }
});

test('SQL : INSERT hors des jeux déclarés refusé ; schéma sans INSERT accepté', () => {
  assert.equal(sqlSetKind('migrations/999_exemple.sql'), 'contenu');
  assert.equal(sqlSetKind('sql/fixtures/foretmap-anonymise.sql.gz'), 'anonymise');
  assert.equal(sqlSetKind('sql/export.sql'), null);
  assert.deepEqual(rules(scan('sql/export.sql', "INSERT INTO zones VALUES ('z1');")), [
    'sql-non-declare',
  ]);
  assert.deepEqual(scan('sql/export.sql', 'CREATE TABLE t (id INT);'), []);
});

test('SQL : un jeu de contenu ne porte aucune valeur de table personnelle', () => {
  const insertUsers = "INSERT INTO `users` (`id`, `email`) VALUES ('u1', 'x');";
  assert.deepEqual(rules(scan('sql/quiz_foretmap_data.sql', insertUsers)), [
    'sql-donnees-personnelles',
  ]);
  assert.deepEqual(rules(scan('migrations/999_x.sql', 'INSERT IGNORE INTO forum_posts SET a=1;')), [
    'sql-donnees-personnelles',
  ]);
  // Copie entre tables (migration de schéma) et tables de contenu : autorisées.
  const copy = 'INSERT INTO user_roles (user_id, role_id)\nSELECT u.id, r.id FROM users u;';
  assert.deepEqual(scan('migrations/999_x.sql', copy), []);
  assert.deepEqual(scan('migrations/999_x.sql', "INSERT INTO plants (name) VALUES ('Ortie');"), []);
});

test('jeu anonymisé : un seul hachage générique, adresses en domaine réservé', () => {
  const p = 'sql/fixtures/foretmap-anonymise.sql.gz';
  const gz = (text) => zlib.gzipSync(Buffer.from(text, 'utf8'));
  const anonymised = [
    "INSERT INTO `users` VALUES ('u1','a@exemple.invalid','" + FAKE_BCRYPT() + "'),",
    "('u2','b@exemple.invalid','" + FAKE_BCRYPT() + "');",
  ].join('\n');
  assert.deepEqual(scanFile(p, gz(anonymised)), []);

  const leaked = [
    "INSERT INTO `users` VALUES ('u1','eleve@lycee.example.fr','" + FAKE_BCRYPT('b') + "'),",
    "('u2','b@exemple.invalid','" + FAKE_BCRYPT('c') + "');",
  ].join('\n');
  assert.deepEqual(rules(scanFile(p, gz(leaked))), ['bcrypt', 'email-reel']);
});

test('dump renommé : l’en-tête mysqldump / phpMyAdmin le trahit', () => {
  const dump = '-- MariaDB dump 10.19  Distrib 10.11\n--\n-- Host: localhost\n';
  assert.deepEqual(rules(scan('notes/notes.txt', dump)), ['entete-dump']);
  assert.deepEqual(rules(scan('notes/notes.txt', '-- phpMyAdmin SQL Dump\n')), ['entete-dump']);
});

test('CLI : la sortie ne recopie jamais la valeur trouvée', () => {
  const res = spawnSync(process.execPath, [SCRIPT, '--stdin', '--as', 'config/x.js'], {
    input: `const a = '${FAKE_GITHUB_TOKEN}';\nconst b = '${FAKE_BCRYPT()}';\n`,
    encoding: 'utf8',
  });
  assert.equal(res.status, 1);
  const output = res.stdout + res.stderr;
  assert.match(output, /config\/x\.js:1 {2}\[jeton-github\]/);
  assert.match(output, /config\/x\.js:2 {2}\[bcrypt\]/);
  assert.ok(!output.includes(FAKE_GITHUB_TOKEN), 'jeton recopié dans la sortie');
  assert.ok(!output.includes(FAKE_BCRYPT()), 'hachage recopié dans la sortie');
});

test('CLI --staged : un commit portant un hachage est refusé (hook pre-commit)', (t) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'foretmap-sensitive-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' });
  git('init', '-q');
  fs.writeFileSync(path.join(repo, 'ok.js'), 'module.exports = 1;\n');
  git('add', 'ok.js');
  let res = spawnSync(process.execPath, [SCRIPT, '--staged'], { cwd: repo, encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);

  fs.mkdirSync(path.join(repo, 'sql'));
  fs.writeFileSync(
    path.join(repo, 'sql', 'export.sql'),
    `INSERT INTO users VALUES ('u1','${FAKE_BCRYPT()}');\n`,
  );
  git('add', '-f', 'sql/export.sql');
  res = spawnSync(process.execPath, [SCRIPT, '--staged'], { cwd: repo, encoding: 'utf8' });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /sql\/export\.sql:1 {2}\[bcrypt\]/);
  assert.match(res.stderr, /\[sql-non-declare\]/);
});

test('dépôt : aucun fichier suivi ne déclenche le garde-fou (job CI quality)', () => {
  const res = spawnSync(process.execPath, [SCRIPT, '--all'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
});

test('.gitignore : dumps, sauvegardes, clés et fichiers .env sont ignorés', () => {
  const ignored = (p) =>
    spawnSync('git', ['check-ignore', '--no-index', '-q', p], { cwd: ROOT }).status === 0;
  for (const p of [
    'oliviera_foretmap.sql',
    'sql/foretmap_bdd_complete.sql',
    'base.sql.gz',
    'base.sql.zip',
    'base.dump',
    'backups/x.sql',
    'server.pem',
    'tool.key',
    'id_ed25519',
    '.env',
    '.env.production',
  ]) {
    assert.ok(ignored(p), `${p} devrait être ignoré`);
  }
  for (const p of ['.env.example', 'sql/schema_foretmap.sql', 'migrations/999_x.sql']) {
    assert.ok(!ignored(p), `${p} ne devrait pas être ignoré`);
  }
});

test('branchement : hook pre-commit et job CI quality appellent le garde-fou', () => {
  const hook = fs.readFileSync(path.join(ROOT, '.githooks', 'pre-commit'), 'utf8');
  assert.match(hook, /node scripts\/check-sensitive-files\.js --staged/);
  const ci = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
  const start = ci.indexOf('\n  quality:');
  const quality = ci.slice(start, start + 1 + ci.slice(start + 1).search(/\n {2}[\w-]+:\n/));
  assert.match(quality, /node scripts\/check-sensitive-files\.js --all/);
});
