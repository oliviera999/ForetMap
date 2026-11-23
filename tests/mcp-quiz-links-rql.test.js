'use strict';

// Connecteur MCP : les liens question ↔ fiche se lisent dans `resource_question_links`
// (liens approuvés), source unique depuis la migration 300 et seule source depuis le retrait
// T3 des tables figées (migration `retrait_t3_quiz_question_links`).
//   - `foretmap_get_species` → `qcm_codes` ;
//   - `foretmap_list_qcm` → filtre `species_id`, qui ne voyait que l'ancienne table figée (une
//     question rattachée depuis la migration 300 n'y était pas trouvée).
// Tests BDD partagée : exécution séquentielle ; tout ce qui est semé est retiré à la fin.

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('./helpers/mcpFixtures');

fx.enableMcpEnv();

const { app } = require('../server');
const { initSchema, execute } = require('../database');

const stamp = Date.now().toString(36).toUpperCase();
const catSlug = `mcpl${stamp.toLowerCase()}`.slice(0, 64);
const code = (suffix) => `QK${stamp}${suffix}`.slice(0, 16);
const Q = { approuve: code('A'), propose: code('S'), autre: code('O') };
let plantId = 0;
let token = '';

test.before(async () => {
  await initSchema();
  await execute(
    `INSERT IGNORE INTO quiz_categories (slug, nom, theme, order_index)
     VALUES (?, 'Liens MCP', 'sciences', 997)`,
    [catSlug],
  );
  let numero = 1;
  for (const c of Object.values(Q)) {
    await execute(
      `INSERT INTO quiz_questions
         (question_code, categorie_slug, numero_dans_categorie, question,
          choix_a, choix_b, choix_c, reponse_correcte, niveau, statut)
       VALUES (?, ?, ?, ?, 'A', 'B', 'C', 'A', 'college', 'actif')`,
      [c, catSlug, numero, `Question ${c} ?`],
    );
    numero += 1;
  }
  plantId = (
    await execute('INSERT INTO plants (name, emoji, description) VALUES (?, ?, ?)', [
      `Espèce liens MCP ${stamp}`,
      '🌱',
      'liens MCP',
    ])
  ).insertId;
  const link = (questionCode, status) =>
    execute(
      `INSERT INTO resource_question_links
         (resource_type, resource_ref, question_code, is_gating, origin, status)
       VALUES ('plant', ?, ?, 0, 'manual', ?)`,
      [String(plantId), questionCode, status],
    );
  await link(Q.approuve, 'approved');
  await link(Q.propose, 'suggested');
  const admin = await fx.createAccount('admin');
  token = (await fx.obtainTokens(app, admin)).access_token;
});

test.after(async () => {
  const codes = Object.values(Q);
  const marks = codes.map(() => '?').join(', ');
  await execute(
    `DELETE FROM resource_question_links WHERE question_code IN (${marks})`,
    codes,
  ).catch(() => {});
  await execute(`DELETE FROM quiz_questions WHERE question_code IN (${marks})`, codes).catch(
    () => {},
  );
  await execute('DELETE FROM quiz_categories WHERE slug = ?', [catSlug]).catch(() => {});
  await execute('DELETE FROM plants WHERE id = ?', [plantId]).catch(() => {});
  await fx.cleanupAccounts();
});

test.beforeEach(() => fx.enableMcpEnv());

test('foretmap_get_species : qcm_codes = liens approuvés de resource_question_links', async () => {
  const res = await fx.callTool(app, token, 'foretmap_get_species', { id: plantId });
  assert.equal(res.isError, false, res.text);
  assert.deepEqual(res.data.qcm_codes, [Q.approuve]);
});

test('foretmap_list_qcm : le filtre species_id lit la source unique, liens approuvés', async () => {
  const res = await fx.callTool(app, token, 'foretmap_list_qcm', { species_id: plantId });
  assert.equal(res.isError, false, res.text);
  const codes = res.data.items.map((r) => r.question_code);
  assert.deepEqual(codes, [Q.approuve]);
});
