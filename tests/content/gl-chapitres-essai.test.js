'use strict';

/**
 * Chapitres d'essai « test » et « foret-magique » : ils restent en base mais hors plateau
 * (`plateau_number IS NULL`), donc hors de tout sélecteur (console MJ : `glChapterOptions.js`),
 * compteur et contrôle de contenu de plateau (`WHERE ch.plateau_number BETWEEN 1 AND 4`).
 * Test de CONTENU : un chapitre d'essai qui recevrait un numéro de plateau réapparaîtrait
 * partout. Sur une base sans ces chapitres (CI, base neuve), le contrôle le dit et passe.
 */

require('../helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../database');

const SLUGS_ESSAI = ['test', 'foret-magique'];

test('les chapitres d’essai restent hors plateau', async (t) => {
  await db.initSchema();
  const rows = await db.queryAll(
    `SELECT slug, plateau_number FROM gl_chapters WHERE slug IN (${SLUGS_ESSAI.map(() => '?').join(', ')})`,
    SLUGS_ESSAI,
  );
  if (!rows.length) {
    t.diagnostic('Aucun chapitre d’essai en base (base neuve) : contrôle sauté');
    return;
  }
  assert.deepEqual(
    rows.filter((r) => r.plateau_number != null).map((r) => r.slug),
    [],
    'chapitre d’essai rattaché à un plateau : il sortirait dans les sélecteurs et les contrôles',
  );
});

test('les plateaux 1 à 4 ne sont portés que par des chapitres joués (un chapitre par plateau)', async (t) => {
  await db.initSchema();
  const rows = await db.queryAll(
    `SELECT plateau_number, COUNT(*) AS c
       FROM gl_chapters
      WHERE plateau_number BETWEEN 1 AND 4 AND slug NOT LIKE 'tenir-ex-%'
        AND slug NOT LIKE 'ch-concu-%' AND slug NOT LIKE 'fst-%' AND slug NOT LIKE 'locks-ch-%'
      GROUP BY plateau_number HAVING c > 1`,
  );
  const any = await db.queryOne(
    "SELECT COUNT(*) AS c FROM gl_chapters WHERE plateau_number BETWEEN 1 AND 4 AND slug NOT LIKE 'tenir-ex-%'",
  );
  if (!Number(any?.c)) {
    t.diagnostic('Aucun chapitre de plateau 1-4 en base (base neuve) : contrôle sauté');
    return;
  }
  assert.deepEqual(
    rows.map((r) => `plateau ${r.plateau_number} : ${r.c} chapitres`),
    [],
    'deux chapitres sur le même plateau : le chargeur des catalogues prend le premier par id',
  );
});
