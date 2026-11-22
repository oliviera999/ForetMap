'use strict';

// Migration « contenus_terrain_2026_11_20 » : mécanique de rejeu (chantier CPT, flux F1).
//
// Les contenus écrits en production le 20/11/2026 sont repris par une migration dont chaque
// insertion est jointe à son parent par clé naturelle. Une base fraîche n'a presque aucun de
// ces parents : ce test sème les parents minimaux (espèces, cartes, une
// zone de visite par site, une clé avec ses couplets n° 3 et n° 4, des séances dans leur
// ancienne forme), rejoue le fichier et vérifie chaque bloc, les gardes et l'absence d'effet
// d'un second passage.
//
// Le fichier est retrouvé par son suffixe : son numéro est attribué à l'intégration.
// Tests BDD partagée : exécution séquentielle ; tout ce qui est semé est retiré à la fin.

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initSchema, execute, queryOne, queryAll, splitSqlStatements } = require('../database');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const MIGRATION_FILE = fs
  .readdirSync(MIGRATIONS_DIR)
  .find((f) => /_contenus_terrain_2026_11_20\.sql$/.test(f));
const SQL = fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION_FILE), 'utf8');
const STATEMENTS = splitSqlStatements(SQL);

// Codes à six caractères seulement : un test qui laisse un code aléatoire du type `QF98xxxx`
// dans la base partagée (ordre CI : `test` puis `test:content`) tombe sinon dans l'intervalle.
const RANGE = "question_code BETWEEN 'QF9873' AND 'QF9933' AND CHAR_LENGTH(question_code) = 6";
// Lignes de notions des 61 questions : 168 posées le 20/11, retouchées ensuite par la migration
// `college_quiz_paliers` (chantier collège, retri des paliers cycle 3 / cycle 4), qui voit les
// liaisons catégorie → notions semées juste avant par `college_referentiel_notions`.
const RANGE_NOTIONS = 220;
// Après le rejeu de cette migration-ci (hors curseur : propre à ce test, jamais en prod), les 11
// ajouts de l'autre cycle que le retri des paliers avait supprimés reviennent.
const RANGE_NOTIONS_APRES_REJEU = 231;
const RETRAITS = [
  'QF0010',
  'QF0011',
  'QF0062',
  'QF0387',
  'QF0398',
  'QF9213',
  'QF9214',
  'QF0431',
  'QF0427',
];
/** Lignes de référence créées par le bloc 0 (absentes du dépôt avant cette migration). */
const CATEGORIES_CREEES = ['demarche_mesure', 'glossaire_definitions', 'microbes_sante'];
const NOTIONS_CREEES = ['2-MICRO', 'EST-DEMO', 'EST-EVOL', 'T-EVO'];
const ESPECES = [
  'Massette',
  'Lentisque',
  'Patelle rustique',
  'Talitre (puce de mer)',
  'Ail',
  'Romarin',
  'Hirondelle de fenêtre',
  'Rougequeue noir',
  'Phytoplancton',
  'Gracilaire cervicorne',
  'Nette rousse',
];
/** Une zone de visite par site (identifiants texte de la production, clé naturelle). */
const ZONES_VISITE = {
  sablettes: 'zone-da63713c',
  melah: 'zone-f40b7875',
  dayat: 'zone-8dbc6d24',
};
const ZONE_TRAVAIL = { id: 'zone-bade91d5', map: 'n3' };
const REPERE = { id: '5107548b-4790-4962-b0d5-85ededd77db1', map: 'foret' };
const SLUGS_CLES = [
  'oiseaux-eau-daya',
  'insectes-ordres',
  'coleopteres',
  'arbres-palmiers',
  'animaux-grands-groupes',
];
const SEANCES = [
  '6e-eau-de-nos-lieux',
  '6e-inventaire-n3',
  '6e-pas-la-par-hasard',
  '6e-mauvaise-saison',
];
const AVANT = '2026-11-17 12:00:00';
const TABLES = [
  'quiz_questions',
  'quiz_question_notions',
  'tutorials',
  'tutorial_zones',
  'tutorial_markers',
  'resource_question_links',
  'visit_tutorials',
  'visit_media',
  'id_key_leads',
  'pedago_sessions',
  'plant_photos',
  'map_species',
];

const undo = [];
const plantIds = {};
let configReconnaitre = null;
let coupletIds = {};

const count = async (sql, params = []) => Number((await queryOne(sql, params)).n);

