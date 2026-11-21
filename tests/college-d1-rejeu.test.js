'use strict';

/**
 * Migration `college_corrections_immediates` (chantier collège, flux D1) : mécanique de rejeu.
 *
 * La base de test fraîche ne porte ni le glossaire, ni la carte de la daya, ni les séances 6e :
 * la migration y est presque entièrement sans effet. Ce test pose donc l'**ancienne forme** des
 * lignes visées (tirée des fichiers de données `data/college-2026-11/d1/`), joue la migration
 * deux fois et vérifie :
 *   - le premier passage applique chaque correction ;
 *   - le second ne change rien (idempotence) ;
 *   - une valeur modifiée entre-temps dans l'application n'est jamais écrasée ;
 *   - les séances restent valides pour `validateSteps` et les espèces sont résolues par leur nom.
 *
 * Toutes les lignes posées ou modifiées sont restaurées à la fin. Patron :
 * `tests/learning-links-migration-300.test.js`. Le fichier est retrouvé par son suffixe (le
 * numéro de migration est posé par SI).
 */

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { initSchema, execute, queryOne, queryAll, splitSqlStatements } = require('../database');
const { validateSteps } = require('../lib/pedagoSessions');

const DATA_DIR = path.join(__dirname, '..', 'data', 'college-2026-11', 'd1');
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const MIGRATION = fs
  .readdirSync(MIGRATIONS_DIR)
  .find((f) => /_college_corrections_immediates\.sql$/.test(f));

const data = (name) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
const EMOJI = data('emoji.json');
const NIVEAUX = data('glossaire-niveaux.json');
const CONTENU = data('glossaire-contenu.json');
const CARTES = data('cartes.json');
const SEANCES = data('seances.json');

/** Fiche dont l'emoji a été changé « dans l'application » avant la migration. */
const FICHE_RETOUCHEE = 'Iule';
const EMOJI_RETOUCHE = '🐌';
/** Étape dont le texte a été retouché « dans l'application » avant la migration. */
const ETAPE_RETOUCHEE = { slug: '6e-biodiversite-deux-lieux', stepId: 'b3' };

const restore = [];
const plantIds = new Map();

async function runMigration() {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION), 'utf8');
  let affected = 0;
  for (const stmt of splitSqlStatements(sql)) {
    const res = await execute(stmt);
    affected += res?.affectedRows || 0;
  }
  return affected;
}

async function ensurePlant(name, emoji) {
  const row = await queryOne('SELECT id, emoji FROM plants WHERE name = ? ORDER BY id LIMIT 1', [
    name,
  ]);
  if (row) {
    restore.push(() => execute('UPDATE plants SET emoji = ? WHERE id = ?', [row.emoji, row.id]));
    if (emoji != null) await execute('UPDATE plants SET emoji = ? WHERE id = ?', [emoji, row.id]);
    plantIds.set(name, row.id);
    return row.id;
  }
  const res = await execute('INSERT INTO plants (name, emoji, description) VALUES (?, ?, ?)', [
    name,
    emoji || '🌱',
    'fixture du test de rejeu D1',
  ]);
  restore.push(() => execute('DELETE FROM plants WHERE id = ?', [res.insertId]));
  plantIds.set(name, res.insertId);
  return res.insertId;
}

