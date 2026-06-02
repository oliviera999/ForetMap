#!/usr/bin/env node
/**
 * Copie / transforme glMascotPack.js (ESM) vers lib/gl-pack/mascotPack.js (CJS)
 * pour l’API Express sans dossier src/ (déploiement runtime).
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'lib', 'gl-pack');
const relSrc = 'src/utils/glMascotPack.js';
const outName = 'mascotPack.js';

function esmGlMascotPackToCjs(text) {
  let out = text.replace(/^import \{ z \} from 'zod';\s*/m, "const { z } = require('zod');\n");
  out = out.replace(/^export const /gm, 'const ');
  out = out.replace(/^export function /gm, 'function ');
  out += '\nmodule.exports = {\n  glMascotPackSchema,\n  parseGlMascotPack,\n  validateGlMascotPack,\n};\n';
  return out;
}

function main() {
  const from = path.join(root, relSrc);
  const to = path.join(outDir, outName);
  if (!fs.existsSync(from)) {
    if (fs.existsSync(to)) {
      console.warn('[sync-gl-pack-server-lib] Sources absentes — lib/gl-pack/ conservé (bundle runtime).');
      return;
    }
    console.error('[sync-gl-pack-server-lib] Ni sources ni lib/gl-pack/mascotPack.js.');
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const text = fs.readFileSync(from, 'utf8');
  fs.writeFileSync(to, esmGlMascotPackToCjs(text), 'utf8');
  console.log('[sync-gl-pack-server-lib] OK → lib/gl-pack/mascotPack.js');
}

main();
