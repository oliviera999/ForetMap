'use strict';

// Migration `retrait_t3_quiz_question_links` : temps 3 du retrait des tables figées
// `quiz_question_species` et `quiz_question_tutorials` (audit du 25/09/2026, § 3.5 ;
// `docs/RUNBOOK_RETRAITS_T3.md`). Source unique des liens : `resource_question_links`.
//
// Le fichier est retrouvé par son suffixe : son numéro est attribué à l'intégration.
// Tests BDD partagée : exécution séquentielle ; tout ce qui est semé est retiré à la fin.

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initSchema, execute, queryAll, pool, splitSqlStatements } = require('../database');
const {
  LEGACY_QUIZ_LINK_TABLES,
  recreateLegacyQuizLinkTables,
  dropLegacyQuizLinkTables,
  presentLegacyQuizLinkTables,
} = require('./helpers/legacyQuizLinkTables');

const ROOT = path.join(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'migrations');
const MIGRATION_FILE = fs
  .readdirSync(MIGRATIONS_DIR)
  .find((f) => /^\d+_retrait_t3_quiz_question_links\.sql$/.test(f));
const SQL = MIGRATION_FILE
  ? fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION_FILE), 'utf8')
  : '';

const stamp = Date.now().toString(36).toUpperCase();
const catSlug = `t3cat${stamp.toLowerCase()}`.slice(0, 64);
const questionCode = `QT3${stamp}`.slice(0, 16);
let plantId = 0;

/** Rejoue le fichier comme le runner : une seule connexion (variables de session), `query`. */
async function runMigration() {
  const conn = await pool.getConnection();
  try {
    for (const stmt of splitSqlStatements(SQL)) await conn.query(stmt);
  } finally {
    conn.release();
  }
}

before(async () => {
  await initSchema();
  await execute(
    `INSERT IGNORE INTO quiz_categories (slug, nom, theme, order_index)
     VALUES (?, 'Retrait T3', 'sciences', 996)`,
    [catSlug],
  );
  await execute(
    `INSERT INTO quiz_questions
       (question_code, categorie_slug, numero_dans_categorie, question,
        choix_a, choix_b, choix_c, reponse_correcte, niveau, statut)
     VALUES (?, ?, 1, ?, 'A', 'B', 'C', 'A', 'college', 'actif')`,
    [questionCode, catSlug, `Question ${questionCode} ?`],
  );
  plantId = (
    await execute('INSERT INTO plants (name, emoji, description) VALUES (?, ?, ?)', [
      `Espèce retrait T3 ${stamp}`,
      '🌱',
      'retrait T3',
    ])
  ).insertId;
});

after(async () => {
  // Quoi qu'il arrive, la base revient à l'état d'après le retrait.
  await dropLegacyQuizLinkTables(execute).catch(() => {});
  await execute('DELETE FROM resource_question_links WHERE question_code = ?', [
    questionCode,
  ]).catch(() => {});
  await execute('DELETE FROM quiz_questions WHERE question_code = ?', [questionCode]).catch(
    () => {},
  );
  await execute('DELETE FROM quiz_categories WHERE slug = ?', [catSlug]).catch(() => {});
  await execute('DELETE FROM plants WHERE id = ?', [plantId]).catch(() => {});
});

// ---------------------------------------------------------------------------------------
// Structure du fichier
// ---------------------------------------------------------------------------------------

test('retrait T3 : un seul fichier, retrouvé par son suffixe, en utf8mb4', () => {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /_retrait_t3_quiz_question_links\.sql$/.test(f));
  assert.equal(files.length, 1, files.join(', '));
  assert.match(SQL, /^SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;/);
});

test('retrait T3 : seulement les deux tables figées, ni gl_*, ni vue, ni trigger, ni DEFINER', () => {
  const code = splitSqlStatements(SQL).join('\n');
  assert.ok(!/\bgl_[a-z]/i.test(code), 'aucune table gl_*');
  assert.ok(!/\b(TRIGGER|DEFINER|VIEW|ALTER|TRUNCATE|DELETE|UPDATE|INSERT)\b/i.test(code));
  const drops = [...code.matchAll(/DROP TABLE(?: IF EXISTS)? ([a-z_]+)/gi)].map((m) => m[1]);
  assert.deepEqual(drops.sort(), [...LEGACY_QUIZ_LINK_TABLES].sort());
  // Le `DROP` est toujours conditionné au contrôle de passage (ceinture).
  assert.match(code, /@fm_t3_qqs_exists > 0 AND @fm_t3_qqs_missing = 0/);
  assert.match(code, /@fm_t3_qqt_exists > 0 AND @fm_t3_qqt_missing = 0/);
});

// ---------------------------------------------------------------------------------------
// Effet en base
// ---------------------------------------------------------------------------------------

test('retrait T3 : après initialisation, les deux tables figées sont absentes', async () => {
  assert.deepEqual(await presentLegacyQuizLinkTables(queryAll), []);
});

test('retrait T3 : une table dont un lien manque dans resource_question_links reste', async () => {
  await recreateLegacyQuizLinkTables(execute);
  await execute('INSERT INTO quiz_question_species (question_code, plant_id) VALUES (?, ?)', [
    questionCode,
    plantId,
  ]);
  await runMigration();
  // La table des espèces garde son lien orphelin ; celle des tutoriels (vide) part.
  assert.deepEqual(await presentLegacyQuizLinkTables(queryAll), ['quiz_question_species']);

  // Le lien rejoint la source unique : le contrôle de passage tombe à 0, la table part.
  await execute(
    `INSERT INTO resource_question_links
       (resource_type, resource_ref, question_code, is_gating, origin, status)
     VALUES ('plant', ?, ?, 0, 'editorial', 'approved')`,
    [String(plantId), questionCode],
  );
  await runMigration();
  assert.deepEqual(await presentLegacyQuizLinkTables(queryAll), []);
});

test('retrait T3 : rejouée deux fois sur tables absentes, aucune erreur, aucun effet', async () => {
  await dropLegacyQuizLinkTables(execute);
  const before = await queryAll(
    "SELECT COUNT(*) AS n FROM resource_question_links WHERE resource_type IN ('plant', 'tutorial')",
  );
  await runMigration();
  await runMigration();
  assert.deepEqual(await presentLegacyQuizLinkTables(queryAll), []);
  assert.deepEqual(
    await queryAll(
      "SELECT COUNT(*) AS n FROM resource_question_links WHERE resource_type IN ('plant', 'tutorial')",
    ),
    before,
  );
});

// ---------------------------------------------------------------------------------------
// Garde anti-régression : plus aucun code applicatif ne nomme les tables supprimées
// ---------------------------------------------------------------------------------------

function listFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listFiles(full, out);
    else if (/\.(c?js|mjs|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

test('retrait T3 : aucun module applicatif ne lit ni n’écrit les tables supprimées', () => {
  const files = [
    path.join(ROOT, 'database.js'),
    path.join(ROOT, 'server.js'),
    ...['lib', 'routes', 'middleware', 'scripts', 'src'].flatMap((d) =>
      fs.existsSync(path.join(ROOT, d)) ? listFiles(path.join(ROOT, d)) : [],
    ),
  ];
  const re = new RegExp(`\\b(?:${LEGACY_QUIZ_LINK_TABLES.join('|')})\\b`);
  const hits = files
    .filter((f) => re.test(fs.readFileSync(f, 'utf8')))
    .map((f) => path.relative(ROOT, f));
  assert.deepEqual(hits, []);
});
