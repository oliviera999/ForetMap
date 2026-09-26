'use strict';

// =====================================================================
// Caractérisation du moteur de verrouillage, produit par produit (audit du 25/09/2026,
// § 3.1 et § 3.4 ; décision Q18 du mainteneur : adaptateur de produit).
//
// Ce fichier FIGE ce que rendent aujourd'hui, pour ForetMap (`fm`) et pour Gnomes & Licornes
// (`gl`), sur un jeu minimal et entièrement maîtrisé :
//   - `getChallengeState`                  (défi d'une ressource) ;
//   - `assertGatingSatisfiedForAcknowledge` (décision à l'accusé) ;
//   - `buildGatingSummary`                  (résumé groupé) ;
//   - `getFmResourceProgressSummary`        (progression, ForetMap seulement) ;
//   - `registerCooldownOnWrongIfGating`     (écriture du verrou, les deux produits).
//
// Il a été écrit AVANT l'extraction de l'adaptateur (`lib/pedago/gatingProducts.js`) et doit
// rester vert après : c'est la preuve qu'elle ne change aucun comportement. Il fige aussi les
// défauts éventuels — une différence n'est jamais « corrigée » ici en silence.
//
// Les sorties sont comparées à `tests/fixtures/learning-gating-products.golden.json`, après
// deux normalisations seulement : les codes et références générés (horodatés) sont remplacés
// par des alias stables (`FM_QA`, `P1`…), et les champs qui dépendent de l'horloge
// (`locked_until`, `remaining_*`) par `<t>` quand ils sont renseignés.
//
// Régénérer le fichier de référence (changement de comportement VOULU, à justifier dans la PR) :
//   GATING_CHAR_RECORD=1 node --test tests/learning-gating-products-characterization.test.js
//   npx prettier --write tests/fixtures/learning-gating-products.golden.json
// =====================================================================

require('./helpers/setup');
const fs = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const database = require('../database');
const { initSchema, execute, queryOne, queryAll } = database;
const { setSetting } = require('../lib/settings');
const { snapshotSetting, restoreSetting } = require('./helpers/settingsSnapshot');
const glSettings = require('../lib/glSettings');
const gatingCore = require('../lib/shared/gatingSettingsCore');
const { quizNiveauEntryPalier } = require('../lib/pedagoScales');
const {
  getChallengeState,
  assertGatingSatisfiedForAcknowledge,
} = require('../lib/learningGatingAcknowledge');
const { buildGatingSummary } = require('../lib/learningGatingSummary');
const { getFmResourceProgressSummary } = require('../lib/learningGatingProgress');
const { registerCooldownOnWrongIfGating } = require('../lib/learningGatingRuntime');
const { invalidateStrictCodesCache } = require('../lib/learningGatingLockMode');
const {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
  createGlChapterWithMarker,
  createGlGameWithTeams,
} = require('./helpers/glFixtures');

const GOLDEN_PATH = path.join(__dirname, 'fixtures', 'learning-gating-products.golden.json');
const RECORD = process.env.GATING_CHAR_RECORD === '1';
const recorded = {};

const stamp = String(Date.now());
const tail = stamp.slice(-7);
const db = { queryAll, queryOne, execute };

/** Alias stables : valeur générée → nom lisible dans le fichier de référence. */
const aliases = new Map();
function alias(value, name) {
  aliases.set(String(value), name);
  return value;
}

// --- ForetMap ---------------------------------------------------------
const fmCat = `chfm${stamp}`.slice(0, 64);
const FM_QA = alias(`CQA${tail}`, 'FM_QA'); // collège, active
const FM_QB = alias(`CQB${tail}`, 'FM_QB'); // lycée, active
const FM_QC = alias(`CQC${tail}`, 'FM_QC'); // collège, INACTIVE (brouillon)
const S1 = alias(`ch-s1-${stamp}`, 'S1'); // QA juste ; verrou sur P2
const S2 = alias(`ch-s2-${stamp}`, 'S2'); // aucune réponse
const S3 = alias(`ch-s3-${stamp}`, 'S3'); // QA et QB justes
const S4 = alias(`ch-s4-${stamp}`, 'S4'); // écritures de verrou (défi → mauvaise réponse)
const plants = {};

