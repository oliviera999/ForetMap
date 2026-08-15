'use strict';

// Restriction de peuple sur les sortilèges (`gl_spells.caster_kind`, migration 173) :
// administration (fiche unitaire + édition en masse) et application au lancement.
require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { invalidateGameplayCache, invalidateModulesCache } = require('../lib/glSettings');
const { signAuthToken } = require('../middleware/requireTeacher');
const {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
  createGlChapterWithMarker,
  createGlGameWithTeams,
  assignPlayerToGameTeam,
} = require('./helpers/glFixtures');

const stamp = Date.now();
const TEST_CATEGORY = 'ck_test_peuples';
let gameId = null;
let gnomeTeamId = null;
let unicornTeamId = null;
let chapterId = null;
let gnomePlayerId = null;
let unicornPlayerId = null;
let gnomeToken = '';
let unicornToken = '';
let adminToken = '';

/** Remet un sort à une restriction donnée (les tests se partagent le catalogue). */
async function setCasterKind(spellCode, casterKind) {
  await execute('UPDATE gl_spells SET caster_kind = ? WHERE spell_code = ?', [
    casterKind,
    spellCode,
  ]);
}

before(async () => {
  await initSchema();
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('gameplay.vitality_enabled', 'true', NOW()),
            ('modules.spell_cast_enabled', 'true', NOW()),
            ('gameplay.spell_cast_contribution_mode', '"coordinator"', NOW()),
            ('gameplay.spell_cast_team_scope', '"any_team"', NOW()),
            ('gameplay.spell_cast_mj_only', 'false', NOW()),
            ('gameplay.spell_cast_approval_mode', '"per_spell"', NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`,
  );
  invalidateGameplayCache();
  invalidateModulesCache();

  const admin = await createGlAdmin({
    email: `ck.mj.${stamp}@ecole.local`,
    displayName: 'MJ CasterKind',
  });
  const cls = await createGlClass({
    name: `Classe CasterKind ${stamp}`,
    school: 'Ecole Test',
    adminId: admin.id,
  });

  const { chapter } = await createGlChapterWithMarker({
    slug: `ch-casterkind-${stamp}`,
    title: 'Chapitre CasterKind',
  });
  chapterId = Number(chapter.id);

  // Catégorie dédiée : le test d'édition en masse cible une catégorie entière, il ne
  // doit pas toucher les sorts des autres fichiers de test (base partagée).
  await execute(
    `INSERT INTO gl_spell_categories (slug, nom, order_index, created_at, updated_at)
     VALUES (?, 'Test peuples', 900, NOW(), NOW())
     ON DUPLICATE KEY UPDATE nom = VALUES(nom), updated_at = NOW()`,
    [TEST_CATEGORY],
  );
  await execute(
    `INSERT INTO gl_spells (spell_code, category_slug, nom, emoji, cout_gemmes, cout_coeurs,
                            statut, caster_kind, created_at, updated_at)
     VALUES ('SL901', ?, 'Sort gnomes', '🧙', 2, 0, 'officiel', 'gnome', NOW(), NOW()),
            ('SL902', ?, 'Sort licornes', '🦄', 2, 0, 'officiel', 'unicorn', NOW(), NOW()),
            ('SL903', ?, 'Sort ouvert', '✨', 2, 0, 'officiel', 'any', NOW(), NOW())
     ON DUPLICATE KEY UPDATE category_slug = VALUES(category_slug),
       caster_kind = VALUES(caster_kind), cout_gemmes = VALUES(cout_gemmes),
       cout_coeurs = VALUES(cout_coeurs), updated_at = NOW()`,
    [TEST_CATEGORY, TEST_CATEGORY, TEST_CATEGORY],
  );
  await execute(
    `INSERT INTO gl_chapter_spells (chapter_id, spell_code, order_index)
     VALUES (?, 'SL901', 0), (?, 'SL902', 10), (?, 'SL903', 20)
     ON DUPLICATE KEY UPDATE order_index = VALUES(order_index)`,
    [chapterId, chapterId, chapterId],
  );

  const gnomePlayer = await createGlPlayer({
    classId: cls.id,
    pseudo: `ck-gnome-${stamp}`,
    healthPoints: 9,
    powerPoints: 9,
  });
  const unicornPlayer = await createGlPlayer({
    classId: cls.id,
    pseudo: `ck-unicorn-${stamp}`,
    healthPoints: 9,
    powerPoints: 9,
  });
  gnomePlayerId = Number(gnomePlayer.id);
  unicornPlayerId = Number(unicornPlayer.id);

  const { game, teams } = await createGlGameWithTeams({
    classId: cls.id,
    chapterId,
    createdBy: admin.id,
    status: 'live',
    name: `Partie CasterKind ${stamp}`,
    teams: [
      { name: 'Gnomes', type: 'gnome' },
      { name: 'Licornes', type: 'unicorn' },
    ],
  });
  gameId = Number(game.id);
  gnomeTeamId = Number(teams[0].id);
  unicornTeamId = Number(teams[1].id);

  await assignPlayerToGameTeam({ gameId, teamId: gnomeTeamId, playerId: gnomePlayerId });
  await assignPlayerToGameTeam({ gameId, teamId: unicornTeamId, playerId: unicornPlayerId });

  gnomeToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_player',
    userId: String(gnomePlayerId),
    roleSlug: 'gl_player',
    permissions: ['gl.read', 'gl.action.request'],
    displayName: gnomePlayer.pseudo,
    classId: cls.id,
    teamId: gnomeTeamId,
    gameId,
  });
  unicornToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_player',
    userId: String(unicornPlayerId),
    roleSlug: 'gl_player',
    permissions: ['gl.read', 'gl.action.request'],
    displayName: unicornPlayer.pseudo,
    classId: cls.id,
    teamId: unicornTeamId,
    gameId,
  });
  adminToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_admin',
    userId: String(admin.id),
    roleSlug: 'gl_admin',
    permissions: [
      'gl.read',
      'gl.content.manage',
      'gl.game.manage',
      'gl.event.emit',
      'gl.action.request',
    ],
    displayName: admin.display_name,
  });
});

// --- Administration : fiche unitaire -------------------------------------------------

test('la fiche admin expose la restriction et la rend modifiable', async () => {
  const before = await request(app)
    .get('/api/gl/admin/spells/SL901')
    .set('Authorization', `Bearer ${adminToken}`);
  assert.strictEqual(before.status, 200);
  assert.strictEqual(before.body.spell.caster_kind, 'gnome');

  const put = await request(app)
    .put('/api/gl/admin/spells/SL901')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nom: 'Sort gnomes',
      category_slug: TEST_CATEGORY,
      cout_gemmes: 2,
      caster_kind: 'unicorn',
    });
  assert.strictEqual(put.status, 200);
  assert.strictEqual(put.body.spell.caster_kind, 'unicorn');

  await setCasterKind('SL901', 'gnome');
});

test('un PUT qui omet la restriction ne la remet pas au défaut', async () => {
  const res = await request(app)
    .put('/api/gl/admin/spells/SL901')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ nom: 'Sort gnomes', category_slug: TEST_CATEGORY, cout_gemmes: 2 });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.spell.caster_kind, 'gnome');
});

test('la fiche joueur expose aussi la restriction (pastille de la carte de sort)', async () => {
  const res = await request(app)
    .get('/api/gl/spells/SL902')
    .set('Authorization', `Bearer ${gnomeToken}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.spell.caster_kind, 'unicorn');
});

