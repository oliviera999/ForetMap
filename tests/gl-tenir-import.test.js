'use strict';

require('./helpers/setup');
const fs = require('node:fs');
const path = require('node:path');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../database');
const { initSchema, queryAll, queryOne } = db;
const {
  importChasseZones,
  importQuestionsLecture,
  importSorts,
  findForbiddenString,
  computeZoneGeometry,
  flattenTitres,
} = require('../lib/glTenirImport');
const { runImports } = require('../scripts/gl-import-tenir');
const { ensureTenirCorpus } = require('./helpers/glTenirFixtures');

const EXEMPLE = path.join(__dirname, '..', 'data', 'gl', 'tenir', 'exemple');
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(EXEMPLE, `${name}.json`), 'utf8'));

let corpus;

before(async () => {
  await initSchema();
  corpus = await ensureTenirCorpus();
});

test('findForbiddenString : mots interdits à la frontière de mot, « Grise » sensible à la casse', () => {
  assert.equal(findForbiddenString("L'Opérateur relance"), null);
  assert.equal(findForbiddenString('une bande grise sur le chemin'), null);
  assert.equal(findForbiddenString('Quand la Grise arrive'), 'Grise');
  assert.equal(findForbiddenString('le corbeau se tait'), 'corbeau');
  assert.equal(findForbiddenString('Pas encore'), null);
  assert.equal(findForbiddenString('un faux pas'), 'faux');
  assert.equal(findForbiddenString('un monstre'), 'monstre');
});

test('computeZoneGeometry : centroïde et rang de la case la plus proche', () => {
  const markers = [
    { id: 1, x_pct: 10, y_pct: 10, order_index: 0 },
    { id: 2, x_pct: 50, y_pct: 50, order_index: 1 },
    { id: 3, x_pct: 90, y_pct: 90, order_index: 2 },
  ];
  const geo = computeZoneGeometry(
    [
      [0.4, 0.4],
      [0.6, 0.4],
      [0.6, 0.6],
      [0.4, 0.6],
    ],
    markers,
  );
  assert.equal(geo.geometriePrete, 1);
  assert.ok(Math.abs(geo.centre.x - 0.5) < 1e-9);
  assert.equal(geo.rangCase, 1);
  assert.equal(computeZoneGeometry(null, markers).geometriePrete, 0);
});

test('flattenTitres : chemins honneurs.<h>.<biome>, sceaux, missions.<n>, voyageur.<n>', () => {
  const rows = flattenTitres(readJson('titres'));
  assert.ok(rows.find((r) => r.code === 'honneurs.eclaireurs.tropiques' && r.plateau === 1));
  assert.ok(rows.find((r) => r.code === 'sceaux_peuple.mains.aride' && r.peuple === 'gnome'));
  assert.ok(rows.find((r) => r.code === 'missions.1'));
  assert.ok(rows.find((r) => r.code === 'voyageur.2'));
});

test('--dry-run n’écrit rien ; le jeu d’exemple passe entier', async () => {
  const before = await queryOne('SELECT COUNT(*) AS c FROM gl_chasse_zones');
  const reports = await runImports(db, { fichier: 'tous', dryRun: true, dossier: EXEMPLE });
  for (const rep of reports)
    assert.deepEqual(rep.errors, [], `${rep.fichier}: ${rep.errors.join(' | ')}`);
  const after = await queryOne('SELECT COUNT(*) AS c FROM gl_chasse_zones');
  assert.equal(Number(after.c), Number(before.c));
});

test('chargement réel idempotent : deux passages = même base, rang_case et centroïde calculés', async () => {
  const first = await runImports(db, { fichier: 'tous', dryRun: false, dossier: EXEMPLE });
  for (const rep of first)
    assert.deepEqual(rep.errors, [], `${rep.fichier}: ${rep.errors.join(' | ')}`);
  const snapshot = async () => ({
    zones: await queryAll(
      'SELECT zone_key, rang_case, geometrie_prete, ROUND(centre_x, 4) AS cx, question_code, ordre, actif FROM gl_chasse_zones ORDER BY zone_key',
    ),
    questions: await queryAll(
      'SELECT zone_key, reponse, actif FROM gl_tenir_questions_lecture ORDER BY zone_key',
    ),
    sorts: await queryAll(
      'SELECT spell_code, statut, fenetre, peuple, execution FROM gl_spells WHERE tenir_v2 = 1 ORDER BY spell_code',
    ),
    badges: await queryAll('SELECT code, regle_type, seuil FROM gl_tenir_badges ORDER BY code'),
  });
  const a = await snapshot();
  const second = await runImports(db, { fichier: 'tous', dryRun: false, dossier: EXEMPLE });
  for (const rep of second) assert.deepEqual(rep.errors, []);
  const b = await snapshot();
  assert.deepEqual(a, b);
  const zone = a.zones.find((z) => z.zone_key === 'cz-p1-01');
  assert.equal(Number(zone.geometrie_prete), 1);
  assert.ok(Number.isInteger(Number(zone.rang_case)));
  assert.ok(Number(zone.cx) > 0);
  assert.equal(a.sorts.length, 25);
  const spells = await queryAll(
    'SELECT spell_code FROM gl_chapter_spells WHERE chapter_id = ? ORDER BY spell_code',
    [corpus.chapters[1].chapter.id],
  );
  assert.ok(spells.some((s) => s.spell_code === 'SL002'));
  assert.ok(!spells.some((s) => s.spell_code === 'SL038'), 'Boussole ouvre au chapitre 2');
  const ch2 = await queryAll('SELECT spell_code FROM gl_chapter_spells WHERE chapter_id = ?', [
    corpus.chapters[2].chapter.id,
  ]);
  assert.ok(ch2.some((s) => s.spell_code === 'SL038'));
  assert.ok(
    ch2.some((s) => s.spell_code === 'SL002'),
    'ouverture cumulative',
  );
});

