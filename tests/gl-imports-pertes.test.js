'use strict';

/**
 * Audit des bugs G&L du 19 novembre 2026, lot 8 — imports de contenu qui perdent des données.
 *
 * - C5  : exporter puis importer le glossaire du lore effaçait les « termes liés » ;
 * - C6  : un import de QCM (biomes ou lore) supprimait les liens glossaire des questions
 *         absentes du fichier et remettait `is_gating` à 0 sur ceux qu'il recréait ; l'import
 *         lore écrivait hors transaction ;
 * - C11 : lignes de feuillets sans code passées sous silence, imports du lore et de la charte
 *         écrits ligne à ligne hors transaction ;
 * - C12 : catalogues de la Trame remplacés en bloc sans transaction.
 */

require('./helpers/setup');
const fs = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const { createGlAdmin, signTokens } = require('./helpers/glFixtures');
const { buildWorkbookBuffer } = require('../lib/spreadsheet');
const {
  applyLoreGlossaryImport,
  parseLoreGlossaryWorkbook,
  buildLoreGlossaryExportWorkbook,
  loadLoreGlossaryExportRows,
} = require('../lib/glLoreGlossaryImport');
const { applyQcmImport } = require('../lib/glQcmImport');
const { applyQcmLoreImport } = require('../lib/glQcmLoreImport');
const { applyFeuilletsImport, parseFeuilletsWorkbook } = require('../lib/glLoreFeuilletsImport');
const { IMPORTERS } = require('../lib/glTenirImport');

const { queryAll, queryOne, execute } = db;
const deps = { queryAll, queryOne, execute };
const EXEMPLE = path.join(__dirname, '..', 'data', 'gl', 'tenir', 'exemple');
const lire = (nom) => JSON.parse(fs.readFileSync(path.join(EXEMPLE, `${nom}.json`), 'utf8'));

let adminToken = null;

async function nettoyer() {
  await execute(
    `DELETE FROM gl_resource_question_links
      WHERE question_code IN ('QCM9801', 'QCM9802', 'LQCM9801', 'LQCM9802', 'LQCM9811', 'LQCM9812')`,
  );
  await execute("DELETE FROM gl_qcm_questions WHERE question_code IN ('QCM9801', 'QCM9802')");
  await execute("DELETE FROM gl_qcm_lore_questions WHERE question_code LIKE 'LQCM98%'");
  await execute("DELETE FROM gl_qcm_categories WHERE slug = 'lot8-cat'");
  await execute("DELETE FROM gl_qcm_lore_categories WHERE slug IN ('lot8-cat', 'lot8-cat-tx')");
  await execute("DELETE FROM gl_qcm_lore_scopes WHERE slug IN ('lot8-scope', 'lot8-scope-tx')");
  await execute("DELETE FROM gl_glossary_terms WHERE glossary_code IN ('GLZ8A', 'GLZ8B')");
  await execute("DELETE FROM gl_lore_glossary_terms WHERE lore_code LIKE 'LRZ8%'");
  await execute("DELETE FROM gl_lore_plateaux WHERE zone_label LIKE 'Lot8 %'");
  await execute("DELETE FROM gl_chapters WHERE slug LIKE 'lot8-charte-%'");
}

before(async () => {
  await db.initSchema();
  await nettoyer();
  const admin = await createGlAdmin({ email: `gl.lot8.${Date.now()}@ecole.local` });
  ({ adminToken } = await signTokens({
    adminId: admin.id,
    adminPermissions: ['gl.read', 'gl.content.manage'],
  }));
});

after(nettoyer);

const base64 = (buffer) => buffer.toString('base64');
const postImport = (url, buffer) =>
  request(app)
    .post(url)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ fileDataBase64: base64(buffer), dryRun: false });

// ---------------------------------------------------------------------------------------------
// C5 — glossaire du lore : aller-retour export → import
// ---------------------------------------------------------------------------------------------

const GLOSSAIRE_ENTETES = ['id', 'terme', 'categorie', 'niveau', 'termes_lies', 'statut'];

