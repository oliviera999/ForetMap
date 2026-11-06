'use strict';

/**
 * « Tenir à deux » v2 — exports CSV par classe (spec § 11) : en-têtes, une ligne par élève ×
 * séance, BOM + `;`, joueur → 403, aucune bourse ni classement. Fixtures anonymes.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute } = require('../database');
const { createTenirGame } = require('./helpers/glTenirFixtures');

let ctx;
const auth = (t) => ({ Authorization: `Bearer ${t}` });

before(async () => {
  await initSchema();
  ctx = await createTenirGame({ stamp: Date.now(), playerCount: 4 });
  await execute(
    `INSERT INTO gl_game_team_spirit (game_id, round_number, team_id, cartes_gardees, cartes_json) VALUES (?, 1, ?, 5, '["Question","Écoute"]'), (?, 2, ?, 6, NULL)
     ON DUPLICATE KEY UPDATE cartes_gardees = VALUES(cartes_gardees)`,
    [ctx.game.id, ctx.teams[0].id, ctx.game.id, ctx.teams[0].id],
  );
  await execute(
    `INSERT INTO gl_tenir_badges (code, nom, regle_type, seuil, source, actif) VALUES ('premiere_page', 'Première page', 'compteur', 1, 'carnet_personnel_pages', 1)
     ON DUPLICATE KEY UPDATE actif = 1`,
  );
  await execute(
    `INSERT IGNORE INTO gl_player_badges (player_id, badge_code, game_id, source, valeur, awarded_by, awarded_at) VALUES (?, 'premiere_page', ?, 'carnet_personnel_pages', 1, 'app', NOW())`,
    [ctx.players[0].id, ctx.game.id],
  );
});

test('team-spirit.csv : BOM, séparateur ; en-têtes, une ligne par élève × séance, sans bourse', async () => {
  const res = await request(app)
    .get(`/api/gl/admin/classes/${ctx.cls.id}/exports/team-spirit.csv`)
    .set(auth(ctx.adminToken));
  assert.equal(res.status, 200, res.text);
  assert.match(res.headers['content-type'], /text\/csv/);
  assert.ok(res.text.startsWith('﻿'));
  const lines = res.text.replace('﻿', '').trim().split('\r\n');
  assert.equal(
    lines[0],
    'eleve;prenom;nom;partie;chapitre;tour;date;equipe;peuple;cartes_gardees;cartes_nommees',
  );
  // Gnomes A compte 1 joueur (4 joueurs répartis sur 4 équipes) × 2 séances.
  assert.equal(lines.length, 3, res.text);
  assert.ok(lines[1].includes(ctx.players[0].pseudo));
  assert.ok(lines[1].includes(';gnomes;5;'));
  assert.ok(lines[1].includes('Question, Écoute'));
  assert.doesNotMatch(res.text, /health|power|classement|cœur|gemme/i);
});

test('badges.csv : en-têtes et lignes ; un joueur est refusé (403)', async () => {
  const res = await request(app)
    .get(`/api/gl/admin/classes/${ctx.cls.id}/exports/badges.csv`)
    .set(auth(ctx.adminToken));
  assert.equal(res.status, 200, res.text);
  const lines = res.text.replace('﻿', '').trim().split('\r\n');
  assert.equal(lines[0], 'eleve;prenom;nom;badge;libelle;date;source;attribue_par');
  assert.equal(lines.length, 2);
  assert.ok(lines[1].includes('premiere_page;Première page'));
  const forbidden = await request(app)
    .get(`/api/gl/admin/classes/${ctx.cls.id}/exports/badges.csv`)
    .set(auth(ctx.players[0].token));
  assert.equal(forbidden.status, 403);
  const missing = await request(app)
    .get('/api/gl/admin/classes/999999/exports/badges.csv')
    .set(auth(ctx.adminToken));
  assert.equal(missing.status, 404);
});
