#!/usr/bin/env node
'use strict';

/**
 * Générateur de la migration « college_cles_courtes » (flux D4, chantier collège, novembre 2026)
 * à partir de `data/college-2026-11/d4/cles-courtes.json`.
 *
 *   node scripts/college-2026-11/build-d4-migration.js           # écrit la migration
 *   node scripts/college-2026-11/build-d4-migration.js --check   # vérifie qu'elle est à jour
 *
 * Le numéro n'apparaît que dans le nom du fichier : le script réécrit le fichier existant qui
 * porte le suffixe `_college_cles_courtes.sql`, quel que soit son numéro (renumérotation par SI).
 *
 * Règles de la migration générée :
 * - insertion seule (aucun UPDATE ni DELETE) : une clé déjà présente, même modifiée dans
 *   l'application, n'est jamais retouchée ;
 * - une clé courte n'est créée que si TOUT ce qu'elle désigne existe (clé complète de renvoi,
 *   carte, chaque fiche par nom + nom scientifique, chaque clade) : sinon elle est sautée en
 *   entier, sans erreur (base fraîche, base en retard), jamais créée à moitié ;
 * - couplets et propositions sont gardés par clé naturelle (slug + titre de la clé, numéro du
 *   couplet, rang de la proposition) : rejouer la migration n'ajoute rien ;
 * - `created_by` reste NULL (aucun compte, aucune adresse) ; clés publiées, niveau `college`.
 */

const fs = require('node:fs');
const path = require('node:path');
const { checkD4, loadData, speciesOf, refsOf, plantKey } = require('./check-d4-donnees');

const ROOT = path.join(__dirname, '..', '..');
const MIGRATIONS_DIR = path.join(ROOT, 'migrations');
const SUFFIX = '_college_cles_courtes.sql';
const SUFFIX_RE = /^\d+_college_cles_courtes\.sql$/;
const DEFAULT_FILE = `379${SUFFIX}`;

