'use strict';

// `foretmap_get_id_key` : crédit et licence des images de propositions (colonnes
// `id_key_leads.image_credit` / `image_licence`, migration `id_keys_credits_chemins_tutoriels`).
// Suite proposée par le flux F2 du chantier CPT. Une image sans auteur est signalée par
// `image_credit_missing` et comptée dans `images_without_credit`.
// Tests BDD partagée : exécution séquentielle ; tout ce qui est semé est retiré à la fin.

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('./helpers/mcpFixtures');

fx.enableMcpEnv();

const { app } = require('../server');
const { initSchema, execute } = require('../database');

const stamp = Date.now().toString(36);
const slug = `cle-credits-${stamp}`;
let keyId = 0;
let token = '';
const plantIds = [];

test.before(async () => {
  await initSchema();
  for (const name of ['A', 'B']) {
    plantIds.push(
      (
        await execute('INSERT INTO plants (name, emoji, description) VALUES (?, ?, ?)', [
          `Espèce crédits ${name} ${stamp}`,
          '🌱',
          'crédits de clé',
        ])
      ).insertId,
    );
  }
  keyId = (
    await execute('INSERT INTO id_keys (slug, title, is_published) VALUES (?, ?, 1)', [
      slug,
      `Clé crédits ${stamp}`,
    ])
  ).insertId;
  const coupletId = (
    await execute('INSERT INTO id_key_couplets (key_id, number) VALUES (?, 1)', [keyId])
  ).insertId;
  await execute(
    `INSERT INTO id_key_leads
       (couplet_id, sort_order, statement, plant_id, outcome, image_url, image_credit, image_licence)
     VALUES (?, 0, 'Feuilles opposées', ?, 'espece', '/uploads/id-keys/a.jpg', 'Auteur Test', 'CC BY-SA 4.0'),
            (?, 1, 'Feuilles alternes', ?, 'espece', '/uploads/id-keys/b.jpg', NULL, NULL)`,
    [coupletId, plantIds[0], coupletId, plantIds[1]],
  );
  const admin = await fx.createAccount('admin');
  token = (await fx.obtainTokens(app, admin)).access_token;
});

test.after(async () => {
  await execute('DELETE FROM id_keys WHERE id = ?', [keyId]).catch(() => {});
  for (const id of plantIds) {
    await execute('DELETE FROM plants WHERE id = ?', [id]).catch(() => {});
  }
  await fx.cleanupAccounts();
});

test.beforeEach(() => fx.enableMcpEnv());

test('foretmap_get_id_key : image, auteur et licence de chaque proposition', async () => {
  const res = await fx.callTool(app, token, 'foretmap_get_id_key', { slug });
  assert.equal(res.isError, false, res.text);
  const [opposees, alternes] = res.data.couplets[0].leads;
  assert.equal(opposees.image_url, '/uploads/id-keys/a.jpg');
  assert.equal(opposees.image_credit, 'Auteur Test');
  assert.equal(opposees.image_licence, 'CC BY-SA 4.0');
  assert.equal(opposees.image_credit_missing, undefined);
  assert.equal(alternes.image_url, '/uploads/id-keys/b.jpg');
  assert.equal(alternes.image_credit, undefined);
  assert.equal(alternes.image_credit_missing, true);
  assert.equal(res.data.images_without_credit, 1);
});

test('foretmap_get_id_key : la description annonce les crédits', async () => {
  const res = await fx.rpc(app, token, 'tools/list');
  const tool = res.body.result.tools.find((t) => t.name === 'foretmap_get_id_key');
  assert.ok(tool, 'outil listé');
  assert.match(tool.description, /image_credit/);
  assert.match(tool.description, /images_without_credit/);
});
