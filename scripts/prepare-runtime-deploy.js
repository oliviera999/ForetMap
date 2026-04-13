#!/usr/bin/env node
/**
 * Bundle « runtime » (sources + dist + node_modules prod) pour déploiement sans npm sur le serveur.
 * Équivalent logique de `prepare-runtime-deploy.ps1`, portable Linux / macOS / Windows (sh ou cmd).
 */
const fs = require('fs');
const path = require('path');
const { spawnSync, execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');

/** Playwright n’est pas nécessaire au bundle prod ; son postinstall (Chromium/Wasm) peut faire planter `npm ci` sur mutualisé (OOM). */
function envForNpmBundle() {
  return {
    ...process.env,
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD || '1',
  };
}

const argv = new Set(process.argv.slice(2));
const skipInstall = argv.has('--skip-install');
const skipBuild = argv.has('--skip-build');
const skipPrune = argv.has('--skip-prune');

const EXCLUDE_DIR_NAMES = new Set([
  '.git',
  '.cursor',
  'deploy',
  'node_modules',
  'uploads',
  'logs',
  'playwright-report',
  'test-results',
  'blob-report',
]);
const EXCLUDE_FILE_NAMES = new Set([
  '.env',
  'startup.log',
  'startup-diag.log',
  'npm-debug.log',
]);

const REQUIRED_RUNTIME = [
  'app.js',
  'server.js',
  'database.js',
  'package.json',
  'package-lock.json',
  'node_modules',
  'dist',
  /** Validation POST/PUT `/api/visit/mascot-packs` sans dossier `src/` (voir `npm run sync:visit-pack-lib`). */
  'lib/visit-pack/mascotPack.js',
  'lib/visit-pack/visitMascotState.js',
];

function runCommand(cmd, args, options = {}) {
  const commandLine = [cmd, ...args].join(' ');
  try {
    execSync(commandLine, {
      cwd: rootDir,
      stdio: 'inherit',
      shell: true,
      ...options,
    });
    return true;
  } catch (err) {
    const code = err && typeof err.status === 'number' ? err.status : '?';
    console.error(`[cmd-failed] ${commandLine} (code ${code})`);
    return false;
  }
}

function commandExists(cmd) {
  const check = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], {
    cwd: rootDir,
    stdio: 'ignore',
    shell: false,
  });
  return check.status === 0;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function stampCompact() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function copyProjectFiltered(srcRoot, destRoot) {
  fs.mkdirSync(destRoot, { recursive: true });
  fs.cpSync(srcRoot, destRoot, {
    recursive: true,
    dereference: false,
    filter(src) {
      const rel = path.relative(srcRoot, src);
      if (!rel || rel === '.') return true;
      const segments = rel.split(path.sep);
      for (const seg of segments) {
        if (EXCLUDE_DIR_NAMES.has(seg)) return false;
      }
      if (EXCLUDE_FILE_NAMES.has(path.basename(src))) return false;
      return true;
    },
  });
}

function copyNodeModulesDir(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true, dereference: false });
}

function createRuntimeZip(zipPath, stageDir) {
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

  if (commandExists('zip')) {
    return runCommand('zip', ['-qr', zipPath, '.'], { cwd: stageDir });
  }

  const tarArgs = ['-a', '-c', '-f', zipPath, '-C', stageDir, '.'];
  if (commandExists('tar') && runCommand('tar', tarArgs)) {
    return true;
  }

  if (process.platform === 'win32' && commandExists('powershell')) {
    const inner = path.join(stageDir, '*');
    return runCommand('powershell', [
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `Compress-Archive -Path "${inner}" -DestinationPath "${zipPath}" -Force`,
    ]);
  }

  console.warn(
    "Aucun outil ZIP trouvé (essayez : apt install zip, ou tar avec support zip). Archive non créée."
  );
  return false;
}

if (!skipInstall || !skipBuild || !skipPrune) {
  if (!commandExists('npm')) {
    fail('Commande introuvable: npm. Installe Node.js/npm puis réessaie.');
  }
}