async function semerTermesLore() {
  for (const [code, terme] of [
    ['LRZ8A', 'Zlot huit alpha'],
    ['LRZ8B', 'Zlot huit bêta'],
    ['LRZ8C', 'Zlot huit gamma'],
  ]) {
    await execute(
      `INSERT INTO gl_lore_glossary_terms (lore_code, terme, categorie, niveau, statut, created_at, updated_at)
       VALUES (?, ?, 'concept', 'recit', 'actif', NOW(), NOW())
       ON DUPLICATE KEY UPDATE terme = VALUES(terme)`,
      [code, terme],
    );
  }
  await execute("DELETE FROM gl_lore_glossary_relations WHERE from_code LIKE 'LRZ8%'");
  await execute(
    "INSERT INTO gl_lore_glossary_relations (from_code, to_code) VALUES ('LRZ8A', 'LRZ8B'), ('LRZ8A', 'LRZ8C')",
  );
}

const relationsDe = async (code) =>
  (
    await queryAll(
      'SELECT to_code FROM gl_lore_glossary_relations WHERE from_code = ? ORDER BY to_code ASC',
      [code],
    )
  ).map((r) => String(r.to_code));

test('C5 — exporter puis importer le glossaire du lore garde les termes liés', async () => {
  await semerTermesLore();
  const rows = (await loadLoreGlossaryExportRows(deps, 'actif')).filter((r) =>
    String(r.lore_code).startsWith('LRZ8'),
  );
  assert.equal(rows.length, 3);
  const buffer = await buildLoreGlossaryExportWorkbook(rows);
  const { glossaryRows } = await parseLoreGlossaryWorkbook(buffer);
  const exportee = glossaryRows.find((r) => String(r.id) === 'LRZ8A');
  assert.ok(String(exportee.termes_lies || '').trim(), 'la colonne termes_lies est exportée');

  await applyLoreGlossaryImport(deps, glossaryRows, { dryRun: false });
  assert.deepEqual(await relationsDe('LRZ8A'), ['LRZ8B', 'LRZ8C']);
});

test('C5 — cellule termes_lies vide : relations intactes ; un tiret les vide ; une liste les remplace', async () => {
  await semerTermesLore();
  const classeur = (termesLies) =>
    buildWorkbookBuffer([
      {
        name: 'glossaire',
        aoa: [
          GLOSSAIRE_ENTETES,
          ['LRZ8A', 'Zlot huit alpha', 'concept', 'recit', termesLies, 'actif'],
        ],
      },
    ]);
  const importer = async (termesLies) => {
    const { glossaryRows } = await parseLoreGlossaryWorkbook(await classeur(termesLies));
    return applyLoreGlossaryImport(deps, glossaryRows, { dryRun: false });
  };

  await importer('');
  assert.deepEqual(await relationsDe('LRZ8A'), ['LRZ8B', 'LRZ8C'], 'cellule vide = inchangé');

  await importer('Zlot huit gamma');
  assert.deepEqual(await relationsDe('LRZ8A'), ['LRZ8C'], 'cellule remplie = remplacement');

  await importer('-');
  assert.deepEqual(await relationsDe('LRZ8A'), [], 'un tiret vide les relations du terme');
});

// ---------------------------------------------------------------------------------------------
// C6 — liens glossaire des QCM
// ---------------------------------------------------------------------------------------------

const liensDe = async (dataset, code) =>
  queryAll(
    `SELECT resource_ref, is_gating, origin FROM gl_resource_question_links
      WHERE question_dataset = ? AND question_code = ? ORDER BY resource_ref ASC`,
    [dataset, code],
  );

async function poserLien(dataset, type, code, ref, isGating) {
  await execute(
    `INSERT INTO gl_resource_question_links
       (question_dataset, question_code, resource_type, resource_ref, status, origin, is_gating)
     VALUES (?, ?, ?, ?, 'approved', 'import', ?)
     ON DUPLICATE KEY UPDATE origin = 'import', status = 'approved', is_gating = VALUES(is_gating)`,
    [dataset, code, type, ref, isGating],
  );
}

