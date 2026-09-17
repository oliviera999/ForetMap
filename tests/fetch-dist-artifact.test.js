'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { execFileSync } = require('node:child_process');

const {
  EXIT_DEFER,
  parseBuildInfo,
  decideAction,
  findDistGaps,
  isDistTracked,
  restorePrevious,
  main,
} = require('../scripts/fetch-dist-artifact.js');

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const SHA_C = 'c'.repeat(40);

/** Crée un `dist/` minimal mais complet au sens de `findDistGaps`. */
function makeDist(dir, entries = ['index.vite.html', 'gl.html', 'plan.html', 'staff.html']) {
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'assets', 'main-abc123.js'), '// bundle');
  for (const entry of entries) {
    fs.writeFileSync(path.join(dir, entry), '<!doctype html>');
  }
}

function tmpApp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'foretmap-dist-test-'));
}

/** Environnement git minimal : les runners CI n'ont pas forcément d'identité configurée. */
function gitEnv() {
  return {
    ...process.env,
    GIT_AUTHOR_NAME: 'test',
    GIT_AUTHOR_EMAIL: 'test@example.invalid',
    GIT_COMMITTER_NAME: 'test',
    GIT_COMMITTER_EMAIL: 'test@example.invalid',
  };
}

test('parseBuildInfo accepte un artefact bien formé et normalise la casse du sha', () => {
  const info = parseBuildInfo(
    JSON.stringify({
      sourceCommit: SHA_A.toUpperCase(),
      version: '1.163.3',
      builtAt: '2026-09-17T19:00:00.000Z',
      branch: 'main',
    }),
  );
  assert.equal(info.sourceCommit, SHA_A);
  assert.equal(info.version, '1.163.3');
  assert.equal(info.builtAt, '2026-09-17T19:00:00.000Z');
  assert.equal(info.branch, 'main');
});

test('parseBuildInfo refuse tout artefact dont on ne sait pas de quel commit il sort', () => {
  // Poser un dist/ sans savoir à quelles sources il correspond, c'est se garantir des
  // assets en 404 : la validation doit bloquer, jamais deviner.
  assert.throws(() => parseBuildInfo('pas du json'), /illisible/);
  assert.throws(() => parseBuildInfo('[]'), /objet requis/);
  assert.throws(() => parseBuildInfo('null'), /objet requis/);
  assert.throws(() => parseBuildInfo('{}'), /sourceCommit/);
  assert.throws(() => parseBuildInfo(JSON.stringify({ sourceCommit: 'abc1234' })), /sourceCommit/);
  assert.throws(
    () => parseBuildInfo(JSON.stringify({ sourceCommit: `${'z'.repeat(40)}` })),
    /sourceCommit/,
  );
});

test('parseBuildInfo tolère les métadonnées annexes absentes', () => {
  const info = parseBuildInfo(JSON.stringify({ sourceCommit: SHA_A }));
  assert.equal(info.sourceCommit, SHA_A);
  assert.equal(info.version, null);
  assert.equal(info.branch, null);
  assert.equal(info.builtAt, '');
});

test('decideAction pose l’artefact quand il correspond au commit déployé', () => {
  const decision = decideAction({
    buildInfo: { sourceCommit: SHA_A },
    expectedSource: SHA_A.toUpperCase(),
    ancestors: [SHA_A, SHA_B],
  });
  assert.equal(decision.action, 'apply');
});

test('decideAction reporte (et n’échoue pas) quand l’artefact vient d’un ancêtre', () => {
  // Cas courant : `version-bump.yml` pousse `chore(release)` sur main avec le GITHUB_TOKEN,
  // ce qui ne déclenche aucun workflow ; l'artefact est donc brièvement un commit en retard.
  const decision = decideAction({
    buildInfo: { sourceCommit: SHA_B },
    expectedSource: SHA_A,
    ancestors: [SHA_A, SHA_B, SHA_C],
  });
  assert.equal(decision.action, 'defer');
  assert.match(decision.reason, /publication CI en cours/);
});

test('decideAction refuse un artefact étranger à l’historique déployé', () => {
  const decision = decideAction({
    buildInfo: { sourceCommit: SHA_C },
    expectedSource: SHA_A,
    ancestors: [SHA_A, SHA_B],
  });
  assert.equal(decision.action, 'stale');
});

test('decideAction sans commit attendu accepte l’artefact tel quel', () => {
  const decision = decideAction({ buildInfo: { sourceCommit: SHA_A }, expectedSource: null });
  assert.equal(decision.action, 'apply');
});

test('EXIT_DEFER reste 75 (EX_TEMPFAIL) : le cron s’appuie sur cette valeur', () => {
  // scripts/auto-deploy-cron.sh teste littéralement `-eq 75` pour distinguer
  // « artefact pas encore prêt » (sortie propre) de « artefact cassé » (alerte).
  assert.equal(EXIT_DEFER, 75);
});

test('findDistGaps signale un build sans assets/ ou sans entrée produit', () => {
  const app = tmpApp();
  try {
    const complete = path.join(app, 'complete');
    makeDist(complete, ['a.html', 'b.html']);
    assert.deepEqual(findDistGaps(complete, ['a.html', 'b.html']), []);

    const missingEntry = path.join(app, 'missing-entry');
    makeDist(missingEntry, ['a.html']);
    assert.deepEqual(findDistGaps(missingEntry, ['a.html', 'b.html']), ['b.html']);

    const noAssets = path.join(app, 'no-assets');
    fs.mkdirSync(noAssets, { recursive: true });
    fs.writeFileSync(path.join(noAssets, 'a.html'), '<!doctype html>');
    assert.deepEqual(findDistGaps(noAssets, ['a.html']), ['assets/']);
  } finally {
    fs.rmSync(app, { recursive: true, force: true });
  }
});

