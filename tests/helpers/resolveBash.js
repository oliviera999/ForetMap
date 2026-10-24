'use strict';

/**
 * Sous Windows, `bash` du PATH pointe souvent vers le relais WSL (cassé sans distro).
 * Les scripts du dépôt sont validés / exécutés avec Git Bash, comme en local.
 */

const fs = require('node:fs');
const path = require('node:path');

const GIT_BASH_CANDIDATES = [
  process.env.GIT_BASH,
  'C:\\Program Files\\Git\\bin\\bash.exe',
  'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
].filter(Boolean);

function resolveBash() {
  if (process.platform === 'win32') {
    for (const candidate of GIT_BASH_CANDIDATES) {
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  }
  return 'bash';
}

/** Chemin lisible par bash (Git Bash attend /c/… sous Windows). */
function bashPath(p) {
  if (process.platform !== 'win32') return p;
  return path
    .resolve(p)
    .replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`)
    .replace(/\\/g, '/');
}

/**
 * Lien symbolique de dossier : junction sous Windows (pas de privilège admin),
 * symlink classique ailleurs.
 */
function linkDirectory(target, linkPath) {
  if (process.platform === 'win32') {
    fs.symlinkSync(target, linkPath, 'junction');
    return;
  }
  fs.symlinkSync(target, linkPath);
}

/** Lien vers un binaire : symlink si possible, sinon copie (Windows sans Developer Mode). */
function linkOrCopyFile(target, linkPath) {
  try {
    fs.symlinkSync(target, linkPath);
  } catch {
    fs.copyFileSync(target, linkPath);
  }
}

module.exports = { resolveBash, bashPath, linkDirectory, linkOrCopyFile };