if (!skipInstall) {
  console.log('==> Installation dépendances complètes (build local)');
  console.log('    (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 — pas de navigateurs e2e, adapté hébergement limité)');
  if (!runCommand('npm', ['ci', '--include=dev'], { env: envForNpmBundle() })) {
    fail('Échec npm ci --include=dev');
  }
} else {
  console.log('==> Installation ignorée (--skip-install)');
}

if (!skipBuild) {
  console.log('==> Build frontend');
  if (!runCommand('npm', ['run', 'build'], { env: envForNpmBundle() })) {
    fail('Échec npm run build');
  }
} else {
  console.log('==> Build ignoré (--skip-build)');
}

if (!skipPrune) {
  console.log('==> Prune vers dépendances production');
  if (!runCommand('npm', ['prune', '--omit=dev'], { env: envForNpmBundle() })) {
    fail('Échec npm prune --omit=dev');
  }
} else {
  console.log('==> Prune ignorée (--skip-prune)');
}

const distIndexVite = path.join(rootDir, 'dist', 'index.vite.html');
const distIndexLegacy = path.join(rootDir, 'dist', 'index.html');
if (!fs.existsSync(distIndexVite) && !fs.existsSync(distIndexLegacy)) {
  fail('Build incomplet: dist/index.vite.html (ou dist/index.html) introuvable.');
}
if (!fs.existsSync(path.join(rootDir, 'node_modules'))) {
  fail('node_modules introuvable. Relance sans --skip-install.');
}

const deployRoot = path.join(rootDir, 'deploy');
const runtimeRoot = path.join(deployRoot, 'runtime');
const stamp = stampCompact();
const bundleName = `foretmap-runtime-${stamp}`;
const stageDir = path.join(runtimeRoot, bundleName);
const zipPath = path.join(deployRoot, `${bundleName}.zip`);
const manifestPath = path.join(stageDir, 'DEPLOY_MANIFEST.txt');

fs.mkdirSync(runtimeRoot, { recursive: true });
if (fs.existsSync(stageDir)) {
  fs.rmSync(stageDir, { recursive: true, force: true });
}
fs.mkdirSync(stageDir, { recursive: true });

console.log('==> Copie des fichiers projet (hors secrets, sans node_modules)');
copyProjectFiltered(rootDir, stageDir);

console.log('==> Copie node_modules (runtime)');
copyNodeModulesDir(path.join(rootDir, 'node_modules'), path.join(stageDir, 'node_modules'));

for (const name of REQUIRED_RUNTIME) {
  const p = path.join(stageDir, name);
  if (!fs.existsSync(p)) {
    fail(`Bundle incomplet: '${name}' introuvable dans le staging.`);
  }
}

let gitSha = 'unknown';
try {
  gitSha = execSync('git rev-parse --short HEAD', {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
} catch (_) {
  /* noop */
}

const manifest = [
  'ForetMap runtime bundle',
  `generated_at=${new Date().toISOString()}`,
  `git_sha=${gitSha}`,
  `stage_dir=${stageDir}`,
  'notes=Ce bundle contient dist + node_modules(prod).',
].join('\n');
fs.writeFileSync(manifestPath, manifest, 'utf8');

console.log('==> Création archive ZIP');
const zipped = createRuntimeZip(zipPath, stageDir);

console.log('');
console.log('Bundle runtime prêt.');
console.log(`- Dossier: ${stageDir}`);
if (zipped) {
  console.log(`- ZIP (optionnel): ${zipPath}`);
} else {
  console.log('- ZIP: non généré (voir message ci-dessus) — tu peux uploader le dossier tel quel ou zipper à la main.');
}
console.log('');
console.log('Déploiement serveur:');
console.log('1) Uploader le dossier ci-dessus tel quel (rsync / SFTP), ou extraire le ZIP si tu l’as produit.');
console.log('2) Redémarrer l’application Node.js.');
console.log('3) Vérifier avec: npm run deploy:check:prod');