async function runMigration() {
  const affected = [];
  for (const stmt of STATEMENTS) affected.push((await execute(stmt)).affectedRows);
  return affected;
}

async function tableCounts() {
  const counts = {};
  for (const t of TABLES) counts[t] = await count(`SELECT COUNT(*) AS n FROM ${t}`);
  return counts;
}

/** Insère la ligne si elle manque et prévoit son retrait ; ne touche pas une ligne existante. */
async function seedIfAbsent(
  existsSql,
  existsParams,
  insertSql,
  insertParams,
  deleteSql,
  deleteParams,
) {
  if (await queryOne(existsSql, existsParams)) return false;
  await execute(insertSql, insertParams);
  undo.push(() => execute(deleteSql, deleteParams));
  return true;
}

const sevenSteps = () =>
  JSON.stringify(
    Array.from({ length: 7 }, (_, i) => ({
      id: `z${i + 1}`,
      title: `Ancienne étape ${i + 1}`,
      body: 'Ancienne forme.',
      action: { type: 'message', payload: {} },
      completeWhen: 'manual',
    })),
  );

async function plantId(name) {
  return (await queryOne('SELECT id FROM plants WHERE name = ?', [name])).id;
}

async function seedLead(coupletId, sortOrder, statement, plant) {
  return (
    await execute(
      `INSERT INTO id_key_leads (couplet_id, sort_order, statement, plant_id, outcome)
       VALUES (?, ?, ?, ?, 'espece')`,
      [coupletId, sortOrder, statement, plant],
    )
  ).insertId;
}

async function leadsOf(number) {
  return queryAll(
    `SELECT p.name FROM id_key_leads l
       JOIN id_key_couplets c ON c.id = l.couplet_id AND c.number = ?
       JOIN id_keys k ON k.id = c.key_id AND k.slug = 'oiseaux-eau-daya'
       JOIN plants p ON p.id = l.plant_id
      ORDER BY l.sort_order`,
    [number],
  );
}

before(async () => {
  await initSchema();
  configReconnaitre = (
    await queryOne(
      "SELECT config_json FROM pedago_sessions WHERE slug = 'college-reconaitre-sans-toucher'",
    )
  )?.config_json;
});

after(async () => {
  const marks = (list) => list.map(() => '?').join(', ');
  const ids = Object.values(plantIds).map(String);
  const run = (sql, params = []) => execute(sql, params).catch(() => {});
  await run(`DELETE FROM pedago_sessions WHERE slug IN (${marks(SEANCES)})`, SEANCES);
  if (configReconnaitre) {
    await run(
      "UPDATE pedago_sessions SET config_json = ? WHERE slug = 'college-reconaitre-sans-toucher'",
      [configReconnaitre],
    );
  }
  await run(`DELETE FROM id_keys WHERE slug IN (${marks(SLUGS_CLES)})`, SLUGS_CLES);
  const zones = Object.values(ZONES_VISITE);
  await run(
    `DELETE FROM visit_media WHERE target_type = 'zone' AND target_id IN (${marks(zones)})`,
    zones,
  );
  if (ids.length) {
    await run(
      `DELETE FROM resource_question_links
        WHERE resource_type = 'plant' AND resource_ref IN (${marks(ids)})`,
      ids,
    );
  }
  await run(
    "DELETE FROM resource_question_links WHERE resource_type = 'glossary' AND resource_ref = 'FM0010' AND " +
      RANGE,
  );
  const maps = Object.keys(ZONES_VISITE);
  await run(`DELETE FROM visit_tutorials WHERE map_id IN (${marks(maps)})`, maps);
  for (const fn of undo.reverse()) await fn().catch(() => {});
  // Le rejeu de cette migration-ci (hors curseur) fait revenir les ajouts de l'autre cycle que
  // le retri des paliers (`college_quiz_paliers`, postérieure) avait retirés : on rejoue ce
  // retri pour rendre la base dans l'état des migrations — sinon `test:content`, lancé après
  // `npm test` sur la même base (CI), voit des questions sur deux cycles.
  const paliers = fs.readdirSync(MIGRATIONS_DIR).find((f) => /_college_quiz_paliers\.sql$/.test(f));
  if (paliers) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, paliers), 'utf8');
    for (const stmt of splitSqlStatements(sql)) await run(stmt);
  }
});

// ---------------------------------------------------------------------------------------
// Structure du fichier
// ---------------------------------------------------------------------------------------