// --- Gnomes & Licornes -------------------------------------------------
const glCat = `chgl${stamp}`.slice(0, 64);
const GL_GA = alias(`CGA${tail}`, 'GL_GA'); // active
const GL_GB = alias(`CGB${tail}`, 'GL_GB'); // active
const GL_GC = alias(`CGC${tail}`, 'GL_GC'); // INACTIVE
const GL_LX = alias(`CLX${tail}`, 'GL_LX'); // lien « qcm_lore » vers une question absente
const R1 = alias(`ch-r1-${stamp}`.slice(0, 64), 'R1');
const R2 = alias(`ch-r2-${stamp}`.slice(0, 64), 'R2');
const R3 = alias(`ch-r3-${stamp}`.slice(0, 64), 'R3');
const R4 = alias(`ch-r4-${stamp}`.slice(0, 64), 'R4');
let player = null;
let teamId = null;
let glAuth = null;
let glAuthNoTeam = null;
let mjAuth = null;

const fmSettingSnapshots = [];
let fmTypePolicyRow = null;
let glTypePolicyRow = null;

const TIME_KEYS = new Set([
  'locked_until',
  'remaining_ms',
  'remaining_hours',
  'remaining_days',
  'remaining_label',
]);

/** Normalise une sortie : alias pour les valeurs générées, `<t>` pour l'horloge. */
function canon(value) {
  if (Array.isArray(value)) return value.map(canon);
  if (value instanceof Set) return [...value].map(canon);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (TIME_KEYS.has(k) && v) out[k] = '<t>';
      else out[k] = canon(v);
    }
    return out;
  }
  // Chaînes seulement : un compteur numérique ne doit jamais être pris pour un identifiant.
  if (typeof value === 'string' && aliases.has(value)) return aliases.get(value);
  return value;
}

/** Compare à la référence (ou l'enregistre en mode GATING_CHAR_RECORD=1). */
function expectGolden(name, actual) {
  const normalized = canon(actual);
  if (RECORD) {
    recorded[name] = normalized;
    return;
  }
  const golden = JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf8'));
  assert.ok(Object.hasOwn(golden, name), `référence absente : ${name}`);
  assert.deepStrictEqual(normalized, golden[name], name);
}

const collegeLevel = { maxPalier: quizNiveauEntryPalier('college') };

async function insertPolicy(table, resourceType, resourceRef, fields) {
  const cols = [
    'mode',
    'required_correct',
    'enabled',
    'allowed_wrong_attempts',
    'max_questions_per_session',
    'retry_cooldown_days',
    'retry_cooldown_hours',
    'cooldown_scope',
    'lock_mode',
    'granularity',
  ];
  const row = {
    mode: 'inherit',
    required_correct: 1,
    enabled: 1,
    allowed_wrong_attempts: null,
    max_questions_per_session: null,
    retry_cooldown_days: null,
    retry_cooldown_hours: null,
    cooldown_scope: null,
    lock_mode: null,
    granularity: null,
    ...fields,
  };
  await execute(
    `INSERT INTO ${table} (resource_type, resource_ref, ${cols.join(', ')})
     VALUES (?, ?, ${cols.map(() => '?').join(', ')})`,
    [resourceType, resourceRef, ...cols.map((c) => row[c])],
  );
}

async function restoreTypePolicy(table, resourceType, row) {
  await execute(`DELETE FROM ${table} WHERE resource_type = ? AND resource_ref = '*'`, [
    resourceType,
  ]);
  if (!row) return;
  const cols = Object.keys(row);
  await execute(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    cols.map((c) => row[c]),
  );
}

function setGlSite(over = {}) {
  glSettings.setGatingCacheForTests({
    enabled: true,
    granularity: 'player',
    defaultMode: 'any',
    defaultRequiredCorrect: 1,
    allowedWrongAttempts: 0,
    retryCooldownHours: 6,
    lockMode: 'advisory',
    cooldownScope: 'resource',
    maxQuestionsPerSession: 3,
    announceOnButton: false,
    stateIcons: true,
    ...over,
  });
}

