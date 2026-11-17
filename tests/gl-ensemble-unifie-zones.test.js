'use strict';

/**
 * Ensemble unifié, PR 1b, étape 1.10 (M22, L5) — zones.
 *
 * - **M22** : chaque question de zone trouve sa réponse sur le site. Après un « pas encore »,
 *   l'écran dit où la lire (fiche d'espèce ou mot du glossaire) : un lien, jamais la réponse ;
 * - catalogue `chasse-zones.json` : champ facultatif `glossaire` (codes de termes) ;
 * - catalogue `questions-lecture.json` : retour propre à chaque mauvais choix (`retours`) ;
 * - contrôle « réponses sur le site » (`lib/glReponsesSurSite.js`), pur.
 *
 * Le contenu livré (zones, questions `GQCM93xx`, fiche `SP0277`, termes de glossaire) est contrôlé
 * sur le corpus réel par `tests/content/gl-ensemble-unifie-zones.test.js`. Fixtures anonymes.
 */

require('./helpers/setup');
const fs = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const { initSchema, execute, queryOne } = db;
const { importChasseZones, importQuestionsLecture } = require('../lib/glTenirImport');
const { pisteDeReponse } = require('../lib/glChasse');
const {
  createTenirGame,
  importExempleChasse,
  ouvrirTourEnJeu,
} = require('./helpers/glTenirFixtures');
const { findForbiddenString } = require('../lib/shared/glGardeFousCore');
const {
  motsUtiles,
  evaluerReponse,
  bonneReponse,
  versCsv,
  resumer,
  celluleCsv,
} = require('../lib/glReponsesSurSite');

const EXEMPLE = path.join(__dirname, '..', 'data', 'gl', 'tenir', 'exemple');
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(EXEMPLE, `${name}.json`), 'utf8'));
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const stamp = Date.now();
const SP = `TSP${String(stamp).slice(-9)}`;
const GL = `GL8${String(stamp).slice(-3)}`;
// Zones d'exemple du plateau 1 : cz-p1-01 autour de (0.35, 0.3), cz-p1-02 autour de (0.55, 0.3).
const Z1 = { x: 0.35, y: 0.3 };
const Z2 = { x: 0.55, y: 0.3 };

let ctx;
const api = (p) => `/api/gl/games/${ctx.game.id}${p}`;
const membre = (i) => ctx.players.find((p) => Number(p.teamId) === Number(ctx.teams[i].id));

async function mauvaiseReponse(question) {
  const row = await queryOne(
    'SELECT choix_a, choix_b, choix_c, choix_d, choix_e, reponse_correcte FROM gl_qcm_questions WHERE question_code = ?',
    [question.questionCode],
  );
  const juste = row[`choix_${String(row.reponse_correcte).toLowerCase()}`];
  return question.choices.find((c) => c.text !== juste);
}

/** Fouille dans une zone, puis mauvaise réponse à sa question : renvoie la réponse HTTP. */
async function pasEncoreSur(joueur, point) {
  const f = await request(app).post(api('/chasse/fouiller')).set(auth(joueur.token)).send(point);
  assert.equal(f.status, 201, JSON.stringify(f.body));
  assert.ok(f.body.question, 'la fouille tombe dans une zone');
  const choix = await mauvaiseReponse(f.body.question);
  return request(app).post(api('/chasse/repondre')).set(auth(joueur.token)).send({
    presentationToken: f.body.question.presentationToken,
    questionCode: f.body.question.questionCode,
    choiceId: choix.id,
  });
}

