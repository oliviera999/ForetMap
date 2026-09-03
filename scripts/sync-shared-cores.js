#!/usr/bin/env node
/**
 * Régénère les miroirs CJS `lib/shared/*Core.js` depuis les noyaux ESM de `src/shared/`
 * (source de vérité unique), pour l’API Express sans dossier src/ (déploiement runtime).
 *
 * Même motif que scripts/sync-gl-pack-server-lib.js, scripts/sync-visit-pack-server-lib.js
 * et scripts/sync-term-autolink-lib.js, généralisé à plusieurs paires :
 *   - `import { a } from './x.js'`  → `const { a } = require('./x')` (imports relatifs entre
 *     noyaux réalignés sur la sortie à plat de lib/shared/) ;
 *   - `export const` / `export function` → déclaration nue, exportée en fin de fichier ;
 *   - `export { … };` → `module.exports = { … };`.
 *
 * Usage :
 *   node scripts/sync-shared-cores.js           # écrit les miroirs
 *   node scripts/sync-shared-cores.js --check   # code 1 si un miroir diverge, sans écrire
 *
 * Le module exporte aussi ses fonctions (`renderMirror`, `checkAll`…) pour le test
 * tests/shared-cores-sync.test.js, qui rejoue la génération en mémoire.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'lib', 'shared');
const TAG = '[sync-shared-cores]';

/** Paires source ESM (relative à la racine) → nom du miroir dans lib/shared/. */
const PAIRS = Object.freeze([
  ['src/shared/emojiMojibakeCore.js', 'emojiMojibakeCore.js'],
  ['src/shared/glBoardPathCore.js', 'glBoardPathCore.js'],
  ['src/shared/glMarkerAppearanceCore.js', 'glMarkerAppearanceCore.js'],
  ['src/shared/glMarkerBackgroundsCore.js', 'glMarkerBackgroundsCore.js'],
  ['src/shared/glMarkerEventConfigCore.js', 'glMarkerEventConfigCore.js'],
  ['src/shared/image-frame/glImageFrameCore.js', 'glImageFrameCore.js'],
]);

function banner(relSrc) {
  return (
    '/* Fichier généré par scripts/sync-shared-cores.js — ne pas éditer. */\n' +
    `/* Source : ${relSrc} — régénérer avec \`npm run sync:shared-cores\`. */\n` +
    "'use strict';\n\n"
  );
}

/**
 * Réécrit un spécificateur d'import relatif (`./emojiMojibakeCore.js`, `../x.js`) en
 * chemin `require` vers le miroir correspondant, tous les miroirs étant à plat dans
 * lib/shared/. Un import qui ne vise pas une paire connue est une erreur : le miroir
 * serait silencieusement cassé au runtime.
 */
function rewriteImportSpecifier(spec, relSrc) {
  if (!spec.startsWith('.')) {
    throw new Error(`${relSrc} : import non relatif "${spec}" non pris en charge par le miroir.`);
  }
  const absTarget = path.resolve(root, path.dirname(relSrc), spec);
  const relTarget = path.relative(root, absTarget).split(path.sep).join('/');
  const pair = PAIRS.find(([src]) => src === relTarget);
  if (!pair) {
    throw new Error(
      `${relSrc} : import relatif "${spec}" ne vise aucun noyau de la liste PAIRS ` +
        '(ajouter la paire à scripts/sync-shared-cores.js).',
    );
  }
  return './' + pair[1].replace(/\.js$/, '');
}

