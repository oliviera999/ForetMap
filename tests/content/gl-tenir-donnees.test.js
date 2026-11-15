'use strict';

/**
 * Corpus « Tenir à deux » (`data/gl/tenir/*.json`) — job CI « Contenu pédagogique ».
 *
 * Contrôles STATIQUES (toujours) : comptes attendus, 8/8/10/10 zones, une question de lecture
 * par zone, chaque sort du § 10 présent avec fenêtre et limite, aucune chaîne interdite, et
 * **au moins 8 zones par plateau avec géométrie** (les 36 polygones sont posés : 28 inline,
 * tracés sur les fonds de plateau de production, planches `docs/captures/tenir-v2/zones-plateau-N.jpg`,
 * 8 par `polygone_ref`). Une zone redessinée dans l'éditeur (Contenus → Chapitres → Zones de
 * chasse, « Exporter le JSON ») doit rester ≥ 3 points dans [0,1]. Chaque contrôle tombe sous
 * son propre nom, sans bloquer le job `test`.
 *
 * Contrôles EN BASE (`--dry-run` du chargeur, termes secrets, codes) : seulement si la base
 * porte les chapitres de plateau 1-4 (production / fixture locale) — une base neuve de CI ne
 * les a pas, le test le dit et passe.
 */

require('../helpers/setup');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const DIR = path.join(__dirname, '..', '..', 'data', 'gl', 'tenir');
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(DIR, `${name}.json`), 'utf8'));
const { isValidPolygon } = require('../../lib/glTenirImport');
const { findForbiddenString } = require('../../lib/shared/glGardeFousCore');

const EXPECTED = {
  'chasse-zones': ['zones', 36],
  'questions-lecture': ['questions', 36],
  peripeties: ['peripeties', 32],
  missions: ['missions', 20],
  badges: ['badges', 15],
  'olu-lignes': ['lignes', 77],
  parures: ['parures', 12],
  sorts: ['sorts', 25],
};

test('comptes attendus par fichier', () => {
  for (const [name, [key, count]] of Object.entries(EXPECTED)) {
    const json = readJson(name);
    assert.ok(json.format, `${name}: clé format`);
    assert.equal(json[key].length, count, `${name}.${key}`);
  }
  const titres = readJson('titres');
  assert.equal(titres.missions.length, 20);
  assert.equal(Object.keys(titres.honneurs).length, 4);
  assert.equal(Object.keys(titres.sceaux_peuple).length, 2);
  const passeur = readJson('passeur-plateau4');
  assert.deepEqual(
    Object.entries(passeur.plateaux).map(([k, v]) => `${k}:${v.pages.length}`),
    ['1:7', '2:7', '3:9', '4:7'],
  );
  assert.equal(readJson('sorts').voyageur.length, 6);
});

test('défis de case : 16 défis, 4 par plateau, complets, sans mot interdit ; lignes d’Olu des trois moments', () => {
  const fichier = readJson('defis-cases');
  assert.ok(fichier.format, 'clé format');
  assert.deepEqual(
    Object.entries(fichier.plateaux).map(([k, v]) => `${k}:${v.length}`),
    ['1:4', '2:4', '3:4', '4:4'],
  );
  const codes = new Set();
  for (const [plateau, liste] of Object.entries(fichier.plateaux)) {
    for (const d of liste) {
      assert.ok(!codes.has(d.code), `${d.code} en double`);
      codes.add(d.code);
      assert.match(d.code, new RegExp(`^d-p${plateau}-`), `${d.code} : préfixe du plateau`);
      for (const champ of ['titre', 'consigne', 'preparation', 'critere', 'notion']) {
        assert.ok(String(d[champ] || '').trim(), `${d.code}.${champ} vide`);
        assert.equal(findForbiddenString(d[champ]), null, `${d.code}.${champ}`);
      }
      assert.ok(d.titre.length <= 160, `${d.code} titre ≤ 160`);
      assert.ok(Number.isInteger(d.duree_s) && d.duree_s >= 10 && d.duree_s <= 3600, d.code);
    }
  }
  assert.equal(codes.size, 16);
  assert.equal(findForbiddenString(fichier.regle), null);
  // Olu : deux lignes par moment, tous biomes, sans variable ni mot interdit.
  const lignes = readJson('olu-lignes').lignes;
  for (const moment of ['defi_case_recu', 'defi_case_releve', 'defi_case_pas_encore']) {
    const du = lignes.filter((l) => l.moment === moment);
    assert.equal(du.length, 2, moment);
    for (const l of du) {
      assert.equal(findForbiddenString(l.texte), null, l.id);
      assert.equal(l.plateaux, undefined, `${l.id} : tous biomes`);
    }
  }
  assert.ok(
    lignes
      .filter((l) => l.moment === 'defi_case_pas_encore')
      .every((l) => /^Pas encore/.test(l.texte)),
    '« Pas encore », jamais « Non »',
  );
});