before(async () => {
  await initSchema();
  ctx = await createTenirGame({ stamp, plateau: 1 });
  await importExempleChasse(db, { game: ctx.game });
  await request(app).get(api('/tenir')).set(auth(ctx.adminToken)).expect(200);
  await execute('UPDATE gl_game_tenir_state SET chapardeur_round = 99 WHERE game_id = ?', [
    ctx.game.id,
  ]);
  await execute(
    `INSERT INTO gl_species (species_code, biome_slug, type, nom_commun, statut, created_at, updated_at)
     VALUES (?, 'jungle_afc', 'faune', 'Fourmi de test', 'actif', NOW(), NOW())`,
    [SP],
  );
  await execute(
    `INSERT INTO gl_glossary_terms (glossary_code, terme, categorie, niveau, definition_courte, all_biomes, statut, created_at, updated_at)
     VALUES (?, 'canopée de test', 'ecosysteme', 'base', 'Le toit de la forêt.', 0, 'actif', NOW(), NOW())`,
    [GL],
  );
  await ouvrirTourEnJeu(request, app, ctx);
});

after(async () => {
  await execute(
    "UPDATE gl_chasse_zones SET especes_json = NULL, glossaire_json = NULL WHERE zone_key IN ('cz-p1-01', 'cz-p1-02')",
  ).catch(() => {});
  await execute('DELETE FROM gl_species WHERE species_code = ?', [SP]).catch(() => {});
  await execute('DELETE FROM gl_glossary_terms WHERE glossary_code = ?', [GL]).catch(() => {});
});

test('M22 : après un « pas encore », la piste nomme la fiche de la zone — un lien, pas la réponse', async () => {
  await execute(
    "UPDATE gl_chasse_zones SET especes_json = ?, glossaire_json = NULL WHERE zone_key = 'cz-p1-01'",
    [JSON.stringify([SP])],
  );
  const res = await pasEncoreSur(membre(2), Z1);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.correct, false);
  assert.match(res.body.feedback, /^Pas encore/);
  assert.deepEqual(res.body.piste, {
    type: 'fiche',
    code: SP,
    nom: 'Fourmi de test',
    texte: 'La réponse se trouve dans la fiche « Fourmi de test ».',
  });
  assert.equal(findForbiddenString(res.body.piste.texte), null);
  // Ni la bonne réponse ni son texte ne sortent avec la piste.
  assert.equal(res.body.reponse, undefined);
  assert.equal(res.body.correctChoiceId, undefined);
});

test('M22 : un terme de glossaire relié à la zone passe avant la fiche ; une ressource absente est sautée', async () => {
  await execute(
    "UPDATE gl_chasse_zones SET especes_json = ?, glossaire_json = ? WHERE zone_key = 'cz-p1-02'",
    [JSON.stringify([SP]), JSON.stringify(['GL7999', GL])],
  );
  const res = await pasEncoreSur(membre(0), Z2);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body.piste, {
    type: 'glossaire',
    code: GL,
    nom: 'canopée de test',
    texte: 'La réponse se trouve au mot « canopée de test » du glossaire.',
  });

  // Fonction seule : zone sans ressource → aucune piste ; terme inactif → la fiche prend le relais.
  assert.equal(await pisteDeReponse(db, { especes: [], glossaire: [] }), null);
  assert.equal(await pisteDeReponse(db, { especes: ['SP-INCONNUE'], glossaire: ['GL7999'] }), null);
  await execute("UPDATE gl_glossary_terms SET statut = 'inactif' WHERE glossary_code = ?", [GL]);
  const repli = await pisteDeReponse(db, { especes: [SP], glossaire: [GL] });
  assert.equal(repli.type, 'fiche');
  await execute("UPDATE gl_glossary_terms SET statut = 'actif' WHERE glossary_code = ?", [GL]);
});

test('une bonne réponse ne porte pas de piste', async () => {
  // Les Licornes B fouillent la zone 1 (révélée plus haut) et répondent juste.
  const joueur = membre(3);
  const f = await request(app).post(api('/chasse/fouiller')).set(auth(joueur.token)).send(Z1);
  assert.equal(f.status, 201, JSON.stringify(f.body));
  const row = await queryOne(
    'SELECT choix_a, choix_b, choix_c, choix_d, choix_e, reponse_correcte FROM gl_qcm_questions WHERE question_code = ?',
    [f.body.question.questionCode],
  );
  const juste = row[`choix_${String(row.reponse_correcte).toLowerCase()}`];
  const res = await request(app)
    .post(api('/chasse/repondre'))
    .set(auth(joueur.token))
    .send({
      presentationToken: f.body.question.presentationToken,
      questionCode: f.body.question.questionCode,
      choiceId: f.body.question.choices.find((c) => c.text === juste).id,
    });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.correct, true);
  assert.equal(res.body.piste, undefined);
});