test('contenus du 20/11 : un seul fichier, retrouvé par son suffixe, en utf8mb4', () => {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => /contenus_terrain_2026_11_20/.test(f));
  assert.equal(files.length, 1);
  assert.match(files[0], /^\d{3}_contenus_terrain_2026_11_20\.sql$/);
  assert.equal(STATEMENTS[0], 'SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci');
});

test('contenus du 20/11 : ni DDL, ni trigger, ni table gl_*, ni table figée, ni adresse', () => {
  for (const stmt of STATEMENTS.slice(1)) {
    assert.match(stmt, /^(INSERT INTO|UPDATE|DELETE FROM) /);
    assert.ok(!/\bgl_[a-z]/i.test(stmt), 'aucune table gl_*');
    assert.ok(
      !/\b(CREATE|ALTER|DROP|TRUNCATE|RENAME)\s+(TABLE|VIEW|INDEX|TRIGGER|DATABASE)\b/i.test(stmt),
      'aucun DDL',
    );
    assert.ok(!/\b(TRIGGER|DEFINER)\b/i.test(stmt), 'ni trigger ni DEFINER');
    // Tables figées depuis la reprise des liens : aucun ajout. Seule écriture admise, la
    // suppression des jumeaux de trois liens retirés (voir le test dédié).
    assert.ok(!/\bquiz_question_species\b/.test(stmt), 'table figée');
    if (/\bquiz_question_tutorials\b/.test(stmt)) {
      assert.match(stmt, /^DELETE FROM quiz_question_tutorials\s/);
    }
    assert.ok(!/[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(stmt), 'aucune adresse e-mail');
  }
});

test('contenus du 20/11 : aucun identifiant auto-incrémenté de la production', () => {
  // Les étapes de séance portent un jeton résolu par nom d'espèce, jamais un identifiant.
  assert.ok(!/"plantId":\d/.test(SQL), 'identifiant de fiche en dur dans une séance');
  assert.match(SQL, /"plantId":@@P1@@/);
  for (const stmt of STATEMENTS) {
    assert.ok(
      !/\b(plant_id|tutorial_id|couplet_id|key_id|lead_id)\s*(=|IN)\s*\(?\s*\d/i.test(stmt),
    );
    assert.ok(!/resource_ref\s*=\s*'?\d/.test(stmt), 'référence de lien numérique en dur');
  }
  // Toute insertion est gardée sur sa clé naturelle.
  for (const stmt of STATEMENTS.filter((s) => s.startsWith('INSERT INTO'))) {
    assert.match(stmt, /WHERE[\s\S]*NOT EXISTS/);
    assert.ok(!/\bVALUES\s*\(/i.test(stmt), 'INSERT … SELECT uniquement');
  }
});

// ---------------------------------------------------------------------------------------
// Base sans parents : seuls les blocs autonomes s'insèrent
// ---------------------------------------------------------------------------------------

test('contenus du 20/11 : sans parents, les blocs autonomes sont posés et rien n’échoue', async () => {
  // `initSchema()` a déjà appliqué la migration sur la base de test.
  // Les sept lignes de référence du bloc 0 existent : les 61 questions et leurs notions aussi
  // (168 posées le 20/11, 220 après le retri des paliers de la migration `college_quiz_paliers`).
  assert.equal(
    await count(
      `SELECT COUNT(*) AS n FROM quiz_categories WHERE theme = 'sciences'
          AND slug IN (${CATEGORIES_CREEES.map(() => '?').join(', ')})`,
      CATEGORIES_CREEES,
    ),
    3,
  );
  assert.equal(
    await count(
      `SELECT COUNT(*) AS n FROM curriculum_notions
        WHERE niveau IN ('seconde', 'terminale_spe', 'es_terminale')
          AND id IN (${NOTIONS_CREEES.map(() => '?').join(', ')})`,
      NOTIONS_CREEES,
    ),
    4,
  );
  assert.equal(await count(`SELECT COUNT(*) AS n FROM quiz_questions WHERE ${RANGE}`), 61);
  assert.equal(
    await count(`SELECT COUNT(*) AS n FROM quiz_question_notions WHERE ${RANGE}`),
    RANGE_NOTIONS,
  );
  // Tutoriels renommés en production : faute du slug de production, le lien repris se pose
  // sur le slug que sème le dépôt, une seule fois.
  for (const [slug, code, ancien] of [
    ['rempotage', 'QF9891', 'QF9213'],
    ['rempotage', 'QF9900', 'QF9214'],
    ['semences', 'QF9881', 'QF0062'],
  ]) {
    const liens = await queryAll(
      `SELECT l.is_gating, l.note FROM resource_question_links l
         JOIN tutorials t ON t.id = l.resource_ref AND t.slug = ?
        WHERE l.resource_type = 'tutorial' AND l.question_code = ?`,
      [slug, code],
    );
    assert.equal(liens.length, 1, `${code} → ${slug}`);
    assert.equal(Number(liens[0].is_gating), 1);
    assert.ok(liens[0].note.startsWith(`Repris de ${ancien} `), liens[0].note);
  }
  assert.equal(
    await count(
      `SELECT COUNT(*) AS n FROM tutorials
        WHERE is_active = 1 AND slug IN ('observer-a-la-boite-loupe', 'observer-aux-jumelles',
              'observer-sans-deranger', 'prendre-une-photo-utile-pour-identifier',
              'securite-sur-l-estran')`,
    ),
    5,
  );
  assert.equal(
    await count(
      `SELECT COUNT(*) AS n FROM resource_question_links l
         JOIN tutorials t ON t.id = l.resource_ref AND t.slug = 'observer-a-la-boite-loupe'
        WHERE l.resource_type = 'tutorial' AND l.question_code = 'QF9883' AND l.is_gating = 0`,
    ),
    1,
  );
  assert.equal(
    await count(
      `SELECT COUNT(*) AS n FROM quiz_questions
        WHERE statut = 'actif' AND question_code IN (${RETRAITS.map(() => '?').join(', ')})`,
      RETRAITS,
    ),
    0,
  );
  // Aucun parent n'est créé par la migration.
  assert.equal(
    await count(
      "SELECT COUNT(*) AS n FROM pedago_sessions WHERE slug = '6e-inventaire-n3' AND is_published = 1",
    ),
    0,
  );
  await runMigration();
});

test('contenus du 20/11 : liens tutoriel des questions retirées supprimés avec leur jumeau historique', async () => {
  const COUPLES = [
    ['semences', 'QF0062'],
    ['rempotage', 'QF9213'],
    ['rempotage', 'QF9214'],
  ];
  const lien = (slug, code) =>
    count(
      `SELECT COUNT(*) AS n FROM resource_question_links l
         JOIN tutorials t ON t.id = l.resource_ref AND t.slug = ?
        WHERE l.resource_type = 'tutorial' AND l.question_code = ?`,
      [slug, code],
    );
  const jumeau = (slug, code) =>
    count(
      `SELECT COUNT(*) AS n FROM quiz_question_tutorials x
         JOIN tutorials t ON t.id = x.tutorial_id AND t.slug = ?
        WHERE x.question_code = ?`,
      [slug, code],
    );
  for (const [slug, code] of COUPLES) {
    assert.equal(await lien(slug, code), 0, `lien ${code} → ${slug}`);
    assert.equal(await jumeau(slug, code), 0, `jumeau ${code} → ${slug}`);
  }
  // Contrôle de retrait des tables historiques : toujours à zéro.
  assert.equal(
    await count(
      `SELECT COUNT(*) AS n FROM quiz_question_tutorials q WHERE NOT EXISTS (
         SELECT 1 FROM resource_question_links r WHERE r.resource_type = 'tutorial'
            AND r.question_code = q.question_code
            AND CAST(r.resource_ref AS UNSIGNED) = q.tutorial_id)`,
    ),
    0,
  );
  // Rien d'autre n'est supprimé : les deux tutoriels gardent leurs autres liens bloquants.
  for (const slug of ['semences', 'rempotage']) {
    const n = await count(
      `SELECT COUNT(*) AS n FROM resource_question_links l
         JOIN tutorials t ON t.id = l.resource_ref AND t.slug = ?
         JOIN quiz_questions q ON q.question_code = l.question_code AND q.statut = 'actif'
        WHERE l.resource_type = 'tutorial' AND l.is_gating = 1 AND l.status = 'approved'`,
      [slug],
    );
    assert.ok(n >= 3, `${slug} : ${n} lien(s) bloquant(s) actif(s)`);
  }
  // Garde : tant que la question est active, son lien et son jumeau restent.
  const tutoId = (await queryOne("SELECT id FROM tutorials WHERE slug = 'rempotage'")).id;
  await execute("UPDATE quiz_questions SET statut = 'actif' WHERE question_code = 'QF9214'");
  await execute(
    `INSERT INTO resource_question_links (resource_type, resource_ref, question_code, is_gating, origin, status)
     VALUES ('tutorial', ?, 'QF9214', 1, 'import', 'approved')`,
    [String(tutoId)],
  );
  await execute(
    "INSERT INTO quiz_question_tutorials (question_code, tutorial_id) VALUES ('QF9214', ?)",
    [tutoId],
  );
  try {
    const garde = STATEMENTS.filter((stmt) =>
      /^DELETE FROM (quiz_question_tutorials|resource_question_links)\s/.test(stmt),
    );
    assert.equal(garde.length, 2);
    for (const stmt of garde) assert.equal((await execute(stmt)).affectedRows, 0);
    assert.equal(await lien('rempotage', 'QF9214'), 1);
    assert.equal(await jumeau('rempotage', 'QF9214'), 1);
  } finally {
    // Retour à l'état posé par la migration : question retirée, lien et jumeau supprimés.
    await execute("UPDATE quiz_questions SET statut = 'inactif' WHERE question_code = 'QF9214'");
    await runMigration();
  }
  assert.equal(await lien('rempotage', 'QF9214'), 0);
  assert.equal(await jumeau('rempotage', 'QF9214'), 0);
});

// ---------------------------------------------------------------------------------------
// Parents minimaux semés
// ---------------------------------------------------------------------------------------

test('contenus du 20/11 : semis des parents minimaux', async () => {
  for (const name of ESPECES) {
    const added = await seedIfAbsent(
      'SELECT id FROM plants WHERE name = ?',
      [name],
      'INSERT INTO plants (name, emoji, description) VALUES (?, ?, ?)',
      [name, '🌱', 'parent semé pour la reprise du 20/11'],
      'DELETE FROM plants WHERE name = ? AND description = ?',
      [name, 'parent semé pour la reprise du 20/11'],
    );
    if (added) plantIds[name] = await plantId(name);
  }
  for (const map of Object.keys(ZONES_VISITE)) {
    await seedIfAbsent(
      'SELECT id FROM maps WHERE id = ?',
      [map],
      'INSERT INTO maps (id, label) VALUES (?, ?)',
      [map, `Site ${map}`],
      'DELETE FROM maps WHERE id = ?',
      [map],
    );
    await seedIfAbsent(
      'SELECT id FROM visit_zones WHERE id = ?',
      [ZONES_VISITE[map]],
      "INSERT INTO visit_zones (id, map_id, name, points) VALUES (?, ?, 'Zone semée', '[]')",
      [ZONES_VISITE[map], map],
      'DELETE FROM visit_zones WHERE id = ?',
      [ZONES_VISITE[map]],
    );
  }
  await seedIfAbsent(
    'SELECT id FROM zones WHERE id = ?',
    [ZONE_TRAVAIL.id],
    "INSERT INTO zones (id, name, map_id) VALUES (?, 'Zone de travail semée', ?)",
    [ZONE_TRAVAIL.id, ZONE_TRAVAIL.map],
    'DELETE FROM zones WHERE id = ?',
    [ZONE_TRAVAIL.id],
  );
  await seedIfAbsent(
    'SELECT id FROM map_markers WHERE id = ?',
    [REPERE.id],
    "INSERT INTO map_markers (id, x_pct, y_pct, label, map_id) VALUES (?, 10, 10, 'Repère semé', ?)",
    [REPERE.id, REPERE.map],
    'DELETE FROM map_markers WHERE id = ?',
    [REPERE.id],
  );
  await seedIfAbsent(
    "SELECT glossary_code FROM glossary_terms WHERE glossary_code = 'FM0010'",
    [],
    "INSERT INTO glossary_terms (glossary_code, terme, categorie) VALUES ('FM0010', 'Terme semé', 'reprise')",
    [],
    "DELETE FROM glossary_terms WHERE glossary_code = 'FM0010'",
    [],
  );
  // Clés : anciennes consignes ; « insectes-ordres » date d'avant le 20/11, « coleopteres » a
  // été retouchée depuis (date du jour) et ne doit donc pas être écrasée.
  await execute(
    `DELETE FROM id_keys WHERE slug IN (${SLUGS_CLES.map(() => '?').join(', ')})`,
    SLUGS_CLES,
  );
  for (const slug of SLUGS_CLES) {
    await execute(
      "INSERT INTO id_keys (slug, title, safety_note, updated_at) VALUES (?, ?, 'Ancienne consigne.', ?)",
      [slug, `Clé ${slug}`, slug === 'coleopteres' ? new Date() : AVANT],
    );
  }
  const keyId = (await queryOne("SELECT id FROM id_keys WHERE slug = 'oiseaux-eau-daya'")).id;
  for (const number of [3, 4]) {
    coupletIds[number] = (
      await execute('INSERT INTO id_key_couplets (key_id, number) VALUES (?, ?)', [keyId, number])
    ).insertId;
  }
  await seedLead(coupletIds[4], 0, 'Tête vert bouteille', await plantId('Massette'));
  await seedLead(coupletIds[4], 1, 'Proposition en double', await plantId('Nette rousse'));

  // Séances dans leur ancienne forme (sept étapes) : la première date d'avant le 20/11, la
  // seconde a été retouchée depuis.
  await execute(
    `DELETE FROM pedago_sessions WHERE slug IN (${SEANCES.map(() => '?').join(', ')})`,
    SEANCES,
  );
  for (const [slug, updatedAt] of [
    ['6e-pas-la-par-hasard', AVANT],
    ['6e-mauvaise-saison', new Date()],
  ]) {
    await execute(
      `INSERT INTO pedago_sessions
         (id, slug, title, level, template_key, config_json, steps_json, is_published, updated_at)
       VALUES (UUID(), ?, ?, 'college', 'custom', '{}', ?, 1, ?)`,
      [slug, `Séance ${slug}`, sevenSteps(), updatedAt],
    );
  }
  await execute(
    `INSERT INTO map_species (map_id, plant_id, validation_status) VALUES ('sablettes', ?, 'documentaire')
     ON DUPLICATE KEY UPDATE validation_status = 'documentaire'`,
    [await plantId('Gracilaire cervicorne')],
  );
});

test('contenus du 20/11 : le doublon de clé n’est supprimé que si l’espèce reste atteinte', async () => {
  // Couplet n° 4 seul à mener à l'espèce : la proposition est conservée.
  await runMigration();
  assert.deepEqual(
    (await leadsOf(4)).map((r) => r.name),
    ['Massette', 'Nette rousse'],
  );
  // Le couplet n° 3 y mène aussi : le doublon du couplet n° 4 disparaît, pas l'autre.
  await seedLead(coupletIds[3], 0, 'Mâle à tête rousse', await plantId('Nette rousse'));
  await runMigration();
  assert.deepEqual(
    (await leadsOf(4)).map((r) => r.name),
    ['Massette'],
  );
  assert.deepEqual(
    (await leadsOf(3)).map((r) => r.name),
    ['Nette rousse'],
  );
});

test('contenus du 20/11 : questions, notions et liens rejoignent leurs parents', async () => {
  assert.equal(await count(`SELECT COUNT(*) AS n FROM quiz_questions WHERE ${RANGE}`), 61);
  assert.equal(
    await count(`SELECT COUNT(*) AS n FROM quiz_question_notions WHERE ${RANGE}`),
    RANGE_NOTIONS_APRES_REJEU,
  );
  assert.equal(
    await count(
      `SELECT COUNT(*) AS n FROM quiz_question_notions
        WHERE ${RANGE} AND mode = 'exclusion' AND notion_id = '2-MICRO'`,
    ),
    4,
  );
  // Lien vers une fiche : résolu par nom, sur l'identifiant de CETTE base.
  const massette = await plantId('Massette');
  const fiche = await queryOne(
    `SELECT is_gating, origin, status, weight, created_by_user_id FROM resource_question_links
      WHERE resource_type = 'plant' AND resource_ref = ? AND question_code = 'QF9929'`,
    [String(massette)],
  );
  assert.deepEqual(
    { ...fiche, is_gating: Number(fiche.is_gating), weight: Number(fiche.weight) },
    { is_gating: 0, origin: 'manual', status: 'approved', weight: 1, created_by_user_id: null },
  );
  // Lien repris d'une ancienne version : note d'origine, terme de glossaire par code.
  const glossaire = await queryOne(
    `SELECT is_gating, note FROM resource_question_links
      WHERE resource_type = 'glossary' AND resource_ref = 'FM0010' AND question_code = 'QF9880'`,
  );
  assert.equal(Number(glossaire.is_gating), 1);
  assert.match(glossaire.note, /^Repris de QF0010 /);
  // Aucun lien vers une ressource absente.
  assert.equal(
    await count(
      `SELECT COUNT(*) AS n FROM resource_question_links l
        WHERE l.${RANGE} AND l.resource_type = 'plant'
          AND NOT EXISTS (SELECT 1 FROM plants p WHERE p.id = l.resource_ref)`,
    ),
    0,
  );
});

test('contenus du 20/11 : tutoriels rattachés aux zones, aux repères et à la Visite', async () => {
  assert.equal(
    await count(
      `SELECT COUNT(*) AS n FROM tutorial_zones z
         JOIN tutorials t ON t.id = z.tutorial_id AND t.slug = 'observer-a-la-boite-loupe'
        WHERE z.zone_id = ?`,
      [ZONE_TRAVAIL.id],
    ),
    1,
  );
  assert.equal(
    await count(
      `SELECT COUNT(*) AS n FROM tutorial_markers m
         JOIN tutorials t ON t.id = m.tutorial_id AND t.slug = 'observer-a-la-boite-loupe'
        WHERE m.marker_id = ?`,
      [REPERE.id],
    ),
    1,
  );
  // Le tutoriel « bienvenue » du site n'existe pas ici : sa ligne est sautée, pas les autres.
  const visite = await queryAll(
    `SELECT t.slug, vt.sort_order, vt.is_active FROM visit_tutorials vt
       JOIN tutorials t ON t.id = vt.tutorial_id
      WHERE vt.map_id = 'sablettes' ORDER BY vt.sort_order`,
  );
  assert.deepEqual(
    visite.map((r) => `${r.sort_order}:${r.slug}:${r.is_active}`),
    ['0:securite-sur-l-estran:1', '2:observer-aux-jumelles:1', '3:observer-sans-deranger:1'],
  );
  // Deux médias par zone de visite semée, légende avec crédit, lien d'image seulement.
  for (const zone of Object.values(ZONES_VISITE)) {
    const medias = await queryAll(
      "SELECT image_url, image_path, caption, sort_order FROM visit_media WHERE target_type = 'zone' AND target_id = ? ORDER BY sort_order",
      [zone],
    );
    assert.deepEqual(
      medias.map((m) => m.sort_order),
      [0, 1],
    );
    for (const m of medias) {
      assert.match(m.image_url, /^https:\/\//);
      assert.equal(m.image_path, null);
      assert.match(m.caption, /Photo : /);
    }
  }
  // Une zone non semée ne reçoit rien (58 médias en production, 6 ici).
  assert.equal(
    await count(
      "SELECT COUNT(*) AS n FROM visit_media WHERE target_type = 'zone' AND image_path IS NULL AND image_url LIKE 'https://%'",
    ),
    6,
  );
});

test('contenus du 20/11 : consignes de sécurité, gardées par la date du 20/11', async () => {
  const note = async (slug) =>
    (await queryOne('SELECT safety_note FROM id_keys WHERE slug = ?', [slug])).safety_note;
  assert.match(
    await note('insectes-ordres'),
    /^On observe sans toucher : abeilles et guêpes piquent/,
  );
  // Clé retouchée après le 20/11 : son texte n'est pas écrasé.
  assert.equal(await note('coleopteres'), 'Ancienne consigne.');
  assert.equal(await note('arbres-palmiers'), 'Ancienne consigne.');
});

test('contenus du 20/11 : séances créées, ramenées à six étapes, réglées', async () => {
  const session = (slug) => queryOne('SELECT * FROM pedago_sessions WHERE slug = ?', [slug]);
  const massette = await plantId('Massette');

  const eau = await session('6e-eau-de-nos-lieux');
  assert.equal(eau.is_published, 1);
  assert.equal(eau.map_id, 'dayat');
  assert.equal(eau.created_by, null);
  const etapesEau = JSON.parse(eau.steps_json);
  assert.equal(etapesEau.length, 5);
  assert.equal(etapesEau[3].action.payload.plantId, massette);
  assert.equal(etapesEau[4].action.payload.questionCode, 'QF9877');
  assert.equal(JSON.parse(eau.config_json).mapId, 'dayat');

  // La séance d'inventaire est créée en brouillon et le reste.
  const inventaire = await session('6e-inventaire-n3');
  assert.equal(inventaire.is_published, 0);
  assert.equal(
    JSON.parse(inventaire.steps_json)[1].action.payload.keyIdOrSlug,
    'animaux-grands-groupes',
  );

  // Ancienne forme datée d'avant le 20/11 : six étapes, fiches résolues par nom.
  const hasard = JSON.parse((await session('6e-pas-la-par-hasard')).steps_json);
  assert.equal(hasard.length, 6);
  assert.deepEqual(
    hasard.slice(0, 4).map((s) => s.action.payload.plantId),
    [
      massette,
      await plantId('Lentisque'),
      await plantId('Patelle rustique'),
      await plantId('Talitre (puce de mer)'),
    ],
  );
  // Séance retouchée après le 20/11 : laissée telle quelle.
  assert.equal(JSON.parse((await session('6e-mauvaise-saison')).steps_json).length, 7);

  // Clé de la séance « Reconnaître sans toucher », écriture JSON d'origine conservée.
  const reconnaitre = await session('college-reconaitre-sans-toucher');
  assert.equal(JSON.parse(reconnaitre.config_json).keyIdOrSlug, 'arbres-palmiers');
  assert.equal(
    reconnaitre.config_json,
    configReconnaitre.replace(/"keyIdOrSlug":(\s?)null/, '"keyIdOrSlug":$1"arbres-palmiers"'),
  );
});

test('contenus du 20/11 : photos proposées et registre de présence', async () => {
  const photos = await queryAll(
    `SELECT ph.kind, ph.url, ph.confirmed, ph.source, ph.licence FROM plant_photos ph
       JOIN plants p ON p.id = ph.plant_id WHERE p.name = 'Phytoplancton'`,
  );
  assert.equal(photos.length, 1);
  assert.deepEqual(
    { kind: photos[0].kind, confirmed: photos[0].confirmed, source: photos[0].source },
    { kind: 'photo', confirmed: 0, source: 'wikimedia_commons' },
  );
  assert.match(photos[0].url, /^https:\/\/upload\.wikimedia\.org\//);
  const registre = await queryOne(
    `SELECT ms.validation_status FROM map_species ms
       JOIN plants p ON p.id = ms.plant_id AND p.name = 'Gracilaire cervicorne'
      WHERE ms.map_id = 'sablettes'`,
  );
  assert.equal(registre.validation_status, 'a_confirmer');
});

// ---------------------------------------------------------------------------------------
// Rejeu
// ---------------------------------------------------------------------------------------

test('contenus du 20/11 : rejouée deux fois, mêmes comptes, aucune ligne touchée', async () => {
  const avant = await tableCounts();
  const sessionsAvant = await queryAll(
    'SELECT slug, steps_json, config_json, is_published FROM pedago_sessions ORDER BY slug',
  );
  const second = await runMigration();
  const third = await runMigration();
  assert.ok(
    second.every((n) => n === 0),
    `second passage : ${second.join(' ')}`,
  );
  assert.ok(
    third.every((n) => n === 0),
    `troisième passage : ${third.join(' ')}`,
  );
  assert.deepEqual(await tableCounts(), avant);
  assert.deepEqual(
    await queryAll(
      'SELECT slug, steps_json, config_json, is_published FROM pedago_sessions ORDER BY slug',
    ),
    sessionsAvant,
  );
  assert.equal(
    await count(
      "SELECT COUNT(*) AS n FROM pedago_sessions WHERE slug = '6e-inventaire-n3' AND is_published = 1",
    ),
    0,
  );
});

test('contenus du 20/11 : zéro doublon sur les clés naturelles', async () => {
  const doublons = async (table, cols, where = '1 = 1') =>
    (
      await queryAll(
        `SELECT ${cols}, COUNT(*) AS n FROM ${table} WHERE ${where} GROUP BY ${cols} HAVING COUNT(*) > 1`,
      )
    ).length;
  assert.equal(
    await doublons('visit_media', 'target_type, target_id, image_url', 'image_url IS NOT NULL'),
    0,
  );
  assert.equal(
    await doublons(
      'plant_photos',
      'plant_id, url',
      "plant_id IN (SELECT id FROM plants WHERE name IN ('Phytoplancton', 'Zooplancton'))",
    ),
    0,
  );
  assert.equal(await doublons('tutorials', 'slug'), 0);
  assert.equal(await doublons('pedago_sessions', 'slug'), 0);
  assert.equal(
    await doublons('resource_question_links', 'resource_type, resource_ref, question_code'),
    0,
  );
  assert.equal(await doublons('quiz_questions', 'categorie_slug, numero_dans_categorie'), 0);
});
