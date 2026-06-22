#!/usr/bin/env node
/**
 * build-ship.js — Routine de build complet + livraison (côté dev).
 *
 * Enchaîne, dans l'ordre :
 *   1. build front + miroirs CJS  (npm run build → scripts/build-safe.js :
 *      manifests GL, vite build des 3 entrées, sync lib/visit-pack + lib/gl-pack) ;
 *   2. contrôles qualité          (lint, format:check, npm test) ;
 *   3. bump de version            (package.json) + entrée CHANGELOG sous [Non publié] ;
 *   4. git add -A + commit ;
 *   5. git push                   (avec retry/backoff réseau).
 *
 * Objectif : le serveur n'a plus AUCUNE manip à faire. Le cron
 * scripts/auto-deploy-cron.sh tire le commit (dist/ déjà buildé et versionné),
 * synchronise les miroirs, (npm ci --omit=dev si besoin), redémarre et vérifie.
 * Le back ne se « build » pas : c'est du Node exécuté tel quel.
 *
 * Usage :
 *   npm run ship -- -m "feat(zones): titre du lot"        # patch + tous les contrôles + push
 *   npm run ship -- -m "..." --minor                       # bump mineur
 *   npm run ship -- -m "..." --note "Ligne détaillée CHANGELOG"
 *   npm run ship -- --dry-run                               # build + contrôles, sans bump/commit/push
 *   npm run ship -- -m "..." --skip-tests                  # saute npm test (ex. pas de MySQL local)
 *
 * Flags :
 *   -m, --message <txt>  Sujet du commit (obligatoire sauf --dry-run).
 *       --note <txt>     Texte de la puce CHANGELOG (défaut : le sujet du commit).
 *       --bump <type>    patch (défaut) | minor | major | none.
 *       --minor          Raccourci pour --bump minor.
 *       --major          Raccourci pour --bump major.
 *       --no-changelog   Ne pas toucher au CHANGELOG.
 *       --skip-build     Réutiliser dist/ existant (pas de vite build).
 *       --skip-lint      Sauter eslint.
 *       --skip-format    Sauter prettier --check.
 *       --skip-tests     Sauter npm test.
 *       --skip-checks    Sauter lint + format + tests.
 *       --branch <name>  Branche de push (défaut : branche git courante).
 *       --dry-run        N'effectue ni bump, ni CHANGELOG, ni commit, ni push.
 *   -h, --help           Affiche cette aide.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const gitCmd = process.platform === 'win32' ? 'git.exe' : 'git';

function log(msg) {
  process.stdout.write(`[ship] ${msg}\n`);
}

function fail(msg) {
  process.stderr.write(`[ship] ERREUR: ${msg}\n`);
  process.exit(1);
}

/** Exécute une commande en héritant des flux ; retourne le status code. */
function run(cmd, args, opts = {}) {
  const child = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', env: process.env, ...opts });
  if (child.error) {
    fail(`commande introuvable ou échec de lancement : ${cmd} (${child.error.message})`);
  }
  return child.status;
}

/** Exécute une commande et capture stdout (trim) ; retourne null en cas d'échec. */
function capture(cmd, args) {
  const child = spawnSync(cmd, args, { cwd: root, encoding: 'utf8' });
  if (child.status !== 0 || child.error) return null;
  return (child.stdout || '').trim();
}

function step(cmd, args, label) {
  log(`▶ ${label}`);
  const status = run(cmd, args);
  if (status !== 0) {
    fail(`étape « ${label} » échouée (code ${status}). Rien n'a été commité ni poussé.`);
  }
}

function parseArgs(argv) {
  const opts = {
    message: null,
    note: null,
    bump: 'patch',
    changelog: true,
    build: true,
    lint: true,
    format: true,
    tests: true,
    branch: null,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    switch (a) {
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
        break;
      case '-m':
      case '--message':
        opts.message = argv[(i += 1)];
        break;
      case '--note':
        opts.note = argv[(i += 1)];
        break;
      case '--bump':
        opts.bump = argv[(i += 1)];
        break;
      case '--minor':
        opts.bump = 'minor';
        break;
      case '--major':
        opts.bump = 'major';
        break;
      case '--no-changelog':
        opts.changelog = false;
        break;
      case '--skip-build':
        opts.build = false;
        break;
      case '--skip-lint':
        opts.lint = false;
        break;
      case '--skip-format':
        opts.format = false;
        break;
      case '--skip-tests':
        opts.tests = false;
        break;
      case '--skip-checks':
        opts.lint = false;
        opts.format = false;
        opts.tests = false;
        break;
      case '--branch':
        opts.branch = argv[(i += 1)];
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      default:
        fail(`option inconnue : ${a} (voir --help)`);
    }
  }
  return opts;
}

function printHelp() {
  // En-tête de fichier = documentation de référence ; on en imprime l'essentiel.
  const header = fs
    .readFileSync(__filename, 'utf8')
    .split('\n')
    .filter((l) => l.startsWith(' *') || l.startsWith('/**'))
    .map((l) =>
      l
        .replace(/^\/\*\*?/, '')
        .replace(/^ \* ?/, '')
        .replace(/^ \*\/$/, ''),
    )
    .join('\n');
  process.stdout.write(`${header}\n`);
}

