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
 * L'export attendu : `mariadb-dump` (ou `mysqldump`) des seules tables de `TABLES`, avec leur
 * structure (pas de `--no-create-info`). Plusieurs `INSERT` par table sont fusionnés ; les
 * colonnes sont nommées dans la sortie ; `plants.hazard_reviewed_by` est vidé (voir
 * `NEUTRALIZED_COLUMNS`).
 *
 * Le parseur reproduit exactement celui des scripts consommateurs
 * (`import-biodiv-pedago.js`, `import-plants-enriched.js`) : découpe sur le `;` de fin
 * d'instruction en respectant les chaînes SQL et leurs échappements.
 */

const fs = require('fs');
const path = require('path');
const {
  findInsertStatements,
  parseCreateTableColumns,
  splitValueTuples,
  buildInsert,
} = require('./lib/sqlDumpInserts');

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

/**
 * Adresses e-mail **dans le contenu** (ex. crédit photo Wikimedia « mail me (x@y.z) if you want
 * to use… ») : ce sont des données personnelles de tiers, retirées plutôt que bloquantes — la
 * liste `TABLES` ne contient aucune table de comptes, donc une adresse ne peut venir que d'un
 * texte. Le garde-fou `PII_PATTERNS` reste appliqué après ce retrait.
 */
const CONTENT_EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const EMAIL_PLACEHOLDER = '[adresse retirée]';

/** @returns {{ text: string, count: number }} */
function redactContentEmails(text) {
  let count = 0;
  const redacted = text.replace(CONTENT_EMAIL_RE, () => {
    count += 1;
    return EMAIL_PLACEHOLDER;
  });
  return { text: redacted, count };
}

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

/**
 * Colonnes vidées (`NULL`) à l'extraction : elles désignent une personne. `plants.hazard_reviewed_by`
 * porte l'identifiant du compte enseignant qui a validé la section « danger » (migration 271) ;
 * c'est en plus une clé étrangère vers `users`, qu'aucune base neuve ne contient.
 */
const NEUTRALIZED_COLUMNS = Object.freeze({ plants: ['hazard_reviewed_by'] });

/**
 * Instruction d'insertion de la table, reconstruite depuis l'export :
 *   - tous les `INSERT` de la table (un gros export en contient plusieurs) fusionnés en un ;
 *   - colonnes nommées (d'après le `CREATE TABLE` de l'export) : l'import ne dépend plus de
 *     l'ordre des colonnes de la base cible ;
 *   - colonnes de `NEUTRALIZED_COLUMNS` remises à `NULL`.
 * @returns {{ statement: string, rows: number } | null}
 */
function extractTable(sql, table) {
  const statements = findInsertStatements(sql, table);
  if (!statements.length) return null;
  const columns = statements[0].columns || parseCreateTableColumns(sql, table);
  const rows = [];
  for (const stmt of statements) {
    if ((stmt.columns || null) !== null && columns && stmt.columns.join() !== columns.join()) {
      throw new Error(`${table} : listes de colonnes différentes d'un INSERT à l'autre.`);
    }
    rows.push(...splitValueTuples(stmt.valuesText));
  }
  const neutralized = NEUTRALIZED_COLUMNS[table] || [];
  if (neutralized.length) {
    if (!columns) {
      throw new Error(
        `${table} : structure absente de l'export (CREATE TABLE) — impossible de vider ` +
          `${neutralized.join(', ')}. Refaire l'export sans --no-create-info.`,
      );
    }
    for (const name of neutralized) {
      const index = columns.indexOf(name);
      if (index < 0) continue; // export antérieur à la colonne : rien à vider
      for (const row of rows) row[index] = 'NULL';
    }
  }
  if (columns) {
    const bad = rows.find((row) => row.length !== columns.length);
    if (bad) {
      throw new Error(
        `${table} : ${bad.length} valeurs pour ${columns.length} colonnes — export illisible.`,
      );
    }
  }
  return { statement: buildInsert(table, columns, rows), rows: rows.length };
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
  const counts = [];
  for (const table of TABLES) {
    let extracted;
    try {
      extracted = extractTable(sql, table);
    } catch (err) {
      console.error(`[extract-biodiv-pedago-seed] ÉCHEC — ${err.message}`);
      console.error('Aucun fichier écrit.');
      process.exit(1);
    }
    if (!extracted) {
      missing.push(table);
      continue;
    }
    counts.push(`${table} ${extracted.rows}`);
    parts.push(`-- ${table}`, extracted.statement, '');
  }

  const { text: content, count: redactedEmails } = redactContentEmails(parts.join('\n'));
  if (redactedEmails) {
    console.log(
      `[extract-biodiv-pedago-seed] ${redactedEmails} adresse(s) e-mail retirée(s) du contenu.`,
    );
  }

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
  console.log(`[extract-biodiv-pedago-seed] lignes : ${counts.join(', ')}.`);
  if (missing.length) {
    console.warn(`[extract-biodiv-pedago-seed] Tables absentes du dump : ${missing.join(', ')}`);
  }
}

if (require.main === module) main();

module.exports = { TABLES, NEUTRALIZED_COLUMNS, PII_PATTERNS, extractTable, redactContentEmails };
