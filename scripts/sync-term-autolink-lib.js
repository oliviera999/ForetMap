#!/usr/bin/env node
/**
 * Copie / transforme src/utils/termAutolink.js (ESM) vers
 * lib/term-autolink/termAutolink.js (CJS) pour l’API Express sans dossier src/
 * (déploiement runtime).
 *
 * Même motif que scripts/sync-gl-pack-server-lib.js et
 * scripts/sync-visit-pack-server-lib.js.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'lib', 'term-autolink');
const relSrc = 'src/utils/termAutolink.js';
const outName = 'termAutolink.js';

// En-tête du miroir : marque le fichier comme généré et déclare les globals DOM
// utilisés par `walkAndLink` (fonction réservée au front — jamais appelée côté
// serveur), sinon `no-undef` échoue sur `lib/**` qui est linté en contexte Node.
const BANNER = `/* Fichier généré par scripts/sync-term-autolink-lib.js — ne pas éditer à la main. */
/* Source : src/utils/termAutolink.js — régénérer avec \`npm run sync:term-autolink-lib\`. */
/* global Node, document */
`;

function esmTermAutolinkToCjs(text) {
  let out = BANNER + text.replace(/^export const /gm, 'const ');
  out = out.replace(/^export function /gm, 'function ');
  out += '\nmodule.exports = {\n  SKIP_TAGS,\n  VOID_TAGS,\n  createTermAutolink,\n};\n';
  return out;
}

function main() {
  const from = path.join(root, relSrc);
  const to = path.join(outDir, outName);
  if (!fs.existsSync(from)) {
    if (fs.existsSync(to)) {
      console.warn(
        '[sync-term-autolink-lib] Sources absentes — lib/term-autolink/ conservé (bundle runtime).',
      );
      return;
    }
    console.error('[sync-term-autolink-lib] Ni sources ni lib/term-autolink/termAutolink.js.');
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const text = fs.readFileSync(from, 'utf8');
  const transformed = esmTermAutolinkToCjs(text);
  // Garde-fou (audit §7.5) : la transformation ESM→CJS repose sur des regex ciblées ;
  // tout `import`/`export` résiduel signifierait un miroir CJS silencieusement incomplet.
  const residual = transformed.match(/^(import |export )/m);
  if (residual) {
    console.error(
      `[sync-term-autolink-lib] ÉCHEC : syntaxe ESM résiduelle ("${residual[1].trim()}") après ` +
        `transformation de ${relSrc}. Adapter esmTermAutolinkToCjs() (nouvel import/export non couvert ` +
        'par les regex) avant de régénérer lib/term-autolink/termAutolink.js.',
    );
    process.exit(1);
  }
  fs.writeFileSync(to, transformed, 'utf8');
  console.log('[sync-term-autolink-lib] OK → lib/term-autolink/termAutolink.js');
}

main();
