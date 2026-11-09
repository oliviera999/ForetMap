'use strict';

/**
 * Catalogues « Tenir à deux » en prod (simulation du 7 novembre 2026, étape 1) :
 * - import tolérant ligne par ligne (une ligne fautive au milieu, le reste écrit) ;
 * - `--strict` : tout ou rien ;
 * - synchronisation au démarrage idempotente (deux passages = une seule écriture) ;
 * - zone sans polygone : avertissement, jamais un refus ;
 * - routes d'administration réservées au MJ.
 * Fixtures anonymes (`data/gl/tenir/exemple`).
 */

require('./helpers/setup');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const { initSchema, queryOne, execute } = db;
const { importChasseZones, importQuestionsLecture, IMPORT_ORDER } = require('../lib/glTenirImport');
const {
  syncTenirCatalogues,
  syncTenirCataloguesAtStartup,
  readStoredHashes,
  hashRepoCatalogues,
  describeTenirCatalogues,
  HASH_KEY,
} = require('../lib/glTenirSync');
const { ensureTenirCorpus, createTenirGame } = require('./helpers/glTenirFixtures');

const EXEMPLE = path.join(__dirname, '..', 'data', 'gl', 'tenir', 'exemple');
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(EXEMPLE, `${name}.json`), 'utf8'));

let ctx;
let tmpDir;

before(async () => {
  await initSchema();
  await ensureTenirCorpus();
  ctx = await createTenirGame({ stamp: Date.now() });
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenir-sync-'));
  for (const name of IMPORT_ORDER) {
    fs.copyFileSync(path.join(EXEMPLE, `${name}.json`), path.join(tmpDir, `${name}.json`));
  }
});

test('import tolérant : une ligne fautive au milieu est écartée et rapportée, le reste est écrit', async () => {
  const json = readJson('chasse-zones');
  json.zones[3].question_code = 'QCM-INEXISTANTE';
  const rep = await importChasseZones(db, json, { dryRun: false });
  assert.equal(rep.refuse, false);
  assert.equal(rep.ecartees, 1);
  assert.equal(rep.upserted, json.zones.length - 1);
  assert.match(rep.errors.join('\n'), /QCM-INEXISTANTE introuvable/);
  const ok = await queryOne('SELECT actif FROM gl_chasse_zones WHERE zone_key = ?', [
    json.zones[4].zone_key,
  ]);
  assert.equal(Number(ok.actif), 1, 'la ligne suivante est écrite');
  // La ligne écartée n'est pas désactivée pour autant : elle reste telle qu'elle était.
  const kept = await queryOne('SELECT actif FROM gl_chasse_zones WHERE zone_key = ?', [
    json.zones[3].zone_key,
  ]);
  assert.ok(kept, 'ligne écartée conservée');
  // Rechargement propre.
  const clean = await importChasseZones(db, readJson('chasse-zones'), { dryRun: false });
  assert.deepEqual(clean.errors, []);
  assert.equal(clean.ecartees, 0);
});

test('--strict : une ligne fautive refuse le fichier entier, rien n’est écrit', async () => {
  const json = readJson('chasse-zones');
  json.zones[0].indice = 'Là où le corbeau dort';
  const before = await queryOne(
    'SELECT indice, updated_at FROM gl_chasse_zones WHERE zone_key = ?',
    [json.zones[1].zone_key],
  );
  json.zones[1].indice = 'Indice modifié pour le test strict';
  const rep = await importChasseZones(db, json, { dryRun: false, strict: true });
  assert.equal(rep.refuse, true);
  assert.equal(rep.upserted, 0);
  assert.match(rep.errors.join('\n'), /chaîne interdite « corbeau »/);
  const after = await queryOne('SELECT indice FROM gl_chasse_zones WHERE zone_key = ?', [
    json.zones[1].zone_key,
  ]);
  assert.equal(after.indice, before.indice);
});