// --- Administration : édition en masse ----------------------------------------------

test('édition en masse : applique la restriction à une sélection de sorts', async () => {
  const res = await request(app)
    .post('/api/gl/admin/spells/bulk')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ codes: ['SL901', 'SL902'], patch: { caster_kind: 'unicorn' } });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.requested, 2);
  assert.deepStrictEqual(res.body.patch, { caster_kind: 'unicorn' });

  const row = await queryOne('SELECT caster_kind FROM gl_spells WHERE spell_code = ?', ['SL901']);
  assert.strictEqual(row.caster_kind, 'unicorn');

  await setCasterKind('SL901', 'gnome');
  await setCasterKind('SL902', 'unicorn');
});

test('édition en masse : accepte les alias français et une cible par catégorie', async () => {
  const res = await request(app)
    .post('/api/gl/admin/spells/bulk')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ categorySlug: TEST_CATEGORY, patch: { caster_kind: 'gnomes' } });
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.codes.includes('SL903'));

  const row = await queryOne('SELECT caster_kind FROM gl_spells WHERE spell_code = ?', ['SL903']);
  assert.strictEqual(row.caster_kind, 'gnome');

  await setCasterKind('SL901', 'gnome');
  await setCasterKind('SL902', 'unicorn');
  await setCasterKind('SL903', 'any');
});