test('question de lecture : le retour propre au mauvais choix prime sur le retour commun', async () => {
  // La zone 1 vient d'être trouvée par les Licornes B : une équipe gnome peut la tenir.
  await execute(
    "UPDATE gl_tenir_questions_lecture SET retours_json = ? WHERE zone_key = 'cz-p1-01'",
    [
      JSON.stringify({
        A: 'Pas encore : retour du choix A.',
        B: 'Pas encore : retour du choix B.',
        C: 'Pas encore : retour du choix C.',
        D: 'Pas encore : retour du choix D.',
      }),
    ],
  );
  const lecture = await queryOne(
    "SELECT reponse, choix_json FROM gl_tenir_questions_lecture WHERE zone_key = 'cz-p1-01'",
  );
  const choix = JSON.parse(lecture.choix_json);
  const mauvaiseLettre = ['A', 'B', 'C', 'D'].find((l) => l !== lecture.reponse);
  const gnome = membre(0);
  const ouverte = await request(app)
    .post(api('/chasse/pages/cz-p1-01/ouvrir'))
    .set(auth(gnome.token))
    .send({});
  assert.equal(ouverte.status, 200, JSON.stringify(ouverte.body));
  assert.ok(ouverte.body.question, 'la question de lecture est jointe');
  const choixFaux = ouverte.body.question.choices.find((c) => c.text === choix[mauvaiseLettre]);
  const res = await request(app)
    .post(api('/chasse/pages/cz-p1-01/tenir'))
    .set(auth(gnome.token))
    .send({
      presentationToken: ouverte.body.question.presentationToken,
      questionCode: ouverte.body.question.questionCode,
      choiceId: choixFaux.id,
    });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.correct, false);
  assert.equal(res.body.feedback, `Pas encore : retour du choix ${mauvaiseLettre}.`);
  await execute(
    "UPDATE gl_tenir_questions_lecture SET retours_json = NULL WHERE zone_key = 'cz-p1-01'",
  );
});

test('chargeur des zones : `glossaire` est facultatif, sa forme est contrôlée, un terme absent est signalé sans refuser', async () => {
  const ok = readJson('chasse-zones');
  ok.zones[0].glossaire = [GL.toLowerCase(), 'GL7999'];
  let rep = await importChasseZones(db, ok, { dryRun: true });
  assert.equal(rep.refuse, false, JSON.stringify(rep.errors));
  assert.match(rep.warnings.join('\n'), /terme de glossaire GL7999 introuvable/);
  assert.doesNotMatch(rep.warnings.join('\n'), new RegExp(`${GL} introuvable`));

  const bad = readJson('chasse-zones');
  bad.zones[0].glossaire = 'GL0001';
  bad.zones[1].glossaire = ['GL1', 'pas-un-code'];
  bad.zones[2].glossaire = ['GL0001', 'GL0002', 'GL0003', 'GL0004'];
  bad.zones[3].glossaire = [];
  rep = await importChasseZones(db, bad, { dryRun: true });
  const erreurs = rep.errors.join('\n');
  assert.match(erreurs, /glossaire doit être une liste de codes/);
  assert.match(erreurs, /code de glossaire invalide/);
  assert.match(erreurs, /glossaire attend 1 à 3 codes/);

  // Écrit en base, puis relu par le moteur.
  const ecrit = readJson('chasse-zones');
  ecrit.zones[0].glossaire = [GL];
  rep = await importChasseZones(db, ecrit, {});
  assert.equal(rep.refuse, false, JSON.stringify(rep.errors));
  const row = await queryOne('SELECT glossaire_json FROM gl_chasse_zones WHERE zone_key = ?', [
    ecrit.zones[0].zone_key,
  ]);
  assert.deepEqual(JSON.parse(row.glossaire_json), [GL]);
  // Sans le champ, la colonne se vide (le fichier est maître).
  rep = await importChasseZones(db, readJson('chasse-zones'), {});
  const vide = await queryOne('SELECT glossaire_json FROM gl_chasse_zones WHERE zone_key = ?', [
    ecrit.zones[0].zone_key,
  ]);
  assert.equal(vide.glossaire_json, null);
});