test('zone sans polygone ni polygone_ref : avertissement, pas un refus ; zone inactive : feuillet d’un autre plateau toléré', async () => {
  const json = readJson('chasse-zones');
  json.zones[0].polygone = null;
  json.zones[0].polygone_ref = null;
  json.zones[1].actif = false;
  json.zones[1].feuillet_code = 'tenir-ex-p3-1';
  const rep = await importChasseZones(db, json, { dryRun: true, catalog: [] });
  assert.deepEqual(rep.errors, []);
  assert.match(rep.warnings.join('\n'), /sans géométrie/);
  assert.match(rep.warnings.join('\n'), /autre plateau .* zone inactive/);
  // Une zone active avec un feuillet d'un autre plateau reste une erreur.
  json.zones[1].actif = true;
  const bad = await importChasseZones(db, json, { dryRun: true, catalog: [] });
  assert.match(bad.errors.join('\n'), /feuillet d'un autre plateau/);
});

test('questions de lecture : zone inactive ou inconnue → écartée avec avertissement (jamais une erreur en tolérant)', async () => {
  const zones = readJson('chasse-zones');
  zones.zones[0].actif = false;
  const questions = readJson('questions-lecture');
  questions.questions.push({ ...questions.questions[1], zone_key: 'cz-p9-99' });
  const rep = await importQuestionsLecture(db, questions, { dryRun: true, zones });
  assert.deepEqual(rep.errors, []);
  assert.equal(rep.ecartees, 2);
  assert.match(rep.warnings.join('\n'), /zone inactive/);
  assert.match(rep.warnings.join('\n'), /zone inconnue/);
  const strict = await importQuestionsLecture(db, questions, { dryRun: true, zones, strict: true });
  assert.match(strict.errors.join('\n'), /zone inconnue/);
  assert.equal(strict.refuse, true);
});

test('synchronisation idempotente : deux démarrages = une seule écriture, empreintes mémorisées', async () => {
  await execute('DELETE FROM gl_settings WHERE `key` = ?', [HASH_KEY]);
  const first = await syncTenirCatalogues(db, { dossier: tmpDir });
  const synced = first.files.filter((f) => f.status === 'synchronise');
  assert.equal(synced.length, IMPORT_ORDER.length, JSON.stringify(first.files));
  assert.ok(
    synced.every((f) => f.errorsTotal === 0),
    JSON.stringify(synced),
  );
  const stored = await readStoredHashes(db);
  assert.deepEqual(stored, hashRepoCatalogues(tmpDir));

  const second = await syncTenirCatalogues(db, { dossier: tmpDir });
  assert.ok(second.files.every((f) => f.status === 'a_jour'));

  // Un fichier modifié est rechargé seul.
  const badges = JSON.parse(fs.readFileSync(path.join(tmpDir, 'badges.json'), 'utf8'));
  badges.badges[0].critere = `${badges.badges[0].critere} (modifié)`;
  fs.writeFileSync(path.join(tmpDir, 'badges.json'), JSON.stringify(badges, null, 2));
  const third = await syncTenirCatalogues(db, { dossier: tmpDir });
  assert.deepEqual(
    third.files.filter((f) => f.status === 'synchronise').map((f) => f.fichier),
    ['badges'],
  );
  const row = await queryOne('SELECT critere FROM gl_tenir_badges WHERE code = ?', [
    badges.badges[0].code,
  ]);
  assert.match(row.critere, /\(modifié\)$/);

  // Un fichier refusé (structure) ne mémorise pas son empreinte : retenté au prochain démarrage.
  fs.writeFileSync(path.join(tmpDir, 'badges.json'), JSON.stringify({ format: 'x' }));
  const fourth = await syncTenirCatalogues(db, { dossier: tmpDir });
  assert.equal(fourth.files.find((f) => f.fichier === 'badges').status, 'refuse');
  const fifth = await syncTenirCatalogues(db, { dossier: tmpDir });
  assert.equal(fifth.files.find((f) => f.fichier === 'badges').status, 'refuse');
  fs.writeFileSync(path.join(tmpDir, 'badges.json'), JSON.stringify(badges, null, 2));
  await syncTenirCatalogues(db, { dossier: tmpDir });
});

test('au démarrage : désactivée en test sauf GL_TENIR_SYNC=1, et jamais bloquante', async () => {
  const previous = process.env.GL_TENIR_SYNC;
  delete process.env.GL_TENIR_SYNC;
  assert.equal(await syncTenirCataloguesAtStartup(db, { dossier: tmpDir }), null);
  process.env.GL_TENIR_SYNC = '0';
  assert.equal(await syncTenirCataloguesAtStartup(db, { dossier: tmpDir }), null);
  process.env.GL_TENIR_SYNC = '1';
  const broken = {
    queryAll: async () => [],
    queryOne: async () => {
      throw new Error('base indisponible');
    },
    execute: async () => ({}),
  };
  assert.equal(await syncTenirCataloguesAtStartup(broken, { dossier: tmpDir }), null);
  const ok = await syncTenirCataloguesAtStartup(db, { dossier: tmpDir });
  assert.ok(ok && Array.isArray(ok.files));
  if (previous === undefined) delete process.env.GL_TENIR_SYNC;
  else process.env.GL_TENIR_SYNC = previous;
});

test('describeTenirCatalogues : comptes, empreintes et écarts', async () => {
  const etat = await describeTenirCatalogues(db, { dossier: tmpDir });
  assert.equal(etat.fichiers.length, IMPORT_ORDER.length);
  const zones = etat.fichiers.find((f) => f.fichier === 'chasse-zones');
  assert.equal(zones.table, 'gl_chasse_zones');
  assert.ok(zones.count >= 8);
  assert.equal(zones.aJour, true);
  assert.deepEqual(etat.ecarts, []);
});

test('GET/POST /api/gl/admin/tenir/catalogues : MJ seulement ; dry-run d’un fichier ; fichier inconnu → 400', async () => {
  const forbidden = await request(app)
    .get('/api/gl/admin/tenir/catalogues')
    .set('Authorization', `Bearer ${ctx.players[0].token}`);
  assert.equal(forbidden.status, 403);
  const anon = await request(app).get('/api/gl/admin/tenir/catalogues');
  assert.equal(anon.status, 401);

  const res = await request(app)
    .get('/api/gl/admin/tenir/catalogues')
    .set('Authorization', `Bearer ${ctx.adminToken}`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(Array.isArray(res.body.fichiers));
  assert.ok(res.body.fichiers.some((f) => f.fichier === 'badges' && f.table === 'gl_tenir_badges'));

  const dry = await request(app)
    .post('/api/gl/admin/tenir/catalogues/sync')
    .set('Authorization', `Bearer ${ctx.adminToken}`)
    .send({ dryRun: true, fichier: 'badges' });
  assert.equal(dry.status, 200, JSON.stringify(dry.body));
  assert.equal(dry.body.dryRun, true);
  assert.equal(dry.body.files.length, 1);
  assert.equal(dry.body.files[0].status, 'dry_run');

  const unknown = await request(app)
    .post('/api/gl/admin/tenir/catalogues/sync')
    .set('Authorization', `Bearer ${ctx.adminToken}`)
    .send({ fichier: 'inconnu' });
  assert.equal(unknown.status, 400);

  const playerPost = await request(app)
    .post('/api/gl/admin/tenir/catalogues/sync')
    .set('Authorization', `Bearer ${ctx.players[0].token}`)
    .send({ dryRun: true });
  assert.equal(playerPost.status, 403);
});
