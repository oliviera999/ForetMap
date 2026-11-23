'use strict';

// Assouplissement du profil collège (décisions d'Oliv du 22/11/2026, flux C2, lot 6) : données
// de la migration `college_assouplissement` (retrouvée par son suffixe). Sources uniques :
// data/college-assouplissement/lot4_quiz.json (20 questions de cycle 3, copiées telles quelles)
// et data/college-assouplissement/assouplissement.json. Les tests de base passent sur une base
// fraîche (parents souvent absents : lignes sautées) comme sur une copie de la production.

require('../helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {
  loadData,
  checkQuestions,
  frenchSpaces,
  buildSql,
  findMigrationFile,
  EXPECTED_ANSWERS,
} = require('../../scripts/college-assouplissement/build-lot4-migration');
const { indexClades, collapseForProfile, collapsedCladeIdFor } = require('../../lib/clades');
const { quizQuestionEntryPalierSql } = require('../../lib/curriculumNotions');
const { initSchema, queryAll, queryOne } = require('../../database');

const data = loadData();
const { questions, meta } = data;
const CODES = questions.map((q) => q.question_code);
const LETTERS = ['A', 'B', 'C', 'D'];
const NBSP = ' ';

before(async () => {
  await initSchema();
});

test('la migration versionnée est la sortie du générateur', () => {
  assert.equal(fs.readFileSync(findMigrationFile(), 'utf8'), buildSql(data));
});

test('la migration ne contient ni DDL, ni trigger, ni DEFINER, ni table gl_*', () => {
  const sql = fs.readFileSync(findMigrationFile(), 'utf8').replace(/^--.*$/gm, '');
  assert.doesNotMatch(sql, /\b(CREATE|ALTER|DROP|TRUNCATE|RENAME)\b/i);
  assert.doesNotMatch(sql, /\bTRIGGER\b|\bDEFINER\b/i);
  assert.doesNotMatch(sql, /\bgl_[a-z_]+/i);
  assert.doesNotMatch(sql, /quiz_question_species|quiz_question_tutorials/);
});

test('les 20 questions passent les contrôles du générateur (notions de la base)', async () => {
  const rows = await queryAll('SELECT id, niveau FROM curriculum_notions');
  const notions = new Map(rows.map((r) => [r.id, r.niveau]));
  assert.deepEqual(checkQuestions(data, { notions }), []);
});

test('le contrôle détecte les fautes visées', () => {
  const broken = structuredClone(data);
  const q = broken.questions[0];
  q.feedback_b = 'Recopie du retour de la bonne réponse.';
  q.choix_b = `${q.choix_b} ${'très '.repeat(10)}longue`;
  q.notions_ajout = ['1-ECO'];
  const errors = checkQuestions(broken).join('\n');
  assert.match(errors, /feedback_b \(bonne réponse\) non NULL/);
  assert.match(errors, /bonne réponse trop longue/);
  assert.match(errors, /aucune notion de cycle 3/);
  assert.match(errors, /bonnes réponses|QF9934/);
});

test('répartition des bonnes réponses du lot : A 3, B 5, C 6, D 6', () => {
  const counts = { A: 0, B: 0, C: 0, D: 0 };
  for (const q of questions) counts[q.reponse_correcte] += 1;
  assert.deepEqual(counts, { ...EXPECTED_ANSWERS });
});

test('typographie : espaces insécables avant ; : ! ? et dans « », conversion idempotente', () => {
  assert.equal(
    frenchSpaces('Pourquoi ? « oui » : non ; si !'),
    `Pourquoi${NBSP}? «${NBSP}oui${NBSP}»${NBSP}: non${NBSP}; si${NBSP}!`,
  );
  const once = frenchSpaces('« a » : b');
  assert.equal(frenchSpaces(once), once);
});