test('un chargement ne touche pas gl_game_chasse_pages ni les tables gl_game_*', async () => {
  const tables = await queryAll(
    "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'gl_game_%'",
  );
  const counts = {};
  for (const t of tables)
    counts[t.TABLE_NAME] = Number((await queryOne(`SELECT COUNT(*) AS c FROM ${t.TABLE_NAME}`)).c);
  await runImports(db, { fichier: 'tous', dryRun: false, dossier: EXEMPLE });
  for (const t of tables) {
    assert.equal(
      Number((await queryOne(`SELECT COUNT(*) AS c FROM ${t.TABLE_NAME}`)).c),
      counts[t.TABLE_NAME],
      t.TABLE_NAME,
    );
  }
});

test('refus : question inconnue, thème ≠ catégorie, indice > 120, ordre à trou, chaîne interdite, question en double', async () => {
  const base = readJson('chasse-zones');
  const bad = JSON.parse(JSON.stringify(base));
  bad.zones[0].question_code = 'QCM-INEXISTANTE';
  bad.zones[1].theme_secours = 'flore'; // la question 1 est faune
  bad.zones[2].indice = 'x'.repeat(121);
  bad.zones[3].ordre = 5;
  bad.zones[4].indice = 'Là où le corbeau dort';
  bad.zones[5].question_code = bad.zones[6].question_code;
  const rep = await importChasseZones(db, bad, { dryRun: true });
  assert.match(rep.errors.join('\n'), /QCM-INEXISTANTE introuvable/);
  assert.match(rep.errors.join('\n'), /theme_secours/);
  assert.match(rep.errors.join('\n'), /> 120/);
  assert.match(rep.errors.join('\n'), /trou/);
  assert.match(rep.errors.join('\n'), /chaîne interdite « corbeau »/);
  assert.match(rep.errors.join('\n'), /déjà utilisée/);
});

test('refus : polygone < 3 points, polygone_ref inconnu, feuillet d’un autre plateau', async () => {
  const bad = readJson('chasse-zones');
  bad.zones[0].polygone = [
    [0.1, 0.1],
    [0.2, 0.2],
  ];
  bad.zones[1].polygone = null;
  bad.zones[1].polygone_ref = 'zf-inconnue';
  bad.zones[2].feuillet_code = 'tenir-ex-p3-1';
  const rep = await importChasseZones(db, bad, { dryRun: true, catalog: [] });
  assert.match(rep.errors.join('\n'), /polygone invalide/);
  assert.match(rep.errors.join('\n'), /polygone_ref zf-inconnue inconnu/);
  assert.match(rep.errors.join('\n'), /autre plateau/);
});

test('refus questions de lecture : réponse hors A-D, choix en double, feedback sans « Pas encore »', async () => {
  const bad = readJson('questions-lecture');
  bad.questions[0].reponse = 'E';
  bad.questions[1].choix.B = bad.questions[1].choix.A;
  bad.questions[2].feedback_incorrect = 'Non.';
  const rep = await importQuestionsLecture(db, bad, {
    dryRun: true,
    zones: readJson('chasse-zones'),
  });
  assert.match(rep.errors.join('\n'), /reponse hors A-D/);
  assert.match(rep.errors.join('\n'), /choix en double/);
  assert.match(rep.errors.join('\n'), /Pas encore/);
});

test('refus sorts : fenêtre inconnue, effet auto invalide ; un sort v2 retiré du fichier passe en propose', async () => {
  const bad = readJson('sorts');
  bad.sorts[0].fenetre = 'quand_je_veux';
  bad.sorts[1].effet_auto_json = { type: 'inconnu' };
  const rep = await importSorts(db, bad, { dryRun: true });
  assert.match(rep.errors.join('\n'), /fenêtre inconnue/);
  assert.match(rep.errors.join('\n'), /effet_auto_json invalide/);

  const partial = readJson('sorts');
  partial.sorts = partial.sorts.filter((s) => s.code !== 'SL036');
  partial.ouverture_par_chapitre['1'] = partial.ouverture_par_chapitre['1'].filter(
    (c) => c !== 'SL036',
  );
  const ok = await importSorts(db, partial, { dryRun: false });
  assert.deepEqual(ok.errors, []);
  const farce = await queryOne("SELECT statut FROM gl_spells WHERE spell_code = 'SL036'");
  assert.equal(farce.statut, 'propose');
  await importSorts(db, readJson('sorts'), { dryRun: false });
  const back = await queryOne("SELECT statut FROM gl_spells WHERE spell_code = 'SL036'");
  assert.equal(back.statut, 'officiel');
});
