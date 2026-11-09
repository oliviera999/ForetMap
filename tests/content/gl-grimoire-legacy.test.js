'use strict';

/**
 * Grimoire « Tenir à deux » (règle § 10) : seuls les 25 sorts v2 sont lançables ; les anciens
 * sorts du tableur restent en base en `propose` (migration 340). Test de CONTENU : il porte sur
 * les lignes de `gl_spells` semées par les migrations. Sur une base sans sort (base neuve
 * avant semis), le contrôle le dit et passe.
 */

require('../helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../database');

test('aucun sort lançable (`officiel`) hors grimoire v2', async (t) => {
  await db.initSchema();
  const total = await db.queryOne('SELECT COUNT(*) AS c FROM gl_spells');
  if (!Number(total?.c)) {
    t.diagnostic('Aucun sort en base : contrôle sauté');
    return;
  }
  // Périmètre : les sorts présents quand le grimoire v2 a été semé (migration 333). Un sort
  // inséré plus tard (fixtures des suites de code : `npm test` précède `test:content` sur la
  // même base en CI ; import du tableur rejoué) n'est pas du corpus semé : en prod, c'est le
  // contrôle MCP `gl_spells_legacy` qui le relève.
  const legacy = await db.queryAll(
    `SELECT spell_code, nom, statut, tenir_v2, famille
       FROM gl_spells
      WHERE statut = 'officiel' AND (tenir_v2 IS NULL OR tenir_v2 = 0 OR famille IS NULL)
        AND created_at <= COALESCE(
          (SELECT MAX(created_at) FROM gl_spells s2 WHERE s2.tenir_v2 = 1), NOW())
      ORDER BY spell_code`,
  );
  assert.deepEqual(
    legacy.map((s) => `${s.spell_code} ${s.nom}`),
    [],
    'sort hérité encore `officiel` : il doit passer en `propose` (non lançable)',
  );
});

test('les sorts v2 officiels portent famille, fenêtre et exécution', async (t) => {
  await db.initSchema();
  const v2 = await db.queryAll(
    `SELECT spell_code, nom, famille, fenetre, execution
       FROM gl_spells WHERE tenir_v2 = 1 AND statut = 'officiel' ORDER BY spell_code`,
  );
  if (!v2.length) {
    t.diagnostic('Aucun sort v2 en base : contrôle sauté');
    return;
  }
  const incomplets = v2.filter((s) => !s.famille || !s.fenetre || !s.execution);
  assert.deepEqual(
    incomplets.map((s) => s.spell_code),
    [],
    'sort v2 sans famille, fenêtre ou mode d’exécution',
  );
});
