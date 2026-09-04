#!/usr/bin/env node
/**
 * Copie les modules ESM de validation pack mascotte vers lib/visit-pack/
 * pour que l’API Express (`routes/visit.js`) fonctionne sans le dossier `src/`
 * (déploiement runtime / prod sans sources frontend).
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'lib', 'visit-pack');
const VISIT_PACK_PACKAGE_JSON = JSON.stringify({ type: 'module' }, null, 2) + '\n';
const files = [
  ['src/utils/mascotPack.js', 'mascotPack.js'],
  ['src/utils/visitMascotState.js', 'visitMascotState.js'],
  ['src/utils/visitMascotInteractionEvents.js', 'visitMascotInteractionEvents.js'],
  ['src/utils/visitMascotDialogEvents.js', 'visitMascotDialogEvents.js'],
  ['src/utils/visitMascotDialogApply.js', 'visitMascotDialogApply.js'],
  ['src/shared/platform/browserStorage.js', 'browserStorage.js'],
  ['src/utils/visitMascotCatalog.js', 'visitMascotCatalog.js'],
  ['src/data/renard2-cut-manifest.js', 'data/renard2-cut-manifest.js'],
  ['src/data/gnome1-cut-manifest.js', 'data/gnome1-cut-manifest.js'],
];

function copyWithVisitCatalogImportFix(from, to) {
  if (to.endsWith(`${path.sep}visitMascotCatalog.js`)) {
    let text = fs.readFileSync(from, 'utf8');
    // Les manifests de data sont copiés à plat sous lib/visit-pack/data/ : on
    // réaligne tout import relatif `../data/...` (source) sur `./data/...` (miroir).
    text = text.replace(/from '\.\.\/data\//g, "from './data/");
    // `browserStorage.js` vit dans `src/shared/platform/` (lot 3) mais est copié à plat dans
    // le miroir : on réaligne aussi cet import sur `./browserStorage.js`.
    text = text.replace(
      /from '\.\.\/shared\/platform\/browserStorage\.js'/g,
      "from './browserStorage.js'",
    );
    fs.writeFileSync(to, text, 'utf8');
    return;
  }
  fs.copyFileSync(from, to);
}

function main() {
  const hasSrc = files.every(([relSrc]) => fs.existsSync(path.join(root, relSrc)));
  if (!hasSrc) {
    const hasLib = files.every(([, name]) => fs.existsSync(path.join(outDir, name)));
    if (hasLib) {
      console.warn(
        '[sync-visit-pack-server-lib] Sources `src/` absentes — lib/visit-pack/ conservé (bundle runtime).',
      );
      return;
    }
    console.error(
      '[sync-visit-pack-server-lib] Ni sources ni lib/visit-pack/ — impossible de continuer.',
    );
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'package.json'), VISIT_PACK_PACKAGE_JSON, 'utf8');
  for (const [relSrc, name] of files) {
    const from = path.join(root, relSrc);
    const to = path.join(outDir, name);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    copyWithVisitCatalogImportFix(from, to);
  }
  console.log('[sync-visit-pack-server-lib] OK → lib/visit-pack/');
}

main();