test('C6 — import QCM biomes : liens des questions absentes et is_gating du MJ conservés', async () => {
  const biome = await queryOne('SELECT slug FROM gl_biomes ORDER BY slug ASC LIMIT 1');
  assert.ok(biome, 'un biome en base');
  for (const [code, terme] of [
    ['GLZ8A', 'zlothuitalpha'],
    ['GLZ8B', 'zlothuitbeta'],
  ]) {
    await execute(
      `INSERT INTO gl_glossary_terms (glossary_code, terme, categorie, statut, created_at, updated_at)
       VALUES (?, ?, 'ecologie', 'actif', NOW(), NOW())
       ON DUPLICATE KEY UPDATE terme = VALUES(terme), statut = 'actif'`,
      [code, terme],
    );
  }
  const categorie = { categorie_slug: 'lot8-cat', categorie_nom: 'Lot 8' };
  const question = (id, tags) => ({
    id,
    biome_slug: biome.slug,
    categorie_slug: 'lot8-cat',
    numero_dans_categorie: id,
    question: `Question du lot 8 numéro ${id} ?`,
    choix_a: 'Un',
    choix_b: 'Deux',
    choix_c: 'Trois',
    choix_d: 'Quatre',
    reponse_correcte: 'A',
    tags,
  });
  // Premier import : les deux questions, chacune liée à un terme par ses mots-clés.
  await applyQcmImport(
    deps,
    [categorie],
    [question(9801, 'zlothuitalpha, zlothuitbeta'), question(9802, 'zlothuitbeta')],
  );
  assert.deepEqual(
    (await liensDe('qcm', 'QCM9801')).map((l) => l.resource_ref),
    ['GLZ8A', 'GLZ8B'],
  );
  assert.equal((await liensDe('qcm', 'QCM9802')).length, 1);
  // Le MJ rend un lien « bloquant ».
  await poserLien('qcm', 'glossary', 'QCM9801', 'GLZ8A', 1);

  // Second import : un fichier qui ne porte que QCM9801, sans le mot-clé du second terme.
  await applyQcmImport(deps, [categorie], [question(9801, 'zlothuitalpha')]);

  assert.equal(
    (await liensDe('qcm', 'QCM9802')).length,
    1,
    'le lien de la question absente du fichier survit',
  );
  const liens = await liensDe('qcm', 'QCM9801');
  assert.deepEqual(
    liens.map((l) => l.resource_ref),
    ['GLZ8A'],
    'le lien qui ne correspond plus est retiré',
  );
  assert.equal(Number(liens[0].is_gating), 1, 'le conditionnement posé par le MJ est gardé');
});

const loreScope = (slug) => ({ chapitre_slug: slug, chapitre_nom: 'Lot 8' });
const loreCategorie = (slug) => ({ categorie_slug: slug, categorie_nom: 'Lot 8' });
const loreQuestion = (id, extra = {}) => ({
  id,
  chapitre_slug: 'lot8-scope',
  categorie_slug: 'lot8-cat',
  numero_dans_categorie: id,
  tier_lore: 'recit',
  question: `Question lore du lot 8 numéro ${id} ?`,
  choix_a: 'Un',
  choix_b: 'Deux',
  reponse_correcte: 'A',
  ...extra,
});

test('C6 — import QCM lore : liens des questions absentes et is_gating du MJ conservés', async () => {
  await semerTermesLore();
  const scopes = [loreScope('lot8-scope')];
  const categories = [loreCategorie('lot8-cat')];
  await applyQcmLoreImport(deps, scopes, categories, [
    loreQuestion(9801, { tags: 'Zlot huit alpha, Zlot huit bêta' }),
    loreQuestion(9802, { tags: 'Zlot huit bêta' }),
  ]);
  assert.deepEqual(
    (await liensDe('qcm_lore', 'LQCM9801')).map((l) => l.resource_ref),
    ['LRZ8A', 'LRZ8B'],
  );
  assert.equal((await liensDe('qcm_lore', 'LQCM9802')).length, 1);
  await poserLien('qcm_lore', 'lore_glossary', 'LQCM9801', 'LRZ8A', 1);

  await applyQcmLoreImport(deps, scopes, categories, [
    loreQuestion(9801, { tags: 'Zlot huit alpha' }),
  ]);

  assert.equal((await liensDe('qcm_lore', 'LQCM9802')).length, 1);
  const liens = await liensDe('qcm_lore', 'LQCM9801');
  assert.deepEqual(
    liens.map((l) => l.resource_ref),
    ['LRZ8A'],
  );
  assert.equal(Number(liens[0].is_gating), 1);
});