test('chargeur des questions de lecture : `retours` par mauvais choix, « Pas encore » exigé, retour commun facultatif s’ils y sont tous', async () => {
  const zones = readJson('chasse-zones');
  const base = readJson('questions-lecture');
  const q = base.questions[0];
  const mauvaises = ['A', 'B', 'C', 'D'].filter((l) => l !== q.reponse);

  const complet = JSON.parse(JSON.stringify(base));
  complet.questions[0].retours = Object.fromEntries(
    mauvaises.map((l) => [l, `Pas encore : relis le passage ${l}.`]),
  );
  delete complet.questions[0].feedback_incorrect;
  let rep = await importQuestionsLecture(db, complet, { dryRun: true, zones });
  assert.equal(rep.refuse, false, JSON.stringify(rep.errors));

  const partiel = JSON.parse(JSON.stringify(base));
  partiel.questions[0].retours = { [mauvaises[0]]: 'Pas encore : relis le début.' };
  delete partiel.questions[0].feedback_incorrect;
  rep = await importQuestionsLecture(db, partiel, { dryRun: true, zones });
  assert.match(rep.errors.join('\n'), /feedback_incorrect doit commencer par « Pas encore »/);

  const bad = JSON.parse(JSON.stringify(base));
  bad.questions[0].retours = {
    [q.reponse]: 'Pas encore : la bonne lettre n’a pas de retour.',
    [mauvaises[0]]: 'Non, relis.',
    [mauvaises[1]]: '',
    E: 'Pas encore : hors des quatre choix.',
  };
  bad.questions[1].retours = ['Pas encore.'];
  rep = await importQuestionsLecture(db, bad, { dryRun: true, zones });
  const erreurs = rep.errors.join('\n');
  assert.match(erreurs, /pas de retour pour la bonne lettre/);
  assert.match(erreurs, /doit commencer par « Pas encore »/);
  assert.match(erreurs, new RegExp(`retour ${mauvaises[1]} vide`));
  assert.match(erreurs, /retour hors A-D \(E\)/);
  assert.match(erreurs, /retours doit être un objet/);
});