/** Littéral SQL (chaîne entre apostrophes, apostrophes doublées) ou NULL. */
function q(value) {
  if (value == null) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

/** Sous-requête : identifiant de la fiche désignée par son nom et son nom scientifique. */
function plantIdSql(p, alias = 'pp') {
  return `(SELECT MIN(${alias}.id) FROM plants ${alias} WHERE ${alias}.name = ${q(p.name)} AND ${alias}.scientific_name <=> ${q(p.scientific_name)})`;
}

function issueOf(lead) {
  for (const k of ['couplet', 'espece', 'groupe', 'clade']) if (lead[k] != null) return k;
  return null;
}

/** Garde commune aux lignes enfants : la clé courte, par slug ET titre (clé naturelle). */
function keyGuard(cle) {
  return `k.slug = ${q(cle.slug)} AND k.title = ${q(cle.title)}`;
}

function buildKeySql(cle) {
  const out = [];
  const species = [];
  const seen = new Set();
  for (const p of speciesOf(cle)) {
    if (seen.has(plantKey(p))) continue;
    seen.add(plantKey(p));
    species.push(p);
  }
  const { clades, nextKeys } = refsOf(cle);
  const nbLeads = cle.couplets.reduce((n, c) => n + c.leads.length, 0);

  out.push(
    `-- ---------------------------------------------------------------------------`,
    `-- Clé « ${cle.slug} » (renvoi : ${cle.full_key_slug}) — ${cle.couplets.length} couplets, ${nbLeads} propositions`,
    `-- ---------------------------------------------------------------------------`,
    '',
  );

  const prereq = [
    `NOT EXISTS (SELECT 1 FROM id_keys x WHERE x.slug = ${q(cle.slug)})`,
    ...nextKeys.map((s) => `EXISTS (SELECT 1 FROM id_keys x WHERE x.slug = ${q(s)})`),
  ];
  if (cle.map_id != null)
    prereq.push(`EXISTS (SELECT 1 FROM maps x WHERE x.id = ${q(cle.map_id)})`);
  for (const c of clades) prereq.push(`EXISTS (SELECT 1 FROM clades x WHERE x.id = ${q(c)})`);
  for (const p of species) {
    prereq.push(
      `EXISTS (SELECT 1 FROM plants x WHERE x.name = ${q(p.name)} AND x.scientific_name <=> ${q(p.scientific_name)})`,
    );
  }
  out.push(
    `INSERT INTO id_keys (slug, title, description, map_id, scope_label, niveau, is_published,`,
    `                     created_by, tool_required, safety_note, allows_multiple_paths)`,
    `SELECT ${q(cle.slug)}, ${q(cle.title)},`,
    `       ${q(cle.description)},`,
    `       ${q(cle.map_id)}, ${q(cle.scope_label)}, 'college', 1, NULL, ${q(cle.tool_required)},`,
    `       ${q(cle.safety_note)},`,
    `       ${cle.allows_multiple_paths ? 1 : 0}`,
    `  FROM DUAL`,
    ` WHERE ${prereq.join('\n   AND ')};`,
    '',
  );

  const numbers = cle.couplets.map((c) => `SELECT ${c.number} AS number`).join(' UNION ALL ');
  out.push(
    `INSERT INTO id_key_couplets (key_id, number)`,
    `SELECT k.id, n.number`,
    `  FROM id_keys k`,
    `  JOIN (${numbers}) n`,
    ` WHERE ${keyGuard(cle)}`,
    `   AND NOT EXISTS (SELECT 1 FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = n.number);`,
    '',
  );

  for (const c of cle.couplets) {
    c.leads.forEach((l, i) => {
      const issue = issueOf(l);
      const nextCouplet =
        issue === 'couplet'
          ? `(SELECT c2.id FROM id_key_couplets c2 WHERE c2.key_id = k.id AND c2.number = ${l.couplet})`
          : 'NULL';
      const plantId = issue === 'espece' ? plantIdSql(l.espece) : 'NULL';
      const cladeId =
        issue === 'clade' ? q(l.clade) : issue === 'groupe' ? q(l.groupe.clade ?? null) : 'NULL';
      const resultLabel = issue === 'groupe' ? q(l.groupe.label) : 'NULL';
      const nextKey =
        issue === 'couplet'
          ? 'NULL'
          : `(SELECT nk.id FROM id_keys nk WHERE nk.slug = ${q(l.next_key ?? cle.full_key_slug)})`;
      out.push(
        `-- couplet ${c.number}, proposition ${i + 1} → ${describe(l)}`,
        `INSERT INTO id_key_leads (couplet_id, sort_order, statement, hint, next_couplet_id, plant_id,`,
        `                          outcome, clade_id, result_label, next_key_id)`,
        `SELECT c.id, ${i}, ${q(l.statement)},`,
        `       ${q(l.hint)},`,
        `       ${nextCouplet},`,
        `       ${plantId},`,
        `       '${issue}', ${cladeId}, ${resultLabel},`,
        `       ${nextKey}`,
        `  FROM id_keys k`,
        `  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = ${c.number}`,
        ` WHERE ${keyGuard(cle)}`,
        `   AND NOT EXISTS (SELECT 1 FROM id_key_leads l2 WHERE l2.couplet_id = c.id AND l2.sort_order = ${i});`,
        '',
      );
      if (issue === 'groupe') {
        const rows = l.groupe.plants
          .map(
            (p, j) =>
              `SELECT ${q(p.name)} AS name, ${q(p.scientific_name)} AS scientific_name, ${j} AS ord`,
          )
          .join('\n        UNION ALL ');
        out.push(
          `INSERT INTO id_key_lead_plants (lead_id, plant_id, sort_order)`,
          `SELECT l.id, p.id, v.ord`,
          `  FROM id_keys k`,
          `  JOIN id_key_couplets c ON c.key_id = k.id AND c.number = ${c.number}`,
          `  JOIN id_key_leads l ON l.couplet_id = c.id AND l.sort_order = ${i} AND l.outcome = 'groupe'`,
          `  JOIN (${rows}) v`,
          `  JOIN plants p ON p.id = (SELECT MIN(p2.id) FROM plants p2`,
          `                           WHERE p2.name = v.name AND p2.scientific_name <=> v.scientific_name)`,
          ` WHERE ${keyGuard(cle)}`,
          `   AND NOT EXISTS (SELECT 1 FROM id_key_lead_plants x WHERE x.lead_id = l.id AND x.plant_id = p.id);`,
          '',
        );
      }
    });
  }
  return out.join('\n');
}

function describe(l) {
  const issue = issueOf(l);
  if (issue === 'couplet') return `couplet ${l.couplet}`;
  if (issue === 'espece') return `espèce ${l.espece.name}`;
  if (issue === 'groupe') return `groupe ${l.groupe.label} (${l.groupe.plants.length} espèces)`;
  return `clade ${l.clade}`;
}

function buildSql(data = loadData()) {
  const cles = data.cles;
  const header = [
    `-- Chantier collège (novembre 2026), flux D4 : clés de détermination courtes.`,
    `-- FICHIER GÉNÉRÉ par scripts/college-2026-11/build-d4-migration.js à partir de`,
    `-- data/college-2026-11/d4/cles-courtes.json : ne pas modifier à la main.`,
    `--`,
    `-- Crée, au niveau « college » et publiées :`,
    ...cles.map(
      (c) =>
        `--   - ${c.slug} (${c.couplets.length} couplets ; « Pour aller plus loin » : ${c.full_key_slug})`,
    ),
    `-- Les clés complètes restent intactes (aucun UPDATE, aucun DELETE).`,
    `--`,
    `-- Idempotence : chaque clé n'est créée que si sa clé de renvoi, sa carte, ses clades et`,
    `-- chacune de ses fiches (nom + nom scientifique) existent ; sinon elle est sautée en entier.`,
    `-- Couplets, propositions et espèces des groupes sont gardés par clé naturelle (slug et titre`,
    `-- de la clé, numéro du couplet, rang de la proposition) : un rejeu n'ajoute rien.`,
    `-- Contrainte chk_idkey_lead_outcome respectée : nom de groupe (result_label) sur les seules`,
    `-- issues « groupe », jamais sur un clade. created_by reste NULL.`,
    '',
    `SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;`,
    '',
  ];
  return `${[...header, ...cles.map(buildKeySql)].join('\n').trimEnd()}\n`;
}

function migrationPath() {
  const existing = fs.readdirSync(MIGRATIONS_DIR).filter((f) => SUFFIX_RE.test(f));
  if (existing.length > 1)
    throw new Error(`plusieurs migrations ${SUFFIX} : ${existing.join(', ')}`);
  return path.join(MIGRATIONS_DIR, existing[0] || DEFAULT_FILE);
}

module.exports = { buildSql, migrationPath, SUFFIX_RE };

if (require.main === module) {
  const errors = checkD4();
  if (errors.length) {
    console.error('Données D4 non conformes : node scripts/college-2026-11/check-d4-donnees.js');
    process.exit(1);
  }
  const file = migrationPath();
  const sql = buildSql();
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (current !== sql) {
      console.error(`${path.basename(file)} n'est pas à jour : relancer le générateur.`);
      process.exit(1);
    }
    console.log(`${path.basename(file)} à jour.`);
  } else {
    fs.writeFileSync(file, sql);
    console.log(`Écrit : migrations/${path.basename(file)}`);
  }
}