test('zones : 8/8/10/10, ordre sans trou, une question de lecture par zone, codes uniques', () => {
  const zones = readJson('chasse-zones').zones;
  const byPlateau = {};
  for (const z of zones) (byPlateau[z.plateau] ||= []).push(z);
  assert.deepEqual(
    Object.values(byPlateau).map((l) => l.length),
    [8, 8, 10, 10],
  );
  for (const list of Object.values(byPlateau)) {
    const ordres = list.map((z) => z.ordre).sort((a, b) => a - b);
    assert.deepEqual(
      ordres,
      ordres.map((_, i) => i + 1),
    );
  }
  const codes = zones.map((z) => z.question_code);
  assert.equal(new Set(codes).size, 36, 'question_code unique sur les 36 zones');
  const questions = readJson('questions-lecture').questions;
  const qByZone = new Map(questions.map((q) => [q.zone_key, q]));
  for (const z of zones) {
    const q = qByZone.get(z.zone_key);
    assert.ok(q, `question de lecture ${z.zone_key}`);
    assert.equal(q.feuillet_code, z.feuillet_code);
    assert.ok(['A', 'B', 'C', 'D'].includes(q.reponse));
    assert.equal(new Set(Object.values(q.choix).map((c) => c.trim().toLowerCase())).size, 4);
    assert.match(q.feedback_incorrect, /^Pas encore/);
    assert.ok(z.indice.length <= 120, `${z.zone_key} indice ≤ 120`);
  }
});

test('grimoire v2 : chaque sort du § 10 présent avec fenêtre, limite et ouverture', () => {
  const sorts = readJson('sorts');
  const expected = [
    'SL002',
    'SL005',
    'SL036',
    'SL033',
    'SL037',
    'SL038',
    'SL039',
    'SL040',
    'SL041',
    'SL042',
    'SL043',
    'SL044',
    'SL045',
    'SL004',
    'SL021',
    'SL006',
    'SL007',
    'SL046',
    'SL047',
    'SL010',
    'SL027',
    'SL048',
    'SL049',
    'SL018',
    'SL050',
  ];
  const byCode = new Map(sorts.sorts.map((s) => [s.code, s]));
  for (const code of expected) {
    const s = byCode.get(code);
    assert.ok(s, code);
    assert.ok(sorts.vocabulaire.fenetre[s.fenetre], `${code} fenêtre`);
    if (code !== 'SL050') assert.ok(s.limite && s.limite.par && s.limite.portee, `${code} limite`);
    assert.ok(['auto', 'prof'].includes(s.execution));
    if (s.execution === 'auto') assert.ok(s.effet_auto_json, `${code} effet auto`);
  }
  const ouverts = Object.values(sorts.ouverture_par_chapitre).flat();
  for (const code of expected) assert.ok(ouverts.includes(code), `${code} ouvert à un chapitre`);
});