test('catalogue réel : cz-p2-08 est active avec ep-I-06 (L5) ; 36 zones, toutes reliées à une fiche', () => {
  const dossier = path.join(__dirname, '..', 'data', 'gl', 'tenir');
  const zones = JSON.parse(fs.readFileSync(path.join(dossier, 'chasse-zones.json'), 'utf8')).zones;
  assert.equal(zones.length, 36);
  assert.ok(
    zones.every((z) => z.actif === true),
    'les 36 zones sont actives',
  );
  assert.ok(zones.every((z) => Array.isArray(z.especes) && z.especes.length >= 1));
  const p208 = zones.find((z) => z.zone_key === 'cz-p2-08');
  assert.equal(p208.feuillet_code, 'ep-I-06');
  assert.equal(p208.question_code, 'GQCM9305');
  assert.deepEqual(p208.glossaire, ['GL0279', 'GL0082']);
  assert.ok(Array.isArray(p208.polygone) && p208.polygone.length >= 3, 'géométrie en clair');
  // Les cinq questions réécrites, et leur thème de secours aligné sur leur catégorie.
  const parZone = Object.fromEntries(zones.map((z) => [z.zone_key, z]));
  assert.equal(parZone['cz-p3-01'].question_code, 'GQCM9301');
  assert.equal(parZone['cz-p3-05'].question_code, 'GQCM9302');
  assert.equal(parZone['cz-p3-07'].question_code, 'GQCM9303');
  assert.equal(parZone['cz-p3-07'].theme_secours, 'ecosystemes');
  assert.equal(parZone['cz-p3-08'].question_code, 'GQCM9304');
  assert.equal(new Set(zones.map((z) => z.question_code)).size, 36, 'une question par zone');
  // Question de lecture de cz-p2-08 : un retour par mauvais choix, tous « Pas encore ».
  const lecture = JSON.parse(
    fs.readFileSync(path.join(dossier, 'questions-lecture.json'), 'utf8'),
  ).questions.find((q) => q.zone_key === 'cz-p2-08');
  assert.equal(lecture.feuillet_code, 'ep-I-06');
  assert.equal(Object.keys(lecture.retours).length, 3);
  for (const texte of Object.values(lecture.retours)) {
    assert.match(texte, /^Pas encore/);
    assert.equal(findForbiddenString(texte), null);
  }
  assert.equal(lecture.retours[lecture.reponse], undefined);
});

test('contrôle « réponses sur le site » : mots utiles, verdicts, CSV', () => {
  assert.deepEqual(motsUtiles('Ils germent : de jeunes chênes poussent loin de l’arbre'), [
    'germent',
    'jeune',
    'chene',
    'poussent',
    'loin',
    'arbre',
  ]);
  assert.deepEqual(motsUtiles('avec les deux'), [], 'mots outils et mots courts écartés');
  assert.equal(bonneReponse({ reponse_correcte: 'C', choix_c: ' Un gland ' }), 'Un gland');

  const fiche = {
    type: 'fiche',
    code: 'SP0001',
    texte: 'Le geai cache des glands. De jeunes chênes poussent loin de l’arbre.',
  };
  const terme = { type: 'glossaire', code: 'GL0001', texte: 'Une graine qui germe.' };
  const trouvee = evaluerReponse('De jeunes chênes poussent loin de l’arbre', [terme, fiche]);
  assert.equal(trouvee.verdict, 'trouvée');
  assert.equal(trouvee.ressource, 'fiche:SP0001');
  assert.deepEqual(trouvee.manquants, []);
  const partie = evaluerReponse('De jeunes chênes envahissent la clairière voisine', [fiche]);
  assert.equal(partie.verdict, 'en partie');
  assert.deepEqual(partie.trouves, ['jeune', 'chene']);
  assert.equal(
    evaluerReponse('Les sphaignes retiennent toute l’eau', [fiche]).verdict,
    'introuvable',
  );
  assert.equal(evaluerReponse('De jeunes chênes', []).verdict, 'introuvable', 'aucune ressource');

  const rapport = [
    {
      portee: 'zone',
      zone_key: 'cz-p1-01',
      question_code: 'Q1',
      verdict: 'trouvée',
      bonne_reponse: 'a ; b',
    },
    {
      portee: 'case',
      zone_key: '',
      question_code: 'Q2',
      verdict: 'introuvable',
      bonne_reponse: '=1+1',
    },
  ];
  const csv = versCsv(rapport).split('\n');
  assert.match(csv[0], /^portee;zone_key;question_code;biome;verdict/);
  assert.match(csv[1], /"a ; b"/, 'cellule avec séparateur entre guillemets');
  assert.match(csv[2], /'=1\+1/, 'jamais de formule');
  assert.equal(celluleCsv('dit "oui"'), '"dit ""oui"""');
  assert.deepEqual(resumer(rapport), {
    zone: { total: 1, trouvée: 1, 'en partie': 0, introuvable: 0 },
    case: { total: 1, trouvée: 0, 'en partie': 0, introuvable: 1 },
  });
});
