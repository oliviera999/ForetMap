'use strict';

// Contenus de terrain du 20/11/2026 repris par la migration « contenus_terrain_2026_11_20 »
// (chantier CPT, flux F1) : assertions sur les DONNÉES posées sur une base fraîche.
//
// Une base fraîche porte les blocs autonomes : les 61 questions (avec les trois catégories et
// les quatre notions de référence créées par la migration), leurs notions, les tutoriels, les
// liens vers les fiches et tutoriels présents, les retraits.
// Le reste (zones de visite, clés, séances de site) attend ses parents ; la mécanique de
// rejeu avec parents semés est dans `tests/contenus-terrain-2026-11-20-rejeu.test.js`.
// Tests BDD partagée : exécution séquentielle.

require('../helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { initSchema, queryAll, queryOne } = require('../../database');

const RANGE = "question_code BETWEEN 'QF9873' AND 'QF9933'";
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
const TUTORIELS = [
  'observer-a-la-boite-loupe',
  'observer-aux-jumelles',
  'observer-sans-deranger',
  'prendre-une-photo-utile-pour-identifier',
  'securite-sur-l-estran',
];
const LETTRES = ['a', 'b', 'c', 'd'];

let questions = [];

before(async () => {
  await initSchema();
  questions = await queryAll(`SELECT * FROM quiz_questions WHERE ${RANGE} ORDER BY question_code`);
});

test('contenus du 20/11 : les questions reprises existent, actives, niveau collège', () => {
  assert.equal(questions.length, 61);
  for (const q of questions) {
    assert.equal(q.statut, 'actif', q.question_code);
    assert.equal(q.niveau, 'college', q.question_code);
    assert.ok([1, 2, 3].includes(q.difficulte), q.question_code);
  }
});

test('contenus du 20/11 : quatre choix, une bonne lettre, un retour par mauvaise réponse', () => {
  for (const q of questions) {
    const bonne = q.reponse_correcte.toLowerCase();
    assert.ok(LETTRES.includes(bonne), q.question_code);
    assert.equal(q.choix_e, '', `${q.question_code} : pas de cinquième choix`);
    assert.equal(q.reponse_texte, q[`choix_${bonne}`], `${q.question_code} : réponse en clair`);
    assert.ok(q.feedback_correct && q.feedback_correct.length > 20, q.question_code);
    assert.ok(q.notes_pedagogiques, `${q.question_code} : source notée`);
    for (const lettre of LETTRES) {
      assert.ok(q[`choix_${lettre}`], `${q.question_code} : choix ${lettre}`);
      if (lettre === bonne) {
        // Le créneau de la bonne lettre reste vide : `feedback_correct` suffit.
        assert.equal(q[`feedback_${lettre}`], null, `${q.question_code} : créneau ${lettre}`);
      } else {
        assert.ok(q[`feedback_${lettre}`], `${q.question_code} : retour de ${lettre}`);
        assert.notEqual(q[`feedback_${lettre}`], q.feedback_correct, q.question_code);
      }
    }
  }
});

test('contenus du 20/11 : tutoiement et formulation pour des élèves', () => {
  for (const q of questions) {
    const texte = [q.question, q.feedback_correct, ...LETTRES.map((l) => q[`feedback_${l}`])]
      .filter(Boolean)
      .join(' ');
    assert.ok(!/\b(vous|votre|vos)\b/i.test(texte), `${q.question_code} : vouvoiement`);
  }
});

test('contenus du 20/11 : questions d’identification illustrées, photo créditée', () => {
  const identification = questions.filter((q) => q.categorie_slug === 'identification_especes');
  assert.equal(identification.length, 10);
  for (const q of identification) {
    assert.match(q.photo_url, /^https:\/\//, q.question_code);
    assert.ok(q.photo_credit, `${q.question_code} : crédit`);
    assert.ok(q.photo_licence, `${q.question_code} : licence`);
  }
  for (const q of questions.filter((x) => x.categorie_slug !== 'identification_especes')) {
    assert.equal(q.photo_url, null, q.question_code);
  }
});

test('contenus du 20/11 : notions de cycle 3 ajoutées, notions de lycée héritées exclues', async () => {
  const notions = await queryAll(
    `SELECT n.question_code, n.notion_id, n.mode, cn.niveau
       FROM quiz_question_notions n
       JOIN curriculum_notions cn ON cn.id = n.notion_id
      WHERE n.${RANGE}`,
  );
  // 168 lignes posées le 20/11 ; la migration `college_quiz_paliers` (chantier collège, retri
  // des paliers) retouche ensuite ces questions : 220 lignes sur une base semée par les
  // migrations (200 avant que `college_referentiel_notions` ne sème, avant le retri, les
  // liaisons catégorie → notions de la production : le retri y pose alors les mêmes
  // exclusions qu'en production).
  assert.equal(notions.length, 220);
  // Chaque question a sa ligne de notions : au moins un ajout ou une exclusion.
  for (const q of questions) {
    assert.ok(
      notions.some((n) => n.question_code === q.question_code),
      `${q.question_code} : aucune notion réglée`,
    );
  }
  const ajouts = notions.filter((n) => n.mode === 'ajout');
  assert.ok(ajouts.filter((n) => n.niveau === 'cycle3').length >= 30, 'ajouts de cycle 3');
  // Le 20/11, seules des notions de lycée héritées étaient exclues. Depuis le retri des
  // paliers (migration `college_quiz_paliers`), une notion de cycle 3 ou 4 peut l'être aussi,
  // mais seulement si la question garde un ajout explicite de l'autre cycle : le palier est
  // tranché, jamais vidé.
  for (const n of notions.filter((x) => x.mode === 'exclusion')) {
    if (!['cycle3', 'cycle4'].includes(n.niveau)) continue;
    assert.ok(
      ajouts.some(
        (a) =>
          a.question_code === n.question_code &&
          ['cycle3', 'cycle4'].includes(a.niveau) &&
          a.niveau !== n.niveau,
      ),
      `${n.question_code} exclut ${n.notion_id} sans garder l'autre cycle`,
    );
  }
});

test('contenus du 20/11 : les neuf questions remplacées sont retirées', async () => {
  const rows = await queryAll(
    `SELECT question_code, statut FROM quiz_questions
      WHERE question_code IN (${RETRAITS.map(() => '?').join(', ')})`,
    RETRAITS,
  );
  for (const r of rows) assert.equal(r.statut, 'inactif', r.question_code);
});

test('contenus du 20/11 : plus aucun créneau de bonne lettre ne recopie feedback_correct', async () => {
  const row = await queryOne(
    `SELECT COUNT(*) AS n FROM quiz_questions
      WHERE (reponse_correcte = 'A' AND feedback_a = feedback_correct)
         OR (reponse_correcte = 'B' AND feedback_b = feedback_correct)
         OR (reponse_correcte = 'C' AND feedback_c = feedback_correct)
         OR (reponse_correcte = 'D' AND feedback_d = feedback_correct)
         OR (reponse_correcte = 'E' AND feedback_e = feedback_correct)`,
  );
  assert.equal(Number(row.n), 0);
});

test('contenus du 20/11 : cinq tutoriels actifs, illustrés et crédités, sans script', async () => {
  const rows = await queryAll(
    `SELECT slug, title, type, summary, html_content, is_active FROM tutorials
      WHERE slug IN (${TUTORIELS.map(() => '?').join(', ')})`,
    TUTORIELS,
  );
  assert.equal(rows.length, 5);
  for (const t of rows) {
    assert.equal(t.type, 'html', t.slug);
    assert.equal(t.is_active, 1, t.slug);
    assert.ok(t.summary && t.summary.length > 30, `${t.slug} : résumé`);
    assert.ok(t.html_content.length > 1000, `${t.slug} : contenu`);
    assert.ok(!/<script|javascript:|\son\w+=/i.test(t.html_content), `${t.slug} : HTML inerte`);
    assert.match(t.html_content, /<figure><img src="https:\/\/[^"]+" alt="[^"]+">/, t.slug);
    assert.match(t.html_content, /<figcaption>[^<]*Photo : [^<]+<\/figcaption>/, t.slug);
    assert.ok(!/\b(vous|votre|vos)\b/i.test(t.html_content), `${t.slug} : vouvoiement`);
  }
});

test('contenus du 20/11 : liens des questions vers des ressources présentes, source unique', async () => {
  const liens = await queryAll(
    `SELECT l.resource_type, l.resource_ref, l.question_code, l.is_gating, l.origin, l.status, l.note
       FROM resource_question_links l WHERE l.${RANGE}`,
  );
  assert.ok(liens.length >= 24, `${liens.length} liens`);
  for (const l of liens) {
    assert.equal(l.origin, 'manual');
    assert.equal(l.status, 'approved');
    // Un lien bloquant est toujours un lien repris d'une ancienne version de la question.
    if (Number(l.is_gating) === 1) assert.match(l.note, /^Repris de QF\d{4} /);
  }
  const orphelins = await queryOne(
    `SELECT COUNT(*) AS n FROM resource_question_links l
      WHERE l.${RANGE}
        AND ((l.resource_type = 'plant'
              AND NOT EXISTS (SELECT 1 FROM plants p WHERE p.id = l.resource_ref))
          OR (l.resource_type = 'tutorial'
              AND NOT EXISTS (SELECT 1 FROM tutorials t WHERE t.id = l.resource_ref))
          OR (l.resource_type = 'glossary'
              AND NOT EXISTS (SELECT 1 FROM glossary_terms g WHERE g.glossary_code = l.resource_ref)))`,
  );
  assert.equal(Number(orphelins.n), 0);
  // Liens tutoriel → question des nouveaux tutoriels : jamais bloquants.
  const versTutoriel = await queryAll(
    `SELECT t.slug, l.question_code, l.is_gating FROM resource_question_links l
       JOIN tutorials t ON t.id = l.resource_ref
      WHERE l.resource_type = 'tutorial' AND l.${RANGE}
        AND t.slug IN (${TUTORIELS.map(() => '?').join(', ')})`,
    TUTORIELS,
  );
  assert.ok(versTutoriel.length >= 3);
  for (const l of versTutoriel) assert.equal(Number(l.is_gating), 0, l.question_code);
  // Tables historiques figées : rien n'y est écrit pour ces questions.
  for (const table of ['quiz_question_species', 'quiz_question_tutorials']) {
    const row = await queryOne(`SELECT COUNT(*) AS n FROM ${table} WHERE ${RANGE}`);
    assert.equal(Number(row.n), 0, table);
  }
});

test('contenus du 20/11 : la séance d’inventaire de n³ n’est jamais publiée par la reprise', async () => {
  const row = await queryOne(
    "SELECT is_published FROM pedago_sessions WHERE slug = '6e-inventaire-n3'",
  );
  if (row) assert.equal(row.is_published, 0);
});
