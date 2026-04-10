#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync, execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const skipInstall = process.argv.includes('--skip-install');
const viteBinPath = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');

function envForNpmBundle() {
  return {
    ...process.env,
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD || '1',
  };
}

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
    if (err && typeof err.status === 'number') {
      console.error(`[cmd-failed] ${commandLine} (code ${err.status})`);
    } else {
      console.error(`[cmd-failed] ${commandLine}`);
    }
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

if (!commandExists('npm')) {
  fail("Commande introuvable: npm. Installe Node.js/npm puis réessaie.");
}

if (!skipInstall) {
  console.log('==> Installation des dépendances (npm ci --include=dev)');
  console.log('    (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 — pas de navigateurs e2e)');
  if (!runCommand('npm', ['ci', '--include=dev'], { env: envForNpmBundle() })) {
    console.warn('npm ci a échoué (lockfile potentiellement désynchronisé). Bascule sur npm install --include=dev...');
    if (!runCommand('npm', ['install', '--include=dev'], { env: envForNpmBundle() })) {
      fail("Échec installation dépendances (npm ci puis npm install).");
    }
  }
} else {
  console.log('==> Installation sautée (--skip-install)');
  if (!fs.existsSync(viteBinPath)) {
    console.warn("Vite absent (devDependencies non installées). Installation automatique via npm install --include=dev...");
    if (!runCommand('npm', ['install', '--include=dev'], { env: envForNpmBundle() })) {
      fail("Échec installation des dépendances dev requises pour le build.");
    }
  }
}

console.log('==> Build frontend (npm run build)');
if (!runCommand('npm', ['run', 'build'], { env: envForNpmBundle() })) {
  fail("Échec du build frontend (npm run build).");
}

const distPath = path.join(rootDir, 'dist');
const distIndex = fs.existsSync(path.join(distPath, 'index.vite.html'))
  ? path.join(distPath, 'index.vite.html')
  : path.join(distPath, 'index.html');
if (!fs.existsSync(distIndex)) {
  fail('Build incomplet: dist/index.vite.html (ou index.html) introuvable.');
}

const deployDir = path.join(rootDir, 'deploy');
if (!fs.existsSync(deployDir)) {
  fs.mkdirSync(deployDir, { recursive: true });
}

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const zipPath = path.join(deployDir, `foretmap-dist-${stamp}.zip`);

let archived = false;
if (process.platform === 'win32' && commandExists('powershell')) {
  archived = runCommand('powershell', [
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    `Compress-Archive -Path "${path.join(distPath, '*')}" -DestinationPath "${zipPath}" -Force`,
  ]);
} else if (commandExists('zip')) {
  archived = runCommand('zip', ['-qr', zipPath, 'dist'], { cwd: rootDir });
}

console.log('\nTerminé.');
console.log(`- Build prêt: ${distPath}`);
if (archived) {
  console.log(`- Archive prête: ${zipPath}`);
} else {
  console.log("- Archive ZIP non générée (commande 'zip' ou 'powershell' indisponible).");
  console.log('- Upload le dossier dist/ directement sur le serveur.');
}
console.log("Upload le dossier dist/ (ou l'archive ZIP) sur le serveur, puis redémarre l'app Node.js.");
