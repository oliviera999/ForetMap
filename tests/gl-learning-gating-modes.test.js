'use strict';

// Modes et granularité du conditionnement par QCM, désormais APPLIQUÉS à l'accusé
// (docs/AUDIT_GATING_QCM_FEUILLETS_2026-08.md, constats F1/F4/F5 — arbitrage « brancher »).
//
// Ce que ce fichier verrouille :
//   - `any` : une seule bonne réponse suffit, même si trois questions sont liées ;
//   - `all` : toutes sont exigées ;
//   - `threshold` : exactement N, borné au nombre de questions liées ;
//   - surcharge par ressource : `enabled = 0` dispense la ressource…
//   - …mais l'interrupteur global reste MAÎTRE : éteint, aucune surcharge ne le rallume ;
//   - granularité `team` : la bonne réponse d'un coéquipier — ou du MJ en mode animation —
//     compte pour le lecteur.

require('./helpers/setup');
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute } = require('../database');
const glSettings = require('../lib/glSettings');
const {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
  createGlChapterWithMarker,
  createGlGameWithTeams,
  signTokens,
} = require('./helpers/glFixtures');

const stamp = Date.now();
const catSlug = `gmcat${stamp}`.slice(0, 64);
const pageSlug = `gmpage${stamp}`.slice(0, 80);
const codes = ['A', 'B', 'C'].map((s) => `GM${s}${String(stamp).slice(-6)}`.slice(0, 16));
const password = 'gatingmodes1';

let player = null;
let glToken = '';
let teamToken = '';
let teamId = null;

const site = (over = {}) =>
  glSettings.setGatingCacheForTests({
    enabled: true,
    granularity: 'player',
    defaultMode: 'any',
    defaultRequiredCorrect: 1,
    retryCooldownDays: 0, // pas de verrou : ces scénarios n'échouent jamais volontairement
    ...over,
  });

const challenge = (token = glToken) =>
  request(app)
    .get(
      `/api/gl/learning/gating/challenge?resourceType=content_page&resourceRef=${encodeURIComponent(pageSlug)}`,
    )
    .set('Authorization', 'Bearer ' + token)
    .expect(200);

const mark = (token = glToken) =>
  request(app)
    .post(`/api/gl/learning/mark/content_page/${encodeURIComponent(pageSlug)}`)
    .set('Authorization', 'Bearer ' + token)
    .send({ confirm: true });

/** Marque `count` questions comme réussies par le lecteur (ou par l'équipe si teamId est passé). */
async function answerCorrectly(count, { forTeamId = null } = {}) {
  for (const code of codes.slice(0, count)) {
    await execute(
      `INSERT INTO gl_qcm_attempts
        (reader_user_type, reader_user_id, question_dataset, question_code, is_correct, team_id, answered_at)
       VALUES (?, ?, 'qcm', ?, 1, ?, NOW())`,
      [
        forTeamId ? 'gl_admin' : 'gl_player', // équipe : c'est le MJ qui a répondu
        forTeamId ? `mj-${stamp}` : String(player.id),
        code,
        forTeamId,
      ],
    );
  }
}