before(async () => {
  await initSchema();

  // --- Réglages du site ForetMap : tous posés explicitement, restaurés à la fin.
  for (const name of gatingCore.GATING_SETTING_NAMES) {
    const def = gatingCore.GATING_SETTING_DEFS[name];
    if (def.fmKey) fmSettingSnapshots.push(await snapshotSetting(def.fmKey));
  }
  const fmSite = {
    'learning.gating.enabled': true,
    'learning.gating.default_mode': 'any',
    'learning.gating.default_required_correct': 1,
    'learning.gating.allowed_wrong_attempts': 0,
    'learning.gating.retry_cooldown_hours': 6,
    'learning.gating.lock_mode': 'advisory',
    'learning.gating.cooldown_scope': 'resource',
    'learning.gating.max_questions_per_session': 3,
    'learning.gating.announce_on_button': true,
    'learning.gating.state_icons': false,
  };
  for (const [key, value] of Object.entries(fmSite)) await setSetting(key, value, {});

  // --- Couche « type » : retirée pendant le test (préréglages de migration), puis rétablie.
  fmTypePolicyRow =
    (await queryOne(
      "SELECT * FROM resource_gating_policy WHERE resource_type = 'plant' AND resource_ref = '*'",
    )) || null;
  await execute(
    "DELETE FROM resource_gating_policy WHERE resource_type = 'plant' AND resource_ref = '*'",
  );
  glTypePolicyRow =
    (await queryOne(
      "SELECT * FROM gl_resource_gating_policy WHERE resource_type = 'content_page' AND resource_ref = '*'",
    )) || null;
  await execute(
    "DELETE FROM gl_resource_gating_policy WHERE resource_type = 'content_page' AND resource_ref = '*'",
  );

  // --- ForetMap : questions, fiches, liens, politiques, élèves.
  await execute(
    "INSERT INTO quiz_categories (slug, nom, theme, order_index) VALUES (?, 'CH', 'sciences', 999)",
    [fmCat],
  );
  for (const [code, niveau, n, statut] of [
    [FM_QA, 'college', 1, 'actif'],
    [FM_QB, 'lycee', 2, 'actif'],
    [FM_QC, 'college', 3, 'brouillon'],
  ]) {
    await execute(
      `INSERT INTO quiz_questions
        (question_code, categorie_slug, numero_dans_categorie, question, choix_a, choix_b, choix_c,
         reponse_correcte, niveau, statut)
       VALUES (?, ?, ?, 'Q ?', 'A', 'B', 'C', 'A', ?, ?)`,
      [code, fmCat, n, niveau, statut],
    );
  }
  for (const key of ['P1', 'P2', 'P3', 'P4']) {
    const res = await execute("INSERT INTO plants (name, emoji) VALUES (?, '🌿')", [
      `CH ${key} ${stamp}`,
    ]);
    plants[key] = String(res.insertId);
    alias(plants[key], key);
  }
  const fmLink = (ref, code, weight) =>
    execute(
      `INSERT INTO resource_question_links
        (resource_type, resource_ref, question_code, is_gating, weight, origin, status)
       VALUES ('plant', ?, ?, 1, ?, 'manual', 'approved')`,
      [ref, code, weight],
    );
  await fmLink(plants.P1, FM_QA, 2);
  await fmLink(plants.P1, FM_QB, 1);
  await fmLink(plants.P1, FM_QC, 3);
  await fmLink(plants.P2, FM_QB, 1);
  await fmLink(plants.P4, FM_QA, 1);
  await insertPolicy('resource_gating_policy', 'plant', plants.P1, {
    mode: 'threshold',
    required_correct: 2,
    allowed_wrong_attempts: 1,
    max_questions_per_session: 1,
    retry_cooldown_hours: 0,
    cooldown_scope: 'resource',
    lock_mode: 'advisory',
    granularity: 'team',
  });
  await insertPolicy('resource_gating_policy', 'plant', plants.P2, {
    mode: 'all',
    allowed_wrong_attempts: 0,
    max_questions_per_session: 3,
    retry_cooldown_hours: 48,
    cooldown_scope: 'resource',
    lock_mode: 'flow',
  });
  await insertPolicy('resource_gating_policy', 'plant', plants.P3, { mode: 'any' });
  await insertPolicy('resource_gating_policy', 'plant', plants.P4, { mode: 'any', enabled: 0 });
  for (const id of [S1, S2, S3, S4]) {
    await execute(
      `INSERT INTO users (id, user_type, pseudo, display_name, is_active, created_at, updated_at)
       VALUES (?, 'student', ?, 'CH', 1, NOW(), NOW())`,
      [id, `ch${id.slice(3, 5)}${stamp}`.slice(0, 50)],
    );
  }
  const answer = (userId, code, ok) =>
    execute(
      'INSERT INTO user_quiz_attempts (user_id, question_code, is_correct) VALUES (?, ?, ?)',
      [userId, code, ok ? 1 : 0],
    );
  await answer(S1, FM_QA, true);
  await answer(S1, FM_QB, false);
  await answer(S3, FM_QA, true);
  await answer(S3, FM_QB, true);
  await execute(
    `INSERT INTO resource_gating_cooldowns
      (user_id, resource_type, resource_ref, question_code, locked_until, wrong_question_code, wrong_attempts)
     VALUES (?, 'plant', ?, '', DATE_ADD(NOW(), INTERVAL 40 HOUR), ?, 1)`,
    [S1, plants.P2, FM_QB],
  );
  await execute(
    `INSERT INTO user_plant_observation_events (user_id, plant_id, observed_at)
     VALUES (?, ?, NOW(3))`,
    [S3, Number(plants.P1)],
  );

  // --- Gnomes & Licornes : questions, liens, politiques, joueur et équipe.
  await execute("INSERT INTO gl_qcm_categories (slug, nom, order_index) VALUES (?, 'CH', 999)", [
    glCat,
  ]);
  for (const [code, n, statut] of [
    [GL_GA, 1, 'actif'],
    [GL_GB, 2, 'actif'],
    [GL_GC, 3, 'brouillon'],
  ]) {
    await execute(
      `INSERT INTO gl_qcm_questions
        (question_code, biome_slug, categorie_slug, numero_dans_categorie, question, choix_a, choix_b,
         choix_c, choix_d, choix_e, reponse_correcte, niveau, statut)
       VALUES (?, 'savane', ?, ?, 'Q ?', 'A', 'B', 'C', 'D', 'E', 'A', 'college', ?)`,
      [code, glCat, n, statut],
    );
  }
  const glLink = (ref, code, weight, dataset = 'qcm') =>
    execute(
      `INSERT INTO gl_resource_question_links
        (question_dataset, resource_type, resource_ref, question_code, is_gating, weight, origin, status)
       VALUES (?, 'content_page', ?, ?, 1, ?, 'manual', 'approved')`,
      [dataset, ref, code, weight],
    );
  await glLink(R1, GL_GA, 2);
  await glLink(R1, GL_GB, 1);
  await glLink(R1, GL_GC, 3);
  await glLink(R1, GL_LX, 5, 'qcm_lore');
  await glLink(R2, GL_GB, 1);
  await glLink(R4, GL_GA, 1);
  await insertPolicy('gl_resource_gating_policy', 'content_page', R1, {
    mode: 'threshold',
    required_correct: 2,
    allowed_wrong_attempts: 1,
    max_questions_per_session: 1,
    retry_cooldown_hours: 0,
    cooldown_scope: 'resource',
    lock_mode: 'advisory',
    granularity: 'team',
  });
  await insertPolicy('gl_resource_gating_policy', 'content_page', R2, {
    mode: 'all',
    allowed_wrong_attempts: 0,
    max_questions_per_session: 3,
    retry_cooldown_hours: 48,
    cooldown_scope: 'resource',
    lock_mode: 'flow',
    granularity: 'player',
  });
  await insertPolicy('gl_resource_gating_policy', 'content_page', R3, { mode: 'any' });
  await insertPolicy('gl_resource_gating_policy', 'content_page', R4, { mode: 'any', enabled: 0 });

  const admin = await createGlAdmin({ email: `ch.${stamp}@ecole.local` });
  const cls = await createGlClass({ name: `Ch ${stamp}`, adminId: admin.id });
  player = await createGlPlayer({
    classId: cls.id,
    pseudo: `ch${stamp}`.slice(0, 40),
    password: 'caracterisation1',
    firstName: 'Carac',
    lastName: 'Terisation',
  });
  alias(String(player.id), 'PLAYER');
  const { chapter } = await createGlChapterWithMarker({ slug: `ch-chap-${stamp}` });
  const { teams } = await createGlGameWithTeams({
    classId: cls.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    name: `Partie Ch ${stamp}`,
    teams: [{ name: `Equipe Ch ${stamp}` }],
  });
  teamId = Number(teams[0].id);
  glAuth = { userType: 'gl_player', userId: String(player.id), teamId };
  glAuthNoTeam = { userType: 'gl_player', userId: String(player.id) };
  mjAuth = { userType: 'gl_admin', userId: alias(`mj-ch-${stamp}`, 'MJ') };
  // Le joueur a réussi GA lui-même ; GB a été réussie par le MJ POUR l'équipe.
  await execute(
    `INSERT INTO gl_qcm_attempts
      (reader_user_type, reader_user_id, question_dataset, question_code, is_correct, team_id, answered_at)
     VALUES ('gl_player', ?, 'qcm', ?, 1, NULL, NOW())`,
    [String(player.id), GL_GA],
  );
  await execute(
    `INSERT INTO gl_qcm_attempts
      (reader_user_type, reader_user_id, question_dataset, question_code, is_correct, team_id, answered_at)
     VALUES ('gl_admin', ?, 'qcm', ?, 1, ?, NOW())`,
    [mjAuth.userId, GL_GB, teamId],
  );
  await execute(
    `INSERT INTO gl_resource_gating_cooldowns
      (reader_user_type, reader_user_id, resource_type, resource_ref, question_code,
       locked_until, wrong_question_code, wrong_attempts)
     VALUES ('gl_player', ?, 'content_page', ?, '', DATE_ADD(NOW(), INTERVAL 40 HOUR), ?, 1)`,
    [String(player.id), R2, GL_GB],
  );
  setGlSite();
  invalidateStrictCodesCache();
});

