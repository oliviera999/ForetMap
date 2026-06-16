'use strict';

const fs = require('fs');
const path = require('path');

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

function getGlMascotPackLibProbe() {
  const roots = projectRoots();
  const libMirrorOk = roots.some((r) =>
    fs.existsSync(path.join(r, 'lib', 'gl-pack', 'mascotPack.js')),
  );
  return { roots, libMirrorOk };
}

module.exports = {
  projectRoots,
  getGlMascotPackLibProbe,
};
