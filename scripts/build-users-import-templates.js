#!/usr/bin/env node
'use strict';

/**
 * Régénère les modèles d'import de comptes versionnés dans `docs/templates/` à partir
 * de la **source unique** `lib/studentRouteHelpers.js` — celle qui alimente aussi
 * `GET /api/students/import/template`. Les fichiers du dépôt et le modèle téléchargé
 * depuis l'application ne peuvent donc pas diverger (le test
 * `tests/content/users-import-templates.test.js` le vérifie en CI).
 *
 * Usage : `npm run templates:users` (ou `--check` pour vérifier sans écrire).
 */

const fs = require('fs');
const path = require('path');
const {
  TEMPLATE_COLUMNS,
  csvEscape,
  buildTemplateWorkbookRows,
} = require('../lib/studentRouteHelpers');

/** Sous-ensemble « minimal » : les seules colonnes sans lesquelles un import échoue. */
const MINIMAL_COLUMNS = [
  TEMPLATE_COLUMNS[0],
  TEMPLATE_COLUMNS[1],
  TEMPLATE_COLUMNS[2],
  TEMPLATE_COLUMNS[3],
  TEMPLATE_COLUMNS[5],
];

const BOM = '﻿';

function toCsv(columns, rows) {
  const lines = [columns.map(csvEscape).join(';')];
  for (const row of rows) lines.push(columns.map((c) => csvEscape(row[c])).join(';'));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

function buildFiles() {
  const rows = buildTemplateWorkbookRows();
  const minimalRows = rows
    .filter((r) =>
      ['visiteur', 'eleve_novice', 'prof_classe'].includes(String(r[TEMPLATE_COLUMNS[0]])),
    )
    .map((r) => Object.fromEntries(MINIMAL_COLUMNS.map((c) => [c, r[c]])));
  return {
    'users-import-template.csv': toCsv(TEMPLATE_COLUMNS, rows),
    'users-import-template-minimal.csv': toCsv(MINIMAL_COLUMNS, minimalRows),
    'users-import-template-vierge.csv': toCsv(TEMPLATE_COLUMNS, []),
  };
}

function main() {
  const check = process.argv.includes('--check');
  const dir = path.join(__dirname, '..', 'docs', 'templates');
  fs.mkdirSync(dir, { recursive: true });
  let drift = 0;
  for (const [name, content] of Object.entries(buildFiles())) {
    const file = path.join(dir, name);
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (current === content) continue;
    drift += 1;
    if (check) {
      console.error(`[templates:users] ${name} est désynchronisé (npm run templates:users)`);
      continue;
    }
    fs.writeFileSync(file, content, 'utf8');
    console.log(`[templates:users] écrit ${path.relative(process.cwd(), file)}`);
  }
  if (check && drift > 0) process.exitCode = 1;
  if (!check && drift === 0) console.log('[templates:users] déjà à jour');
}

main();

module.exports = { buildFiles, MINIMAL_COLUMNS };