test('C6 — import QCM lore : une ligne en échec annule tout l’import (transaction)', async () => {
  const entetes = [
    'id',
    'chapitre_slug',
    'categorie_slug',
    'numero_dans_categorie',
    'tier_lore',
    'question',
    'choix_a',
    'choix_b',
    'reponse_correcte',
    'source_lore',
  ];
  const ligne = (id, source) => [
    id,
    'lot8-scope-tx',
    'lot8-cat-tx',
    id,
    'recit',
    `Question ${id} ?`,
    'Un',
    'Deux',
    'A',
    source,
  ];
  const buffer = await buildWorkbookBuffer([
    {
      name: 'chapitres',
      aoa: [
        ['chapitre_slug', 'chapitre_nom'],
        ['lot8-scope-tx', 'Lot 8'],
      ],
    },
    {
      name: 'categories',
      aoa: [
        ['categorie_slug', 'categorie_nom'],
        ['lot8-cat-tx', 'Lot 8'],
      ],
    },
    // `source_lore` est un VARCHAR(255) : la seconde ligne échoue à l'écriture.
    { name: 'questions', aoa: [entetes, ligne(9811, 'Codex'), ligne(9812, 'x'.repeat(400))] },
  ]);
  const res = await postImport('/api/gl/lore/admin/qcm/import', buffer);
  assert.ok(res.status >= 400, `import refusé (statut ${res.status})`);
  assert.equal(
    await queryOne(
      "SELECT question_code FROM gl_qcm_lore_questions WHERE question_code = 'LQCM9811'",
    ),
    undefined,
    'la première question ne reste pas en base',
  );
  assert.equal(
    await queryOne("SELECT slug FROM gl_qcm_lore_categories WHERE slug = 'lot8-cat-tx'"),
    undefined,
    'la catégorie non plus',
  );
});

// ---------------------------------------------------------------------------------------------
// C11 — imports du lore et de la charte
// ---------------------------------------------------------------------------------------------

test('C11 — feuillets : une ligne sans code figure dans le rapport', async () => {
  const buffer = await buildWorkbookBuffer([
    {
      name: 'feuillets',
      aoa: [
        ['code', 'type', 'titre'],
        ['', 'feuillet', 'Sans code'],
        ['lot8-feuillet-ok', 'feuillet', 'Avec code'],
      ],
    },
  ]);
  const parsed = await parseFeuilletsWorkbook(buffer);
  assert.equal(parsed.rowErrors.length, 1);
  const writes = [];
  const report = await applyFeuilletsImport(
    {
      queryAll: async () => [],
      execute: async (sql) => {
        writes.push(sql);
        return { affectedRows: 1 };
      },
    },
    parsed,
    { dryRun: true },
  );
  assert.equal(report.feuillets.upserted, 1);
  assert.equal(report.feuillets.skipped, 1, 'la ligne ignorée est comptée');
  assert.equal(report.feuillets.errors.length, 1);
  assert.equal(report.feuillets.errors[0].row, 2);
  assert.match(report.feuillets.errors[0].error, /Code feuillet obligatoire/);
  assert.equal(writes.length, 0);
});

test('C11 — import feuillets : un plateau en échec annule ceux déjà écrits (transaction)', async () => {
  const buffer = await buildWorkbookBuffer([
    {
      name: 'feuillets',
      aoa: [
        ['code', 'type', 'titre'],
        ['', 'feuillet', 'Ligne ignorée'],
      ],
    },
    {
      name: 'plateaux',
      // `zone_label` est un VARCHAR(120) : le second plateau échoue à l'écriture.
      aoa: [
        ['plateau', 'zone'],
        [1, 'Lot8 zone témoin'],
        [2, `Lot8 ${'z'.repeat(200)}`],
      ],
    },
  ]);
  const res = await postImport('/api/gl/lore/admin/feuillets/import', buffer);
  assert.ok(res.status >= 400, `import refusé (statut ${res.status})`);
  assert.equal(
    await queryOne("SELECT id FROM gl_lore_plateaux WHERE zone_label = 'Lot8 zone témoin'"),
    undefined,
  );
});

test('C11 — import glossaire lore : une ligne en échec annule tout l’import (transaction)', async () => {
  await execute("DELETE FROM gl_lore_glossary_terms WHERE lore_code = 'LRZ8T1'");
  const buffer = await buildWorkbookBuffer([
    {
      name: 'glossaire',
      aoa: [
        GLOSSAIRE_ENTETES,
        ['LRZ8T1', 'Zlot huit témoin', 'concept', 'recit', '', 'actif'],
        // `lore_code` est un VARCHAR(16) : la seconde ligne échoue à l'écriture.
        ['LRZ8-CODE-BEAUCOUP-TROP-LONG', 'Zlot huit trop long', 'concept', 'recit', '', 'actif'],
      ],
    },
  ]);
  const res = await postImport('/api/gl/lore/admin/glossary/import', buffer);
  assert.ok(res.status >= 400, `import refusé (statut ${res.status})`);
  assert.equal(
    await queryOne("SELECT lore_code FROM gl_lore_glossary_terms WHERE lore_code = 'LRZ8T1'"),
    undefined,
  );
});

