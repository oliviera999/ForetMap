'use strict';

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { createGlAdmin, createGlClass, createGlPlayer } = require('./helpers/glFixtures');
const {
  isValidReferenceSlug,
  extractMarkdownTitle,
  extractMarkdownSummary,
  compareReferenceSlugs,
  mergeReferenceDoc,
  listReferenceDocFileSlugs,
} = require('../lib/glReferenceDocs');

const BASE = '/api/gl/admin/reference-docs';
const SLUG = 'presentation';

let playerToken = '';
let adminToken = '';

const stamp = Date.now();

before(async () => {
  await initSchema();
  const admin = await createGlAdmin({
    email: `refdocs.mj.${stamp}@ecole.local`,
    displayName: 'MJ',
  });
  const cls = await createGlClass({ name: `Classe RefDocs ${stamp}`, adminId: admin.id });
  const player = await createGlPlayer({ classId: cls.id, pseudo: `refdocs-player-${stamp}` });

  playerToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_player',
    userId: String(player.id),
    roleSlug: 'gl_player',
    permissions: ['gl.read'],
    displayName: 'Equipe test',
  });
  adminToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_admin',
    userId: String(admin.id),
    roleSlug: 'gl_admin',
    permissions: ['gl.read', 'gl.content.manage'],
    displayName: 'MJ',
  });
});

// Les tests écrivent une surcouche : on rend la main aux fichiers du dépôt en sortant.
after(async () => {
  await execute('DELETE FROM gl_reference_docs WHERE slug = ?', [SLUG]);
});

test('les helpers refusent tout slug hors du dossier docs/reference/gl', () => {
  assert.strictEqual(isValidReferenceSlug('guide-du-mj'), true);
  assert.strictEqual(isValidReferenceSlug('../../../etc/passwd'), false);
  assert.strictEqual(isValidReferenceSlug('guide/du/mj'), false);
  assert.strictEqual(isValidReferenceSlug('Guide-Du-MJ'), false);
  assert.strictEqual(isValidReferenceSlug('guide_du_mj'), false);
  assert.strictEqual(isValidReferenceSlug(''), false);
  assert.strictEqual(isValidReferenceSlug('a'.repeat(200)), false);
});

test('extractMarkdownTitle prend le premier titre de niveau 1', () => {
  assert.strictEqual(extractMarkdownTitle('# Le titre\n\nTexte', 'fallback'), 'Le titre');
  assert.strictEqual(extractMarkdownTitle('## Sous-titre\n', 'fallback'), 'fallback');
  assert.strictEqual(extractMarkdownTitle('', 'fallback'), 'fallback');
});

test('extractMarkdownSummary ignore titres, citations et séparateurs', () => {
  const markdown = '# Titre\n\n> Public de ce document.\n\n---\n\nLe **jeu** sert à ceci.';
  assert.strictEqual(extractMarkdownSummary(markdown), 'Le jeu sert à ceci.');
  assert.strictEqual(extractMarkdownSummary('# Titre seul'), '');
});

test('compareReferenceSlugs suit l’ordre de lecture puis l’alphabet', () => {
  const slugs = ['guide-du-mj', 'zzz-inconnu', 'presentation', 'aaa-inconnu'];
  assert.deepStrictEqual([...slugs].sort(compareReferenceSlugs), [
    'presentation',
    'guide-du-mj',
    'aaa-inconnu',
    'zzz-inconnu',
  ]);
});

test('mergeReferenceDoc : la surcouche base l’emporte sur le fichier', () => {
  const fileDoc = { slug: 'x', title: 'Fichier', bodyMarkdown: '# Fichier', updatedAt: null };
  const fromFile = mergeReferenceDoc('x', fileDoc, null);
  assert.strictEqual(fromFile.source, 'file');
  assert.strictEqual(fromFile.edited, false);
  assert.strictEqual(fromFile.bodyMarkdown, '# Fichier');

  const override = { slug: 'x', title: 'Base', bodyMarkdown: '# Base', updatedBy: '7' };
  const fromDb = mergeReferenceDoc('x', fileDoc, override);
  assert.strictEqual(fromDb.source, 'db');
  assert.strictEqual(fromDb.edited, true);
  assert.strictEqual(fromDb.title, 'Base');
  assert.strictEqual(fromDb.bodyMarkdown, '# Base');
  assert.strictEqual(fromDb.fileAvailable, true);
});