test('findDistGaps contrôle par défaut toutes les entrées du registre produits', () => {
  // Une entrée manquante ferait servir ForetMap en silence sur gl.* / planlyautey.*
  // (repli SPA) : le défaut doit couvrir tous les produits, pas seulement ForetMap.
  const app = tmpApp();
  try {
    const dist = path.join(app, 'dist');
    makeDist(dist, ['index.vite.html']);
    const gaps = findDistGaps(dist);
    assert.ok(gaps.includes('gl.html'), `attendu gl.html parmi ${gaps.join(', ')}`);
    assert.ok(gaps.includes('plan.html'), `attendu plan.html parmi ${gaps.join(', ')}`);
  } finally {
    fs.rmSync(app, { recursive: true, force: true });
  }
});

test('isDistTracked distingue un dist/ versionné d’un dist/ ignoré', () => {
  // Garde-fou de la phase de recouvrement : tant que `dist/` est suivi, le poser depuis
  // l'artefact salirait l'arbre, et le cron refuse de déployer sur un arbre sale — le
  // serveur se bloquerait à chaque passage.
  const app = tmpApp();
  const git = (...args) => execFileSync('git', args, { cwd: app, encoding: 'utf8', env: gitEnv() });
  try {
    git('init', '--quiet');
    makeDist(path.join(app, 'dist'));

    git('add', '--force', 'dist');
    git('commit', '--quiet', '-m', 'dist versionné');
    assert.equal(isDistTracked(app), true);

    git('rm', '-r', '--quiet', '--cached', 'dist');
    fs.writeFileSync(path.join(app, '.gitignore'), 'dist/\n');
    git('add', '.gitignore');
    git('commit', '--quiet', '-m', 'dist ignoré');
    assert.equal(isDistTracked(app), false);
  } finally {
    fs.rmSync(app, { recursive: true, force: true });
  }
});

test('isDistTracked ne lève pas hors d’un dépôt git', () => {
  const app = tmpApp();
  try {
    assert.equal(isDistTracked(app), false);
  } finally {
    fs.rmSync(app, { recursive: true, force: true });
  }
});

test('--mode repair ne fait rien quand dist/ est déjà complet', () => {
  // Le cron appelle ce mode à chaque passage sans nouveau commit : il doit court-circuiter
  // AVANT tout accès réseau, sinon c'est un fetch toutes les deux minutes pour rien.
  const app = tmpApp();
  try {
    makeDist(path.join(app, 'dist'));
    // Pas de remote configuré : si le mode tentait un fetch, l'appel lèverait.
    assert.equal(main(['--mode', 'repair', '--dir', app]), 0);
  } finally {
    fs.rmSync(app, { recursive: true, force: true });
  }
});

test('--mode repair laisse la main à git quand dist/ est encore versionné', () => {
  const app = tmpApp();
  const git = (...args) => execFileSync('git', args, { cwd: app, encoding: 'utf8', env: gitEnv() });
  try {
    git('init', '--quiet');
    // `dist/` suivi mais amputé : en mode `repo` c'est à `git` de le rétablir, pas à l'artefact.
    makeDist(path.join(app, 'dist'), ['index.vite.html']);
    git('add', '--force', 'dist');
    git('commit', '--quiet', '-m', 'dist versionné');

    assert.equal(main(['--mode', 'repair', '--dir', app]), 0);
  } finally {
    fs.rmSync(app, { recursive: true, force: true });
  }
});

test('restorePrevious remet dist.prev/ en place et le consomme', () => {
  const app = tmpApp();
  try {
    makeDist(path.join(app, 'dist'));
    fs.writeFileSync(path.join(app, 'dist', 'marqueur.txt'), 'nouveau');
    makeDist(path.join(app, 'dist.prev'));
    fs.writeFileSync(path.join(app, 'dist.prev', 'marqueur.txt'), 'ancien');

    assert.equal(restorePrevious(app), 0);
    assert.equal(fs.readFileSync(path.join(app, 'dist', 'marqueur.txt'), 'utf8'), 'ancien');
    assert.equal(fs.existsSync(path.join(app, 'dist.prev')), false);
    assert.equal(fs.existsSync(path.join(app, 'dist.discarded')), false);
  } finally {
    fs.rmSync(app, { recursive: true, force: true });
  }
});

test('restorePrevious échoue sans dist.prev/ et laisse dist/ intact', () => {
  const app = tmpApp();
  try {
    makeDist(path.join(app, 'dist'));
    fs.writeFileSync(path.join(app, 'dist', 'marqueur.txt'), 'en place');

    assert.equal(restorePrevious(app), 1);
    assert.equal(fs.readFileSync(path.join(app, 'dist', 'marqueur.txt'), 'utf8'), 'en place');
  } finally {
    fs.rmSync(app, { recursive: true, force: true });
  }
});

test('restorePrevious refuse de restaurer un dist.prev/ incomplet', () => {
  // Un rollback qui pose un build tronqué est pire que pas de rollback : on garde le
  // dist/ en place et on laisse le cron alerter.
  const app = tmpApp();
  try {
    makeDist(path.join(app, 'dist'));
    fs.writeFileSync(path.join(app, 'dist', 'marqueur.txt'), 'en place');
    fs.mkdirSync(path.join(app, 'dist.prev'), { recursive: true });
    fs.writeFileSync(path.join(app, 'dist.prev', 'index.vite.html'), '<!doctype html>');

    assert.equal(restorePrevious(app), 1);
    assert.equal(fs.readFileSync(path.join(app, 'dist', 'marqueur.txt'), 'utf8'), 'en place');
    assert.equal(fs.existsSync(path.join(app, 'dist.prev')), true);
  } finally {
    fs.rmSync(app, { recursive: true, force: true });
  }
});