test('édition en masse : refuse une valeur inconnue et une sélection vide', async () => {
  const badValue = await request(app)
    .post('/api/gl/admin/spells/bulk')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ codes: ['SL901'], patch: { caster_kind: 'dragon' } });
  assert.strictEqual(badValue.status, 400);

  const noCodes = await request(app)
    .post('/api/gl/admin/spells/bulk')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ codes: [], patch: { caster_kind: 'gnome' } });
  assert.strictEqual(noCodes.status, 400);

  const noPatch = await request(app)
    .post('/api/gl/admin/spells/bulk')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ codes: ['SL901'], patch: {} });
  assert.strictEqual(noPatch.status, 400);
});

test('édition en masse : réservée à gl.content.manage', async () => {
  const res = await request(app)
    .post('/api/gl/admin/spells/bulk')
    .set('Authorization', `Bearer ${gnomeToken}`)
    .send({ codes: ['SL901'], patch: { caster_kind: 'gnome' } });
  assert.ok(res.status === 401 || res.status === 403, `statut inattendu : ${res.status}`);
});

// --- Application au lancement -------------------------------------------------------

test('une équipe du mauvais peuple ne peut pas ouvrir le brouillon', async () => {
  const res = await request(app)
    .post(`/api/gl/games/${gameId}/spell-casts/drafts`)
    .set('Authorization', `Bearer ${unicornToken}`)
    .send({ spellCode: 'SL901', teamId: unicornTeamId });
  assert.strictEqual(res.status, 403);
  assert.match(res.body.error, /gnomes/i);
});

test('une équipe du bon peuple ouvre le brouillon et voit la restriction', async () => {
  const res = await request(app)
    .post(`/api/gl/games/${gameId}/spell-casts/drafts`)
    .set('Authorization', `Bearer ${gnomeToken}`)
    .send({ spellCode: 'SL901', teamId: gnomeTeamId });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.draft.casterKind, 'gnome');
});

test('un sort ouvert reste lançable par les deux peuples', async () => {
  const res = await request(app)
    .post(`/api/gl/games/${gameId}/spell-casts/drafts`)
    .set('Authorization', `Bearer ${unicornToken}`)
    .send({ spellCode: 'SL903', teamId: unicornTeamId });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.draft.casterKind, 'any');
});

