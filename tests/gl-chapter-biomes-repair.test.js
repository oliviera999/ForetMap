'use strict';

// Migration 177 — réparation du rattachement des contenus GL aux chapitres.
// Le rattachement d'une ressource (espèce, glossaire, QCM, feuillet) à un chapitre
// est déduit de `gl_chapter_biomes` : on vérifie ici les deux règles de réparation
// (chapitre de plateau sans biome → biomes du plateau ; chapitre hors plateau
// portant un biome de plateau → lien retiré), la garde qui protège un paramétrage
// éditorial existant, et l'idempotence.

require('./helpers/setup');
const fs = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { initSchema, execute, queryAll, queryOne, splitSqlStatements } = require('../database');

const MIGRATION_FILE = path.join(__dirname, '..', 'migrations', '177_gl_chapter_biomes_repair.sql');

const stamp = Date.now();
const PLATEAU_NUMBER = 99;
const SLUG_PLATEAU_VIDE = `repair-plateau-vide-${stamp}`;
const SLUG_PLATEAU_GARNI = `repair-plateau-garni-${stamp}`;
const SLUG_HORS_PLATEAU = `repair-hors-plateau-${stamp}`;
const ZONE_LABEL = `Repair ${stamp}`;

/** Deux biomes de la liste du plateau + un biome propre au chapitre hors plateau. */
let biomePlateauA = '';
let biomePlateauB = '';
let biomePropre = '';

/**
 * Rejoue le fichier de migration avec le découpage du runner (`splitSqlStatements`) :
 * les `;` présents dans les chaînes (`REPLACE(..., ';', ',')`) et dans les commentaires
 * ne doivent pas couper un statement.
 */
async function runMigration() {
  const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
  const statements = splitSqlStatements(sql);
  assert.strictEqual(statements.length, 2, 'la migration 177 doit tenir en 2 statements');
  for (const stmt of statements) await execute(stmt);
}

async function chapterIdBySlug(slug) {
  const row = await queryOne('SELECT id FROM gl_chapters WHERE slug = ? LIMIT 1', [slug]);
  return row ? Number(row.id) : null;
}

async function biomesOf(chapterId) {
  return queryAll(
    'SELECT biome_slug, order_index FROM gl_chapter_biomes WHERE chapter_id = ? ORDER BY order_index ASC, biome_slug ASC',
    [chapterId],
  );
}

async function createChapter(slug, plateauNumber) {
  await execute(
    `INSERT INTO gl_chapters (slug, title, plateau_number, order_index, created_at, updated_at)
     VALUES (?, ?, ?, 0, NOW(), NOW())`,
    [slug, `Chapitre ${slug}`, plateauNumber],
  );
  return chapterIdBySlug(slug);
}

