'use strict';

/**
 * `foretmap_id_keys` par le connecteur : `upsert_node` met à jour en place (identifiants,
 * issues, aide et crédit conservés), retire une proposition absente, écrit le crédit d'une
 * image ; `update_key` pose le drapeau « chemins multiples voulus » et les tutoriels « avant de
 * commencer » ; `foretmap_tutorials get` liste les clés liées.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fx = require('./helpers/mcpFixtures');
const { initSchema, execute, queryAll } = require('../database');

fx.enableMcpEnv();

const { app } = require('../server');

const U = crypto.randomUUID().slice(0, 8);
let token;
const plantIds = [];
const keyIds = [];
let tutorialId = 0;

const call = (name, args) => fx.callTool(app, token, name, args);

function ok(r) {
  assert.equal(r.isError, false, r.text);
  return r.data;
}

test.before(async () => {
  await initSchema();
  const admin = await fx.createAccount('admin');
  token = (await fx.obtainTokens(app, admin)).access_token;
  for (const n of ['Renard', 'Hérisson']) {
    const r = await execute(`INSERT INTO plants (name, emoji, description) VALUES (?, '🐾', 't')`, [
      `${n} ${U}`,
    ]);
    plantIds.push(r.insertId);
  }
  tutorialId = (
    await execute(
      `INSERT INTO tutorials (title, slug, type, html_content, is_active)
       VALUES (?, ?, 'html', '<p>Régler la loupe</p>', 1)`,
      [`Loupe ${U}`, `mcp-loupe-${U}`],
    )
  ).insertId;
});

test.after(async () => {
  for (const id of keyIds) await execute('DELETE FROM id_keys WHERE id = ?', [id]);
  for (const id of plantIds) await execute('DELETE FROM plants WHERE id = ?', [id]);
  if (tutorialId) await execute('DELETE FROM tutorials WHERE id = ?', [tutorialId]);
  await fx.cleanupAccounts();
});

test.beforeEach(() => fx.enableMcpEnv());

test('upsert_node : identifiants seuls, retrait, crédit ; update_key : drapeau et tutoriels', async () => {
  const [renard, herisson] = plantIds;
  const key = ok(
    await call('foretmap_id_keys', {
      action: 'create_key',
      title: `Traces ${U}`,
      slug: `traces-${U}`,
    }),
  );
  keyIds.push(key.id);
  const start = key.couplets[0];
  const written = ok(
    await call('foretmap_id_keys', {
      action: 'upsert_node',
      key_id: key.id,
      couplet_id: start.id,
      leads: [
        {
          statement: 'Empreinte à quatre doigts',
          hint: 'Griffes marquées.',
          image_url: '/uploads/renard.jpg',
          image_credit: 'A. Photographe',
          image_licence: 'CC BY-SA 4.0',
          plant_id: renard,
        },
        { statement: 'Crotte torsadée', plant_id: renard },
        { statement: 'Crotte noire luisante', plant_id: herisson },
      ],
    }),
  );
  assert.equal(written.created, false);
  const ids = written.couplet.leads.map((l) => l.id);
  assert.equal(ids.length, 3);

  // Le cas du 20/11 : les propositions renvoyées avec leur seul identifiant.
  const same = ok(
    await call('foretmap_id_keys', {
      action: 'upsert_node',
      key_id: key.id,
      couplet_id: start.id,
      leads: ids.map((id) => ({ id })),
    }),
  );
  assert.deepEqual(same.couplet.leads, written.couplet.leads, 'identifiants et contenu inchangés');

  // Énoncé retouché sur une proposition, crédit sur une autre, troisième retirée.
  const edited = ok(
    await call('foretmap_id_keys', {
      action: 'upsert_node',
      key_id: key.id,
      couplet_id: start.id,
      leads: [
        { id: ids[0], statement: 'Empreinte ovale à quatre doigts' },
        { id: ids[1], image_url: '/uploads/crotte.jpg', image_credit: 'B. Naturaliste' },
      ],
    }),
  );
  assert.deepEqual(
    edited.couplet.leads.map((l) => l.id),
    ids.slice(0, 2),
  );
  const [first, second] = edited.couplet.leads;
  assert.equal(first.statement, 'Empreinte ovale à quatre doigts');
  assert.equal(first.plant_id, renard, 'issue conservée');
  assert.equal(first.hint, 'Griffes marquées.', 'aide conservée');
  assert.equal(first.image_credit, 'A. Photographe');
  assert.equal(first.image_licence, 'CC BY-SA 4.0');
  assert.equal(second.image_credit, 'B. Naturaliste');
  assert.equal(second.image_licence, null);
  const rows = await queryAll(
    'SELECT id FROM id_key_leads WHERE couplet_id = ? ORDER BY sort_order',
    [start.id],
  );
  assert.deepEqual(
    rows.map((r) => Number(r.id)),
    ids.slice(0, 2),
    'la proposition absente est supprimée, les autres ne sont pas recréées',
  );

  // Identifiant périmé : refus net, rien n'est créé à sa place.
  const stale = await call('foretmap_id_keys', {
    action: 'upsert_node',
    key_id: key.id,
    couplet_id: start.id,
    leads: [{ id: ids[0] }, { id: ids[2], statement: 'Revenante', plant_id: herisson }],
  });
  assert.equal(stale.isError, true);
  assert.match(stale.text, /introuvable dans ce couplet/);

  // Métadonnées : drapeau et tutoriels « avant de commencer ».
  const updated = ok(
    await call('foretmap_id_keys', {
      action: 'update_key',
      key_id: key.id,
      allows_multiple_paths: true,
      tool_required: ['loupe'],
      tutorial_ids: [tutorialId],
    }),
  );
  assert.equal(updated.allows_multiple_paths, true);
  assert.deepEqual(updated.tutorial_ids, [tutorialId]);
  const full = ok(await call('foretmap_id_keys', { action: 'get', key: key.id }));
  assert.equal(full.tutorials[0].title, `Loupe ${U}`);
  assert.equal(full.allows_multiple_paths, true);
  assert.equal(full.couplets[0].leads[0].image_credit, 'A. Photographe');

  // Lecture inverse : la fiche du tutoriel liste les clés liées.
  const tuto = ok(await call('foretmap_tutorials', { action: 'get', tutorial_id: tutorialId }));
  assert.deepEqual(tuto.linked_id_keys, [
    { id: key.id, slug: `traces-${U}`, title: `Traces ${U}`, is_published: false },
  ]);

  // Liste vidée par [].
  const cleared = ok(
    await call('foretmap_id_keys', { action: 'update_key', key_id: key.id, tutorial_ids: [] }),
  );
  assert.deepEqual(cleared.tutorial_ids, []);
  const after = ok(await call('foretmap_tutorials', { action: 'get', tutorial_id: tutorialId }));
  assert.deepEqual(after.linked_id_keys, []);
});