after(async () => {
  if (RECORD) {
    fs.mkdirSync(path.dirname(GOLDEN_PATH), { recursive: true });
    fs.writeFileSync(GOLDEN_PATH, `${JSON.stringify(recorded, null, 2)}\n`);
  }
  glSettings.setGatingCacheForTests(null);
  const fmRefs = Object.values(plants);
  const glRefs = [R1, R2, R3, R4];
  const clean = (sql, params) => execute(sql, params).catch(() => {});
  if (fmRefs.length) {
    const ph = fmRefs.map(() => '?').join(', ');
    await clean(
      `DELETE FROM resource_gating_cooldowns WHERE resource_type = 'plant' AND resource_ref IN (${ph})`,
      fmRefs,
    );
    await clean(
      `DELETE FROM resource_gating_policy WHERE resource_type = 'plant' AND resource_ref IN (${ph})`,
      fmRefs,
    );
    await clean(
      `DELETE FROM resource_question_links WHERE resource_type = 'plant' AND resource_ref IN (${ph})`,
      fmRefs,
    );
    await clean(
      `DELETE FROM user_plant_observation_events WHERE plant_id IN (${ph})`,
      fmRefs.map(Number),
    );
    await clean(`DELETE FROM plants WHERE id IN (${ph})`, fmRefs.map(Number));
  }
  await clean('DELETE FROM user_quiz_attempts WHERE user_id IN (?, ?, ?, ?)', [S1, S2, S3, S4]);
  await clean('DELETE FROM users WHERE id IN (?, ?, ?, ?)', [S1, S2, S3, S4]);
  await clean('DELETE FROM quiz_questions WHERE question_code IN (?, ?, ?)', [FM_QA, FM_QB, FM_QC]);
  await clean('DELETE FROM quiz_categories WHERE slug = ?', [fmCat]);
  await clean(
    `DELETE FROM gl_resource_gating_cooldowns WHERE resource_ref IN (?, ?, ?, ?)`,
    glRefs,
  );
  await clean(`DELETE FROM gl_resource_gating_policy WHERE resource_ref IN (?, ?, ?, ?)`, glRefs);
  await clean(`DELETE FROM gl_resource_question_links WHERE resource_ref IN (?, ?, ?, ?)`, glRefs);
  await clean('DELETE FROM gl_qcm_attempts WHERE question_code IN (?, ?, ?)', [
    GL_GA,
    GL_GB,
    GL_GC,
  ]);
  await clean('DELETE FROM gl_qcm_questions WHERE question_code IN (?, ?, ?)', [
    GL_GA,
    GL_GB,
    GL_GC,
  ]);
  await clean('DELETE FROM gl_qcm_categories WHERE slug = ?', [glCat]);
  if (player?.id) await clean('DELETE FROM gl_players WHERE id = ?', [player.id]);
  await restoreTypePolicy('resource_gating_policy', 'plant', fmTypePolicyRow).catch(() => {});
  await restoreTypePolicy('gl_resource_gating_policy', 'content_page', glTypePolicyRow).catch(
    () => {},
  );
  for (const snap of fmSettingSnapshots) await restoreSetting(snap).catch(() => {});
  invalidateStrictCodesCache();
});