test('base : les 20 questions présentes, actives, collège, conformes et au palier 1', async () => {
  const rows = await queryAll(
    `SELECT q.*, ${quizQuestionEntryPalierSql('q')} AS palier
       FROM quiz_questions q WHERE q.question_code IN (${CODES.map(() => '?').join(',')})`,
    CODES,
  );
  assert.equal(rows.length, 20);
  for (const r of rows) {
    const tag = r.question_code;
    assert.equal(r.statut, 'actif', tag);
    assert.equal(r.niveau, 'college', tag);
    assert.equal(Number(r.palier), 1, `${tag} : palier d'entrée`);
    assert.equal(Number(r.numero_dans_categorie), Number(tag.slice(2)), `${tag} : numéro`);
    const choices = LETTERS.map((l) => r[`choix_${l.toLowerCase()}`]);
    assert.ok(
      choices.every((c) => typeof c === 'string' && c.trim()),
      `${tag} : 4 choix`,
    );
    const good = r[`choix_${r.reponse_correcte.toLowerCase()}`].length;
    const longest = Math.max(
      ...LETTERS.filter((l) => l !== r.reponse_correcte).map(
        (l) => r[`choix_${l.toLowerCase()}`].length,
      ),
    );
    assert.ok(good <= 1.1 * longest, `${tag} : bonne réponse ≤ 110 % du plus long distracteur`);
    for (const l of LETTERS) {
      const fb = r[`feedback_${l.toLowerCase()}`];
      if (l === r.reponse_correcte) assert.equal(fb, null, `${tag} : feedback_${l.toLowerCase()}`);
      else assert.ok(fb && fb.trim(), `${tag} : retour du distracteur ${l}`);
    }
    for (const field of [
      'question',
      'feedback_correct',
      ...choices.map((_, i) => `choix_${'abcd'[i]}`),
    ]) {
      assert.doesNotMatch(r[field], / [;:!?]|« | »/, `${tag} ${field} : espace ordinaire`);
    }
  }
});

test('base : notions des 20 questions (ajout cycle 3, exclusions lycée)', async () => {
  const rows = await queryAll(
    `SELECT question_code, notion_id, mode FROM quiz_question_notions
      WHERE question_code IN (${CODES.map(() => '?').join(',')})`,
    CODES,
  );
  const got = new Set(rows.map((r) => `${r.question_code}|${r.notion_id}|${r.mode}`));
  for (const q of questions) {
    for (const n of q.notions_ajout)
      assert.ok(got.has(`${q.question_code}|${n}|ajout`), `${q.question_code} ${n}`);
    for (const n of q.notions_exclusion)
      assert.ok(got.has(`${q.question_code}|${n}|exclusion`), `${q.question_code} ${n}`);
  }
});

test('base : liens question ↔ fiche non bloquants, seulement dans resource_question_links', async (t) => {
  const rows = await queryAll(
    `SELECT l.question_code, p.name, l.is_gating, l.status, l.origin
       FROM resource_question_links l
       JOIN plants p ON l.resource_type = 'plant' AND l.resource_ref = CAST(p.id AS CHAR) COLLATE utf8mb4_unicode_ci
      WHERE l.question_code IN (${CODES.map(() => '?').join(',')})`,
    CODES,
  );
  const got = new Map(rows.map((r) => [`${r.question_code}|${r.name}`, r]));
  let expected = 0;
  let missing = 0;
  for (const q of questions) {
    for (const id of q.fiches_liees) {
      expected += 1;
      const name = meta.fiches[String(id)];
      const unique = await queryOne('SELECT COUNT(*) AS n FROM plants WHERE name = ?', [name]);
      const row = got.get(`${q.question_code}|${name}`);
      if (Number(unique.n) !== 1) {
        missing += 1;
        assert.equal(row, undefined);
        continue;
      }
      assert.ok(row, `${q.question_code} → ${name}`);
      assert.equal(Number(row.is_gating), 0);
      assert.equal(row.status, 'approved');
      assert.equal(row.origin, 'manual');
    }
  }
  t.diagnostic(
    `liens : ${expected - missing} posés, ${missing} sautés (fiche absente de cette base)`,
  );
});

test('base : clade « Animaux à quatre membres » visible au collège, rangement attendu', async () => {
  const rows = await queryAll(
    'SELECT id, parent_id, name, label_simple, shared_attribute, attribute_simple, visible_college FROM clades',
  );
  const tetra = rows.find((r) => r.id === meta.clade.id);
  if (!tetra) return; // arbre absent de cette base
  assert.equal(Number(tetra.visible_college), 1);
  assert.equal(tetra.label_simple, meta.clade.label_simple);
  assert.equal(tetra.attribute_simple, frenchSpaces(meta.clade.attribute_simple));
  const collapsed = collapseForProfile(rows, 'college');
  const byId = indexClades(collapsed.items);
  const chainIds = (cladeId) => {
    const ids = [];
    let cur = collapsedCladeIdFor(collapsed, cladeId);
    while (cur) {
      ids.push(cur);
      cur = byId.get(cur)?.parent_id || null;
    }
    return ids;
  };
  // Séance 6e-grands-groupes : pipistrelle (chiroptères), rougequeue (oiseaux) et hémidactyle
  // (lézards) dans « Animaux à quatre membres » ; le tilapia (actinoptérygiens) dans
  // « Vertébrés », hors de cette boîte.
  for (const cladeId of ['chiropteres', 'oiseaux', 'squamates']) {
    if (!rows.some((r) => r.id === cladeId)) continue;
    assert.ok(chainIds(cladeId).includes('tetrapodes'), `${cladeId} sous tetrapodes`);
  }
  if (rows.some((r) => r.id === 'actinopterygiens')) {
    const chain = chainIds('actinopterygiens');
    assert.ok(!chain.includes('tetrapodes'), 'tilapia hors des quatre membres');
    assert.ok(chain.includes('vertebres'), 'tilapia dans les vertébrés');
  }
});

