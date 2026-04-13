'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Racines candidates pour résoudre `mascotPack.js` (dev avec `src/`, prod avec `lib/visit-pack/`).
 * Plusieurs entrées couvrent Passenger / hébergeurs où `process.cwd()` n’est pas la racine du dépôt.
 */
function projectRoots() {
  const roots = [];
  const push = (p) => {
    if (!p || typeof p !== 'string') return;
    const abs = path.resolve(p);
    if (!roots.includes(abs)) roots.push(abs);
  };
  push(path.join(__dirname, '..'));
  if (require.main && require.main.filename) {
    push(path.dirname(require.main.filename));
  }
  push(process.cwd());
  return roots;
}

/** Chemins absolus uniques vers `mascotPack.js` à tenter avec `import()` (src puis lib par racine). */
function getMascotPackValidatorCandidates() {
  const seen = new Set();
  const out = [];
  for (const root of projectRoots()) {
    const srcPack = path.join(root, 'src', 'utils', 'mascotPack.js');
    const libPack = path.join(root, 'lib', 'visit-pack', 'mascotPack.js');
    for (const abs of [srcPack, libPack]) {
      if (!fs.existsSync(abs)) continue;
      const norm = path.normalize(abs);
      if (seen.has(norm)) continue;
      seen.add(norm);
      out.push(abs);
    }
  }
  return out;
}

/** Instantané synchrone pour GET /api/admin/diagnostics (sans import dynamique). */
function getMascotPackLibProbe() {
  const roots = projectRoots();
  const libMirrorOk = roots.some(
    (r) =>
      fs.existsSync(path.join(r, 'lib', 'visit-pack', 'mascotPack.js'))
      && fs.existsSync(path.join(r, 'lib', 'visit-pack', 'visitMascotState.js')),
  );
  return {
    roots,
    candidatesCount: getMascotPackValidatorCandidates().length,
    libMirrorOk,
  };
}

module.exports = {
  projectRoots,
  getMascotPackValidatorCandidates,
  getMascotPackLibProbe,
};
