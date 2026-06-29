'use strict';

// Vérifie l'affinage du scope des resync glossaire GL : le DELETE des liens
// gl_resource_question_links lors d'un upsert de question QCM est restreint à
// origin='import' (matcher-owned). Les liens épinglés manuellement (origin='manual',
// ex-'point4' requalifié par la migration 149) DOIVENT survivre à la resync, même
// lorsqu'ils ne correspondent à aucun mot-clé ; seuls les liens 'import' périmés
// sont effacés et régénérés selon les mots-clés courants.

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { initSchema, execute, queryAll, queryOne } = require('../database');
const { upsertGlQcmQuestion } = require('../lib/glQcmCrud');

const deps = { queryAll, queryOne, execute };

const stamp = Date.now();
const biomeSlug = `oscope-biome-${stamp}`.slice(0, 64);
const catSlug = `oscope-cat-${stamp}`.slice(0, 64);
const qcode = `QCM${String(stamp).slice(-6)}`.slice(0, 16).toUpperCase();

// Termes glossaire : T1 sera matché par les mots_cles, STALE ne le sera pas.
const termMatchCode = `GOS1${String(stamp).slice(-4)}`.slice(0, 16);
const termMatchTerme = `oscopeterme${stamp}`; // mot unique normalisable, présent dans mots_cles
const termStaleCode = `GOS2${String(stamp).slice(-4)}`.slice(0, 16);
const termStaleTerme = `oscopestale${stamp}`;
const termManualCode = `GOS3${String(stamp).slice(-4)}`.slice(0, 16);
const termManualTerme = `oscopemanual${stamp}`;

before(async () => {
  await initSchema();

  await execute(
    `INSERT IGNORE INTO gl_biomes (slug, nom, order_index) VALUES (?, 'Biome scope test', 999)`,
    [biomeSlug],
  );
  await execute(
    `INSERT IGNORE INTO gl_qcm_categories (slug, nom, order_index) VALUES (?, 'Cat scope test', 999)`,
    [catSlug],
  );

  for (const [code, terme] of [
    [termMatchCode, termMatchTerme],
    [termStaleCode, termStaleTerme],
    [termManualCode, termManualTerme],
  ]) {
    await execute(
      `INSERT IGNORE INTO gl_glossary_terms (glossary_code, terme, categorie, statut)
       VALUES (?, ?, 'ecologie', 'actif')`,
      [code, terme],
    );
  }

  // Question QCM existante (sera ré-upsertée par le test).
  await execute(
    `INSERT IGNORE INTO gl_qcm_questions
      (question_code, biome_slug, categorie_slug, numero_dans_categorie, question,
       choix_a, choix_b, choix_c, choix_d, reponse_correcte, mots_cles, statut)
     VALUES (?, ?, ?, 1, 'Question scope ?', 'A', 'B', 'C', 'D', 'A', ?, 'actif')`,
    [qcode, biomeSlug, catSlug, termMatchTerme],
  );

  // Lien manuel épinglé (origin='manual', approuvé) : ne correspond à AUCUN mot-clé
  // de la question → doit survivre à la resync grâce au scope origin='import'.
  await execute(
    `INSERT IGNORE INTO gl_resource_question_links
      (question_dataset, question_code, resource_type, resource_ref, status, origin, is_gating)
     VALUES ('qcm', ?, 'glossary', ?, 'approved', 'manual', 1)`,
    [qcode, termManualCode],
  );

  // Lien import périmé (origin='import', approuvé) sur un terme qui n'est plus dans les
  // mots_cles → doit être supprimé par la resync.
  await execute(
    `INSERT IGNORE INTO gl_resource_question_links
      (question_dataset, question_code, resource_type, resource_ref, status, origin, is_gating)
     VALUES ('qcm', ?, 'glossary', ?, 'approved', 'import', 1)`,
    [qcode, termStaleCode],
  );
});

after(async () => {
  await execute('DELETE FROM gl_resource_question_links WHERE question_code = ?', [qcode]).catch(
    () => {},
  );
  await execute('DELETE FROM gl_qcm_questions WHERE question_code = ?', [qcode]).catch(() => {});
  await execute('DELETE FROM gl_glossary_terms WHERE glossary_code IN (?, ?, ?)', [
    termMatchCode,
    termStaleCode,
    termManualCode,
  ]).catch(() => {});
  await execute('DELETE FROM gl_qcm_categories WHERE slug = ?', [catSlug]).catch(() => {});
  await execute('DELETE FROM gl_biomes WHERE slug = ?', [biomeSlug]).catch(() => {});
});

test('resync glossaire QCM : préserve origin=manual, régénère uniquement origin=import', async () => {
  // Ré-upsert de la question avec mots_cles ciblant uniquement le terme "match".
  await upsertGlQcmQuestion(
    deps,
    {
      biome_slug: biomeSlug,
      categorie_slug: catSlug,
      numero_dans_categorie: 1,
      question: 'Question scope ?',
      choix_a: 'A',
      choix_b: 'B',
      choix_c: 'C',
      choix_d: 'D',
      choix_e: 'E',
      reponse_correcte: 'A',
      mots_cles: termMatchTerme,
    },
    { question_code: qcode, requireExisting: true },
  );

  const links = await queryAll(
    `SELECT resource_ref, origin, status FROM gl_resource_question_links
      WHERE question_dataset = 'qcm' AND resource_type = 'glossary' AND question_code = ?`,
    [qcode],
  );
  const byRef = new Map(links.map((l) => [l.resource_ref, l]));

  // 1. Le lien manuel épinglé survit (non régénérable par le matcher).
  assert.ok(byRef.has(termManualCode), 'le lien origin=manual doit survivre à la resync');
  assert.equal(byRef.get(termManualCode).origin, 'manual');

  // 2. Le lien import périmé est supprimé.
  assert.equal(
    byRef.has(termStaleCode),
    false,
    'le lien import périmé (terme hors mots_cles) doit être supprimé',
  );

  // 3. Le lien import correspondant aux mots_cles courants est régénéré.
  assert.ok(byRef.has(termMatchCode), 'le lien import matché doit être (re)créé');
  assert.equal(byRef.get(termMatchCode).origin, 'import');
  assert.equal(byRef.get(termMatchCode).status, 'approved');
});