// ---------------------------------------------------------------------
// ForetMap
// ---------------------------------------------------------------------

test('FM — getChallengeState : seuil, question inactive écartée, ordre des liens', async () => {
  const fmState = (resourceRef, extra = {}) =>
    getChallengeState(db, { product: 'fm', resourceType: 'plant', resourceRef, ...extra });
  expectGolden('fm.challenge.P1.S1', await fmState(plants.P1, { userId: S1 }));
  expectGolden('fm.challenge.P1.S3', await fmState(plants.P1, { userId: S3 }));
  expectGolden(
    'fm.challenge.P1.S1.college',
    await fmState(plants.P1, { userId: S1, learnerLevel: collegeLevel }),
  );
  expectGolden(
    'fm.challenge.P2.S1.college',
    await fmState(plants.P2, { userId: S1, learnerLevel: collegeLevel }),
  );
  expectGolden('fm.challenge.P2.S2', await fmState(plants.P2, { userId: S2 }));
  expectGolden('fm.challenge.P3.S1', await fmState(plants.P3, { userId: S1 }));
  expectGolden('fm.challenge.P4.S1', await fmState(plants.P4, { userId: S1 }));
  expectGolden('fm.challenge.P1.anonymous', await fmState(plants.P1));
  expectGolden('fm.challenge.P1.skip', await fmState(plants.P1, { userId: S1, skipGating: true }));
  expectGolden(
    'fm.challenge.badType',
    await getChallengeState(db, {
      product: 'fm',
      resourceType: 'zone',
      resourceRef: '1',
      userId: S1,
    }),
  );
  expectGolden(
    'fm.challenge.foretmapAlias',
    await getChallengeState(db, {
      product: ' ForetMap ',
      resourceType: 'plant',
      resourceRef: plants.P1,
      userId: S1,
    }),
  );
  expectGolden(
    'fm.challenge.unknownProduct',
    await getChallengeState(db, {
      product: 'xx',
      resourceType: 'plant',
      resourceRef: plants.P1,
      userId: S1,
    }),
  );
});

