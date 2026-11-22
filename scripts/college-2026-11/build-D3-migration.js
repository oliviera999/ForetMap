#!/usr/bin/env node
'use strict';

/**
 * Flux D3 du chantier collège (novembre 2026) — génère la migration `college_quiz_paliers`
 * et le fichier de revue à partir des fichiers de données `data/college-2026-11/D3/`.
 *
 *   node scripts/college-2026-11/build-D3-migration.js          # écrit migration + revue + operations.json
 *   node scripts/college-2026-11/build-D3-migration.js --check  # échoue si un fichier généré est périmé
 *
 * Entrées (données relues à la main, une décision par question) :
 *   - `paliers-lotNN.json` : `{ code, categorie, palier: 3 | 4 | 'lycee', raison, ajouts?, notions_lycee? }` ;
 *   - `enonces.json`       : énoncés rendus autonomes (`avant` / `apres`) et liste des autres ;
 *   - `categories.json`    : `description_college` des catégories partagées avec le lycée.
 *
 * Résolution (faite ici, une fois, contre l'instantané de la prod du 21/11/2026) : pour une
 * question tranchée au palier 3, chaque notion de cycle 4 effective est retirée — exclusion si
 * elle vient de la catégorie, suppression de la ligne `ajout` sinon (ou passage de l'ajout en
 * exclusion si elle vient aussi de la catégorie) ; symétriquement au palier 4. Le résultat
 * résolu est écrit dans `operations.json` : la migration et les tests ne lisent que lui (le
 * dossier de l'instantané est supprimé par SI avant la PR vers `main`).
 *
 * Le numéro de la migration n'apparaît que dans le nom de fichier : le script réécrit le
 * fichier existant qui porte le suffixe `_college_quiz_paliers.sql`, quel que soit son numéro
 * (fiche de coordination, § 1, « Rendre la renumérotation gratuite »).
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT, 'data', 'college-2026-11', 'D3');
const SNAPSHOT_DIR = path.join(ROOT, 'docs', 'coordination', 'college-2026-11', 'snapshot');
const MIGRATIONS_DIR = path.join(ROOT, 'migrations');
const REVUE_PATH = path.join(ROOT, 'docs', 'coordination', 'college-2026-11', 'revue', 'D3.md');
const OPERATIONS_PATH = path.join(DATA_DIR, 'operations.json');
const SUFFIX = '_college_quiz_paliers.sql';
const DEFAULT_MIGRATION = `379${SUFFIX}`;

const CYCLE_OF_PALIER = { 3: 'cycle3', 4: 'cycle4' };
const OTHER_CYCLE = { 3: 'cycle4', 4: 'cycle3' };
const LYCEE_NIVEAUX = new Set([
  'seconde',
  'premiere_spe',
  'terminale_spe',
  'es_premiere',
  'es_terminale',
]);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readOptionalJson(file, fallback) {
  return fs.existsSync(file) ? readJson(file) : fallback;
}

function loadDecisions() {
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => /^paliers-lot\d{2}\.json$/.test(f))
    .sort();
  const decisions = [];
  for (const file of files) {
    for (const entry of readJson(path.join(DATA_DIR, file)))
      decisions.push({ ...entry, lot: file });
  }
  return decisions;
}

function migrationPath() {
  const existing = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(SUFFIX));
  if (existing.length > 1)
    throw new Error(`Plusieurs migrations ${SUFFIX} : ${existing.join(', ')}`);
  return path.join(MIGRATIONS_DIR, existing[0] || DEFAULT_MIGRATION);
}

/** Opérations résolues contre l'instantané. */
function resolveOperations() {
  const snap = (name) => readJson(path.join(SNAPSHOT_DIR, name));
  const notions = new Map(snap('curriculum_notions.json').map((n) => [n.id, n]));
  const questions = new Map(snap('quiz_questions.json').map((q) => [q.question_code, q]));
  const catLinks = snap('quiz_category_notions.json');
  const overrides = snap('quiz_question_notions.json');
  const decisions = loadDecisions();

  const seen = new Set();
  const ops = {
    autre_cycle: [],
    ajout_to_exclusion: [],
    exclusion_insert: [],
    ajout_delete: [],
    ajout_insert: [],
    lycee_ajout_delete: [],
    lycee_niveau: [],
    lycee_ajout_insert: [],
  };
  const rows = [];

  for (const d of decisions) {
    if (seen.has(d.code)) throw new Error(`Question tranchée deux fois : ${d.code}`);
    seen.add(d.code);
    const q = questions.get(d.code);
    if (!q) throw new Error(`Question absente de l'instantané : ${d.code}`);
    if (q.categorie_slug !== d.categorie) throw new Error(`Catégorie divergente pour ${d.code}`);
    if (q.niveau !== 'college') throw new Error(`${d.code} n'est pas une question de collège`);
    const inherited = new Set(
      catLinks.filter((l) => l.categorie_slug === q.categorie_slug).map((l) => l.notion_id),
    );
    const own = overrides.filter((o) => o.question_code === d.code);
    const ajouts = new Set(own.filter((o) => o.mode === 'ajout').map((o) => o.notion_id));
    const exclusions = new Set(own.filter((o) => o.mode === 'exclusion').map((o) => o.notion_id));
    const effective = new Set([...[...inherited].filter((n) => !exclusions.has(n)), ...ajouts]);
    const levelOf = (n) => {
      const notion = notions.get(n);
      if (!notion) throw new Error(`Notion inconnue ${n} (${d.code})`);
      return notion.niveau;
    };
    const before = [...effective].filter((n) => /^cycle/.test(levelOf(n))).sort();
    const base = { code: d.code, categorie: d.categorie };
    const row = { ...d, before, question: q.question, operations: [] };

    if (d.palier === 'lycee') {
      for (const n of ajouts) {
        if (/^cycle/.test(levelOf(n))) {
          ops.lycee_ajout_delete.push({ ...base, notion: n });
          row.operations.push(`− ajout ${n}`);
        }
      }
      ops.lycee_niveau.push(base);
      row.operations.push('niveau → lycee');
      const lycInherited = [...inherited].filter(
        (n) => LYCEE_NIVEAUX.has(levelOf(n)) && !exclusions.has(n),
      );
      for (const n of d.notions_lycee || []) {
        if (!LYCEE_NIVEAUX.has(levelOf(n)))
          throw new Error(`${n} n'est pas une notion de lycée (${d.code})`);
        if (lycInherited.includes(n) || ajouts.has(n)) continue;
        if (exclusions.has(n))
          throw new Error(`${n} exclue pour ${d.code} : cas à traiter à la main`);
        ops.lycee_ajout_insert.push({ ...base, notion: n });
        row.operations.push(`+ ajout ${n}`);
      }
      // Ancrage : les notions de lycée héritées deviennent des ajouts explicites, pour que le
      // résultat ne dépende pas des liaisons de catégorie (qui diffèrent entre la prod et une
      // base semée par les migrations).
      for (const n of lycInherited) {
        if (ajouts.has(n) || (d.notions_lycee || []).includes(n)) continue;
        ops.lycee_ajout_insert.push({ ...base, notion: n });
        row.operations.push(`+ ajout ${n} (ancrage)`);
      }
      const finalLycee = new Set([
        ...lycInherited,
        ...[...ajouts].filter((n) => LYCEE_NIVEAUX.has(levelOf(n))),
        ...(d.notions_lycee || []),
      ]);
      if (finalLycee.size === 0) throw new Error(`${d.code} passe au lycée sans notion de lycée`);
      row.after = [...finalLycee].sort();
      rows.push(row);
      continue;
    }

    if (d.palier !== 3 && d.palier !== 4) throw new Error(`Palier invalide pour ${d.code}`);
    const keep = CYCLE_OF_PALIER[d.palier];
    const drop = OTHER_CYCLE[d.palier];
    const final = new Set(effective);
    ops.autre_cycle.push({ ...base, cycle: drop });
    for (const n of [...effective].sort()) {
      if (levelOf(n) !== drop) continue;
      final.delete(n);
      if (ajouts.has(n) && inherited.has(n)) {
        ops.ajout_to_exclusion.push({ ...base, notion: n });
        row.operations.push(`ajout ${n} → exclusion`);
      } else if (ajouts.has(n)) {
        ops.ajout_delete.push({ ...base, notion: n });
        row.operations.push(`− ajout ${n}`);
      } else {
        ops.exclusion_insert.push({ ...base, notion: n });
        row.operations.push(`exclusion ${n}`);
      }
    }
    for (const n of d.ajouts || []) {
      if (levelOf(n) !== keep) throw new Error(`Ajout ${n} hors du palier ${d.palier} (${d.code})`);
      if (final.has(n)) continue;
      if (exclusions.has(n))
        throw new Error(`${n} exclue pour ${d.code} : cas à traiter à la main`);
      ops.ajout_insert.push({ ...base, notion: n });
      row.operations.push(`+ ajout ${n}`);
      final.add(n);
    }
    // Ancrage : chaque notion du palier retenu qui ne vient que de la catégorie devient un
    // ajout explicite (sans effet en prod, mais le palier ne dépend plus des liaisons de
    // catégorie, qui diffèrent entre la prod et une base semée par les migrations).
    for (const n of [...final].sort()) {
      if (levelOf(n) !== keep || ajouts.has(n) || (d.ajouts || []).includes(n)) continue;
      ops.ajout_insert.push({ ...base, notion: n });
      row.operations.push(`+ ajout ${n} (ancrage)`);
    }
    const levels = [...final].map(levelOf);
    if (!levels.includes(keep)) throw new Error(`${d.code} n'a plus de notion ${keep}`);
    if (levels.includes(drop)) throw new Error(`${d.code} garde une notion ${drop}`);
    row.after = [...final].filter((n) => /^cycle/.test(levelOf(n))).sort();
    rows.push(row);
  }
  return { ops, rows };
}

