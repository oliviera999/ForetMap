'use strict';

// Service unique des liens question ↔ ressource (`lib/pedago/learningLinks.js`) : une seule
// table, `resource_question_links`, avec origine et statut (piste C, tranche « liens »).
// Audit du 25/09/2026, § 1.3.3, § 3.2.3 et § 3.5. Tests BDD partagée : exécution séquentielle.

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { initSchema, execute, queryAll, queryOne } = require('../database');
const links = require('../lib/pedago/learningLinks');

const db = { queryAll, queryOne, execute };
const stamp = Date.now().toString(36).toUpperCase();
const catSlug = `svccat${stamp.toLowerCase()}`.slice(0, 64);
const code = (suffix) => `QV${stamp}${suffix}`.slice(0, 16);
const CODES = {
  A: code('A'),
  B: code('B'),
  C: code('C'),
  D: code('D'),
};
const ALL = Object.values(CODES);
const glossaryCode = `GLV${stamp}`.slice(0, 32);
let plantId = 0;
let tutorialId = 0;

async function rql(resourceType, resourceRef, questionCode) {
  return queryOne(
    `SELECT resource_type, resource_ref, question_code, is_gating, origin, status, note, weight
       FROM resource_question_links
      WHERE resource_type = ? AND resource_ref = ? AND question_code = ?`,
    [resourceType, String(resourceRef), questionCode],
  );
}

before(async () => {
  await initSchema();
  await execute(
    `INSERT IGNORE INTO quiz_categories (slug, nom, theme, order_index)
     VALUES (?, 'Service liens', 'sciences', 996)`,
    [catSlug],
  );
  let numero = 1;
  for (const c of ALL) {
    await execute(
      `INSERT INTO quiz_questions
         (question_code, categorie_slug, numero_dans_categorie, question,
          choix_a, choix_b, choix_c, reponse_correcte, niveau, statut)
       VALUES (?, ?, ?, ?, 'A', 'B', 'C', 'A', 'college', 'actif')`,
      [c, catSlug, numero, `Question ${c} ?`],
    );
    numero += 1;
  }
  plantId = (
    await execute('INSERT INTO plants (name, emoji, description) VALUES (?, ?, ?)', [
      `Espèce service ${stamp}`,
      '🌱',
      'service des liens',
    ])
  ).insertId;
  tutorialId = (
    await execute(
      `INSERT INTO tutorials (title, slug, type, summary, html_content, is_active, sort_order)
       VALUES (?, ?, 'html', NULL, '<p>service</p>', 1, 952)`,
      [`Tutoriel service ${stamp}`, `tuto-service-${stamp.toLowerCase()}`],
    )
  ).insertId;
  await execute(
    `INSERT INTO glossary_terms
       (glossary_code, terme, variantes, categorie, niveau, definition_courte, statut)
     VALUES (?, ?, '', 'flore', 'base', 'Terme du service', 'actif')`,
    [glossaryCode, `servterme${stamp}`],
  );
  // État de départ : A repris des tables historiques (éditorial, approuvé, non bloquant),
  // B rejeté par un professeur, C saisi à la main et bloquant.
  for (const [type, ref] of [
    ['plant', plantId],
    ['tutorial', tutorialId],
  ]) {
    await execute(
      `INSERT INTO resource_question_links
         (resource_type, resource_ref, question_code, is_gating, origin, status, note)
       VALUES (?, ?, ?, 0, 'editorial', 'approved', 'reprise de test')`,
      [type, String(ref), CODES.A],
    );
  }
  await execute(
    `INSERT INTO resource_question_links
       (resource_type, resource_ref, question_code, is_gating, origin, status)
     VALUES ('plant', ?, ?, 0, 'auto', 'rejected'), ('plant', ?, ?, 1, 'manual', 'approved')`,
    [String(plantId), CODES.B, String(plantId), CODES.C],
  );
});

after(async () => {
  const marks = ALL.map(() => '?').join(', ');
  for (const table of ['resource_question_links', 'quiz_questions']) {
    await execute(`DELETE FROM ${table} WHERE question_code IN (${marks})`, ALL).catch(() => {});
  }
  await execute('DELETE FROM quiz_categories WHERE slug = ?', [catSlug]).catch(() => {});
  await execute('DELETE FROM plants WHERE id = ?', [plantId]).catch(() => {});
  await execute('DELETE FROM tutorials WHERE id = ?', [tutorialId]).catch(() => {});
  await execute('DELETE FROM glossary_terms WHERE glossary_code LIKE ?', [`GLV${stamp}%`]).catch(
    () => {},
  );
});

