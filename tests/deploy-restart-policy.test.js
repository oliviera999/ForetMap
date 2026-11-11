'use strict';

/**
 * Choix « redémarrer ou non » du déploiement automatique (`scripts/lib/deploy-restart-policy.sh`,
 * sourcé par `scripts/auto-deploy-cron.sh`), sur un vrai dépôt git temporaire :
 * - documentation (*.md partout), tests/, tests-ui/, e2e/, .cursor/, docs/ : pas de redémarrage ;
 * - code serveur, front, migrations : redémarrage ;
 * - commit de version de release.yml (champ `version` seul de package.json et package-lock.json) :
 *   ni redémarrage, ni `npm ci` ; une dépendance modifiée : les deux.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { resolveBash, bashPath } = require('./helpers/resolveBash');

const POLICY = path.join(__dirname, '..', 'scripts', 'lib', 'deploy-restart-policy.sh');
const BASH = resolveBash();

const PKG = (version, deps = { express: '^5.1.0' }) =>
  `${JSON.stringify({ name: 'demo', version, private: true, dependencies: deps }, null, 2)}\n`;
const LOCK = (version, expressVersion = '5.1.0') =>
  `${JSON.stringify(
    {
      name: 'demo',
      version,
      lockfileVersion: 3,
      packages: {
        '': { name: 'demo', version, dependencies: { express: '^5.1.0' } },
        'node_modules/express': {
          version: expressVersion,
          resolved: `https://registry.npmjs.org/express/-/express-${expressVersion}.tgz`,
        },
      },
    },
    null,
    2,
  )}\n`;

function git(dir, ...args) {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
}

/** Dépôt temporaire : un commit initial, puis `changes` ; renvoie { dir, from, to, files }. */
function repoWith(changes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-restart-'));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'test@example.org');
  git(dir, 'config', 'user.name', 'test');
  const base = {
    'package.json': PKG('1.0.0'),
    'package-lock.json': LOCK('1.0.0'),
    'server.js': 'module.exports = 1;\n',
    'docs/API.md': '# API\n',
  };
  for (const [f, c] of Object.entries(base)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), c);
  }
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'init');
  const from = git(dir, 'rev-parse', 'HEAD');
  for (const [f, c] of Object.entries(changes)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), c);
  }
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'change');
  const to = git(dir, 'rev-parse', 'HEAD');
  const files = git(dir, 'diff', '--name-only', from, to);
  return { dir, from, to, files };
}

function policy(r, fn) {
  const script = `source '${bashPath(POLICY)}'; ${fn} '${r.from}' '${r.to}' "$CHANGED"`;
  const out = spawnSync(BASH, ['-c', script], {
    cwd: r.dir,
    encoding: 'utf8',
    env: { ...process.env, CHANGED: r.files },
  });
  return { status: out.status, stdout: out.stdout.trim(), stderr: out.stderr };
}

const restartFiles = (r) => policy(r, 'deploy_restart_files').stdout;
const depsChanged = (r) => policy(r, 'deploy_dependencies_changed').status === 0;

test('documentation, tests, e2e, outillage : aucun redémarrage', { skip: !BASH }, () => {
  const r = repoWith({
    'CHANGELOG.md': '# x\n',
    'README.md': 'x\n',
    'docs/API.md': '# API v2\n',
    'docs/reference/guide.md': 'x\n',
    'data/gl/README.md': 'x\n',
    'tests/a.test.js': 'x\n',
    'tests-ui/b.test.jsx': 'x\n',
    'e2e/c.spec.js': 'x\n',
    '.cursor/rules/x.mdc': 'x\n',
    '.claude/skills/x/SKILL.md': 'x\n',
    '.github/workflows/ci.yml': 'x\n',
  });
  assert.equal(restartFiles(r), '');
});

test('code serveur, front ou migration : redémarrage, fichiers nommés', { skip: !BASH }, () => {
  const r = repoWith({
    'server.js': 'module.exports = 2;\n',
    'src/App.jsx': 'x\n',
    'migrations/343_x.sql': 'SELECT 1;\n',
    'docs/API.md': '# API v2\n',
  });
  assert.deepEqual(restartFiles(r).split('\n').sort(), [
    'migrations/343_x.sql',
    'server.js',
    'src/App.jsx',
  ]);
});

test('commit de version seul (release.yml) : ni redémarrage ni npm ci', { skip: !BASH }, () => {
  const r = repoWith({
    'package.json': PKG('1.0.1'),
    'package-lock.json': LOCK('1.0.1'),
    'CHANGELOG.md': '# x\n',
  });
  assert.equal(restartFiles(r), '');
  assert.equal(depsChanged(r), false);
});

test('dépendance modifiée : redémarrage et npm ci', { skip: !BASH }, () => {
  const r = repoWith({
    'package.json': PKG('1.0.1', { express: '^5.2.0' }),
    'package-lock.json': LOCK('1.0.1', '5.2.0'),
  });
  assert.match(restartFiles(r), /package\.json/);
  assert.equal(depsChanged(r), true);
});

test(
  'lockfile seul modifié (version d’une dépendance) : redémarrage et npm ci',
  { skip: !BASH },
  () => {
    const r = repoWith({ 'package-lock.json': LOCK('1.0.0', '5.1.1') });
    assert.equal(restartFiles(r), 'package-lock.json');
    assert.equal(depsChanged(r), true);
  },
);

test('script de déploiement : la politique est sourcée et utilisée', () => {
  const cron = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'auto-deploy-cron.sh'),
    'utf8',
  );
  assert.match(cron, /source "\$SCRIPT_DIR\/lib\/deploy-restart-policy\.sh"/);
  assert.match(cron, /deploy_restart_files "\$LOCAL_SHA" "\$REMOTE_SHA"/);
  assert.match(cron, /deploy_dependencies_changed "\$PREV_SHA" "\$REMOTE_SHA"/);
});
