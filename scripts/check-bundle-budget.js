#!/usr/bin/env node
/**
 * Budget du bundle de l'entrée non connectée (audit UI/UX du 19/11/2026, U1).
 *
 * Mesure, dans le manifeste Rollup (`dist/.vite/manifest.json`, `build.manifest: true`), le
 * poids **décodé** de ce que le navigateur charge avant de pouvoir afficher l'écran de
 * connexion : l'entrée HTML et ses imports **statiques**, suivis récursivement (Vite les
 * déclare en `modulepreload`). Les chunks dynamiques (`import()`) n'y entrent pas : ils ne
 * partent qu'à la demande.
 *
 * Cliquet : le plafond ne peut que baisser. Une PR qui alourdit l'écran de connexion échoue ;
 * une PR qui l'allège abaisse `BUNDLE_BUDGETS` dans le même lot. L'objectif fixé par l'audit
 * est `TARGET_JS_KB` (400 Ko de JS décodé). Le shell connecté est chargé à la demande depuis
 * le 20/11/2026 (`src/components/app/authenticatedShellParts.js`), le temps réel, Markdown et
 * l'éditeur riche depuis le 21/11/2026 (lot K, garde-fou `tests/login-entry-lazy.test.js`) ; ce
 * qui reste au-dessus de l'objectif est listé dans `docs/AUDIT_UI_UX_2026-11-19.md`, U1.
 *
 * La mesure n'a de sens que sur un build **de production** : avec `NODE_ENV=test` ou
 * `development`, Vite embarque la version de développement de React (deux fois plus lourde).
 * Le script le détecte et échoue avec une consigne plutôt que de comparer des choux et des
 * carottes.
 *
 * Usage : node scripts/check-bundle-budget.js [--report] [--dist <dossier>]
 *   --report : affiche le détail par fichier sans échouer (mesures avant/après d'une PR).
 * Exporte ses fonctions pour `tests/bundle-budget.test.js`.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const TAG = '[bundle-budget]';

/** Objectif de l'audit U1 pour le JS décodé de l'écran de connexion (Ko). */
const TARGET_JS_KB = 400;

/**
 * Plafonds par entrée HTML (Ko décodés, 1 Ko = 1 024 octets). Mesures de référence au
 * 20/11/2026 : 1 525,8 Ko de JS en 24 fichiers au lot 2 du chantier UI/UX, puis 770,1 Ko en
 * 17 fichiers et 369,8 Ko de CSS une fois le shell connecté chargé à la demande ; 774,4 Ko
 * avant le lot K, **503,8 Ko en 11 fichiers** après (21/11/2026).
 * Marge de 5 Ko environ : ce n'est pas une enveloppe à remplir.
 */
const BUNDLE_BUDGETS = Object.freeze({
  'index.vite.html': Object.freeze({
    label: 'ForetMap (écran de connexion)',
    // 1 530 → 1 535 le 21/11/2026 (chantier CPT, provisoire), puis 775 / 372 : le shell connecté
    // est chargé à la demande (UI/UX, U1), le code ajouté par CPT quitte l'écran de connexion.
    // 775 → 509 le 21/11/2026 (lot K) : client Socket.IO, Markdown (`marked`, `dompurify`),
    // éditeur riche (`turndown`), écran Séances et popover du glossaire chargés à la demande.
    // 509 → 507 le 22/11/2026 (niveau de contenu des professeurs) : la modale « Connexion
    // professeur » (`PinModal`, ~4,6 Ko) part à la demande ; le résolveur du niveau de contenu
    // en reprend ~1,4 Ko. Mesure : 508,8 Ko sur `main`, 504,6 Ko après.
    jsKb: 507,
    cssKb: 372,
  }),
});

/** Marqueurs de la version de développement de React (absents du build de production). */
const DEV_BUILD_MARKERS = Object.freeze(['In HTML, %s cannot be a child', 'react-dom.development']);

/**
 * Fichiers chargés avant l'exécution de l'entrée : l'entrée et ses imports statiques,
 * récursivement, avec leurs feuilles de style.
 * @param {Record<string, { file: string, css?: string[], imports?: string[] }>} manifest
 * @param {string} entryKey
 * @returns {{ js: string[], css: string[] }} chemins relatifs à `dist/`, sans doublon
 */