// ---------------------------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------------------------

function sqlString(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function derivedTable(list, columns) {
  return list
    .map((entry, i) => {
      const values = columns.map((c) => sqlString(entry[c]));
      if (i === 0) return `    SELECT ${values.map((v, j) => `${v} AS ${columns[j]}`).join(', ')}`;
      return `    UNION ALL SELECT ${values.join(', ')}`;
    })
    .join('\n');
}

const C = 'COLLATE utf8mb4_unicode_ci';

function insertNotionsSql(list, mode, niveau) {
  return `INSERT INTO quiz_question_notions (question_code, notion_id, mode)
SELECT q.question_code, cn.id, '${mode}'
  FROM (
${derivedTable(list, ['code', 'categorie', 'notion'])}
  ) v
  JOIN quiz_questions q ON q.question_code = v.code ${C}
                       AND q.categorie_slug = v.categorie ${C}
                       AND q.niveau = '${niveau}'
  JOIN curriculum_notions cn ON cn.id = v.notion ${C}
 WHERE NOT EXISTS (
         SELECT 1 FROM quiz_question_notions x
          WHERE x.question_code = q.question_code
            AND x.notion_id = cn.id);`;
}

function deleteAjoutsSql(list) {
  return `DELETE qn
  FROM quiz_question_notions qn
  JOIN (
${derivedTable(list, ['code', 'categorie', 'notion'])}
  ) v ON qn.question_code = v.code ${C} AND qn.notion_id = v.notion ${C}
  JOIN quiz_questions q ON q.question_code = qn.question_code
                       AND q.categorie_slug = v.categorie ${C}
                       AND q.niveau = 'college'
 WHERE qn.mode = 'ajout';`;
}

/** Exclusion de toute notion de l'autre cycle héritée de la catégorie, au moment du rejeu. */
function exclusionAutreCycleSql(list) {
  return `INSERT INTO quiz_question_notions (question_code, notion_id, mode)
SELECT q.question_code, cl.notion_id, 'exclusion'
  FROM (
${derivedTable(list, ['code', 'categorie', 'cycle'])}
  ) v
  JOIN quiz_questions q ON q.question_code = v.code ${C}
                       AND q.categorie_slug = v.categorie ${C}
                       AND q.niveau = 'college'
  JOIN quiz_category_notions cl ON cl.categorie_slug = q.categorie_slug
  JOIN curriculum_notions cn ON cn.id = cl.notion_id AND cn.niveau = v.cycle ${C}
 WHERE NOT EXISTS (
         SELECT 1 FROM quiz_question_notions x
          WHERE x.question_code = q.question_code
            AND x.notion_id = cl.notion_id);`;
}

/** Ajout d'une notion de l'autre cycle que la catégorie donne aussi : passé en exclusion. */
function ajoutAutreCycleToExclusionSql(list) {
  return `UPDATE quiz_question_notions qn
  JOIN (
${derivedTable(list, ['code', 'categorie', 'cycle'])}
  ) v ON qn.question_code = v.code ${C}
  JOIN quiz_questions q ON q.question_code = qn.question_code
                       AND q.categorie_slug = v.categorie ${C}
                       AND q.niveau = 'college'
  JOIN quiz_category_notions cl ON cl.categorie_slug = q.categorie_slug AND cl.notion_id = qn.notion_id
  JOIN curriculum_notions cn ON cn.id = qn.notion_id AND cn.niveau = v.cycle ${C}
   SET qn.mode = 'exclusion'
 WHERE qn.mode = 'ajout';`;
}

function lyceeNiveauSql(list) {
  return `UPDATE quiz_questions q
  JOIN (
${derivedTable(list, ['code', 'categorie'])}
  ) v ON q.question_code = v.code ${C} AND q.categorie_slug = v.categorie ${C}
   SET q.niveau = 'lycee'
 WHERE q.niveau <=> 'college';`;
}

function enonceSql(entry) {
  return `UPDATE quiz_questions
   SET question = ${sqlString(entry.apres)}
 WHERE question_code = ${sqlString(entry.code)}
   AND question <=> ${sqlString(entry.avant)};`;
}

function categorySql(entry) {
  return `UPDATE quiz_categories
   SET description_college = ${sqlString(entry.description_college)}
 WHERE slug = ${sqlString(entry.slug)}
   AND description_college IS NULL;`;
}

function block(title, comment, statements) {
  const lines = [
    '-- ---------------------------------------------------------------------',
    `-- ${title}`,
  ];
  for (const c of comment) lines.push(`--    ${c}`);
  lines.push('-- ---------------------------------------------------------------------');
  if (statements.length === 0) lines.push('-- (rien)');
  return `${lines.join('\n')}\n${statements.join('\n\n')}\n`;
}

function buildMigration(ops, enonces, categories) {
  const header = `-- =====================================================================
-- Chantier collège (novembre 2026), flux D3 — migration \`college_quiz_paliers\`.
-- FICHIER GÉNÉRÉ par scripts/college-2026-11/build-D3-migration.js à partir de
-- data/college-2026-11/D3/*.json : ne pas l'éditer à la main.
--
-- Objet : le palier d'une question de collège se déduit de ses notions effectives
-- (catégorie − exclusions ∪ ajouts) ; une notion de cycle 3 → palier 1, sinon palier 2.
-- 445 questions de collège étaient rattachées aux deux cycles (instantané du 21/11/2026) :
-- chacune est tranchée (cycle 3 ou cycle 4) d'après son contenu et les programmes, ou passée au
-- lycée. Relecture : docs/coordination/college-2026-11/revue/D3.md.
--
-- Blocs :
--   1. quiz_question_notions  ajouts de l'autre cycle supprimés (collège)
--   2. quiz_question_notions  ajouts de l'autre cycle aussi hérités : passés en exclusion
--   3. quiz_question_notions  exclusions des notions héritées de l'autre cycle (liaisons de
--                             catégorie lues au rejeu)
--   4. quiz_question_notions  ajouts explicites du palier retenu (notion précise, ancrage)
--   5. quiz_question_notions  questions passées au lycée : ajouts de collège supprimés
--   6. quiz_questions         niveau college → lycee (garde sur l'ancienne valeur)
--   7. quiz_question_notions  notions de lycée des questions passées au lycée
--   8. quiz_questions         énoncés rendus autonomes (garde sur l'ancien énoncé)
--   9. quiz_categories        description_college (posée seulement si vide)
--
-- Gardes : chaque ligne vise une question par son code ET sa catégorie ET son niveau attendu
-- (une question absente, déplacée ou déjà modifiée dans l'application est sautée) ; insertions
-- en NOT EXISTS ; énoncés en \`<=>\` sur l'ancien texte. Rejouable : zéro erreur, zéro doublon.
-- Aucun DDL, aucune table gl_*, aucun trigger, aucune donnée personnelle.
-- =====================================================================

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
`;
  const parts = [header];
  parts.push(
    block(
      `1. Ajouts de l'autre cycle supprimés (${ops.ajout_delete.length} lignes)`,
      ['Notion ajoutée à la main qui ne vient pas de la catégorie.'],
      ops.ajout_delete.length ? [deleteAjoutsSql(ops.ajout_delete)] : [],
    ),
  );
  parts.push(
    block(
      `2. Ajouts de l'autre cycle aussi hérités : passés en exclusion (${ops.autre_cycle.length} questions ; ${ops.ajout_to_exclusion.length} lignes en prod au 21/11)`,
      [
        'Clé primaire (question, notion) : une seule ligne, dont on change le mode.',
        'Calculé sur les liaisons de catégorie présentes au rejeu (elles diffèrent entre la prod et',
        'une base semée par les migrations).',
      ],
      ops.autre_cycle.length ? [ajoutAutreCycleToExclusionSql(ops.autre_cycle)] : [],
    ),
  );
  parts.push(
    block(
      `3. Exclusions des notions héritées de l'autre cycle (${ops.autre_cycle.length} questions ; ${ops.exclusion_insert.length} lignes en prod au 21/11)`,
      [
        "Toute notion de l'autre cycle donnée par la catégorie, au moment du rejeu.",
        'Parents : la question (code, catégorie, niveau college) et la liaison de catégorie.',
      ],
      ops.autre_cycle.length ? [exclusionAutreCycleSql(ops.autre_cycle)] : [],
    ),
  );
  parts.push(
    block(
      `4. Ajouts explicites des notions du palier retenu (${ops.ajout_insert.length} lignes)`,
      [
        'Notion précise quand la catégorie ne porte pas celle qui décrit la question, et ancrage',
        'des notions héritées du palier retenu (sans effet en prod ; le palier ne dépend plus des',
        'liaisons de catégorie).',
      ],
      ops.ajout_insert.length ? [insertNotionsSql(ops.ajout_insert, 'ajout', 'college')] : [],
    ),
  );
  parts.push(
    block(
      `5. Questions passées au lycée : ajouts de collège supprimés (${ops.lycee_ajout_delete.length} lignes)`,
      ['Avant le bloc 6 (garde niveau = college).'],
      ops.lycee_ajout_delete.length ? [deleteAjoutsSql(ops.lycee_ajout_delete)] : [],
    ),
  );
  parts.push(
    block(
      `6. Niveau college → lycee (${ops.lycee_niveau.length} questions)`,
      ["La garde de palier retire alors d'elle-même les notions de collège héritées."],
      ops.lycee_niveau.length ? [lyceeNiveauSql(ops.lycee_niveau)] : [],
    ),
  );
  parts.push(
    block(
      `7. Notions de lycée des questions passées au lycée (${ops.lycee_ajout_insert.length} lignes)`,
      ['Ajouts explicites (ancrage des notions de lycée héritées de la catégorie).'],
      ops.lycee_ajout_insert.length
        ? [insertNotionsSql(ops.lycee_ajout_insert, 'ajout', 'lycee')]
        : [],
    ),
  );
  parts.push(
    block(
      `8. Énoncés rendus autonomes (${enonces.length} questions)`,
      ['Le nom du tutoriel est écrit en clair : la question se comprend hors de la fiche.'],
      enonces.map(enonceSql),
    ),
  );
  parts.push(
    block(
      `9. Descriptions collège des catégories (${categories.length} catégories)`,
      ['Affichées au collège à la place de la description (flux C6).'],
      categories.map(categorySql),
    ),
  );
  return parts.join('\n');
}

// ---------------------------------------------------------------------------------------------
// Revue
// ---------------------------------------------------------------------------------------------

function cell(text) {
  return String(text == null ? '' : text)
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ');
}

function buildRevue(rows, enoncesData, categories, snapshotCategories) {
  const count = (p) => rows.filter((r) => r.palier === p).length;
  const lines = [];
  lines.push('# Revue — D3 (quiz : retri des paliers et descriptions collège)');
  lines.push('');
  lines.push(
    '> **Fichier généré** par `scripts/college-2026-11/build-D3-migration.js` (sections « Répartition » à « Catégories ») ; la section « Points d’attention » est écrite à la main en tête. Source de travail : instantané de la prod du 21/11/2026. Migration `college_quiz_paliers`.',
  );
  lines.push('');
  const manualPath = path.join(DATA_DIR, 'revue-entete.md');
  if (fs.existsSync(manualPath)) {
    lines.push(fs.readFileSync(manualPath, 'utf8').trim());
    lines.push('');
  }
  lines.push('## Répartition');
  lines.push('');
  lines.push('| Décision | Questions |');
  lines.push('| --- | ---: |');
  lines.push(`| Cycle 3 (palier 1) | ${count(3)} |`);
  lines.push(`| Cycle 4 (palier 2) | ${count(4)} |`);
  lines.push(`| Passées au lycée | ${count('lycee')} |`);
  lines.push(`| **Total tranché** | **${rows.length}** |`);
  lines.push('');
  const byCat = new Map();
  for (const r of rows) {
    const e = byCat.get(r.categorie) || { 3: 0, 4: 0, lycee: 0 };
    e[r.palier] += 1;
    byCat.set(r.categorie, e);
  }
  lines.push('| Catégorie | Cycle 3 | Cycle 4 | Lycée |');
  lines.push('| --- | ---: | ---: | ---: |');
  for (const [cat, e] of [...byCat.entries()].sort()) {
    lines.push(`| \`${cat}\` | ${e[3]} | ${e[4]} | ${e.lycee} |`);
  }
  lines.push('');
  lines.push('## Questions passées au lycée');
  lines.push('');
  lines.push(
    '| Code | Catégorie | Énoncé | Notions collège avant | Notions lycée après | Opérations | Raison |',
  );
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const r of rows.filter((x) => x.palier === 'lycee')) {
    lines.push(
      `| ${r.code} | \`${r.categorie}\` | ${cell(r.question)} | ${r.before.join(', ')} | ${r.after.join(', ')} | ${cell(r.operations.join(' ; '))} | ${cell(r.raison)} |`,
    );
  }
  lines.push('');
  lines.push('## Paliers tranchés (questions restées au collège)');
  lines.push('');
  lines.push(
    'Avant : notions de collège effectives (toutes les questions listées portaient les deux cycles). Après : notions de collège effectives après la migration. Source de chaque décision : programmes de cycle 3 et de cycle 4 (Sciences et technologie, SVT), colonne « Raison ».',
  );
  lines.push('');
  lines.push('| Code | Catégorie | Énoncé | Avant | Palier | Après | Opérations | Raison |');
  lines.push('| --- | --- | --- | --- | :---: | --- | --- | --- |');
  for (const r of rows.filter((x) => x.palier !== 'lycee')) {
    lines.push(
      `| ${r.code} | \`${r.categorie}\` | ${cell(r.question)} | ${r.before.join(', ')} | ${r.palier === 3 ? 'C3' : 'C4'} | ${r.after.join(', ')} | ${cell(r.operations.join(' ; '))} | ${cell(r.raison)} |`,
    );
  }
  lines.push('');
  lines.push('## Énoncés dépendant d’un tutoriel');
  lines.push('');
  lines.push('### Rendus autonomes');
  lines.push('');
  lines.push('| Code | Avant | Après |');
  lines.push('| --- | --- | --- |');
  for (const e of enoncesData.autonomes || []) {
    lines.push(`| ${e.code} | ${cell(e.avant)} | ${cell(e.apres)} |`);
  }
  lines.push('');
  lines.push('### Laissés en l’état');
  lines.push('');
  lines.push('| Code | Énoncé | Raison |');
  lines.push('| --- | --- | --- |');
  for (const e of enoncesData.laisses || []) {
    lines.push(`| ${e.code} | ${cell(e.question)} | ${cell(e.raison)} |`);
  }
  lines.push('');
  lines.push('## Catégories : `description_college`');
  lines.push('');
  lines.push('| Catégorie | Description actuelle | Description collège |');
  lines.push('| --- | --- | --- |');
  for (const c of categories) {
    const cur = snapshotCategories.get(c.slug);
    lines.push(
      `| \`${c.slug}\` | ${cell(cur ? cur.description : '')} | ${cell(c.description_college)} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const check = process.argv.includes('--check');
  const enoncesData = readOptionalJson(path.join(DATA_DIR, 'enonces.json'), {
    autonomes: [],
    laisses: [],
  });
  const categories = readOptionalJson(path.join(DATA_DIR, 'categories.json'), []);

  let operations;
  let rows;
  if (fs.existsSync(SNAPSHOT_DIR)) {
    ({ ops: operations, rows } = resolveOperations());
  } else {
    // Après la suppression de l'instantané par SI : on repart des opérations déjà résolues.
    const saved = readJson(OPERATIONS_PATH);
    operations = saved.operations;
    rows = null;
  }

  const outputs = [];
  outputs.push([
    OPERATIONS_PATH,
    `${JSON.stringify({ operations, decisions: rows ? rows.map(({ code, categorie, palier, before, after }) => ({ code, categorie, palier, before, after })) : readJson(OPERATIONS_PATH).decisions }, null, 1)}\n`,
  ]);
  outputs.push([
    migrationPath(),
    buildMigration(operations, enoncesData.autonomes || [], categories),
  ]);
  if (rows) {
    const snapCats = new Map(
      readJson(path.join(SNAPSHOT_DIR, 'quiz_categories.json')).map((c) => [c.slug, c]),
    );
    const prettier = require('prettier');
    const options = (await prettier.resolveConfig(REVUE_PATH)) || {};
    const revue = await prettier.format(buildRevue(rows, enoncesData, categories, snapCats), {
      ...options,
      filepath: REVUE_PATH,
    });
    outputs.push([REVUE_PATH, revue]);
  }

  let stale = 0;
  for (const [file, content] of outputs) {
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (current === content) continue;
    if (check) {
      console.error(`Périmé : ${path.relative(ROOT, file)}`);
      stale += 1;
    } else {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
      console.log(`Écrit : ${path.relative(ROOT, file)}`);
    }
  }
  if (check && stale) process.exit(1);
  if (rows) {
    const n = (p) => rows.filter((r) => r.palier === p).length;
    console.log(
      `Décisions : ${rows.length} (cycle 3 : ${n(3)}, cycle 4 : ${n(4)}, lycée : ${n('lycee')})`,
    );
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { resolveOperations, buildMigration, sqlString };