before(async () => {
  await initSchema();
  await execute(
    `INSERT IGNORE INTO gl_qcm_categories (slug, nom, order_index) VALUES (?, 'Modes', 999)`,
    [catSlug],
  );
  for (let i = 0; i < codes.length; i += 1) {
    await execute(
      `INSERT IGNORE INTO gl_qcm_questions
        (question_code, categorie_slug, numero_dans_categorie, question, choix_a, choix_b, choix_c, reponse_correcte, niveau)
       VALUES (?, ?, ?, 'Q ?', 'A', 'B', 'C', 'A', 'college')`,
      [codes[i], catSlug, i + 1],
    );
  }
  await execute(
    `INSERT INTO gl_content_pages (slug, title, body_markdown, updated_by, updated_at)
     VALUES (?, 'Page modes', 'Corps', 'test', NOW())
     ON DUPLICATE KEY UPDATE title = VALUES(title)`,
    [pageSlug],
  );
  // Trois questions bloquantes sur la même ressource : c'est ce qui rend les modes visibles.
  for (const code of codes) {
    await execute(
      `INSERT IGNORE INTO gl_resource_question_links
        (question_dataset, resource_type, resource_ref, question_code, is_gating, weight, origin, status)
       VALUES ('qcm', 'content_page', ?, ?, 1, 1, 'manual', 'approved')`,
      [pageSlug, code],
    );
  }

  const admin = await createGlAdmin({ email: `gm.${stamp}@ecole.local` });
  const cls = await createGlClass({ name: `Gm ${stamp}`, adminId: admin.id });
  player = await createGlPlayer({
    classId: cls.id,
    pseudo: `gm${stamp}`.slice(0, 40),
    password,
    firstName: 'Gating',
    lastName: 'Modes',
  });
  const login = await request(app)
    .post('/api/gl/auth/login')
    .send({ pseudo: player.pseudo, password });
  glToken = login.body.authToken;

  // Un second jeton pour le même joueur, mais porteur d'une équipe réelle (granularité `team`).
  const { chapter } = await createGlChapterWithMarker({ slug: `gm-chap-${stamp}` });
  const { teams } = await createGlGameWithTeams({
    classId: cls.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    name: `Partie Gm ${stamp}`,
    teams: [{ name: `Equipe Gm ${stamp}` }],
  });
  teamId = Number(teams[0].id);
  ({ playerToken: teamToken } = await signTokens({
    playerId: player.id,
    playerPseudo: player.pseudo,
    teamId,
  }));
});

beforeEach(async () => {
  await execute('DELETE FROM gl_qcm_attempts WHERE question_code IN (?, ?, ?)', codes).catch(
    () => {},
  );
  await execute('DELETE FROM gl_learning_acknowledgements WHERE target_code = ?', [pageSlug]).catch(
    () => {},
  );
  await execute('DELETE FROM gl_resource_gating_policy WHERE resource_ref = ?', [pageSlug]).catch(
    () => {},
  );
});

after(async () => {
  glSettings.setGatingCacheForTests(null);
  await execute('DELETE FROM gl_learning_acknowledgements WHERE target_code = ?', [pageSlug]).catch(
    () => {},
  );
  await execute('DELETE FROM gl_qcm_attempts WHERE question_code IN (?, ?, ?)', codes).catch(
    () => {},
  );
  await execute('DELETE FROM gl_resource_gating_policy WHERE resource_ref = ?', [pageSlug]).catch(
    () => {},
  );
  await execute('DELETE FROM gl_resource_question_links WHERE resource_ref = ?', [pageSlug]).catch(
    () => {},
  );
  await execute('DELETE FROM gl_content_pages WHERE slug = ?', [pageSlug]).catch(() => {});
  await execute('DELETE FROM gl_qcm_questions WHERE question_code IN (?, ?, ?)', codes).catch(
    () => {},
  );
  await execute('DELETE FROM gl_qcm_categories WHERE slug = ?', [catSlug]).catch(() => {});
  if (player?.id) await execute('DELETE FROM gl_players WHERE id = ?', [player.id]).catch(() => {});
});

test('mode « any » — une seule question posée, une seule bonne réponse suffit', async () => {
  site({ defaultMode: 'any' });

  const initial = await challenge();
  assert.equal(initial.body.required, true);
  assert.equal(initial.body.mode, 'any');
  assert.equal(initial.body.required_correct, 1);
  assert.equal(initial.body.questions.length, 3, 'les trois liens restent visibles');
  assert.equal(initial.body.pending_count, 1, 'mais une seule réponse est attendue');

  await mark().expect(403);

  await answerCorrectly(1);
  const after = await challenge();
  assert.equal(after.body.pending_count, 0);
  assert.equal(after.body.satisfied, true);
  await mark().expect(200);
});

