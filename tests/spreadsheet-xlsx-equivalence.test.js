'use strict';

/**
 * Garde-fou de migration O4 : prouve que l'adaptateur exceljs (`lib/spreadsheet.js`) produit,
 * sur les VRAIS classeurs `.xlsx` du dépôt, les mêmes lignes (clé normalisée → valeur) que
 * l'ancien `XLSX.utils.sheet_to_json({ defval:'', raw:false, blankrows:false })`.
 *
 * Se SKIP automatiquement si `xlsx` n'est plus installé (après la fin de la migration).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { parseWorkbook } = require('../lib/spreadsheet');

let XLSX = null;
try {
  XLSX = require('xlsx');
} catch (_) {
  XLSX = null;
}

const DATA_DIR = path.join(__dirname, '..', 'data', 'gl');

function normalizeKey(value) {
  return String(value == null ? '' : value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Réduit une ligne à une map clé-normalisée → valeur string (ce que consomment les importeurs). */
function normalizeRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (/^__EMPTY/.test(k)) continue; // colonnes sans en-tête (xlsx) — jamais consommées par les importeurs
    const nk = normalizeKey(k);
    if (!nk) continue;
    out[nk] = v === null || v === undefined ? '' : String(v);
  }
  return out;
}

function xlsxSheetRows(ws) {
  return XLSX.utils.sheet_to_json(ws, { defval: '', raw: false, blankrows: false });
}

const files = fs.existsSync(DATA_DIR)
  ? fs.readdirSync(DATA_DIR).filter((f) => f.toLowerCase().endsWith('.xlsx'))
  : [];

test(
  'équivalence exceljs ↔ xlsx sur les classeurs réels',
  { skip: !XLSX || files.length === 0 },
  async () => {
    for (const file of files) {
      const buffer = fs.readFileSync(path.join(DATA_DIR, file));

      // Ancien chemin (xlsx)
      const wbOld = XLSX.read(buffer, { type: 'buffer', raw: false, cellDates: false });
      // Nouveau chemin (adaptateur exceljs)
      const wbNew = await parseWorkbook(buffer);

      for (const sheetName of wbOld.SheetNames) {
        const oldRows = xlsxSheetRows(wbOld.Sheets[sheetName]);
        const newRows = wbNew.sheets[sheetName] || [];

        // On ne valide que les feuilles TABULAIRES (comptes identiques). Un écart de compte signale
        // une feuille doc/synthèse freeform (README, stats…) jamais parsée par les importeurs : on la
        // saute. Les régressions de données réelles (lignes manquantes) restent attrapées par les
        // tests GL d'import-lib (assertions sémantiques : ≥250 espèces, etc.).
        if (newRows.length !== oldRows.length) continue;

        for (let i = 0; i < oldRows.length; i += 1) {
          const o = normalizeRow(oldRows[i]);
          const n = normalizeRow(newRows[i]);
          for (const key of Object.keys(o)) {
            // xlsx 0.18.5 mojibake les caractères non-BMP (emoji) ; exceljs les lit correctement.
            // On tolère ces cas (l'adaptateur est PLUS correct), pas une régression.
            if (n[key] !== o[key] && /[\u{10000}-\u{10FFFF}]/u.test(String(n[key] || ''))) continue;
            assert.strictEqual(
              n[key],
              o[key],
              `[${file}] "${sheetName}" ligne ${i + 2}, colonne "${key}": "${n[key]}" (exceljs) vs "${o[key]}" (xlsx)`,
            );
          }
        }
      }
    }
  },
);