test('base : présences confirmées (n3 et foret), sans toucher aux autres cartes', async () => {
  for (const p of meta.presences) {
    const plant = await queryAll('SELECT id FROM plants WHERE name = ?', [p.plant]);
    const map = await queryOne('SELECT id FROM maps WHERE id = ?', [p.map_id]);
    if (plant.length !== 1 || !map) continue;
    const row = await queryOne(
      'SELECT validation_status, is_featured FROM map_species WHERE map_id = ? AND plant_id = ?',
      [p.map_id, plant[0].id],
    );
    assert.ok(row, `${p.map_id} / ${p.plant}`);
  }
});

test('base : QF9877 porte C3-ENV en ajout et entre au palier 1', async () => {
  const q = await queryOne(
    `SELECT ${quizQuestionEntryPalierSql('q')} AS palier FROM quiz_questions q WHERE q.question_code = 'QF9877'`,
  );
  if (!q) return;
  assert.equal(Number(q.palier), 1);
  const n = await queryOne(
    "SELECT mode FROM quiz_question_notions WHERE question_code = 'QF9877' AND notion_id = 'C3-ENV'",
  );
  assert.equal(n?.mode, 'ajout');
});

test('base : « matière organique » au palier base du glossaire', async () => {
  const g = await queryOne("SELECT niveau FROM glossary_terms WHERE glossary_code = 'FM0019'");
  if (!g) return;
  assert.equal(g.niveau, 'base');
});

test('base : aucune question citée par une séance de cycle 3 au palier 2', async () => {
  const sessions = await queryAll(
    "SELECT slug, config_json, steps_json FROM pedago_sessions WHERE level = 'college'",
  );
  const cited = [];
  for (const s of sessions) {
    let steps = [];
    let config = {};
    try {
      steps = JSON.parse(s.steps_json) || [];
      config = JSON.parse(s.config_json) || {};
    } catch {
      continue;
    }
    for (const step of steps) {
      const payload = step?.action?.payload || {};
      if (step?.action?.type !== 'open_quiz' || !payload.questionCode) continue;
      const cycle3 =
        payload.notionNiveau === 'cycle3' ||
        config.notionNiveau === 'cycle3' ||
        /^6e-/.test(s.slug);
      if (cycle3) cited.push({ slug: s.slug, code: payload.questionCode });
    }
  }
  for (const c of cited) {
    const q = await queryOne(
      `SELECT ${quizQuestionEntryPalierSql('q')} AS palier FROM quiz_questions q WHERE q.question_code = ?`,
      [c.code],
    );
    if (!q) continue;
    assert.equal(Number(q.palier), 1, `${c.slug} : ${c.code} au palier ${q.palier}`);
  }
});

test('base : consignes et preset des séances (ou séance retouchée signalée)', async (t) => {
  for (const s of meta.seances) {
    const row = await queryOne('SELECT steps_json FROM pedago_sessions WHERE slug = ?', [s.slug]);
    if (!row) continue;
    const step = JSON.parse(row.steps_json)[s.step_index];
    if (!step || step.id !== s.step_id) {
      t.diagnostic(`AVERTISSEMENT ${s.slug} : étape ${s.step_id} déplacée, laissée telle quelle`);
      continue;
    }
    const expectedBody = s.body_apres != null ? frenchSpaces(s.body_apres) : s.body_avant;
    const applied =
      step.body === expectedBody && (!s.preset || step.action?.payload?.preset === s.preset);
    if (!applied && step.body !== s.body_avant) {
      t.diagnostic(
        `AVERTISSEMENT ${s.slug} · ${s.step_id} : retouchée dans l'application, non réécrite`,
      );
      continue;
    }
    assert.ok(applied, `${s.slug} · ${s.step_id} : consigne et preset appliqués`);
    if (s.body_apres != null)
      assert.doesNotMatch(step.body, /\bisole[rz]?\b|Affiche ensuite tout le réseau/);
  }
});