test('FM — assertGatingSatisfiedForAcknowledge : refus, verrou, niveau, dispense', async () => {
  const ack = (resourceRef, extra = {}) =>
    assertGatingSatisfiedForAcknowledge(db, {
      product: 'fm',
      resourceType: 'plant',
      resourceRef,
      ...extra,
    });
  expectGolden('fm.ack.P1.S1', await ack(plants.P1, { userId: S1 }));
  expectGolden('fm.ack.P1.S2', await ack(plants.P1, { userId: S2 }));
  expectGolden('fm.ack.P1.S3', await ack(plants.P1, { userId: S3 }));
  expectGolden(
    'fm.ack.P1.S1.college',
    await ack(plants.P1, { userId: S1, learnerLevel: collegeLevel }),
  );
  expectGolden('fm.ack.P2.S1', await ack(plants.P2, { userId: S1 }));
  expectGolden('fm.ack.P2.S2', await ack(plants.P2, { userId: S2 }));
  expectGolden('fm.ack.P3.S2', await ack(plants.P3, { userId: S2 }));
  expectGolden('fm.ack.P1.anonymous', await ack(plants.P1));
});

test('FM — buildGatingSummary : liste groupée, dispense « déjà fait », niveau', async () => {
  const rawRefs = [plants.P1, plants.P2, plants.P3, plants.P4, 'inconnue', plants.P1].join(',');
  expectGolden(
    'fm.summary.S1',
    await buildGatingSummary(db, {
      product: 'fm',
      resourceType: 'plant',
      rawRefs,
      userId: S1,
      isAlreadyDone: async (_type, ref) => ref === plants.P3,
    }),
  );
  expectGolden(
    'fm.summary.S1.college',
    await buildGatingSummary(db, {
      product: 'fm',
      resourceType: 'plant',
      rawRefs,
      userId: S1,
      learnerLevel: collegeLevel,
    }),
  );
  expectGolden(
    'fm.summary.anonymous',
    await buildGatingSummary(db, { product: 'fm', resourceType: 'plant', rawRefs }),
  );
});

