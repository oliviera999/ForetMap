#!/usr/bin/env node
'use strict';

/**
 * Violations actuelles des frontières d'import du front (`scripts/lib/eslint-import-boundaries.cjs`).
 *
 *   node scripts/import-boundaries-baseline.js          # liste, par frontière
 *   node scripts/import-boundaries-baseline.js --write  # réécrit scripts/data/import-boundaries-baseline.json
 *
 * La liste écrite sert de référence à la règle ESLint : ses entrées sont signalées en
 * avertissement, toute nouvelle violation en erreur. Réécrire la liste ne doit servir qu'à en
 * **retirer** des entrées résorbées ; en ajouter une revient à accepter une nouvelle dette.
 */

const fs = require('node:fs');
const path = require('node:path');
const { boundaryViolations } = require('./lib/eslint-import-boundaries.cjs');

const ROOT = path.resolve(__dirname, '..');
const BASELINE = path.join(__dirname, 'data', 'import-boundaries-baseline.json');
const IMPORT_RE =
  /(?:^|[\s;])(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(?:jsx?|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Violations actuelles : `{ zone: [clé…] }` et la liste plate triée des clés. */
function currentViolations() {
  const byZone = {};
  const keys = new Set();
  for (const file of walk(path.join(ROOT, 'src'))) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(IMPORT_RE)) {
      for (const v of boundaryViolations(file, m[1] || m[2])) {
        (byZone[v.zone] ||= new Set()).add(v.key);
        keys.add(v.key);
      }
    }
  }
  return {
    byZone: Object.fromEntries(Object.entries(byZone).map(([z, s]) => [z, [...s].sort()])),
    keys: [...keys].sort(),
  };
}

if (require.main === module) {
  const { byZone, keys } = currentViolations();
  for (const [zone, list] of Object.entries(byZone)) {
    process.stdout.write(`== ${zone} : ${list.length}\n${list.join('\n')}\n`);
  }
  if (!keys.length) process.stdout.write('Aucune violation.\n');
  if (process.argv.includes('--write')) {
    fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
    fs.writeFileSync(
      BASELINE,
      `${JSON.stringify(
        {
          description:
            'Violations de frontière d’import recensées (règle foretmap/import-boundaries-baseline, en avertissement). Ne retirer que des entrées résorbées : node scripts/import-boundaries-baseline.js --write',
          violations: keys,
        },
        null,
        2,
      )}\n`,
    );
    process.stdout.write(
      `${keys.length} violation(s) écrite(s) dans ${path.relative(ROOT, BASELINE)}\n`,
    );
  }
}

module.exports = { currentViolations };