test('roster MJ : contribution d’un joueur du mauvais peuple refusée', async () => {
  // Le MJ ouvre un brouillon à l'échelle de la partie : les deux équipes sont au roster,
  // seule celle du peuple requis peut alimenter le sort.
  const draftRes = await request(app)
    .post(`/api/gl/games/${gameId}/spell-casts/drafts`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ spellCode: 'SL902', teamId: unicornTeamId });
  assert.strictEqual(draftRes.status, 201);
  assert.strictEqual(draftRes.body.draft.rosterScope, 'game');
  const draftId = draftRes.body.draft.id;

  const refused = await request(app)
    .put(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/contributions`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ contributions: [{ playerId: gnomePlayerId, gems: 2, hearts: 0 }] });
  assert.strictEqual(refused.status, 403);
  assert.match(refused.body.error, /licornes/i);

  // Une ligne à zéro reste un no-op légitime (le front envoie tout le roster).
  const zeroed = await request(app)
    .put(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/contributions`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      contributions: [
        { playerId: gnomePlayerId, gems: 0, hearts: 0 },
        { playerId: unicornPlayerId, gems: 2, hearts: 0 },
      ],
    });
  assert.strictEqual(zeroed.status, 200);
  assert.strictEqual(zeroed.body.draft.ready, true);
});

test('lancement : la restriction posée après l’alimentation bloque le débit', async () => {
  const draftRes = await request(app)
    .post(`/api/gl/games/${gameId}/spell-casts/drafts`)
    .set('Authorization', `Bearer ${gnomeToken}`)
    .send({ spellCode: 'SL903', teamId: gnomeTeamId });
  assert.strictEqual(draftRes.status, 201);
  const draftId = draftRes.body.draft.id;

  await request(app)
    .put(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/contributions`)
    .set('Authorization', `Bearer ${gnomeToken}`)
    .send({ contributions: [{ playerId: gnomePlayerId, gems: 2, hearts: 0 }] });

  const before = await queryOne('SELECT power_points FROM gl_players WHERE id = ?', [
    gnomePlayerId,
  ]);

  // Le MJ restreint le sort aux licornes pendant que le brouillon est déjà complet.
  await setCasterKind('SL903', 'unicorn');
  const launch = await request(app)
    .post(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/launch`)
    .set('Authorization', `Bearer ${gnomeToken}`);
  assert.strictEqual(launch.status, 403);

  const after = await queryOne('SELECT power_points FROM gl_players WHERE id = ?', [gnomePlayerId]);
  assert.strictEqual(Number(after.power_points), Number(before.power_points));

  await setCasterKind('SL903', 'any');
});

test('lancement : un sort restreint se débite normalement pour le bon peuple', async () => {
  const draftRes = await request(app)
    .post(`/api/gl/games/${gameId}/spell-casts/drafts`)
    .set('Authorization', `Bearer ${gnomeToken}`)
    .send({ spellCode: 'SL901', teamId: gnomeTeamId });
  assert.strictEqual(draftRes.status, 201);
  const draftId = draftRes.body.draft.id;

  await request(app)
    .put(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/contributions`)
    .set('Authorization', `Bearer ${gnomeToken}`)
    .send({ contributions: [{ playerId: gnomePlayerId, gems: 2, hearts: 0 }] });

  const before = await queryOne('SELECT power_points FROM gl_players WHERE id = ?', [
    gnomePlayerId,
  ]);
  const launch = await request(app)
    .post(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/launch`)
    .set('Authorization', `Bearer ${gnomeToken}`);
  assert.strictEqual(launch.status, 200);
  assert.strictEqual(launch.body.event.eventType, 'spell_cast');

  const after = await queryOne('SELECT power_points FROM gl_players WHERE id = ?', [gnomePlayerId]);
  assert.strictEqual(Number(after.power_points), Number(before.power_points) - 2);
});

test('le catalogue du chapitre porte la restriction (état de partie)', async () => {
  const res = await request(app)
    .get(`/api/gl/games/${gameId}`)
    .set('Authorization', `Bearer ${gnomeToken}`);
  assert.strictEqual(res.status, 200);
  const spell = (res.body.game.chapter_spells || []).find((s) => s.spell_code === 'SL901');
  assert.ok(spell, 'SL901 absent du catalogue du chapitre');
  assert.strictEqual(spell.caster_kind, 'gnome');
});