function collectStaticClosure(manifest, entryKey) {
  const entries = manifest && typeof manifest === 'object' ? manifest : {};
  if (!entries[entryKey]) throw new Error(`Entrée absente du manifeste Vite : ${entryKey}`);
  const js = [];
  const css = new Set();
  const visited = new Set();
  const visit = (key) => {
    if (visited.has(key)) return;
    visited.add(key);
    const chunk = entries[key];
    if (!chunk) return;
    if (chunk.file && !js.includes(chunk.file)) js.push(chunk.file);
    for (const sheet of chunk.css || []) css.add(sheet);
    for (const imported of chunk.imports || []) visit(imported);
  };
  visit(entryKey);
  return { js, css: [...css] };
}

/**
 * Poids de chaque fichier de la fermeture statique.
 * @param {{ js: string[], css: string[] }} closure
 * @param {(relativePath: string) => number} sizeOf taille en octets d'un fichier de `dist/`
 */
function measureClosure(closure, sizeOf) {
  const files = [
    ...closure.js.map((file) => ({ file, kind: 'js', bytes: sizeOf(file) })),
    ...closure.css.map((file) => ({ file, kind: 'css', bytes: sizeOf(file) })),
  ];
  const sum = (kind) => files.filter((f) => f.kind === kind).reduce((a, f) => a + f.bytes, 0);
  return { files, jsBytes: sum('js'), cssBytes: sum('css'), jsCount: closure.js.length };
}

const toKb = (bytes) => Math.round((bytes / 1024) * 10) / 10;

/**
 * Compare une mesure au plafond de son entrée.
 * @returns {string[]} dépassements (vide si le budget est tenu)
 */
function checkBudget(measure, budget) {
  const failures = [];
  if (toKb(measure.jsBytes) > budget.jsKb) {
    failures.push(`JS ${toKb(measure.jsBytes)} Ko > plafond ${budget.jsKb} Ko`);
  }
  if (toKb(measure.cssBytes) > budget.cssKb) {
    failures.push(`CSS ${toKb(measure.cssBytes)} Ko > plafond ${budget.cssKb} Ko`);
  }
  return failures;
}

/** Vrai si l'un des fichiers JS porte la version de développement de React. */
function looksLikeDevBuild(closure, readFile) {
  return closure.js.some((file) => {
    const source = readFile(file);
    return DEV_BUILD_MARKERS.some((marker) => source.includes(marker));
  });
}

function parseArgs(argv) {
  const args = { report: false, dist: path.resolve(__dirname, '..', 'dist') };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--report') args.report = true;
    else if (argv[i] === '--dist') args.dist = path.resolve(argv[(i += 1)]);
  }
  return args;
}

function main(argv = process.argv.slice(2)) {
  const { report, dist } = parseArgs(argv);
  const manifestPath = path.join(dist, '.vite', 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error(
      `${TAG} manifeste introuvable (${manifestPath}) : lancer « npm run build » d'abord.`,
    );
    return 1;
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const sizeOf = (file) => fs.statSync(path.join(dist, file)).size;
  const readFile = (file) => fs.readFileSync(path.join(dist, file), 'utf8');
  let failed = false;
  for (const [entryKey, budget] of Object.entries(BUNDLE_BUDGETS)) {
    const closure = collectStaticClosure(manifest, entryKey);
    if (looksLikeDevBuild(closure, readFile)) {
      console.error(
        `${TAG} ${entryKey} : build de développement détecté (React non minifié). ` +
          'Relancer « NODE_ENV=production npm run build » avant de mesurer.',
      );
      failed = true;
      continue;
    }
    const measure = measureClosure(closure, sizeOf);
    console.log(
      `${TAG} ${budget.label} : JS ${toKb(measure.jsBytes)} Ko (${measure.jsCount} fichiers, ` +
        `plafond ${budget.jsKb}, objectif ${TARGET_JS_KB}) · CSS ${toKb(measure.cssBytes)} Ko ` +
        `(plafond ${budget.cssKb})`,
    );
    if (report) {
      for (const f of [...measure.files].sort((a, b) => b.bytes - a.bytes)) {
        console.log(`  ${String(toKb(f.bytes)).padStart(8)} Ko  ${f.file}`);
      }
      continue;
    }
    const failures = checkBudget(measure, budget);
    if (failures.length > 0) {
      failed = true;
      console.error(`${TAG} ${entryKey} : budget dépassé — ${failures.join(' ; ')}.`);
      console.error(
        `${TAG} Un module ajouté à l'écran de connexion ? Le charger à la demande (import()), ` +
          'ou justifier la hausse dans la PR. Détail : node scripts/check-bundle-budget.js --report',
      );
    }
  }
  return failed ? 1 : 0;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  BUNDLE_BUDGETS,
  TARGET_JS_KB,
  DEV_BUILD_MARKERS,
  collectStaticClosure,
  measureClosure,
  checkBudget,
  looksLikeDevBuild,
  toKb,
  main,
};
