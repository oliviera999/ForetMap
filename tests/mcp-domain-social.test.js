'use strict';

/**
 * Outil de domaine `foretmap_social` (lot D4) : lectures (forum, signalements, commentaires,
 * carnets, fresques), modération par le pont avec effet vérifié (épingler, verrouiller,
 * supprimer un message, statut d'un message de lieu, supprimer un commentaire), envoi d'une
 * notification, liste du forum sans auteur, refus nominatif sans bypass, domaine désactivé.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const fx = require('./helpers/mcpFixtures');
const { initSchema, queryOne, execute } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');

fx.enableMcpEnv();

const { app } = require('../server');

const STAMP = `${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;
let mcpToken;
let appToken;
let threadId;
let postId;
let commentId;
let zoneId;
const studentIds = [];

const call = (name, args) => fx.callTool(app, mcpToken, name, args);

test.before(async () => {
  await initSchema();
  const admin = await fx.createAccount('admin');
  mcpToken = (await fx.obtainTokens(app, admin)).access_token;
  appToken = await ensureAdminTeacherAuthToken();
  const thread = await request(app)
    .post('/api/forum/threads')
    .set('Authorization', `Bearer ${appToken}`)
    .send({ title: `Sujet MCP ${STAMP}`, body: 'Premier message du sujet de test.' });
  assert.equal(thread.status, 201, JSON.stringify(thread.body));
  threadId = thread.body.thread.id;
  postId = thread.body.first_post_id;
  const zone = await queryOne('SELECT id FROM zones ORDER BY id LIMIT 1');
  zoneId = zone.id;
  const comment = await request(app)
    .post('/api/context-comments')
    .set('Authorization', `Bearer ${appToken}`)
    .send({ contextType: 'zone', contextId: zoneId, body: `Branche cassée ${STAMP}` });
  assert.equal(comment.status, 201, JSON.stringify(comment.body));
  commentId = comment.body.id || comment.body.comment?.id;
  assert.ok(commentId, JSON.stringify(comment.body));
});

test.after(async () => {
  if (threadId) {
    await execute(
      'DELETE FROM forum_post_reports WHERE post_id IN (SELECT id FROM forum_posts WHERE thread_id = ?)',
      [threadId],
    ).catch(() => {});
    await execute('DELETE FROM forum_posts WHERE thread_id = ?', [threadId]);
    await execute('DELETE FROM forum_threads WHERE id = ?', [threadId]);
  }
  if (commentId) await execute('DELETE FROM context_comments WHERE id = ?', [commentId]);
  for (const id of studentIds) {
    await execute('DELETE FROM notifications WHERE user_id = ?', [id]);
    await execute('DELETE FROM users WHERE id = ?', [id]);
  }
  await fx.cleanupAccounts();
});

test.beforeEach(() => fx.enableMcpEnv());

test('forum : liste sans auteur, sujet détaillé, signalements', async () => {
  const list = await call('foretmap_social', { action: 'forum_list', limit: 100 });
  assert.equal(list.isError, false, list.text);
  const mine = list.data.items.find((t) => t.id === threadId);
  assert.ok(mine, 'sujet listé');
  assert.equal(mine.title, `Sujet MCP ${STAMP}`);
  assert.equal(mine.posts_count, 1);
  assert.equal(mine.author_display_name, undefined, 'la liste ne nomme pas l’auteur');
  assert.equal(mine.author_user_id, undefined);

  const get = await call('foretmap_social', { action: 'forum_get', thread_id: threadId });
  assert.equal(get.isError, false, get.text);
  assert.equal(get.data.thread.id, threadId);
  assert.equal(get.data.posts.length, 1);

  const reports = await call('foretmap_social', { action: 'forum_reports', status: 'open' });
  assert.equal(reports.isError, false, reports.text);
  assert.ok(Array.isArray(reports.data.items));
});

test('forum_moderate : épingler, verrouiller, supprimer un message (effets en base)', async () => {
  const pin = await call('foretmap_social', {
    action: 'forum_moderate',
    op: 'pin',
    thread_id: threadId,
  });
  assert.equal(pin.isError, false, pin.text);
  const lock = await call('foretmap_social', {
    action: 'forum_moderate',
    op: 'lock',
    thread_id: threadId,
  });
  assert.equal(lock.isError, false, lock.text);
  let row = await queryOne('SELECT is_pinned, is_locked FROM forum_threads WHERE id = ?', [
    threadId,
  ]);
  assert.equal(Number(row.is_pinned), 1);
  assert.equal(Number(row.is_locked), 1);
  await call('foretmap_social', { action: 'forum_moderate', op: 'unlock', thread_id: threadId });
  row = await queryOne('SELECT is_locked FROM forum_threads WHERE id = ?', [threadId]);
  assert.equal(Number(row.is_locked), 0);

  const missing = await call('foretmap_social', { action: 'forum_moderate', op: 'pin' });
  assert.equal(missing.isError, true, 'thread_id requis');

  const del = await call('foretmap_social', {
    action: 'forum_moderate',
    op: 'delete_post',
    post_id: postId,
  });
  assert.equal(del.isError, false, del.text);
  const post = await queryOne('SELECT is_deleted FROM forum_posts WHERE id = ?', [postId]);
  assert.equal(Number(post.is_deleted), 1);
  const audit = await queryOne(
    "SELECT payload_json FROM audit_log WHERE action = 'forum_post_delete' AND target_id = ? ORDER BY id DESC LIMIT 1",
    [String(postId)],
  );
  const payload =
    typeof audit.payload_json === 'string' ? JSON.parse(audit.payload_json) : audit.payload_json;
  assert.equal(payload.via, 'mcp');
  assert.equal(payload.moderator_action, true);
});

test('commentaires : liste, statut du message de lieu, suppression (effets en base)', async () => {
  const list = await call('foretmap_social', {
    action: 'comments_list',
    context_type: 'zone',
    context_id: String(zoneId),
  });
  assert.equal(list.isError, false, list.text);
  assert.ok(list.data.items.some((c) => String(c.id) === String(commentId)));
  const recent = await call('foretmap_social', { action: 'comments_list', limit: 50 });
  assert.equal(recent.isError, false, recent.text);
  assert.ok(Array.isArray(recent.data.items));
  const half = await call('foretmap_social', { action: 'comments_list', context_type: 'zone' });
  assert.equal(half.isError, true);

  const st = await call('foretmap_social', {
    action: 'place_reports',
    comment_id: String(commentId),
    place_status: 'pris_en_compte',
  });
  assert.equal(st.isError, false, st.text);
  let row = await queryOne('SELECT place_status, is_deleted FROM context_comments WHERE id = ?', [
    commentId,
  ]);
  assert.equal(row.place_status, 'pris_en_compte');

  const del = await call('foretmap_social', {
    action: 'comments_moderate',
    comment_id: String(commentId),
  });
  assert.equal(del.isError, false, del.text);
  row = await queryOne('SELECT is_deleted FROM context_comments WHERE id = ?', [commentId]);
  assert.equal(Number(row.is_deleted), 1);
});

test('notify : notification créée pour le destinataire', async () => {
  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO users (id, user_type, pseudo, first_name, last_name, display_name, is_active,
                        auth_provider, created_at, updated_at)
     VALUES (?, 'student', ?, 'Notif', 'Mcp', 'Notif Mcp', 1, 'local', NOW(), NOW())`,
    [id, `mcp_notif_${STAMP}`],
  );
  studentIds.push(id);
  const r = await call('foretmap_social', {
    action: 'notify',
    title: `Rappel arrosage ${STAMP}`,
    body: 'Pensez aux semis.',
    link: { type: 'place', id: String(zoneId), kind: 'zone' },
    user_ids: [id],
  });
  assert.equal(r.isError, false, r.text);
  assert.equal(r.data.recipients, 1);
  const n = await queryOne('SELECT kind, target_type FROM notifications WHERE user_id = ?', [id]);
  assert.equal(n.kind, 'announcement');
  assert.equal(n.target_type, 'place');
});

test('carnets et fresques (lectures)', async () => {
  const feed = await call('foretmap_social', { action: 'journals' });
  assert.equal(feed.isError, false, feed.text);
  assert.ok(Array.isArray(feed.data.articles));
  const fresques = await call('foretmap_social', { action: 'fresques' });
  assert.equal(fresques.isError, false, fresques.text);
  assert.ok(Array.isArray(fresques.data.items));
});

test('nominatif refusé sans bypass ; liste du forum conservée', async () => {
  process.env.MCP_PRIVACY_BYPASS = 'false';
  const r = await call('foretmap_social', { action: 'forum_get', thread_id: threadId });
  assert.equal(r.isError, true);
  assert.match(r.text, /bypass/);
  const j = await call('foretmap_social', { action: 'journals' });
  assert.equal(j.isError, true);
  const list = await call('foretmap_social', { action: 'forum_list' });
  assert.equal(list.isError, false, list.text);
});

test('domaine désactivé : outil absent et appel refusé', async () => {
  process.env.MCP_DOMAINS_DISABLED = 'social';
  const tools = await fx.listTools(app, mcpToken);
  assert.ok(!tools.includes('foretmap_social'));
  const r = await call('foretmap_social', { action: 'forum_list' });
  assert.equal(r.isError, true);
});