// ---------------------------------------------------------------------------------------
// Lecture : public « fiche »
// ---------------------------------------------------------------------------------------

test('listQuestionsForResource(sheet) : liens approuvés, questions actives, ordre du catalogue', async () => {
  // A (éditorial approuvé, non bloquant) et C (manuel bloquant) affichés ; B rejeté masqué.
  const rows = await links.listQuestionsForResource(db, {
    resourceType: 'plant',
    resourceRef: plantId,
  });
  assert.deepEqual(
    rows.map((r) => r.question_code),
    [CODES.A, CODES.C],
  );
  assert.deepEqual(Object.keys(rows[0]).sort(), [
    'categorie_slug',
    'difficulte',
    'niveau',
    'photo_legende',
    'photo_url',
    'question',
    'question_code',
  ]);
  await execute("UPDATE quiz_questions SET statut = 'inactif' WHERE question_code = ?", [CODES.C]);
  const afterDeactivation = await links.listQuestionsForResource(db, {
    resourceType: 'plant',
    resourceRef: String(plantId),
  });
  assert.deepEqual(
    afterDeactivation.map((r) => r.question_code),
    [CODES.A],
  );
  await execute("UPDATE quiz_questions SET statut = 'actif' WHERE question_code = ?", [CODES.C]);
});

test('listQuestionsForResource(sheet) : colonnes du tutoriel et du glossaire', async () => {
  const rows = await links.listQuestionsForResource(db, {
    resourceType: 'tutorial',
    resourceRef: tutorialId,
  });
  assert.deepEqual(
    rows.map((r) => r.question_code),
    [CODES.A],
  );
  assert.deepEqual(Object.keys(rows[0]).sort(), [
    'categorie_slug',
    'difficulte',
    'niveau',
    'question',
    'question_code',
  ]);
  const none = await links.listQuestionsForResource(db, {
    resourceType: 'glossary',
    resourceRef: glossaryCode,
  });
  assert.deepEqual(none, []);
});

test('listQuestionsForResource : public ou type inconnu refusés', async () => {
  await assert.rejects(
    links.listQuestionsForResource(db, {
      resourceType: 'plant',
      resourceRef: plantId,
      audience: 'gating',
    }),
    /Public de liens non pris en charge/,
  );
  await assert.rejects(
    links.listQuestionsForResource(db, { resourceType: 'feuillet', resourceRef: '1' }),
    /Type de ressource non pris en charge/,
  );
});

// ---------------------------------------------------------------------------------------
// Écriture : mots-clés, saisie, propositions
// ---------------------------------------------------------------------------------------

test('replaceKeywordGlossaryLinks : ne purge et n’écrit que origin = keyword', async () => {
  const other = `${glossaryCode}O`;
  await execute(
    `INSERT INTO glossary_terms
       (glossary_code, terme, variantes, categorie, niveau, definition_courte, statut)
     VALUES (?, ?, '', 'flore', 'base', 'Autre terme', 'actif')`,
    [other, `autreterme${stamp}`],
  );
  for (const [ref, origin, gating] of [
    [glossaryCode, 'import', 1],
    [other, 'keyword', 0],
  ]) {
    await execute(
      `INSERT INTO resource_question_links
         (resource_type, resource_ref, question_code, is_gating, origin, status)
       VALUES ('glossary', ?, ?, ?, ?, 'approved')`,
      [ref, CODES.D, gating, origin],
    );
  }
  await execute(
    `INSERT INTO resource_question_links
       (resource_type, resource_ref, question_code, is_gating, origin, status)
     VALUES ('glossary', ?, ?, 0, 'editorial', 'approved')`,
    [other, CODES.C],
  );

  // Édition de D : ses mots-clés pointent maintenant vers le premier terme (déjà relu).
  const n = await links.replaceKeywordGlossaryLinks(db, {
    questionCode: CODES.D,
    links: [{ glossaryCode, questionCode: CODES.D }],
  });
  assert.equal(n, 1);
  const d = await queryAll(
    `SELECT resource_ref, origin, is_gating FROM resource_question_links
      WHERE resource_type = 'glossary' AND question_code = ? ORDER BY resource_ref`,
    [CODES.D],
  );
  // Le lien relu n'est ni dupliqué ni rétrogradé ; l'ancien lien par mots-clés est purgé.
  assert.deepEqual(
    d.map((r) => [r.resource_ref, r.origin, Number(r.is_gating)]),
    [[glossaryCode, 'import', 1]],
  );
  // La reprise éditoriale d'une autre question n'est pas touchée.
  const c = await rql('glossary', other, CODES.C);
  assert.equal(c.origin, 'editorial');
});

