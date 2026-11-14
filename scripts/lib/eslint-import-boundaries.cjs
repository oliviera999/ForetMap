'use strict';

/**
 * Règle ESLint locale : frontières d'import entre surfaces du front (exploitation, lot 7).
 *
 * Décision du 07/11/2026 : on ne duplique pas les composants partagés, on isole ce qui varie
 * selon la surface. Trois frontières, vérifiées sur le chemin **résolu** de chaque import
 * relatif (`import … from`, `export … from`, `import()`), sans dépendance externe :
 *
 * - `gl-vers-foretmap` : un fichier de `src/gl/` n'importe que `src/gl/` ou `src/shared/` ;
 * - `foretmap-vers-gl` : hors de `src/gl/`, rien n'importe `src/gl/` ;
 * - `public-vers-personnel` : les surfaces publiques (plan public `src/plan/`, e-nov
 *   `src/enov/`, visite `src/components/visit*`, `src/components/Visit*`) n'importent pas les
 *   écrans réservés au personnel (tâches, administration, profils, groupes, journal d'audit,
 *   médiathèque).
 *
 * Deux règles partagent le code : `foretmap/import-boundaries` (erreur) signale toute violation
 * **absente** de la liste des violations existantes (`scripts/data/import-boundaries-baseline.json`),
 * `foretmap/import-boundaries-baseline` (avertissement) signale celles de la liste. Une violation
 * résorbée doit sortir de la liste (test `tests/eslint-import-boundaries.test.js`).
 *
 * Inspiration : la règle `import/no-restricted-paths` d'eslint-plugin-import
 * (https://github.com/import-js/eslint-plugin-import, licence MIT) — même principe de zones
 * cible / origine, réécrit ici en quelques lignes (aucun code copié).
 */

const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

const PUBLIC_RE = /^src\/(?:plan|enov)\/|^src\/components\/(?:visit\/|visit-views|Visit)/;
const STAFF_RE =
  /^src\/components\/(?:tasks\/|tasks-views|Tasks|settings\/|settings-admin-views|profiles\/|profiles-views|audit-views|groups-views|media-library-views|pedago\/admin\/)/;

const ZONES = Object.freeze([
  {
    name: 'gl-vers-foretmap',
    from: (f) => f.startsWith('src/gl/'),
    forbidden: (t) =>
      t.startsWith('src/') && !t.startsWith('src/gl/') && !t.startsWith('src/shared/'),
    message:
      'Gnomes & Licornes n’importe que src/gl/ ou src/shared/ (module partagé déclaré) — promouvoir le module dans src/shared/.',
  },
  {
    name: 'foretmap-vers-gl',
    from: (f) => f.startsWith('src/') && !f.startsWith('src/gl/'),
    forbidden: (t) => t.startsWith('src/gl/'),
    message: 'ForêtMap n’importe jamais src/gl/ — passer par src/shared/.',
  },
  {
    name: 'public-vers-personnel',
    from: (f) => PUBLIC_RE.test(f),
    forbidden: (t) => STAFF_RE.test(t),
    message:
      'Une surface publique (plan public, e-nov, visite) n’importe pas un écran réservé au personnel (tâches, administration).',
  },
]);

const toPosix = (p) => p.split(path.sep).join('/');

/** Chemin relatif au dépôt, sans extension (les imports l'omettent parfois). */
function normalizeTarget(abs) {
  return toPosix(path.relative(ROOT, abs)).replace(/\.(?:jsx?|mjs|cjs)$/, '');
}

/**
 * Violations d'un import : `[{ zone, message, key }]`. `key` = « fichier -> cible » (sans
 * extension), forme des entrées de la liste des violations existantes.
 * @param {string} fileAbs chemin absolu du fichier qui importe
 * @param {string} specifier spécificateur d'import
 */
function boundaryViolations(fileAbs, specifier) {
  if (typeof specifier !== 'string' || !specifier.startsWith('.')) return [];
  const file = toPosix(path.relative(ROOT, fileAbs));
  const target = normalizeTarget(path.resolve(path.dirname(fileAbs), specifier));
  return ZONES.filter((z) => z.from(file) && z.forbidden(target)).map((z) => ({
    zone: z.name,
    message: z.message,
    key: `${file.replace(/\.(?:jsx?|mjs|cjs)$/, '')} -> ${target}`,
  }));
}

function loadBaseline() {
  try {
    const data = require('../data/import-boundaries-baseline.json');
    return new Set(Array.isArray(data.violations) ? data.violations : []);
  } catch {
    return new Set();
  }
}

function makeRule(mode) {
  return {
    meta: {
      type: 'problem',
      docs: {
        description:
          mode === 'baseline'
            ? 'Violations de frontière d’import déjà recensées (à résorber)'
            : 'Frontières d’import entre surfaces du front (G&L, surfaces publiques, personnel)',
      },
      schema: [],
    },
    create(context) {
      const baseline = loadBaseline();
      const filename = context.filename || context.getFilename();
      const check = (node, source) => {
        if (!source || typeof source.value !== 'string') return;
        for (const v of boundaryViolations(filename, source.value)) {
          const known = baseline.has(v.key);
          if ((mode === 'baseline') !== known) continue;
          context.report({
            node: source,
            message: `[${v.zone}] ${v.message}${known ? ' (violation recensée, à résorber)' : ''}`,
          });
        }
      };
      return {
        ImportDeclaration: (node) => check(node, node.source),
        ExportNamedDeclaration: (node) => check(node, node.source),
        ExportAllDeclaration: (node) => check(node, node.source),
        ImportExpression: (node) => check(node, node.source),
      };
    },
  };
}

module.exports = {
  ZONES,
  boundaryViolations,
  plugin: {
    meta: { name: 'foretmap-import-boundaries' },
    rules: {
      'import-boundaries': makeRule('new'),
      'import-boundaries-baseline': makeRule('baseline'),
    },
  },
};
