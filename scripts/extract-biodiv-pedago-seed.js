#!/usr/bin/env node
'use strict';

/**
 * Régénère `sql/biodiv_pedago_seed.sql` depuis un export SQL complet **non versionné**.
 *
 * Le dépôt ne doit jamais contenir de dump de production : celui-ci porte des données
 * personnelles (`users`, `gl_players`, `password_reset_tokens`, `audit_log`, `forum_*`…).
 * On n'en extrait donc que les tables de **contenu** biodiversité / pédagogie, celles que
 * `npm run db:import:biodiv` consomme réellement — aucune ne comporte de colonne
 * nominative.
 *
 * Usage :
 *   node scripts/extract-biodiv-pedago-seed.js <chemin-du-dump.sql> [--out=sql/biodiv_pedago_seed.sql]
 *
 * Le parseur reproduit exactement celui des scripts consommateurs
 * (`import-biodiv-pedago.js`, `import-plants-enriched.js`) : découpe sur le `;` de fin
 * d'instruction en respectant les chaînes SQL et leurs échappements.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUT = path.join(ROOT, 'sql', 'biodiv_pedago_seed.sql');

/** Tables de contenu extraites — doit rester aligné sur les scripts consommateurs. */
const TABLES = [
  'plants',
  'plant_name_aliases',
  'zone_species',
  'marker_species',
  'task_species',
  'species_interactions',
  'glossary_terms',
  'glossary_term_relations',
  'glossary_term_species',
  'glossary_term_tutorials',
  'glossary_term_interactions',
];

/** Motifs interdits dans la sortie : un échec ici vaut mieux qu'une fuite silencieuse. */
const PII_PATTERNS = [
  { label: 'hachage bcrypt', re: /\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}/ },
  { label: 'adresse email', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
];

const HEADER = [
  '-- Jeu de données biodiversité / pédagogie ForetMap.',
  '--',
  "-- Extrait SANS DONNÉES PERSONNELLES d'un export de la base de production : uniquement les",
  '-- tables de contenu (fiches espèces, glossaire, liaisons). Aucune table `users`,',
  '-- `gl_players`, `password_reset_tokens`, `audit_log`, `forum_*`.',
  '--',
  '-- Consommé par `npm run db:import:biodiv` (scripts/import-biodiv-pedago.js et',
  '-- scripts/import-plants-enriched.js), qui parsent les `INSERT INTO` table par table.',
  '--',
  '-- Ne pas éditer à la main : régénérer depuis un export local non versionné via',
  '--   node scripts/extract-biodiv-pedago-seed.js <dump.sql>',
  '',
];

function extractInsert(sql, table) {
  const marker = 'INSERT INTO `' + table + '` VALUES';
  const start = sql.indexOf(marker);
  if (start < 0) return null;
  let i = start;
  let inString = false;
  let escape = false;
  while (i < sql.length) {
    const c = sql[i];
    if (escape) {
      escape = false;
      i++;
      continue;
    }
    if (inString && c === '\\') {
      escape = true;
      i++;
      continue;
    }
    if (c === "'") {
      inString = !inString;
      i++;
      continue;
    }
    if (!inString && c === ';') return sql.slice(start, i + 1);
    i++;
  }
  return null;
}

function parseArgs(argv) {
  let source = null;
  let out = DEFAULT_OUT;
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--out=')) out = path.resolve(ROOT, arg.slice(6));
    else if (!arg.startsWith('--')) source = path.resolve(arg);
  }
  return { source, out };
}

function main() {
  const { source, out } = parseArgs(process.argv);
  if (!source) {
    console.error('Usage : node scripts/extract-biodiv-pedago-seed.js <dump.sql> [--out=…]');
    process.exit(2);
  }
  if (!fs.existsSync(source)) {
    console.error(`Dump introuvable : ${source}`);
    process.exit(2);
  }

  const sql = fs.readFileSync(source, 'utf8');
  const parts = [...HEADER];
  const missing = [];
  for (const table of TABLES) {
    const insert = extractInsert(sql, table);
    if (!insert) {
      missing.push(table);
      continue;
    }
    parts.push(`-- ${table}`, insert, '');
  }

  const content = parts.join('\n');

  // Garde-fou : on refuse d'écrire un fichier qui porterait encore des données personnelles.
  for (const { label, re } of PII_PATTERNS) {
    const hit = content.match(re);
    if (hit) {
      console.error(
        `[extract-biodiv-pedago-seed] ÉCHEC — ${label} détecté dans la sortie : ${hit[0]}`,
      );
      console.error("Aucun fichier écrit. Vérifier la liste TABLES et le contenu de l'export.");
      process.exit(1);
    }
  }

  fs.writeFileSync(out, content);
  const sizeKo = (fs.statSync(out).size / 1024).toFixed(0);
  console.log(`[extract-biodiv-pedago-seed] ${out} écrit (${sizeKo} Ko).`);
  if (missing.length) {
    console.warn(`[extract-biodiv-pedago-seed] Tables absentes du dump : ${missing.join(', ')}`);
  }
}

main();
