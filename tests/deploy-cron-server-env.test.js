'use strict';

/**
 * Le cron de déploiement face à l'environnement réel de l'hébergement (o2switch / CloudLinux),
 * script **réellement exécuté** dans un bac à sable (`tests/helpers/deployCronSandbox.js`).
 *
 * 1. Fichiers non suivis posés par l'hébergement (`.htaccess` de cPanel, `node_modules` en lien
 *    symbolique, sauvegardes `.env.bak-*`) : ils bloquaient tout déploiement (27/09/2026). Seuls
 *    les fichiers suivis comptent désormais ; un `git pull` refusé à cause de l'un d'eux laisse
 *    les sources intactes et alerte.
 * 2. `node` et `npm` hors du PATH du cron : le script prend ceux de l'application
 *    (`scripts/lib/app-node.sh` : DEPLOY_NODE_BIN_DIR, PassengerNodejs du `.htaccess`, PATH,
 *    ~/nodevenv/…) ou s'arrête net, avant de toucher aux sources.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  ROOT,
  startFakeServer,
  makeSandbox,
  pushRemoteCommit,
  runCron,
} = require('./helpers/deployCronSandbox');

const NODE_NAMES = new Set(['node', 'nodejs', 'npm', 'npx', 'corepack']);

/**
 * PATH « système » sans node ni npm, comme celui d'une tâche cron chez o2switch : un dossier de
 * liens vers tous les exécutables de /usr/local/bin, /usr/bin et /bin, sauf ceux de Node.
 */
function pathWithoutNode(root) {
  const dir = path.join(root, 'sysbin');
  fs.mkdirSync(dir, { recursive: true });
  for (const source of ['/usr/local/bin', '/usr/bin', '/bin']) {
    let names = [];
    try {
      names = fs.readdirSync(source);
    } catch {
      continue;
    }
    for (const name of names) {
      const target = path.join(dir, name);
      if (NODE_NAMES.has(name) || fs.existsSync(target)) continue;
      fs.symlinkSync(path.join(source, name), target);
    }
  }
  return dir;
}