/** Transforme le texte ESM d'un noyau en son miroir CJS. */
function esmCoreToCjs(text, relSrc) {
  let out = text;

  // Imports nommés (mono ou multi-lignes) → require, en conservant la mise en forme
  // Prettier de la liste (`{ a, b }` ou bloc indenté).
  out = out.replace(
    /^import\s+(\{[\s\S]*?\})\s+from\s+'([^']+)';\n/gm,
    (_m, names, spec) => `const ${names} = require('${rewriteImportSpecifier(spec, relSrc)}');\n`,
  );

  // Déclarations exportées inline → déclarations nues ; les noms sont collectés pour
  // composer le bloc module.exports (dans l'ordre du fichier).
  const inlineNames = [];
  out = out.replace(/^export (const|let|function) ([A-Za-z_$][\w$]*)/gm, (_m, kind, name) => {
    inlineNames.push(name);
    return `${kind} ${name}`;
  });

  // Bloc `export { … };` final → `module.exports = { … };`.
  let hasExportBlock = false;
  out = out.replace(/^export \{\n/gm, () => {
    hasExportBlock = true;
    return 'module.exports = {\n';
  });

  if (hasExportBlock && inlineNames.length > 0) {
    throw new Error(
      `${relSrc} : mélange de \`export { … }\` et d'exports inline non pris en charge.`,
    );
  }
  if (!hasExportBlock) {
    if (inlineNames.length === 0) {
      throw new Error(`${relSrc} : aucun export détecté.`);
    }
    if (!out.endsWith('\n')) out += '\n';
    out += '\nmodule.exports = {\n' + inlineNames.map((n) => `  ${n},\n`).join('') + '};\n';
  }

  // Garde-fou (audit §7.5) : la transformation repose sur des regex ciblées ; tout
  // `import`/`export` résiduel signifierait un miroir CJS silencieusement incomplet.
  const residual = out.match(/^(import |export )/m);
  if (residual) {
    throw new Error(
      `${relSrc} : syntaxe ESM résiduelle ("${residual[1].trim()}") après transformation. ` +
        'Adapter esmCoreToCjs() (nouvel import/export non couvert par les regex).',
    );
  }

  return banner(relSrc) + out;
}

/** Rend le miroir CJS d'une paire depuis le disque (sans écrire). */
function renderMirror(relSrc) {
  const text = fs.readFileSync(path.join(root, relSrc), 'utf8');
  return esmCoreToCjs(text, relSrc);
}

/**
 * Compare chaque miroir au rendu attendu. Retourne la liste des miroirs divergents
 * (`{ relSrc, outName, missing }`), vide si tout est synchronisé.
 */
function checkAll() {
  const diverged = [];
  for (const [relSrc, outName] of PAIRS) {
    const to = path.join(outDir, outName);
    const expected = renderMirror(relSrc);
    if (!fs.existsSync(to)) {
      diverged.push({ relSrc, outName, missing: true });
      continue;
    }
    if (fs.readFileSync(to, 'utf8') !== expected) {
      diverged.push({ relSrc, outName, missing: false });
    }
  }
  return diverged;
}

/** Écrit les six miroirs. Retourne les noms écrits. */
function writeAll() {
  fs.mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const [relSrc, outName] of PAIRS) {
    fs.writeFileSync(path.join(outDir, outName), renderMirror(relSrc), 'utf8');
    written.push(outName);
  }
  return written;
}

function main(argv = process.argv.slice(2)) {
  const checkMode = argv.includes('--check');
  const hasSrc = PAIRS.every(([relSrc]) => fs.existsSync(path.join(root, relSrc)));
  if (!hasSrc) {
    const hasLib = PAIRS.every(([, outName]) => fs.existsSync(path.join(outDir, outName)));
    if (hasLib) {
      console.warn(`${TAG} Sources src/shared/ absentes — lib/shared/ conservé (bundle runtime).`);
      return 0;
    }
    console.error(
      `${TAG} Ni sources src/shared/ ni miroirs lib/shared/ — impossible de continuer.`,
    );
    return 1;
  }

  try {
    if (checkMode) {
      const diverged = checkAll();
      if (diverged.length === 0) {
        console.log(`${TAG} OK — ${PAIRS.length} miroirs lib/shared/ synchronisés.`);
        return 0;
      }
      for (const d of diverged) {
        console.error(
          `${TAG} DIVERGENCE : lib/shared/${d.outName} ${d.missing ? 'absent' : 'diffère'} ` +
            `de ${d.relSrc}.`,
        );
      }
      console.error(`${TAG} Régénérer avec \`npm run sync:shared-cores\`.`);
      return 1;
    }
    const written = writeAll();
    console.log(`${TAG} OK → lib/shared/{${written.join(',')}}`);
    return 0;
  } catch (err) {
    console.error(`${TAG} ÉCHEC : ${err.message}`);
    return 1;
  }
}

module.exports = { PAIRS, outDir, esmCoreToCjs, renderMirror, checkAll, writeAll, main };

if (require.main === module) {
  process.exit(main());
}