/** Insère une entrée sous « ## [Non publié] » du CHANGELOG. */
function updateChangelog(title, note) {
  const changelogPath = path.join(root, 'CHANGELOG.md');
  if (!fs.existsSync(changelogPath)) {
    log('CHANGELOG.md introuvable : étape CHANGELOG ignorée.');
    return false;
  }
  const content = fs.readFileSync(changelogPath, 'utf8');
  const marker = /^## \[Non publié\]\n/m;
  if (!marker.test(content)) {
    log('Section « ## [Non publié] » absente : étape CHANGELOG ignorée.');
    return false;
  }
  const entry = `## [Non publié]\n\n### ${title}\n\n- ${note}\n`;
  const next = content.replace(marker, entry);
  fs.writeFileSync(changelogPath, next, 'utf8');
  log(`CHANGELOG.md mis à jour (entrée « ${title} »).`);
  return true;
}

function readVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  return pkg.version;
}

/** git push avec retry/backoff sur erreurs réseau (2s, 4s, 8s, 16s). */
function pushWithRetry(branch) {
  const delays = [0, 2000, 4000, 8000, 16000];
  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (delays[attempt] > 0) {
      log(`Nouvel essai de push dans ${delays[attempt] / 1000}s…`);
      const wait = spawnSync(process.execPath, ['-e', `setTimeout(() => {}, ${delays[attempt]})`], {
        stdio: 'ignore',
      });
      void wait;
    }
    const status = run(gitCmd, ['push', '-u', 'origin', branch]);
    if (status === 0) return true;
    log(`push échoué (tentative ${attempt + 1}/${delays.length}).`);
  }
  return false;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  // --- Pré-vol ---
  if (!fs.existsSync(path.join(root, '.git'))) {
    fail('dépôt git introuvable à la racine du projet.');
  }
  const currentBranch = capture(gitCmd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!currentBranch || currentBranch === 'HEAD') {
    fail('impossible de déterminer la branche courante (HEAD détaché ?).');
  }
  const branch = opts.branch || currentBranch;

  if (!opts.dryRun && !opts.message) {
    fail('message de commit requis : passez -m "feat(scope): …" (ou utilisez --dry-run).');
  }
  if (!['patch', 'minor', 'major', 'none'].includes(opts.bump)) {
    fail(`type de bump invalide : ${opts.bump} (patch|minor|major|none).`);
  }

  log(`Branche courante : ${currentBranch} → push vers origin/${branch}`);
  log(
    opts.dryRun ? 'Mode --dry-run : aucun bump/commit/push ne sera effectué.' : 'Mode livraison.',
  );

  // --- 1. Build front + miroirs ---
  if (opts.build) {
    step(npmCmd, ['run', 'build'], 'Build front + miroirs CJS (npm run build)');
  } else {
    log('Build sauté (--skip-build) : réutilisation de dist/ existant.');
  }

  // --- 2. Contrôles qualité (sur l'arbre courant, avant toute mutation) ---
  if (opts.lint) step(npmCmd, ['run', 'lint'], 'Lint (eslint)');
  else log('Lint sauté (--skip-lint).');

  if (opts.format) step(npmCmd, ['run', 'format:check'], 'Format check (prettier)');
  else log('Format check sauté (--skip-format).');

  if (opts.tests) step(npmCmd, ['test'], 'Tests backend (npm test)');
  else log('Tests sautés (--skip-tests).');

  if (opts.dryRun) {
    log('✓ Build + contrôles OK. Arrêt (--dry-run) : pas de bump, commit ni push.');
    return;
  }

  // --- 3. Bump de version + CHANGELOG ---
  if (opts.bump !== 'none') {
    step(npmCmd, ['version', opts.bump, '--no-git-tag-version'], `Bump version (${opts.bump})`);
  } else {
    log('Bump sauté (--bump none).');
  }
  const version = readVersion();
  log(`Version package.json : ${version}`);

  if (opts.changelog) {
    const note = opts.note || opts.message;
    const changed = updateChangelog(opts.message, note);
    // Reformate l'entrée générée pour rester conforme à `npm run format:check` / CI.
    if (changed) run(npmCmd, ['exec', '--', 'prettier', '--write', 'CHANGELOG.md']);
  } else {
    log('CHANGELOG sauté (--no-changelog).');
  }

  // --- 4. Commit ---
  step(gitCmd, ['add', '-A'], 'git add -A');
  const staged = capture(gitCmd, ['diff', '--cached', '--name-only']);
  if (!staged) {
    fail('aucun changement à committer après build/bump (rien à livrer).');
  }
  step(gitCmd, ['commit', '-m', opts.message], 'git commit');

  // --- 5. Push (avec retry/backoff) ---
  log('▶ git push (origin)');
  if (!pushWithRetry(branch)) {
    fail(`push vers origin/${branch} échoué après plusieurs tentatives. Commit local conservé.`);
  }

  log(`✓ Livré : ${version} poussé sur origin/${branch}.`);
  log('Le cron serveur (scripts/auto-deploy-cron.sh) prendra le relais au prochain passage.');
}

main();