test('FM — progression (vue professeur) sur trois élèves maîtrisés', async () => {
  // Seule la liste des élèves est remplacée : la requête lit TOUS les comptes élèves de la
  // base, ce qui rendrait les totaux dépendants des autres fichiers de test.
  const scopedDb = {
    queryOne,
    execute,
    queryAll: (sql, params) =>
      /FROM users u\s+INNER JOIN user_roles/.test(sql)
        ? Promise.resolve([{ id: S1 }, { id: S2 }, { id: S3 }])
        : queryAll(sql, params),
  };
  for (const key of ['P1', 'P2', 'P3', 'P4']) {
    expectGolden(
      `fm.progress.${key}`,
      await getFmResourceProgressSummary(scopedDb, {
        resourceType: 'plant',
        resourceRef: plants[key],
      }),
    );
  }
});

test('FM — registerCooldownOnWrongIfGating : tolérance de la fiche, puis verrou', async () => {
  const wrong = (resourceRef, questionCode, extra = {}) =>
    registerCooldownOnWrongIfGating(db, {
      product: 'fm',
      userId: S4,
      resourceType: 'plant',
      resourceRef,
      questionCode,
      isCorrect: false,
      ...extra,
    });
  // P1 : délai 0 → aucun verrou.
  expectGolden('fm.cooldown.P1.first', await wrong(plants.P1, FM_QA));
  // P2 : tolérance 0, délai 48 h → verrou dès la première faute.
  expectGolden('fm.cooldown.P2.first', await wrong(plants.P2, FM_QB));
  // Question non bloquante pour P2 → rien.
  expectGolden('fm.cooldown.P2.notLinked', await wrong(plants.P2, FM_QA));
  expectGolden('fm.cooldown.P2.correct', await wrong(plants.P2, FM_QB, { isCorrect: true }));
  expectGolden('fm.cooldown.P2.noUser', await wrong(plants.P2, FM_QB, { userId: null }));
  const rows = await queryAll(
    `SELECT resource_ref, question_code, wrong_question_code, wrong_attempts
       FROM resource_gating_cooldowns WHERE user_id = ? ORDER BY resource_ref, question_code`,
    [S4],
  );
  expectGolden('fm.cooldown.rows', rows);
});

// ---------------------------------------------------------------------
// Gnomes & Licornes
// ---------------------------------------------------------------------

test('GL — getChallengeState : équipe, jeux de questions, niveau ignoré', async () => {
  const glState = (resourceRef, extra = {}) =>
    getChallengeState(db, {
      product: 'gl',
      resourceType: 'content_page',
      resourceRef,
      glAuth,
      ...extra,
    });
  expectGolden('gl.challenge.R1.team', await glState(R1));
  expectGolden('gl.challenge.R1.college', await glState(R1, { learnerLevel: collegeLevel }));
  expectGolden('gl.challenge.R1.noTeam', await glState(R1, { glAuth: glAuthNoTeam }));
  expectGolden(
    'gl.challenge.R1.chapterPlayer',
    await glState(R1, { chapterGranularity: 'player' }),
  );
  expectGolden('gl.challenge.R1.mj', await glState(R1, { glAuth: mjAuth }));
  expectGolden('gl.challenge.R2', await glState(R2));
  expectGolden('gl.challenge.R3', await glState(R3));
  expectGolden('gl.challenge.R4', await glState(R4));
  expectGolden('gl.challenge.R1.noReader', await glState(R1, { glAuth: null }));
  expectGolden(
    'gl.challenge.badType',
    await getChallengeState(db, {
      product: 'gl',
      resourceType: 'plant',
      resourceRef: R1,
      glAuth,
    }),
  );
});