before(async () => {
  await initSchema();

  // Trois biomes du catalogue réel qu'aucun chapitre de plateau ne porte déjà : les deux
  // premiers formeront la liste du plateau de test, le troisième restera propre au chapitre
  // hors plateau (sinon la règle [2] le retirerait, à juste titre). La BDD de test est
  // partagée entre fichiers : on ne présume donc pas de son contenu.
  const catalogue = (await queryAll('SELECT slug FROM gl_biomes ORDER BY order_index ASC')).map(
    (r) => String(r.slug),
  );
  const dejaSurUnPlateau = new Set(
    (
      await queryAll(
        `SELECT DISTINCT cb.biome_slug
           FROM gl_chapter_biomes cb
           INNER JOIN gl_chapters c ON c.id = cb.chapter_id
          WHERE c.plateau_number IS NOT NULL`,
      )
    ).map((r) => String(r.biome_slug)),
  );
  const libres = catalogue.filter((slug) => !dejaSurUnPlateau.has(slug));
  assert.ok(libres.length >= 3, 'il faut 3 biomes non portés par un chapitre de plateau');
  [biomePlateauA, biomePlateauB, biomePropre] = libres;

  await execute(
    `INSERT INTO gl_lore_plateaux (plateau_number, zone_label, biomes_slugs, created_at, updated_at)
     VALUES (?, ?, ?, NOW(), NOW())`,
    [PLATEAU_NUMBER, ZONE_LABEL, `${biomePlateauA}; ${biomePlateauB}`],
  );

  await createChapter(SLUG_PLATEAU_VIDE, PLATEAU_NUMBER);
  const idGarni = await createChapter(SLUG_PLATEAU_GARNI, PLATEAU_NUMBER);
  const idHors = await createChapter(SLUG_HORS_PLATEAU, null);

  // Chapitre de plateau déjà paramétré : un seul biome au lieu des deux du plateau — la
  // migration doit le laisser tel quel (elle ne complète pas un paramétrage partiel).
  await execute(
    'INSERT INTO gl_chapter_biomes (chapter_id, biome_slug, order_index) VALUES (?, ?, 0)',
    [idGarni, biomePlateauB],
  );
  // Chapitre hors plateau : un biome qui appartient au plateau + un biome bien à lui.
  await execute(
    'INSERT INTO gl_chapter_biomes (chapter_id, biome_slug, order_index) VALUES (?, ?, 0), (?, ?, 10)',
    [idHors, biomePlateauA, idHors, biomePropre],
  );

  await runMigration();
});

after(async () => {
  for (const slug of [SLUG_PLATEAU_VIDE, SLUG_PLATEAU_GARNI, SLUG_HORS_PLATEAU]) {
    await execute('DELETE FROM gl_chapters WHERE slug = ?', [slug]); // cascade sur gl_chapter_biomes
  }
  await execute('DELETE FROM gl_lore_plateaux WHERE zone_label = ?', [ZONE_LABEL]);
});

test('migration 177 : un chapitre de plateau sans biome reçoit les biomes de son plateau', async () => {
  const id = await chapterIdBySlug(SLUG_PLATEAU_VIDE);
  const rows = await biomesOf(id);
  assert.deepStrictEqual(
    rows.map((r) => [String(r.biome_slug), Number(r.order_index)]),
    [
      [biomePlateauA, 0],
      [biomePlateauB, 10],
    ],
    'les biomes du plateau doivent être posés dans l’ordre de la liste (0, 10)',
  );
});

test('migration 177 : un chapitre de plateau déjà paramétré n’est pas réécrit', async () => {
  const id = await chapterIdBySlug(SLUG_PLATEAU_GARNI);
  const rows = await biomesOf(id);
  assert.deepStrictEqual(
    rows.map((r) => String(r.biome_slug)),
    [biomePlateauB],
    'un choix éditorial existant ne doit jamais être écrasé',
  );
});

test('migration 177 : un chapitre hors plateau perd les biomes portés par un chapitre de plateau', async () => {
  const id = await chapterIdBySlug(SLUG_HORS_PLATEAU);
  const rows = await biomesOf(id);
  assert.deepStrictEqual(
    rows.map((r) => String(r.biome_slug)),
    [biomePropre],
    'le biome du plateau est retiré, le biome propre au chapitre est conservé',
  );
});

test('migration 177 : rejouée, elle ne change plus rien (idempotence)', async () => {
  const ids = {
    vide: await chapterIdBySlug(SLUG_PLATEAU_VIDE),
    garni: await chapterIdBySlug(SLUG_PLATEAU_GARNI),
    hors: await chapterIdBySlug(SLUG_HORS_PLATEAU),
  };
  const avant = {
    vide: await biomesOf(ids.vide),
    garni: await biomesOf(ids.garni),
    hors: await biomesOf(ids.hors),
  };
  await runMigration();
  assert.deepStrictEqual(await biomesOf(ids.vide), avant.vide);
  assert.deepStrictEqual(await biomesOf(ids.garni), avant.garni);
  assert.deepStrictEqual(await biomesOf(ids.hors), avant.hors);
});