test('les documents de référence GL sont présents sur disque', () => {
  const slugs = listReferenceDocFileSlugs();
  assert.ok(slugs.includes(SLUG), 'presentation.md attendu dans docs/reference/gl');
  assert.ok(slugs.includes('guide-du-mj'), 'guide-du-mj.md attendu dans docs/reference/gl');
});

test('GET /api/gl/admin/reference-docs exige gl.content.manage', async () => {
  await request(app).get(BASE).set('Authorization', `Bearer ${playerToken}`).expect(403);
  await request(app).get(BASE).expect(401);
});

test('GET /api/gl/admin/reference-docs liste les documents sans le Markdown', async () => {
  const res = await request(app).get(BASE).set('Authorization', `Bearer ${adminToken}`).expect(200);
  assert.ok(Array.isArray(res.body));
  const item = res.body.find((row) => row.slug === SLUG);
  assert.ok(item, 'presentation attendu dans la liste');
  assert.strictEqual(item.bodyMarkdown, undefined);
  assert.ok(String(item.title || '').length > 0);
  assert.strictEqual(res.body[0].slug, SLUG, 'l’ordre de lecture place presentation en premier');
});

test('GET /api/gl/admin/reference-docs/:slug sert le fichier du dépôt par défaut', async () => {
  const res = await request(app)
    .get(`${BASE}/${SLUG}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.strictEqual(res.body.slug, SLUG);
  assert.strictEqual(res.body.source, 'file');
  assert.strictEqual(res.body.edited, false);
  assert.ok(res.body.bodyMarkdown.includes('Gnomes & Licornes'));
});

test('GET /api/gl/admin/reference-docs/:slug refuse une traversée de chemin', async () => {
  await request(app)
    .get(`${BASE}/${encodeURIComponent('../../../package.json')}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(400);
});

test('GET /api/gl/admin/reference-docs/:slug renvoie 404 pour un document inconnu', async () => {
  await request(app)
    .get(`${BASE}/document-qui-nexiste-pas`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(404);
});

test('PUT /api/gl/admin/reference-docs/:slug exige gl.content.manage', async () => {
  await request(app)
    .put(`${BASE}/${SLUG}`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ title: 'Pirate', bodyMarkdown: 'Non' })
    .expect(403);
});

test('PUT /api/gl/admin/reference-docs/:slug refuse un titre vide', async () => {
  await request(app)
    .put(`${BASE}/${SLUG}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: '   ', bodyMarkdown: 'Corps' })
    .expect(400);
});

test('PUT /api/gl/admin/reference-docs/:slug refuse de créer un document inexistant', async () => {
  await request(app)
    .put(`${BASE}/document-qui-nexiste-pas`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: 'Nouveau', bodyMarkdown: 'Corps' })
    .expect(404);
});

test('PUT puis POST /reset : la surcouche est enregistrée puis annulée', async () => {
  const body = `# Présentation modifiée\n\n🔧 À implémenter : test ${stamp}.`;
  const saved = await request(app)
    .put(`${BASE}/${SLUG}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: 'Présentation modifiée', bodyMarkdown: body })
    .expect(200);
  assert.strictEqual(saved.body.edited, true);
  assert.strictEqual(saved.body.source, 'db');
  assert.strictEqual(saved.body.bodyMarkdown, body);

  const reread = await request(app)
    .get(`${BASE}/${SLUG}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.strictEqual(reread.body.bodyMarkdown, body);

  const listed = await request(app)
    .get(BASE)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.strictEqual(
    listed.body.find((row) => row.slug === SLUG)?.edited,
    true,
    'la liste doit signaler le document modifié',
  );

  const reset = await request(app)
    .post(`${BASE}/${SLUG}/reset`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.strictEqual(reset.body.edited, false);
  assert.strictEqual(reset.body.source, 'file');
  assert.notStrictEqual(reset.body.bodyMarkdown, body);
});

test('un JWT ForetMap ne donne pas accès aux docs de référence GL (isolement produit)', async () => {
  const foretmapToken = await signAuthToken({
    userType: 'teacher',
    userId: '1',
    permissions: ['gl.content.manage'],
    displayName: 'Prof',
  });
  // 403 : rejet au niveau `verifyJwtForProduct` (jeton d'un autre produit), avant toute
  // lecture des permissions — un `gl.content.manage` porté par un JWT ForetMap ne vaut rien.
  await request(app).get(BASE).set('Authorization', `Bearer ${foretmapToken}`).expect(403);
});