test('GL — assertGatingSatisfiedForAcknowledge', async () => {
  const ack = (resourceRef, extra = {}) =>
    assertGatingSatisfiedForAcknowledge(db, {
      product: 'gl',
      resourceType: 'content_page',
      resourceRef,
      glAuth,
      ...extra,
    });
  expectGolden('gl.ack.R1.team', await ack(R1));
  expectGolden('gl.ack.R1.noTeam', await ack(R1, { glAuth: glAuthNoTeam }));
  expectGolden('gl.ack.R1.college', await ack(R1, { learnerLevel: collegeLevel }));
  expectGolden('gl.ack.R2', await ack(R2));
  expectGolden('gl.ack.R2.mj', await ack(R2, { glAuth: mjAuth }));
  expectGolden('gl.ack.R3', await ack(R3));
  expectGolden('gl.ack.R1.noReader', await ack(R1, { glAuth: null }));
});

test('GL — buildGatingSummary : réponses d’équipe comptées selon la granularité', async () => {
  const rawRefs = [R1, R2, R3, R4, R1].join(',');
  expectGolden(
    'gl.summary.player',
    await buildGatingSummary(db, {
      product: 'gl',
      resourceType: 'content_page',
      rawRefs,
      glAuth,
      isAlreadyDone: async (_type, ref) => ref === R3,
      learnerLevel: collegeLevel,
    }),
  );
  expectGolden(
    'gl.summary.noTeam',
    await buildGatingSummary(db, {
      product: 'gl',
      resourceType: 'content_page',
      rawRefs,
      glAuth: glAuthNoTeam,
    }),
  );
  expectGolden(
    'gl.summary.anonymous',
    await buildGatingSummary(db, { product: 'gl', resourceType: 'content_page', rawRefs }),
  );
});

test('GL — registerCooldownOnWrongIfGating', async () => {
  const wrong = (resourceRef, questionCode, extra = {}) =>
    registerCooldownOnWrongIfGating(db, {
      product: 'gl',
      glAuth: mjAuth,
      resourceType: 'content_page',
      resourceRef,
      questionCode,
      isCorrect: false,
      ...extra,
    });
  expectGolden('gl.cooldown.R1.first', await wrong(R1, GL_GA));
  expectGolden('gl.cooldown.R2.first', await wrong(R2, GL_GB));
  expectGolden('gl.cooldown.R2.notLinked', await wrong(R2, GL_GA));
  expectGolden('gl.cooldown.R2.noReader', await wrong(R2, GL_GB, { glAuth: null }));
  const rows = await queryAll(
    `SELECT resource_ref, question_code, wrong_question_code, wrong_attempts
       FROM gl_resource_gating_cooldowns
      WHERE reader_user_type = ? AND reader_user_id = ? ORDER BY resource_ref, question_code`,
    [mjAuth.userType, mjAuth.userId],
  );
  expectGolden('gl.cooldown.rows', rows);
});

test('Interrupteur global maître : site éteint → aucun défi, pour chaque produit', async () => {
  await setSetting('learning.gating.enabled', false, {});
  setGlSite({ enabled: false });
  try {
    expectGolden(
      'off.fm',
      await getChallengeState(db, {
        product: 'fm',
        resourceType: 'plant',
        resourceRef: plants.P1,
        userId: S1,
      }),
    );
    expectGolden(
      'off.gl',
      await getChallengeState(db, {
        product: 'gl',
        resourceType: 'content_page',
        resourceRef: R1,
        glAuth,
      }),
    );
    expectGolden(
      'off.fm.cooldown',
      await registerCooldownOnWrongIfGating(db, {
        product: 'fm',
        userId: S2,
        resourceType: 'plant',
        resourceRef: plants.P2,
        questionCode: FM_QB,
        isCorrect: false,
      }),
    );
  } finally {
    await setSetting('learning.gating.enabled', true, {});
    setGlSite();
  }
});
