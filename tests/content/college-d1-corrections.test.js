'use strict';

require('../helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initSchema, queryAll, queryOne } = require('../../database');

/**
 * Corrections immédiates du chantier collège (flux D1, migration `college_corrections_immediates`).
 *
 * Test de **contenu** : il porte sur les données semées par les migrations et tombe dans le job
 * CI « Contenu pédagogique ». Il tient deux règles qui se dégradent sans bruit :
 *   - l'emoji d'une fiche ne suggère jamais un autre groupe que le sien (un cloporte n'est pas
 *     un coléoptère, un mille-pattes n'est pas une chenille) — table de règles et corrections :
 *     `data/college-2026-11/d1/emoji.json` ;
 *   - les niveaux du glossaire revus pour le collège ne reviennent pas en arrière, et les
 *     séances 6e corrigées gardent leur forme.
 * Sur une base sans glossaire ni séances 6e (base de démonstration), les assertions qui les
 * concernent portent sur un ensemble vide ; la mécanique de la migration est couverte par
 * `tests/college-d1-rejeu.test.js`.
 */

const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'college-2026-11', 'd1');
const data = (name) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
const EMOJI = data('emoji.json');
const NIVEAUX = data('glossaire-niveaux.json');
const CONTENU = data('glossaire-contenu.json');

let plants = [];

before(async () => {
  await initSchema();
  plants = await queryAll(
    `SELECT id, name, emoji, entity_kind, taxon_kingdom, taxon_class, taxon_order, taxon_family
       FROM plants`,
  );
});

test('aucune fiche ne porte l’emoji d’un autre groupe (liste noire de la règle D1)', () => {
  const byEmoji = new Map(EMOJI.regles.map((r) => [r.emoji, r]));
  const fautes = plants
    .filter((p) => p.entity_kind !== 'ressource')
    .filter((p) => {
      const r = byEmoji.get(p.emoji);
      if (!r) return false;
      // Seuls les rangs renseignés sur la fiche se comparent (base de démonstration partielle).
      const connus = Object.keys(r.admis).filter((k) => p[k] != null);
      return connus.length > 0 && !connus.some((k) => r.admis[k].includes(p[k]));
    })
    .map((p) => `${p.name} (${p.emoji} = ${byEmoji.get(p.emoji).represente})`);
  assert.deepEqual(fautes, [], 'emoji qui suggère un autre groupe');
});

test('les emoji trompeurs relevés par l’audit ne sont pas revenus', () => {
  const corrections = new Map(EMOJI.corrections.map((c) => [c.name, c]));
  const revenus = plants
    .filter((p) => corrections.has(p.name) && p.emoji === corrections.get(p.name).avant)
    .map((p) => `${p.name} (${p.emoji})`);
  assert.deepEqual(revenus, []);
});

test('niveaux du glossaire revus pour le collège', async () => {
  const rows = await queryAll(
    `SELECT glossary_code, terme, niveau FROM glossary_terms
      WHERE glossary_code IN (${NIVEAUX.changements.map(() => '?').join(', ')})`,
    NIVEAUX.changements.map((c) => c.glossary_code),
  );
  const attendu = new Map(NIVEAUX.changements.map((c) => [c.glossary_code, c]));
  const ecarts = rows
    .filter((r) => r.terme === attendu.get(r.glossary_code).terme)
    .filter((r) => r.niveau !== attendu.get(r.glossary_code).apres)
    .map((r) => `${r.terme} : ${r.niveau} (attendu ${attendu.get(r.glossary_code).apres})`);
  assert.deepEqual(ecarts, []);
});

test('les termes de base du cycle 3 listés par D1 ne sont pas « avancés »', async () => {
  const base = NIVEAUX.changements.filter((c) => c.apres === 'base').map((c) => c.terme);
  assert.ok(base.includes('cellule') && base.includes("cycle de l'eau"));
  const rows = await queryAll(
    `SELECT terme FROM glossary_terms WHERE niveau = 'avance'
        AND terme IN (${base.map(() => '?').join(', ')})`,
    base,
  );
  assert.deepEqual(
    rows.map((r) => r.terme),
    [],
  );
});

test('« champignon » n’est plus rangé dans la faune', async () => {
  for (const c of CONTENU.categorie) {
    const row = await queryOne('SELECT categorie FROM glossary_terms WHERE glossary_code = ?', [
      c.glossary_code,
    ]);
    if (row) assert.notEqual(row.categorie, 'faune', c.terme);
  }
});

test('invertébré, reptile, poisson : présentés comme groupes d’usage courant', async () => {
  for (const c of CONTENU.definitions) {
    const row = await queryOne(
      'SELECT definition_complete FROM glossary_terms WHERE glossary_code = ? AND terme = ?',
      [c.glossary_code, c.terme],
    );
    if (row) assert.match(row.definition_complete, /mot d'usage courant/, c.terme);
  }
});

test('la carte de la daya n’impose plus le niveau lycée', async () => {
  const row = await queryOne("SELECT pedago_level FROM maps WHERE id = 'dayat'");
  if (row) assert.notEqual(row.pedago_level, 'lycee');
});

test('séances 6e : réseau aquaponie sans bactérie au centre, mangeur de graines présent', async () => {
  const rows = await queryAll(
    `SELECT slug, steps_json FROM pedago_sessions
      WHERE slug IN ('6e-aquaponie-n3', '6e-regimes-alimentaires')`,
  );
  for (const row of rows) {
    const steps = JSON.parse(row.steps_json);
    const highlighted = steps
      .map((s) => s.action?.payload?.highlightPlantId)
      .filter((id) => Number.isInteger(id));
    if (row.slug === '6e-aquaponie-n3') {
      const quiz = steps.map((s) => s.action?.payload?.questionCode).filter(Boolean);
      assert.ok(!quiz.includes('QF0020'), 'QF0020 (chimie) toujours dans la séance');
      const bacteries = plants
        .filter((p) => highlighted.includes(p.id) && /^Bact/i.test(p.taxon_kingdom || ''))
        .map((p) => p.name);
      assert.deepEqual(bacteries, [], 'réseau centré sur une bactérie');
    } else {
      const mangeurs = await queryAll(
        `SELECT DISTINCT from_plant_id AS id FROM species_interactions
          WHERE interaction_type IN ('frugivorie', 'granivorie')`,
      );
      const ids = new Set(mangeurs.map((m) => m.id));
      assert.ok(
        highlighted.some((id) => ids.has(id)),
        'aucune étape ne montre un mangeur de fruits ou de graines',
      );
    }
  }
});