test('upsertLink / updateLink / deleteLinkById / listLinkKeys', async () => {
  const row = await links.upsertLink(
    db,
    {
      resource_type: 'plant',
      resource_ref: String(plantId),
      question_code: CODES.D,
      is_gating: 1,
      weight: 1,
      origin: 'manual',
      confidence: null,
      status: 'approved',
      note: null,
    },
    { provided: { is_gating: true, origin: true }, actor: { userType: 'teacher', userId: null } },
  );
  assert.equal(row.origin, 'manual');
  assert.equal(Number(row.is_gating), 1);
  // Recréer le couple sans dire bloquant / origine ne les réécrit pas (B3).
  const again = await links.upsertLink(
    db,
    {
      resource_type: 'plant',
      resource_ref: String(plantId),
      question_code: CODES.D,
      is_gating: 0,
      weight: 2,
      origin: 'manual',
      confidence: null,
      status: 'approved',
      note: 'relu',
    },
    { provided: {} },
  );
  assert.equal(Number(again.id), Number(row.id));
  assert.equal(Number(again.is_gating), 1);
  assert.equal(Number(again.weight), 2);

  const keys = await links.listLinkKeys(db);
  assert.ok(keys.has(links.linkKey('plant', String(plantId), CODES.D)));

  const patched = await links.updateLink(db, row.id, { is_gating: 0, note: null });
  assert.equal(Number(patched.is_gating), 0);
  assert.equal(patched.note, null);
  assert.equal(await links.updateLink(db, 999999999999, { weight: 1 }), null);
  await assert.rejects(links.updateLink(db, row.id, {}), /Aucune modification/);

  assert.equal(await links.deleteLinkById(db, row.id), true);
  assert.equal(await links.deleteLinkById(db, row.id), false);
});

test('insertSuggestedLinks : proposé, non bloquant, n’écrase jamais un couple existant', async () => {
  const inserted = await links.insertSuggestedLinks(
    db,
    [
      {
        resource_type: 'tutorial',
        resource_ref: String(tutorialId),
        question_code: CODES.B,
        origin: 'auto',
        confidence: 0.8,
        reason: 'compost',
      },
      {
        // Couple déjà présent (reprise éditoriale approuvée) : ignoré.
        resource_type: 'tutorial',
        resource_ref: String(tutorialId),
        question_code: CODES.A,
        origin: 'auto',
        confidence: 0.9,
        reason: 'doublon',
      },
    ],
    { userType: 'teacher', userId: null },
  );
  assert.equal(inserted, 1);
  const b = await rql('tutorial', tutorialId, CODES.B);
  assert.deepEqual(
    { status: b.status, is_gating: Number(b.is_gating), note: b.note },
    { status: 'suggested', is_gating: 0, note: 'compost' },
  );
  const a = await rql('tutorial', tutorialId, CODES.A);
  assert.equal(a.origin, 'editorial');
  assert.equal(a.status, 'approved');
});

test('listResourceCoverage : compteurs par ressource, type inconnu → null', async () => {
  const rows = await links.listResourceCoverage(db, 'tutorial');
  const mine = rows.find((r) => r.ref === String(tutorialId));
  assert.deepEqual(
    {
      links_count: mine.links_count,
      gating_count: mine.gating_count,
      suggested_count: mine.suggested_count,
    },
    { links_count: 2, gating_count: 0, suggested_count: 1 },
  );
  assert.equal(await links.listResourceCoverage(db, 'feuillet'), null);
});
