'use strict';

/**
 * `npm run gl:sim:rapide [-- --voile 3,4,5,6 --e2 --e3 --classe difficulte --runs 4000 --json]`
 * lance le modèle rapide Python (`tools/gl-sim/modele-rapide/sim_tenir_modele.py`, sans
 * dépendance) s'il trouve `python3` (ou `python`), sinon le signale sans échouer.
 */

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const SCRIPT = path.join(__dirname, 'modele-rapide', 'sim_tenir_modele.py');

function trouverPython() {
  for (const bin of ['python3', 'python']) {
    const r = spawnSync(bin, ['--version'], { encoding: 'utf8' });
    if (r.status === 0 && /Python 3/.test(`${r.stdout}${r.stderr}`)) return bin;
  }
  return null;
}

function main() {
  const python = trouverPython();
  if (!python) {
    console.log(
      '[gl-sim:rapide] python3 introuvable : le modèle rapide n’est pas lancé (le banc Node reste disponible : npm run gl:sim).',
    );
    process.exit(0);
  }
  const args = process.argv.slice(2);
  const r = spawnSync(python, ['-I', SCRIPT, ...args], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..', '..'),
  });
  process.exit(r.status == null ? 1 : r.status);
}

module.exports = { trouverPython, SCRIPT };

if (require.main === module) main();