test('C11 — import de la charte : une ligne en échec annule tout l’import (transaction)', async () => {
  const buffer = await buildWorkbookBuffer([
    {
      name: 'chapitres_charte',
      aoa: [
        ['slug', 'titre'],
        ['lot8-charte-temoin', 'Chapitre témoin du lot 8'],
        // `title` est un VARCHAR(180) : la seconde ligne échoue à l'écriture.
        ['lot8-charte-trop-long', 't'.repeat(300)],
      ],
    },
  ]);
  const res = await postImport('/api/gl/chapters/admin/charte/import', buffer);
  assert.ok(res.status >= 400, `import refusé (statut ${res.status})`);
  assert.equal(
    await queryOne("SELECT id FROM gl_chapters WHERE slug = 'lot8-charte-temoin'"),
    undefined,
  );
});

// ---------------------------------------------------------------------------------------------
// C12 — catalogues de la Trame
// ---------------------------------------------------------------------------------------------

/**
 * Base dont le N-ième `INSERT` dans `table` échoue — y compris dans une transaction, pour que
 * le test reste probant une fois les écritures passées sous `withTransaction`.
 */
function baseQuiEchoue(table, rang = 2) {
  const motif = new RegExp(`INSERT\\s+(IGNORE\\s+)?INTO\\s+${table}\\b`, 'i');
  let vus = 0;
  const piege = (executeReel) => async (sql, params) => {
    if (motif.test(String(sql))) {
      vus += 1;
      if (vus === rang) throw new Error(`panne simulée sur ${table}`);
    }
    return executeReel(sql, params);
  };
  return {
    queryAll: db.queryAll,
    queryOne: db.queryOne,
    execute: piege(db.execute),
    withTransaction: (work, options) =>
      db.withTransaction((tx) => work({ ...tx, execute: piege(tx.execute) }), options),
  };
}

const CAS_TRAME = [
  ['trame-reseaux', 'gl_trame_cartes', "biome IN ('jungle_afc', 'savane')"],
  ['trame-reseaux', 'gl_trame_liens', "biome IN ('jungle_afc', 'savane')"],
  ['trame-fils', 'gl_trame_fils_cartes', 'plateau = 1'],
  ['trame-fils', 'gl_trame_fils_liens', 'plateau = 1'],
  ['trame-reparer', 'gl_trame_reparer_especes', 'plateau = 1'],
  ['trame-reparer', 'gl_trame_reparer_a_classer', 'plateau = 1'],
  [
    'trame-ranger',
    'gl_trame_ranger_cartes',
    "jeu_code IN ('role-jungle_afc', 'role-savane', 'pays-p1')",
  ],
  ['trame-adaptations', 'gl_trame_adaptation_cartes', "biome IN ('jungle_afc', 'savane')"],
  ['trame-adaptations', 'gl_trame_adaptation_liens', "biome IN ('jungle_afc', 'savane')"],
];

test('C12 — Trame : un INSERT en échec ne laisse aucun catalogue amputé', async () => {
  const compte = async (table, where) =>
    Number((await queryOne(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`)).n);
  for (const fichier of new Set(CAS_TRAME.map(([f]) => f))) {
    const rep = await IMPORTERS[fichier](db, lire(fichier), {});
    assert.deepEqual(rep.errors, [], `${fichier} : ${rep.errors.join(' | ')}`);
  }
  for (const [fichier, table] of CAS_TRAME) {
    const tables = CAS_TRAME.filter(([f]) => f === fichier);
    const avant = {};
    for (const [, t, w] of tables) avant[t] = await compte(t, w);
    assert.ok(avant[table] > 0, `${table} : contenu de départ`);
    await assert.rejects(
      () => IMPORTERS[fichier](baseQuiEchoue(table), lire(fichier), {}),
      /panne simulée/,
    );
    const apres = {};
    for (const [, t, w] of tables) apres[t] = await compte(t, w);
    assert.deepEqual(apres, avant, `${fichier} : panne sur ${table}`);
  }
});
