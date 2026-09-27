'use strict';

/**
 * Scripts lancés par la crontab du serveur (docs/CRONTAB.md) — incident du 27/09/2026.
 *
 * La ligne de crontab appelait `scripts/auto-deploy-cron.sh` directement, alors que git le
 * suivait sans droit d'exécution (mode 100644) : le serveur comptait sur un `chmod +x` fait à
 * la main, que le `git pull` réécrivant le script a fait sauter. Chaque passage échouait ensuite
 * sur « Permission denied », sans alerte, et le site a fini sur la page d'aide au déploiement.
 *
 * Deux garde-fous indépendants :
 *  - chaque ligne documentée appelle son script **par `bash`** (le droit d'exécution ne compte
 *    plus) ;
 *  - chaque script appelé par la crontab est tout de même suivi **exécutable** par git.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const CRONTAB_DOCS = ['docs/CRONTAB.md', 'docs/EXPLOITATION.md'];

/** Lignes de crontab (5 champs de planification) qui lancent un script `.sh` du dépôt. */
function crontabScriptLines(relativeDoc) {
  const text = fs.readFileSync(path.join(ROOT, relativeDoc), 'utf8');
  return text.split('\n').filter(
    (line) =>
      // Cinq champs de planification cron (chiffres, `*`, `/`, `,`, `-`), puis la commande.
      /^\s*(?:[\d*/,-]+\s+){5}\S/.test(line) && /\/scripts\/[\w-]+\.sh\b/.test(line),
  );
}

function scriptsCalledByCrontab() {
  const names = new Set();
  for (const doc of CRONTAB_DOCS) {
    for (const line of crontabScriptLines(doc)) {
      for (const match of line.matchAll(/\/scripts\/([\w-]+\.sh)\b/g)) names.add(match[1]);
    }
  }
  return [...names].sort();
}

test('la documentation liste bien des lignes de crontab (le contrôle porte sur quelque chose)', () => {
  assert.deepEqual(scriptsCalledByCrontab(), [
    'auto-deploy-cron.sh',
    'db-backup.sh',
    'moodle-sync-cron.sh',
    'uptime-check.sh',
  ]);
});

test('chaque ligne de crontab documentée appelle son script par bash', () => {
  for (const doc of CRONTAB_DOCS) {
    for (const line of crontabScriptLines(doc)) {
      for (const match of line.matchAll(/(\S+)\s+(\S*\/scripts\/[\w-]+\.sh)\b/g)) {
        assert.equal(match[1], 'bash', `${doc} : « ${match[2]} » sans bash devant\n${line}`);
      }
    }
  }
});

test('chaque script appelé par la crontab est suivi exécutable par git (100755)', () => {
  for (const name of scriptsCalledByCrontab()) {
    const out = execFileSync('git', ['ls-files', '-s', `scripts/${name}`], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    assert.match(out, /^100755 /, `scripts/${name} : mode git ${out.split(' ')[0] || 'absent'}`);
  }
});

test('auto-deploy-cron.sh : syntaxe bash valide', () => {
  execFileSync('bash', ['-n', path.join(ROOT, 'scripts', 'auto-deploy-cron.sh')]);
});

test('auto-deploy-cron.sh : front vérifié sans déploiement, y compris arbre non propre', () => {
  const cron = fs.readFileSync(path.join(ROOT, 'scripts', 'auto-deploy-cron.sh'), 'utf8');
  // Les deux chemins qui sortaient tôt vérifient maintenant que le front est posé ET servi.
  const dirty = cron.slice(cron.indexOf('DIRTY_TREE="$(git status --porcelain)"'));
  assert.match(dirty.slice(0, dirty.indexOf('exit 1')), /ensure_frontend_served/);
  const noCommit = cron.slice(cron.indexOf('if [[ "$LOCAL_SHA" == "$REMOTE_SHA" ]]; then'));
  assert.match(noCommit.slice(0, noCommit.indexOf('exit 0')), /ensure_frontend_served/);
  // Serveur bloqué sur la page d'aide : lu sur /api/health (champ `frontend`).
  assert.match(cron, /"\$\(frontend_mode\)" == "missing"/);
  assert.match(cron, /\/api\/health/);
});

test('roue de secours : tmp/restart.txt est ignoré par git (sinon l’arbre deviendrait sale)', () => {
  // Le cron refuse de déployer sur un arbre non propre : un tmp/restart.txt suivi ou non
  // ignoré bloquerait tous les déploiements suivants.
  execFileSync('git', ['check-ignore', '--quiet', 'tmp/restart.txt'], { cwd: ROOT });
});

test('auto-deploy-cron.sh : sans DEPLOY_SECRET, le déploiement n’est plus abandonné', () => {
  const cron = fs.readFileSync(path.join(ROOT, 'scripts', 'auto-deploy-cron.sh'), 'utf8');
  const guard = cron.slice(
    cron.indexOf('if [[ "$DO_DEPLOY_RESTART" == "1" ]] && [[ -z "${DEPLOY_SECRET:-}" ]]; then'),
  );
  assert.doesNotMatch(guard.slice(0, guard.indexOf('\nfi\n')), /exit 1/);
  // Tous les redémarrages passent par restart_app (API, sinon tmp/restart.txt).
  assert.equal((cron.match(/\/api\/admin\/restart" \\/g) || []).length, 1);
  assert.match(cron, /touch "\$APP_DIR\/tmp\/restart\.txt"/);
});