async function ensureGlossaryTerm(code, terme, fields) {
  const row = await queryOne('SELECT * FROM glossary_terms WHERE glossary_code = ?', [code]);
  if (row) {
    restore.push(() =>
      execute(
        `UPDATE glossary_terms SET terme = ?, categorie = ?, niveau = ?, definition_complete = ?
          WHERE glossary_code = ?`,
        [row.terme, row.categorie, row.niveau, row.definition_complete, code],
      ),
    );
    await execute(
      `UPDATE glossary_terms SET terme = ?, categorie = COALESCE(?, categorie),
              niveau = COALESCE(?, niveau), definition_complete = COALESCE(?, definition_complete)
        WHERE glossary_code = ?`,
      [terme, fields.categorie, fields.niveau, fields.definition_complete, code],
    );
    return;
  }
  await execute(
    `INSERT INTO glossary_terms (glossary_code, terme, categorie, niveau, definition_courte, definition_complete)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      code,
      terme,
      fields.categorie || 'ecologie',
      fields.niveau || 'base',
      'fixture du test de rejeu D1',
      fields.definition_complete || null,
    ],
  );
  restore.push(() => execute('DELETE FROM glossary_terms WHERE glossary_code = ?', [code]));
}

/** Valeur d'une garde de charge utile : espèce désignée par son nom → identifiant local. */
function payloadValue(value) {
  if (value && typeof value === 'object' && value.plante) return plantIds.get(value.plante.name);
  return value;
}

/** Séance dans son ancienne forme : étapes visées d'après les gardes, autres étapes neutres. */
function oldSteps(slug) {
  const etapes = SEANCES.etapes.filter((e) => e.slug === slug);
  const insert = etapes.find((e) => e.operation === 'inserer');
  const ids =
    insert?.avant.ids ||
    {
      '6e-aquaponie-n3': ['q1', 'q2', 'q3', 'q4', 'q5'],
      '6e-biodiversite-deux-lieux': ['b1', 'b2', 'b3', 'b4', 'b5'],
    }[slug];
  const steps = ids.map((id) => ({
    id,
    title: `Étape ${id}`,
    body: 'Texte de l’étape.',
    action: { type: 'message', payload: {} },
    completeWhen: 'manual',
  }));
  for (const e of etapes.filter((x) => x.operation === 'modifier')) {
    const payload = Object.fromEntries(
      Object.entries(e.avant.payload).map(([k, v]) => [k, payloadValue(v)]),
    );
    steps[e.index] = {
      id: e.step_id,
      title: e.avant.title,
      body: e.avant.body,
      action: { type: e.avant.action_type, payload },
      completeWhen: 'manual',
    };
  }
  return steps;
}

async function ensureSession(slug, steps) {
  const row = await queryOne('SELECT id, steps_json FROM pedago_sessions WHERE slug = ?', [slug]);
  const json = JSON.stringify(steps);
  if (row) {
    restore.push(() =>
      execute('UPDATE pedago_sessions SET steps_json = ? WHERE id = ?', [row.steps_json, row.id]),
    );
    await execute('UPDATE pedago_sessions SET steps_json = ? WHERE id = ?', [json, row.id]);
    return;
  }
  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO pedago_sessions (id, slug, title, level, template_key, map_id, config_json, steps_json, is_published)
     VALUES (?, ?, ?, 'college', 'custom', 'n3', '{}', ?, 0)`,
    [id, slug, `Fixture ${slug}`, json],
  );
  restore.push(() => execute('DELETE FROM pedago_sessions WHERE id = ?', [id]));
}

async function sessionSteps(slug) {
  const row = await queryOne('SELECT steps_json FROM pedago_sessions WHERE slug = ?', [slug]);
  return JSON.parse(row.steps_json);
}

before(async () => {
  await initSchema();
  assert.ok(MIGRATION, 'migration *_college_corrections_immediates.sql introuvable');

  for (const c of EMOJI.corrections) {
    await ensurePlant(c.name, c.name === FICHE_RETOUCHEE ? EMOJI_RETOUCHE : c.avant);
  }
  const especes = SEANCES.etapes.flatMap((e) =>
    [...Object.values(e.avant.payload || {}), ...Object.values(e.apres.payload || {})]
      .filter((v) => v && typeof v === 'object' && v.plante)
      .map((v) => v.plante.name),
  );
  for (const name of new Set(especes)) {
    if (!plantIds.has(name)) await ensurePlant(name, null);
  }

  for (const c of NIVEAUX.changements) {
    await ensureGlossaryTerm(c.glossary_code, c.terme, { niveau: c.avant });
  }
  for (const c of [...CONTENU.categorie, ...CONTENU.definitions]) {
    await ensureGlossaryTerm(c.glossary_code, c.terme, { [c.champ]: c.avant });
  }

  for (const c of CARTES.changements) {
    const row = await queryOne('SELECT id, pedago_level FROM maps WHERE id = ?', [c.map_id]);
    if (row) {
      restore.push(() =>
        execute('UPDATE maps SET pedago_level = ? WHERE id = ?', [row.pedago_level, c.map_id]),
      );
      await execute('UPDATE maps SET pedago_level = ? WHERE id = ?', [c.avant, c.map_id]);
    } else {
      await execute('INSERT INTO maps (id, label, pedago_level) VALUES (?, ?, ?)', [
        c.map_id,
        'Fixture rejeu D1',
        c.avant,
      ]);
      restore.push(() => execute('DELETE FROM maps WHERE id = ?', [c.map_id]));
    }
  }

  for (const e of SEANCES.etapes.filter((x) => x.question_requise)) {
    const q = await queryOne('SELECT question_code FROM quiz_questions WHERE question_code = ?', [
      e.question_requise,
    ]);
    if (!q) {
      const cat = await queryOne('SELECT slug FROM quiz_categories ORDER BY slug LIMIT 1');
      await execute(
        `INSERT INTO quiz_questions (question_code, categorie_slug, numero_dans_categorie, question,
                choix_a, choix_b, choix_c, reponse_correcte, niveau, statut)
         VALUES (?, ?, 990, 'Fixture ?', 'A', 'B', 'C', 'A', 'college', 'actif')`,
        [e.question_requise, cat.slug],
      );
      restore.push(() =>
        execute('DELETE FROM quiz_questions WHERE question_code = ?', [e.question_requise]),
      );
    }
  }

  for (const slug of new Set(SEANCES.etapes.map((e) => e.slug))) {
    const steps = oldSteps(slug);
    if (slug === ETAPE_RETOUCHEE.slug) {
      const s = steps.find((x) => x.id === ETAPE_RETOUCHEE.stepId);
      s.body = 'Texte retouché par un professeur dans l’application.';
    }
    await ensureSession(slug, steps);
  }
});