test('mode « all » — les trois questions sont exigées', async () => {
  site({ defaultMode: 'all' });

  const initial = await challenge();
  assert.equal(initial.body.mode, 'all');
  assert.equal(initial.body.pending_count, 3);

  await answerCorrectly(2);
  const partial = await challenge();
  assert.equal(partial.body.pending_count, 1);
  const refus = await mark().expect(403);
  assert.equal(
    refus.body.error,
    'Répondez correctement à toutes les questions liées avant de valider.',
  );

  await answerCorrectly(3);
  await mark().expect(200);
});

test('mode « threshold » — N réussites, bornées au nombre de questions liées', async () => {
  site({ defaultMode: 'threshold', defaultRequiredCorrect: 2 });

  const initial = await challenge();
  assert.equal(initial.body.mode, 'threshold');
  assert.equal(initial.body.required_correct, 2);
  assert.equal(initial.body.pending_count, 2);

  await answerCorrectly(1);
  const refus = await mark().expect(403);
  assert.match(refus.body.error, /2 questions liées/);

  await answerCorrectly(2);
  await mark().expect(200);
});

test('mode « threshold » au-delà du nombre de questions — borné, donc satisfiable', async () => {
  site({ defaultMode: 'threshold', defaultRequiredCorrect: 25 });
  const res = await challenge();
  assert.equal(res.body.required_correct, 3, 'seuil borné aux 3 questions liées');
  await answerCorrectly(3);
  await mark().expect(200);
});

test('surcharge par ressource — « enabled = 0 » dispense cette ressource', async () => {
  site({ defaultMode: 'all' });
  await execute(
    `INSERT INTO gl_resource_gating_policy (resource_type, resource_ref, mode, required_correct, enabled)
     VALUES ('content_page', ?, 'inherit', 1, 0)
     ON DUPLICATE KEY UPDATE enabled = 0`,
    [pageSlug],
  );

  const res = await challenge();
  assert.equal(res.body.required, false, 'ressource dispensée');
  assert.equal(res.body.gating_enabled, true, 'le conditionnement reste actif ailleurs');
  await mark().expect(200);
});

test('surcharge par ressource — « mode = any » assouplit une plateforme réglée sur « all »', async () => {
  site({ defaultMode: 'all' });
  await execute(
    `INSERT INTO gl_resource_gating_policy (resource_type, resource_ref, mode, required_correct, enabled)
     VALUES ('content_page', ?, 'any', 1, 1)
     ON DUPLICATE KEY UPDATE mode = 'any', enabled = 1`,
    [pageSlug],
  );

  const res = await challenge();
  assert.equal(res.body.mode, 'any');
  assert.equal(res.body.pending_count, 1);
  await answerCorrectly(1);
  await mark().expect(200);
});

test('interrupteur global maître — éteint, une ressource « enabled = 1 » ne gate pas', async () => {
  site({ enabled: false, defaultMode: 'all' });
  await execute(
    `INSERT INTO gl_resource_gating_policy (resource_type, resource_ref, mode, required_correct, enabled)
     VALUES ('content_page', ?, 'all', 3, 1)
     ON DUPLICATE KEY UPDATE mode = 'all', enabled = 1`,
    [pageSlug],
  );

  const res = await challenge();
  assert.equal(res.body.gating_enabled, false);
  assert.equal(res.body.required, false);
  await mark().expect(200);
});

test('granularité « team » — la bonne réponse du MJ pour l’équipe compte pour le joueur', async () => {
  site({ defaultMode: 'all', granularity: 'team' });

  // Aucune réponse du joueur lui-même : tout a été saisi par le MJ, au nom de l'équipe.
  await answerCorrectly(3, { forTeamId: teamId });

  const enEquipe = await challenge(teamToken);
  assert.equal(enEquipe.body.granularity, 'team');
  assert.equal(enEquipe.body.pending_count, 0, 'les réponses de l’équipe comptent');
  await mark(teamToken).expect(200);
});

test('granularité « player » — les réponses de l’équipe ne suffisent pas', async () => {
  site({ defaultMode: 'all', granularity: 'player' });
  await answerCorrectly(3, { forTeamId: teamId });

  const res = await challenge(teamToken);
  assert.equal(res.body.pending_count, 3, 'le suivi par joueur ignore les réponses de l’équipe');
  await mark(teamToken).expect(403);
});