/** Faux virtualenv CloudLinux : `<root>/nodevenv/<rel>/<version>/bin` avec node et npm. */
function makeNodeVenv(root, rel, version) {
  const bin = path.join(root, 'nodevenv', rel, version, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.symlinkSync(process.execPath, path.join(bin, 'node'));
  fs.writeFileSync(path.join(bin, 'npm'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  return bin;
}

/** `.htaccess` tel que cPanel le génère pour une application Node. */
function writeHtaccess(app, nodePath) {
  fs.writeFileSync(
    path.join(app, '.htaccess'),
    [
      '# DO NOT REMOVE. CLOUDLINUX PASSENGER CONFIGURATION BEGIN',
      `PassengerAppRoot "${app}"`,
      'PassengerBaseURI "/"',
      nodePath ? `PassengerNodejs "${nodePath}"` : '',
      'PassengerAppType node',
      'PassengerStartupFile server.js',
      '# DO NOT REMOVE. CLOUDLINUX PASSENGER CONFIGURATION END',
      '',
    ].join('\n'),
  );
}

async function withSandbox(frontend, fn) {
  const sandbox = makeSandbox();
  const server = await startFakeServer({ frontend });
  try {
    await fn(sandbox, server);
  } finally {
    await server.close();
    fs.rmSync(sandbox.root, { recursive: true, force: true });
  }
}

test('fichiers non suivis de l’hébergement (.htaccess, lien node_modules, .env.bak) : déploiement non bloqué', async () => {
  await withSandbox('dist', async (sandbox, server) => {
    writeHtaccess(sandbox.app, null);
    fs.mkdirSync(path.join(sandbox.root, 'venv-modules'));
    fs.symlinkSync(path.join(sandbox.root, 'venv-modules'), path.join(sandbox.app, 'node_modules'));
    fs.writeFileSync(path.join(sandbox.app, '.env.bak-20260927'), 'X=1\n');

    const run = await runCron(sandbox, server.baseUrl);
    assert.equal(run.code, 0, run.out);
    assert.doesNotMatch(run.out, /non propre/);
    assert.match(run.out, /Aucune mise à jour/);
    assert.doesNotMatch(run.alerts, /arbre non propre/);
  });
});

test('fichier suivi modifié sur le serveur : toujours bloqué, avec alerte', async () => {
  await withSandbox('dist', async (sandbox, server) => {
    fs.appendFileSync(path.join(sandbox.app, '.gitignore'), 'modifié à la main\n');
    const run = await runCron(sandbox, server.baseUrl);
    assert.equal(run.code, 1, run.out);
    assert.match(run.out, /Arbre de travail non propre/);
    assert.match(run.out, / M \.gitignore/);
    assert.match(run.alerts, /Déploiement bloqué \(arbre non propre\)/);
  });
});

test('git pull refusé (fichier non suivi du même nom qu’un fichier du commit) : sources intactes, alerte', async () => {
  await withSandbox('dist', async (sandbox, server) => {
    const localHead = sandbox.git('rev-parse', 'HEAD').trim();
    pushRemoteCommit(sandbox, { 'collision.txt': 'version du dépôt\n' });
    fs.writeFileSync(path.join(sandbox.app, 'collision.txt'), 'fichier du serveur\n');

    const run = await runCron(sandbox, server.baseUrl, { DEPLOY_QUIET_SECONDS: '0' });
    assert.equal(run.code, 1, run.out);
    assert.match(run.out, /ÉCHEC du git pull : sources inchangées/);
    assert.match(run.alerts, /git pull refusé/);
    assert.equal(sandbox.git('rev-parse', 'HEAD').trim(), localHead);
    assert.equal(
      fs.readFileSync(path.join(sandbox.app, 'collision.txt'), 'utf8'),
      'fichier du serveur\n',
    );
    assert.ok(!server.hits.includes('POST /api/admin/restart'));
  });
});

test('node hors du PATH : celui de PassengerNodejs (.htaccess cPanel)', async () => {
  await withSandbox('dist', async (sandbox, server) => {
    const bin = makeNodeVenv(sandbox.root, 'ailleurs', '22');
    writeHtaccess(sandbox.app, path.join(bin, 'node'));
    const run = await runCron(sandbox, server.baseUrl, {
      PATH: pathWithoutNode(sandbox.root),
      HOME: sandbox.root,
    });
    assert.equal(run.code, 0, run.out);
    assert.ok(run.out.includes(`Node de l'application : ${bin}`), run.out);
    assert.match(run.out, /Aucune mise à jour/);
  });
});

test('node hors du PATH, sans .htaccess : virtualenv ~/nodevenv/<app>, version la plus haute', async () => {
  await withSandbox('dist', async (sandbox, server) => {
    makeNodeVenv(sandbox.root, 'app', '20');
    const bin22 = makeNodeVenv(sandbox.root, 'app', '22');
    const run = await runCron(sandbox, server.baseUrl, {
      PATH: pathWithoutNode(sandbox.root),
      HOME: sandbox.root,
    });
    assert.equal(run.code, 0, run.out);
    assert.ok(run.out.includes(`Node de l'application : ${bin22}`), run.out);
  });
});

test('DEPLOY_NODE_BIN_DIR prime sur le .htaccess ; invalide, il est signalé puis ignoré', async () => {
  await withSandbox('dist', async (sandbox, server) => {
    const fromHtaccess = makeNodeVenv(sandbox.root, 'htaccess', '22');
    const explicit = makeNodeVenv(sandbox.root, 'explicite', '22');
    writeHtaccess(sandbox.app, path.join(fromHtaccess, 'node'));
    const env = { PATH: pathWithoutNode(sandbox.root), HOME: sandbox.root };

    const chosen = await runCron(sandbox, server.baseUrl, {
      ...env,
      DEPLOY_NODE_BIN_DIR: explicit,
    });
    assert.equal(chosen.code, 0, chosen.out);
    assert.ok(chosen.out.includes(`Node de l'application : ${explicit}`), chosen.out);

    const invalid = await runCron(sandbox, server.baseUrl, {
      ...env,
      DEPLOY_NODE_BIN_DIR: path.join(sandbox.root, 'nulle-part'),
    });
    assert.equal(invalid.code, 0, invalid.out);
    assert.match(
      invalid.out,
      /DEPLOY_NODE_BIN_DIR=.* ne contient pas node et npm exécutables : ignoré/,
    );
    assert.ok(invalid.out.includes(`Node de l'application : ${fromHtaccess}`), invalid.out);
  });
});

test('node introuvable : arrêt net, avant tout contrôle ni pull', async () => {
  await withSandbox('missing', async (sandbox, server) => {
    const localHead = sandbox.git('rev-parse', 'HEAD').trim();
    pushRemoteCommit(sandbox, { 'nouveau.txt': 'x\n' });
    const run = await runCron(sandbox, server.baseUrl, {
      PATH: pathWithoutNode(sandbox.root),
      HOME: sandbox.root,
      DEPLOY_QUIET_SECONDS: '0',
    });
    assert.equal(run.code, 1, run.out);
    assert.match(run.out, /node et npm introuvables/);
    assert.match(run.out, /DEPLOY_NODE_BIN_DIR/);
    assert.deepEqual(server.hits, []);
    assert.equal(sandbox.git('rev-parse', 'HEAD').trim(), localHead);
  });
});

test('with-app-node.sh : lance la commande avec le node de l’application, depuis la racine', () => {
  const sandbox = makeSandbox();
  try {
    fs.copyFileSync(
      path.join(ROOT, 'scripts', 'with-app-node.sh'),
      path.join(sandbox.app, 'scripts', 'with-app-node.sh'),
    );
    const bin = makeNodeVenv(sandbox.root, 'app', '22');
    const env = { ...process.env, PATH: pathWithoutNode(sandbox.root), HOME: sandbox.root };
    delete env.APP_DIR;
    delete env.DEPLOY_NODE_BIN_DIR;
    const script = path.join(sandbox.app, 'scripts', 'with-app-node.sh');

    const ok = spawnSync(
      'bash',
      [script, 'node', '-e', 'console.log(process.cwd() + "|" + process.env.PATH.split(":")[0])'],
      { cwd: sandbox.root, env, encoding: 'utf8' },
    );
    assert.equal(ok.status, 0, ok.stderr);
    assert.equal(ok.stdout.trim(), `${fs.realpathSync(sandbox.app)}|${bin}`);

    fs.rmSync(path.join(sandbox.root, 'nodevenv'), { recursive: true });
    const missing = spawnSync('bash', [script, 'npm', 'run', 'logs:purge'], {
      cwd: sandbox.root,
      env,
      encoding: 'utf8',
    });
    assert.equal(missing.status, 127);
    assert.match(missing.stderr, /node et npm introuvables .*« npm run logs:purge » non lancé/);
  } finally {
    fs.rmSync(sandbox.root, { recursive: true, force: true });
  }
});
