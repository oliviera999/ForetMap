'use strict';

/**
 * Outils de domaine pédagogiques (lot D2) : `foretmap_tutorials`, `foretmap_learning`,
 * `foretmap_quiz`, `foretmap_glossary`, `foretmap_curriculum`, `foretmap_pedago_sessions`.
 * Lectures, écritures par le pont avec leur effet métier, refus nominatif sans bypass,
 * domaines désactivés ; nouvelles routes `GET /api/tutorials/:id/reads` et
 * `DELETE /api/pedago-sessions/:idOrSlug`.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const fx = require('./helpers/mcpFixtures');
const { initSchema, queryOne, queryAll, execute } = require('../database');

fx.enableMcpEnv();

const { app } = require('../server');

const stamp = Date.now().toString(36);
let adminToken;
let admin;
let student;
let zoneId;
let mapId;
let taskId;
let groupId;
let categorySlug;
let tutorialId;
let questionCode;
let sessionId;
let glossaryCode;
let savedTermNotions = [];
let customRoleId;

async function appToken(account, userType = 'teacher') {
  const { buildSessionPayload } = require('../lib/auth/sessionPayload');
  const { signJwtToken } = require('../lib/auth/jwtPipeline');
  const { JWT_SECRET } = require('../middleware/requireTeacher');
  const session = await buildSessionPayload(userType, account.id);
  return signJwtToken(
    { ...session.tokenPayload, sessionStartedAt: Math.floor(Date.now() / 1000) },
    JWT_SECRET,
    { expiresIn: 600 },
  );
}

const call = (name, args) => fx.callTool(app, adminToken, name, args);

test.before(async () => {
  await initSchema();
  admin = await fx.createAccount('admin');
  adminToken = (await fx.obtainTokens(app, admin)).access_token;
  student = await fx.createAccount('eleve_novice', { userType: 'student' });
  const zone = await queryOne('SELECT id, map_id FROM zones ORDER BY map_id, id LIMIT 1');
  zoneId = zone.id;
  mapId = zone.map_id;
  taskId = `mcp-task-${stamp}`;
  await execute(
    "INSERT INTO tasks (id, title, map_id, status, created_at) VALUES (?, ?, ?, 'available', '2026-10-01')",
    [taskId, `Tâche MCP ${stamp}`, mapId],
  );
  groupId = `mcp-grp-p-${stamp}`;
  await execute(
    "INSERT INTO `groups` (id, slug, name, kind, is_active) VALUES (?, ?, ?, 'class', 1)",
    [groupId, groupId, `Classe ${groupId}`],
  );
  await execute(
    "INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, 'student')",
    [groupId, student.id],
  );
  categorySlug = (await queryOne('SELECT slug FROM quiz_categories ORDER BY slug LIMIT 1')).slug;
  const term = await queryOne(
    "SELECT glossary_code FROM glossary_terms WHERE statut = 'actif' ORDER BY glossary_code LIMIT 1",
  );
  glossaryCode = term.glossary_code;
  savedTermNotions = await queryAll(
    'SELECT notion_id, mode FROM glossary_term_notions WHERE glossary_code = ?',
    [glossaryCode],
  );
});

test.after(async () => {
  if (tutorialId) {
    await execute(
      "DELETE FROM resource_question_links WHERE resource_type = 'tutorial' AND resource_ref = ?",
      [String(tutorialId)],
    );
    await execute(
      "DELETE FROM resource_gating_policy WHERE resource_type = 'tutorial' AND resource_ref = ?",
      [String(tutorialId)],
    );
    await execute('DELETE FROM tutorials WHERE id = ?', [tutorialId]);
  }
  if (questionCode)
    await execute('DELETE FROM quiz_questions WHERE question_code = ?', [questionCode]);
  if (sessionId) await execute('DELETE FROM pedago_sessions WHERE id = ?', [sessionId]);
  await execute('DELETE FROM tasks WHERE id = ?', [taskId]);
  await execute('DELETE FROM `groups` WHERE id = ?', [groupId]);
  // Notions du terme de glossaire : état d'origine rétabli.
  await execute('DELETE FROM glossary_term_notions WHERE glossary_code = ?', [glossaryCode]);
  for (const r of savedTermNotions) {
    await execute(
      'INSERT INTO glossary_term_notions (glossary_code, notion_id, mode) VALUES (?, ?, ?)',
      [glossaryCode, r.notion_id, r.mode],
    );
  }
  await fx.cleanupAccounts();
  if (customRoleId) {
    await execute('DELETE FROM role_permissions WHERE role_id = ?', [customRoleId]);
    await execute('DELETE FROM roles WHERE id = ?', [customRoleId]);
  }
});

test.beforeEach(() => fx.enableMcpEnv());

test('tutoriels : créer, lier / délier (zone, tâche, question), lectures, archiver', async () => {
  const c = await call('foretmap_tutorials', {
    action: 'create',
    data: { title: `Tuto MCP ${stamp}`, type: 'html', html_content: '<p>Paillage</p>' },
  });
  assert.equal(c.isError, false, c.text);
  tutorialId = c.data.id;

  // Question de quiz créée par l'outil quiz (code et numéro attribués).
  const q = await call('foretmap_quiz', {
    action: 'create',
    data: {
      categorie_slug: categorySlug,
      question: `Question MCP ${stamp} : que protège le paillage ?`,
      choix_a: 'Le sol',
      choix_b: 'Le ciel',
      choix_c: 'La lune',
      reponse_correcte: 'A',
      niveau: 'college',
      difficulte: 1,
    },
  });
  assert.equal(q.isError, false, q.text);
  questionCode = q.data.question.question_code;

  const lz = await call('foretmap_tutorials', {
    action: 'link',
    tutorial_id: tutorialId,
    target_type: 'zone',
    target_id: zoneId,
  });
  assert.equal(lz.isError, false, lz.text);
  assert.ok(
    await queryOne('SELECT 1 AS x FROM tutorial_zones WHERE tutorial_id = ? AND zone_id = ?', [
      tutorialId,
      zoneId,
    ]),
  );
  const lt = await call('foretmap_tutorials', {
    action: 'link',
    tutorial_id: tutorialId,
    target_type: 'task',
    target_id: taskId,
  });
  assert.equal(lt.isError, false, lt.text);
  assert.ok(
    await queryOne('SELECT 1 AS x FROM task_tutorials WHERE task_id = ? AND tutorial_id = ?', [
      taskId,
      tutorialId,
    ]),
  );
  const lq = await call('foretmap_tutorials', {
    action: 'link',
    tutorial_id: tutorialId,
    target_type: 'question',
    target_id: questionCode,
  });
  assert.equal(lq.isError, false, lq.text);
  const link = await queryOne(
    "SELECT status, is_gating FROM resource_question_links WHERE resource_type = 'tutorial' AND resource_ref = ? AND question_code = ?",
    [String(tutorialId), questionCode],
  );
  assert.equal(link.status, 'approved');
  assert.equal(Number(link.is_gating), 0, 'non bloquant par défaut');

  const get = await call('foretmap_tutorials', { action: 'get', tutorial_id: tutorialId });
  assert.equal(get.isError, false, get.text);
  assert.ok(get.data.zone_ids.includes(zoneId));
  assert.ok(get.data.linked_tasks.some((t) => t.id === taskId));

  const uq = await call('foretmap_tutorials', {
    action: 'unlink',
    tutorial_id: tutorialId,
    target_type: 'question',
    target_id: questionCode,
  });
  assert.equal(uq.isError, false, uq.text);
  assert.equal(
    await queryOne(
      "SELECT id FROM resource_question_links WHERE resource_type = 'tutorial' AND resource_ref = ? AND question_code = ?",
      [String(tutorialId), questionCode],
    ),
    undefined,
  );
  const uz = await call('foretmap_tutorials', {
    action: 'unlink',
    tutorial_id: tutorialId,
    target_type: 'zone',
    target_id: zoneId,
  });
  assert.equal(uz.isError, false, uz.text);
  assert.equal(
    await queryOne('SELECT 1 AS x FROM tutorial_zones WHERE tutorial_id = ?', [tutorialId]),
    undefined,
  );

  await execute(
    "INSERT INTO user_tutorial_reads (user_id, tutorial_id, acknowledged_at) VALUES (?, ?, '2026-10-02 09:00:00')",
    [student.id, tutorialId],
  );
  const rs = await call('foretmap_tutorials', { action: 'reads_stats', tutorial_id: tutorialId });
  assert.equal(rs.isError, false, rs.text);
  assert.equal(rs.data.total_reads, 1);
  assert.equal(rs.data.readers, undefined, 'agrégats seulement');
  const rd = await call('foretmap_tutorials', { action: 'reads_detail', tutorial_id: tutorialId });
  assert.equal(rd.isError, false, rd.text);
  assert.equal(rd.data.readers.length, 1);
  assert.ok(rd.data.by_group.some((g) => g.group_id === groupId && g.readers === 1));

  const list = await call('foretmap_tutorials', { action: 'list', q: `Tuto MCP ${stamp}` });
  assert.equal(list.data.total, 1);

  const ut = await call('foretmap_tutorials', {
    action: 'unlink',
    tutorial_id: tutorialId,
    target_type: 'task',
    target_id: taskId,
  });
  assert.equal(ut.isError, false, ut.text);
  assert.equal(
    await queryOne('SELECT 1 AS x FROM task_tutorials WHERE task_id = ?', [taskId]),
    undefined,
  );

  // Archivage : désactivé, toujours lisible par la gestion.
  const del = await call('foretmap_tutorials', { action: 'delete', tutorial_id: tutorialId });
  assert.equal(del.isError, false, del.text);
  const row = await queryOne('SELECT is_active FROM tutorials WHERE id = ?', [tutorialId]);
  assert.equal(Number(row.is_active), 0);
  const active = await call('foretmap_tutorials', { action: 'list', q: `Tuto MCP ${stamp}` });
  assert.equal(active.data.total, 0);
  const all = await call('foretmap_tutorials', {
    action: 'list',
    q: `Tuto MCP ${stamp}`,
    include_inactive: true,
  });
  assert.equal(all.data.total, 1);
});

test('route GET /api/tutorials/:id/reads : nominatif selon la permission', async () => {
  const full = await request(app)
    .get(`/api/tutorials/${tutorialId}/reads`)
    .set('Authorization', `Bearer ${await appToken(admin)}`);
  assert.equal(full.status, 200, full.text);
  assert.equal(full.body.nominative, true);
  assert.equal(full.body.readers[0].user_id, student.id);

  // Profil maison : tutorials.manage sans stats.read.all → agrégats seuls.
  const slug = `mcp_tuto_${stamp}`;
  const ins = await execute(
    "INSERT INTO roles (slug, display_name, `rank`, is_system) VALUES (?, 'Tuto MCP', 10, 0)",
    [slug],
  );
  customRoleId = ins.insertId;
  await execute(
    "INSERT INTO role_permissions (role_id, permission_key) VALUES (?, 'tutorials.manage')",
    [customRoleId],
  );
  const editor = await fx.createAccount(slug);
  const agg = await request(app)
    .get(`/api/tutorials/${tutorialId}/reads`)
    .set('Authorization', `Bearer ${await appToken(editor)}`);
  assert.equal(agg.status, 200, agg.text);
  assert.equal(agg.body.nominative, false);
  assert.equal(agg.body.readers, undefined);
  assert.equal(agg.body.total_reads, 1);

  const denied = await request(app)
    .get(`/api/tutorials/${tutorialId}/reads`)
    .set('Authorization', `Bearer ${await appToken(student, 'student')}`);
  assert.equal(denied.status, 403);
  const missing = await request(app)
    .get('/api/tutorials/999999999/reads')
    .set('Authorization', `Bearer ${await appToken(admin)}`);
  assert.equal(missing.status, 404);
});

test('quiz : catégories, liste, fiche, stats, modification fusionnée, notions, retrait', async () => {
  const cats = await call('foretmap_quiz', { action: 'categories' });
  assert.equal(cats.isError, false, cats.text);
  const list = await call('foretmap_quiz', { action: 'list', categorie_slug: categorySlug });
  assert.ok(list.data.items.some((i) => i.question_code === questionCode));

  await execute(
    'INSERT INTO user_quiz_attempts (user_id, question_code, categorie_slug, is_correct) VALUES (?, ?, ?, 0)',
    [student.id, questionCode, categorySlug],
  );
  const st = await call('foretmap_quiz', { action: 'stats', categorie_slug: categorySlug });
  assert.equal(st.isError, false, st.text);
  const mine = st.data.by_question.find((r) => r.question_code === questionCode);
  assert.equal(mine.attempts, 1);
  assert.equal(mine.success_rate_percent, 0);
  assert.ok(st.data.by_category.some((r) => r.categorie_slug === categorySlug));
  assert.equal(st.data.distractors.available, false);

  const up = await call('foretmap_quiz', {
    action: 'update',
    question_code: questionCode,
    data: { feedback_correct: 'Bravo' },
  });
  assert.equal(up.isError, false, up.text);
  let row = await queryOne(
    'SELECT feedback_correct, choix_a, statut FROM quiz_questions WHERE question_code = ?',
    [questionCode],
  );
  assert.equal(row.feedback_correct, 'Bravo');
  assert.equal(row.choix_a, 'Le sol', 'champ non fourni conservé');
  assert.equal(row.statut, 'actif');

  const sn = await call('foretmap_quiz', {
    action: 'set_notions',
    question_code: questionCode,
    ajouts: ['C4-VIV'],
  });
  assert.equal(sn.isError, false, sn.text);
  assert.ok(
    await queryOne(
      "SELECT 1 AS x FROM quiz_question_notions WHERE question_code = ? AND notion_id = 'C4-VIV' AND mode = 'ajout'",
      [questionCode],
    ),
  );
  const get = await call('foretmap_quiz', { action: 'get', question_code: questionCode });
  assert.equal(get.isError, false, get.text);
  assert.equal(get.data.question.question_code, questionCode);

  const rt = await call('foretmap_quiz', { action: 'retire', question_code: questionCode });
  assert.equal(rt.isError, false, rt.text);
  row = await queryOne(
    'SELECT statut, feedback_correct FROM quiz_questions WHERE question_code = ?',
    [questionCode],
  );
  assert.equal(row.statut, 'inactif');
  assert.equal(row.feedback_correct, 'Bravo');
});

test('learning : politique, propositions, acceptation puis rejet, verrous', async () => {
  // Question réactivée pour les propositions et les liens.
  await call('foretmap_quiz', {
    action: 'update',
    question_code: questionCode,
    data: { statut: 'actif' },
  });
  const set = await call('foretmap_learning', {
    action: 'gating_set',
    resource_type: 'tutorial',
    resource_ref: String(tutorialId),
    policy: { mode: 'any', enabled: true },
  });
  assert.equal(set.isError, false, set.text);
  const pol = await queryOne(
    "SELECT mode FROM resource_gating_policy WHERE resource_type = 'tutorial' AND resource_ref = ?",
    [String(tutorialId)],
  );
  assert.equal(pol.mode, 'any');
  const get = await call('foretmap_learning', {
    action: 'gating_get',
    resource_type: 'tutorial',
    resource_ref: String(tutorialId),
  });
  assert.equal(get.isError, false, get.text);
  assert.ok(get.data.policy);

  const sug = await call('foretmap_learning', {
    action: 'links_suggest',
    resource_types: ['tutorial'],
    resource_refs: [String(tutorialId)],
    min_confidence: 0,
  });
  assert.equal(sug.isError, false, sug.text);
  assert.ok(Array.isArray(sug.data.candidates));
  for (const c of sug.data.candidates)
    assert.ok(c.confidence_percent === null || c.confidence_percent >= 0);

  const acc = await call('foretmap_learning', {
    action: 'links_accept',
    candidates: [
      { resource_type: 'tutorial', resource_ref: String(tutorialId), question_code: questionCode },
    ],
  });
  assert.equal(acc.isError, false, acc.text);
  assert.equal(acc.data.created, 1);
  const linkId = acc.data.results[0].link_id;
  const links = await call('foretmap_learning', {
    action: 'links_list',
    resource_type: 'tutorial',
    resource_ref: String(tutorialId),
  });
  assert.ok(links.data.items.some((l) => l.id === linkId));

  // Revue d'un lien « suggested » (tel qu'inséré par le rapprochement automatique).
  await execute(
    "INSERT INTO resource_question_links (resource_type, resource_ref, question_code, is_gating, origin, status) VALUES ('glossary', ?, ?, 0, 'auto', 'suggested')",
    [glossaryCode, questionCode],
  );
  const sugg = await queryOne(
    "SELECT id FROM resource_question_links WHERE resource_type = 'glossary' AND resource_ref = ? AND question_code = ?",
    [glossaryCode, questionCode],
  );
  const rej = await call('foretmap_learning', { action: 'links_reject', link_ids: [sugg.id] });
  assert.equal(rej.isError, false, rej.text);
  assert.equal(rej.data.updated, 1);
  assert.equal(
    (await queryOne('SELECT status FROM resource_question_links WHERE id = ?', [sugg.id])).status,
    'rejected',
  );
  // Un couple proposé peut aussi être rejeté directement (il ne sera plus reproposé).
  const rejC = await call('foretmap_learning', {
    action: 'links_reject',
    candidates: [{ resource_type: 'plant', resource_ref: '1', question_code: questionCode }],
  });
  assert.equal(rejC.isError, false, rejC.text);
  assert.equal(
    (
      await queryOne(
        "SELECT status FROM resource_question_links WHERE resource_type = 'plant' AND resource_ref = '1' AND question_code = ?",
        [questionCode],
      )
    )?.status,
    'rejected',
  );

  const locks = await call('foretmap_learning', { action: 'overrides' });
  assert.equal(locks.isError, false, locks.text);
  assert.ok(Array.isArray(locks.data.locks));
});

test('glossaire et programme : lectures, notions d’un terme, couverture, rattachements', async () => {
  const gl = await call('foretmap_glossary', { action: 'list', limit: 5 });
  assert.equal(gl.isError, false, gl.text);
  assert.ok(gl.data.items.length > 0);
  const term = await call('foretmap_glossary', { action: 'get', glossary_code: glossaryCode });
  assert.equal(term.isError, false, term.text);
  assert.equal(term.data.glossary_code, glossaryCode);
  const sn = await call('foretmap_glossary', {
    action: 'set_notions',
    glossary_code: glossaryCode,
    ajouts: ['2-BIODIV'],
  });
  assert.equal(sn.isError, false, sn.text);
  assert.ok(
    await queryOne(
      "SELECT 1 AS x FROM glossary_term_notions WHERE glossary_code = ? AND notion_id = '2-BIODIV' AND mode = 'ajout'",
      [glossaryCode],
    ),
  );

  const notions = await call('foretmap_curriculum', { action: 'notions', niveau: 'cycle4' });
  assert.equal(notions.isError, false, notions.text);
  assert.ok(notions.data.items.every((n) => n.niveau === 'cycle4'));
  const cov = await call('foretmap_curriculum', { action: 'coverage' });
  assert.equal(cov.isError, false, cov.text);
  assert.ok(cov.data.notions.length >= 12);
  assert.ok(Array.isArray(cov.data.orphan_notions));
  const viv = cov.data.notions.find((n) => n.id === 'C4-VIV');
  assert.ok(viv.questions >= 1);

  const sl = await call('foretmap_curriculum', {
    action: 'set_links',
    target_type: 'quiz_question',
    target_id: questionCode,
    ajouts: ['2-ORGA'],
  });
  assert.equal(sl.isError, false, sl.text);
  assert.ok(
    await queryOne(
      "SELECT 1 AS x FROM quiz_question_notions WHERE question_code = ? AND notion_id = '2-ORGA'",
      [questionCode],
    ),
  );
  const bad = await call('foretmap_curriculum', {
    action: 'set_links',
    target_type: 'quiz_category',
    target_id: categorySlug,
  });
  assert.equal(bad.isError, true, 'notion_ids requis pour une catégorie');
});

test('séances : créer, lire, passages, rattacher une tâche, supprimer (tâche détachée)', async () => {
  const c = await call('foretmap_pedago_sessions', {
    action: 'create',
    data: {
      templateKey: 'college_reconaitre',
      title: `Séance MCP ${stamp}`,
      slug: `seance-mcp-${stamp}`,
    },
  });
  assert.equal(c.isError, false, c.text);
  sessionId = c.data.id;
  const get = await call('foretmap_pedago_sessions', {
    action: 'get',
    session_id: `seance-mcp-${stamp}`,
  });
  assert.equal(get.data.id, sessionId);
  const list = await call('foretmap_pedago_sessions', { action: 'list', q: `Séance MCP ${stamp}` });
  assert.equal(list.data.total, 1);
  const up = await call('foretmap_pedago_sessions', {
    action: 'update',
    session_id: sessionId,
    data: { title: `Séance MCP ${stamp} bis` },
  });
  assert.equal(up.isError, false, up.text);
  assert.equal(
    (await queryOne('SELECT title FROM pedago_sessions WHERE id = ?', [sessionId])).title,
    `Séance MCP ${stamp} bis`,
  );
  const runs = await call('foretmap_pedago_sessions', { action: 'runs', session_id: sessionId });
  assert.equal(runs.isError, false, runs.text);
  assert.equal(runs.data.stats[0].completedUsers, 0);
  const detail = await call('foretmap_pedago_sessions', {
    action: 'runs_detail',
    session_id: sessionId,
  });
  assert.equal(detail.isError, false, detail.text);

  const lk = await call('foretmap_pedago_sessions', {
    action: 'link_task',
    task_id: taskId,
    session_id: `seance-mcp-${stamp}`,
  });
  assert.equal(lk.isError, false, lk.text);
  assert.equal(
    (await queryOne('SELECT pedago_session_id FROM tasks WHERE id = ?', [taskId]))
      .pedago_session_id,
    sessionId,
  );

  const del = await call('foretmap_pedago_sessions', { action: 'delete', session_id: sessionId });
  assert.equal(del.isError, false, del.text);
  assert.equal(del.data.tasks_detached, 1);
  assert.equal(
    await queryOne('SELECT id FROM pedago_sessions WHERE id = ?', [sessionId]),
    undefined,
  );
  assert.equal(
    (await queryOne('SELECT pedago_session_id FROM tasks WHERE id = ?', [taskId]))
      .pedago_session_id,
    null,
  );
  const audit = await queryOne(
    "SELECT id FROM audit_log WHERE action = 'delete_pedago_session' AND target_id = ? LIMIT 1",
    [sessionId],
  );
  assert.ok(audit);
  sessionId = null;
});

test('route DELETE /api/pedago-sessions/:idOrSlug : 404 et refus sans droit', async () => {
  const missing = await request(app)
    .delete('/api/pedago-sessions/inconnue-xyz')
    .set('Authorization', `Bearer ${await appToken(admin)}`);
  assert.equal(missing.status, 404);
  const denied = await request(app)
    .delete('/api/pedago-sessions/inconnue-xyz')
    .set('Authorization', `Bearer ${await appToken(student, 'student')}`);
  assert.ok([403, 404].includes(denied.status));
  assert.notEqual(denied.status, 200);
});

test('nominatif refusé sans bypass (lecteurs, verrous)', async () => {
  process.env.MCP_PRIVACY_BYPASS = 'false';
  const r = await call('foretmap_tutorials', { action: 'reads_detail', tutorial_id: 1 });
  assert.equal(r.isError, true);
  assert.match(r.text, /bypass/);
  const l = await call('foretmap_learning', { action: 'overrides' });
  assert.equal(l.isError, true);
  // L'agrégat reste ouvert.
  const ok = await call('foretmap_tutorials', { action: 'reads_stats', tutorial_id: tutorialId });
  assert.equal(ok.isError, false, ok.text);
});

test('domaines désactivés : outils absents et appels refusés', async () => {
  process.env.MCP_DOMAINS_DISABLED = 'tutorials,quiz,learning,glossary,curriculum,pedago_sessions';
  const tools = await fx.listTools(app, adminToken);
  for (const name of [
    'foretmap_tutorials',
    'foretmap_quiz',
    'foretmap_learning',
    'foretmap_glossary',
    'foretmap_curriculum',
    'foretmap_pedago_sessions',
  ]) {
    assert.ok(!tools.includes(name), name);
  }
  const r = await call('foretmap_quiz', { action: 'categories' });
  assert.equal(r.isError, true);
});