after(async () => {
  for (const fn of restore.reverse()) await fn();
});

let firstPass = 0;
let secondPass = 0;

test('premier passage : chaque correction s’applique, sauf la ligne retouchée', async () => {
  firstPass = await runMigration();
  const attendu =
    EMOJI.corrections.length -
    1 +
    NIVEAUX.changements.length +
    CONTENU.categorie.length +
    CONTENU.definitions.length +
    CARTES.changements.length +
    SEANCES.etapes.filter((e) => e.slug !== ETAPE_RETOUCHEE.slug || e.step_id !== 'b3').length;
  assert.equal(firstPass, attendu);
});

test('second passage : rien ne change (idempotence)', async () => {
  secondPass = await runMigration();
  assert.equal(secondPass, 0);
});

test('emoji : fiches corrigées, fiche retouchée dans l’application intacte', async () => {
  for (const c of EMOJI.corrections) {
    const row = await queryOne('SELECT emoji FROM plants WHERE id = ?', [plantIds.get(c.name)]);
    const attendu = c.name === FICHE_RETOUCHEE ? EMOJI_RETOUCHE : c.apres;
    assert.equal(row.emoji, attendu, c.name);
  }
});

test('glossaire : niveaux, catégorie et définitions', async () => {
  for (const c of NIVEAUX.changements) {
    const row = await queryOne('SELECT niveau FROM glossary_terms WHERE glossary_code = ?', [
      c.glossary_code,
    ]);
    assert.equal(row.niveau, c.apres, c.terme);
  }
  for (const c of [...CONTENU.categorie, ...CONTENU.definitions]) {
    const row = await queryOne(
      `SELECT ${c.champ} AS v FROM glossary_terms WHERE glossary_code = ?`,
      [c.glossary_code],
    );
    assert.equal(row.v, c.apres, `${c.terme} · ${c.champ}`);
  }
});

test('carte de la daya sans niveau imposé', async () => {
  for (const c of CARTES.changements) {
    const row = await queryOne('SELECT pedago_level FROM maps WHERE id = ?', [c.map_id]);
    assert.equal(row.pedago_level, c.apres);
  }
});

test('séances : étapes réécrites, espèces résolues par leur nom, forme valide', async () => {
  const aqua = await sessionSteps('6e-aquaponie-n3');
  assert.equal(aqua[3].action.payload.highlightPlantId, plantIds.get('Tomate'));
  assert.equal(aqua[4].action.payload.questionCode, 'QF9893');

  const regimes = await sessionSteps('6e-regimes-alimentaires');
  assert.deepEqual(
    regimes.map((s) => s.id),
    ['a1', 'a2', 'a3', 'a4', 'a6', 'a5'],
  );
  assert.equal(regimes[0].title, 'Quatre animaux, quatre régimes');
  assert.equal(regimes[4].action.type, 'open_foodweb');
  assert.equal(regimes[4].action.payload.highlightPlantId, plantIds.get('Ténébrion meunier'));
  assert.equal(regimes[4].action.payload.mapId, null);

  const deux = await sessionSteps('6e-biodiversite-deux-lieux');
  assert.equal(deux[1].action.payload.highlightPlantId, plantIds.get('Tomate'));
  // b3 retouchée dans l'application : la garde l'a protégée.
  assert.equal(deux[2].action.payload.highlightPlantId, null);
  assert.equal(deux[2].body, 'Texte retouché par un professeur dans l’application.');

  for (const steps of [aqua, regimes, deux]) {
    assert.equal(validateSteps(steps).ok, true);
  }
});

test('aucune instruction de la migration n’écrit de structure ni de donnée personnelle', () => {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION), 'utf8');
  const statements = splitSqlStatements(sql);
  const verbs = statements.map((s) => s.trim().split(/\s+/)[0].toUpperCase());
  assert.deepEqual([...new Set(verbs)].sort(), ['SET', 'UPDATE']);
  const code = statements.join('\n');
  assert.doesNotMatch(code, /\b(users|students|teachers)\b/i);
  assert.doesNotMatch(code, /DEFINER|TRIGGER|\bDROP\b/i);
});

test('les tables visées existent (aucune instruction orpheline)', async () => {
  const rows = await queryAll(
    `SELECT TABLE_NAME AS t FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN ('plants', 'glossary_terms', 'maps', 'pedago_sessions', 'quiz_questions')`,
  );
  assert.equal(rows.length, 5);
});