test('aucune chaîne interdite dans un champ visible des élèves', () => {
  const failures = [];
  const check = (where, value) => {
    const found = findForbiddenString(value);
    if (found) failures.push(`${where} : « ${found} »`);
  };
  for (const z of readJson('chasse-zones').zones) check(`zone ${z.zone_key} indice`, z.indice);
  for (const q of readJson('questions-lecture').questions) {
    check(`question ${q.zone_key}`, q.question);
    for (const [k, v] of Object.entries(q.choix)) check(`question ${q.zone_key} choix ${k}`, v);
    check(`question ${q.zone_key} feedback`, q.feedback_correct);
    check(`question ${q.zone_key} feedback`, q.feedback_incorrect);
  }
  for (const p of readJson('peripeties').peripeties) check(`péripétie ${p.id}`, p.texte);
  for (const l of readJson('olu-lignes').lignes) {
    check(`Olu ${l.id}`, l.texte);
    check(`Olu ${l.id} correction`, l.correction);
  }
  for (const p of readJson('parures').parures) {
    check(`parure ${p.code}`, p.nom);
    check(`parure ${p.code}`, p.description);
  }
  for (const b of readJson('badges').badges) {
    check(`badge ${b.code}`, b.nom);
    check(`badge ${b.code}`, b.critere);
  }
  const titres = readJson('titres');
  for (const fam of ['honneurs', 'sceaux_peuple']) {
    for (const [h, entry] of Object.entries(titres[fam])) {
      for (const biome of ['tropiques', 'aride', 'tempere', 'grands_froids'])
        check(`${fam}.${h}.${biome}`, entry[biome]);
    }
  }
  for (const t of titres.missions) check('titre de mission', t);
  for (const m of readJson('missions').missions)
    check(`mission ${m.id} titre_sceau`, m.titre_sceau);
  for (const s of readJson('sorts').sorts) {
    check(`sort ${s.code} nom`, s.nom);
    check(`sort ${s.code} effet`, s.effet_court);
  }
  for (const [plateau, entry] of Object.entries(readJson('passeur-plateau4').plateaux)) {
    for (const page of entry.pages)
      if (!page.avertissement) check(`passeur p${plateau} ${page.feuillet_code} titre`, page.titre);
  }
  assert.deepEqual(failures, []);
});

test('géométrie : au moins 8 zones par plateau avec polygone (inline ou polygone_ref), chaque polygone ≥ 3 points dans [0,1]', () => {
  const zones = readJson('chasse-zones').zones;
  const catalog = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '..', '..', 'src', 'gl', 'data', 'zones_feuillets.json'),
      'utf8',
    ),
  ).zones;
  const refs = new Map(catalog.map((z) => [z.zone_id, z]));
  const ready = {};
  const sansGeometrie = [];
  for (const z of zones) {
    const ok =
      isValidPolygon(z.polygone) ||
      (z.polygone_ref && isValidPolygon(refs.get(z.polygone_ref)?.polygone));
    ready[z.plateau] = (ready[z.plateau] || 0) + (ok ? 1 : 0);
    if (!ok) sansGeometrie.push(z.zone_key);
  }
  assert.deepEqual(
    sansGeometrie,
    [],
    `Zones sans polygone valide (≥ 3 points dans [0,1], inline ou polygone_ref) : ${sansGeometrie.join(', ')}`,
  );
  const missing = [1, 2, 3, 4].filter((p) => (ready[p] || 0) < 8);
  assert.deepEqual(
    missing,
    [],
    `Plateaux sans 8 zones dessinées : ${missing.map((p) => `p${p} (${ready[p] || 0}/8)`).join(', ')} — dessiner les polygones dans l'éditeur « Zones de chasse » puis exporter chasse-zones.json.`,
  );
});

test('en base : --dry-run du chargeur sur le jeu réel (codes, termes secrets) si les plateaux 1-4 existent', async (t) => {
  const db = require('../../database');
  await db.initSchema();
  // Les chapitres d'exemple des tests de code (`tenir-ex-plateau-N`) ne portent pas le corpus réel.
  // Il faut un chapitre réel par plateau (1 à 4) : les chapitres éphémères des autres suites ne
  // couvrent que les plateaux 1-2 et ne portent pas le corpus.
  const plateaux = await db.queryOne(
    "SELECT COUNT(DISTINCT plateau_number) AS c FROM gl_chapters WHERE plateau_number BETWEEN 1 AND 4 AND slug NOT LIKE 'tenir-ex-%' AND slug NOT LIKE 'ch-concu-%' AND slug NOT LIKE 'fst-%' AND slug NOT LIKE 'locks-ch-%'",
  );
  if (Number(plateaux?.c || 0) < 4) {
    t.diagnostic('Base sans chapitres de plateau 1-4 (base neuve) : contrôle en base sauté');
    return;
  }
  const { runImports } = require('../../scripts/gl-import-tenir');
  const reports = await runImports(db, { fichier: 'tous', dryRun: true, dossier: DIR });
  for (const rep of reports)
    assert.deepEqual(rep.errors, [], `${rep.fichier}: ${rep.errors.join(' | ')}`);
});
