'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
  createGlGameWithTeams,
  assignPlayerToGameTeam,
  signTokens,
} = require('./helpers/glFixtures');

let adminToken = '';
let playerToken = '';
let gameId = null;
let teamId = null;
const stamp = Date.now();
const codeInBiome = `test-inbiome-${stamp}`;
const codeOutBiome = `test-outbiome-${stamp}`;
const codeFound = `test-found-${stamp}`;

before(async () => {
  await initSchema();
  const admin = await createGlAdmin({ email: `gl.access.${stamp}@ecole.local` });
  const cls = await createGlClass({ name: `Classe Accès ${stamp}`, adminId: admin.id });
  // Chapitre dédié (évite de muter le chapitre seedé partagé) avec un biome maîtrisé.
  await execute('INSERT INTO gl_chapters (slug, title, order_index) VALUES (?, ?, 900)', [
    `acces-${stamp}`,
    `Chapitre Accès ${stamp}`,
  ]);
  const chapter = await queryOne('SELECT id FROM gl_chapters WHERE slug = ? LIMIT 1', [
    `acces-${stamp}`,
  ]);
  const chapterId = Number(chapter.id);
  const inBiome = 'savane';
  const outBiome = 'toundra';
  await execute(
    'INSERT INTO gl_chapter_biomes (chapter_id, biome_slug, order_index) VALUES (?, ?, 0)',
    [chapterId, inBiome],
  );
  const gameSeed = await createGlGameWithTeams({
    classId: cls.id,
    chapterId,
    createdBy: admin.id,
    teams: [{ name: 'Equipe Accès', type: 'gnome' }],
  });
  gameId = Number(gameSeed.game.id);
  teamId = Number(gameSeed.teams[0].id);
  await execute('UPDATE gl_games SET status = ? WHERE id = ?', ['live', gameId]);

  const player = await createGlPlayer({ classId: cls.id, teamId, pseudo: `access-${stamp}` });
  await assignPlayerToGameTeam({ gameId, teamId, playerId: player.id });

  const tokens = await signTokens({
    adminId: admin.id,
    adminPermissions: ['gl.read', 'gl.content.manage', 'gl.settings.manage'],
    playerId: player.id,
    teamId,
  });
  adminToken = tokens.adminToken;
  playerToken = tokens.playerToken;

  const insert = (code, titre, biome) =>
    execute(
      `INSERT INTO gl_lore_feuillets
         (feuillet_code, titre, incipit, idee_cle, texte, texte_accessible, biome_slug, ordre_voyage)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        code,
        titre,
        `Incipit ${titre}`,
        `Idée ${titre}`,
        `TEXTE MJ ${titre}`,
        `Accessible ${titre}`,
        biome,
        1,
      ],
    );
  await insert(codeInBiome, 'Feuillet dans le biome', inBiome);
  await insert(codeOutBiome, 'Feuillet hors biome', outBiome);
  await insert(codeFound, 'Feuillet trouvé', inBiome);

  // Le feuillet "found" est découvert par l'équipe.
  await execute(
    `INSERT INTO gl_game_feuillet_states (game_id, team_id, feuillet_code, status, unlocked_via, discovered_at)
     VALUES (?, ?, ?, 'discovered', 'zone', NOW())`,
    [gameId, teamId, codeFound],
  );
});

test('Joueur : liste scopée aux biomes joués, feuillet hors biome exclu', async () => {
  const res = await request(app)
    .get('/api/gl/lore/feuillets')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  const codes = res.body.items.map((i) => i.feuilletCode);
  assert.ok(codes.includes(codeInBiome), 'feuillet du biome joué visible');
  assert.ok(codes.includes(codeFound), 'feuillet trouvé visible');
  assert.ok(!codes.includes(codeOutBiome), 'feuillet hors biome masqué');
});

test('Joueur : feuillet non trouvé = aperçu (titre + incipit), pas de contenu', async () => {
  const res = await request(app)
    .get('/api/gl/lore/feuillets')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  const locked = res.body.items.find((i) => i.feuilletCode === codeInBiome);
  assert.ok(locked);
  assert.strictEqual(locked.progressStatus, 'locked');
  assert.strictEqual(locked.incipit, 'Incipit Feuillet dans le biome'); // aperçu défaut
  assert.strictEqual(locked.displayText, null);
  assert.strictEqual(locked.texteAccessible, null);
  assert.strictEqual(locked.ideeCle, null);
  assert.strictEqual(locked.texte, undefined);
});

test('Joueur : feuillet trouvé = contenu lisible', async () => {
  const res = await request(app)
    .get('/api/gl/lore/feuillets')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  const found = res.body.items.find((i) => i.feuilletCode === codeFound);
  assert.ok(found);
  assert.strictEqual(found.progressStatus, 'discovered');
  assert.strictEqual(found.displayText, 'Accessible Feuillet trouvé');
});

test('Joueur : GET :code hors biome → 404, non trouvé dans le biome → aperçu, trouvé → contenu', async () => {
  await request(app)
    .get(`/api/gl/lore/feuillets/${codeOutBiome}`)
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(404);

  const preview = await request(app)
    .get(`/api/gl/lore/feuillets/${codeInBiome}`)
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.strictEqual(preview.body.feuillet.displayText, null);
  assert.strictEqual(preview.body.feuillet.incipit, 'Incipit Feuillet dans le biome');

  const full = await request(app)
    .get(`/api/gl/lore/feuillets/${codeFound}`)
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.strictEqual(full.body.feuillet.displayText, 'Accessible Feuillet trouvé');
});

test('MJ : accès intégral, pas de scoping biome ni masquage', async () => {
  const res = await request(app)
    .get('/api/gl/lore/feuillets')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const codes = res.body.items.map((i) => i.feuilletCode);
  assert.ok(codes.includes(codeOutBiome), 'MJ voit aussi les feuillets hors biome');
  const item = res.body.items.find((i) => i.feuilletCode === codeInBiome);
  assert.strictEqual(item.texte, 'TEXTE MJ Feuillet dans le biome');
});

test('Réglage plateforme : ajouter idee_cle à l’aperçu le révèle sur les feuillets verrouillés', async () => {
  await request(app)
    .put('/api/gl/admin/settings/gameplay.lore_feuillet_preview_fields')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ value: ['incipit', 'ideeCle'] })
    .expect(200);

  const res = await request(app)
    .get('/api/gl/lore/feuillets')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  const locked = res.body.items.find((i) => i.feuilletCode === codeInBiome);
  assert.strictEqual(locked.ideeCle, 'Idée Feuillet dans le biome');
  assert.strictEqual(locked.displayText, null); // le texte reste masqué

  // Restaure le défaut pour ne pas polluer les autres tests.
  await request(app)
    .put('/api/gl/admin/settings/gameplay.lore_feuillet_preview_fields')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ value: ['incipit'] })
    .expect(200);
});
