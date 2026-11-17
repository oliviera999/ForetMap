'use strict';

/**
 * Ensemble unifié, PR 1b, étape 1.10 (M22, L5) — contenu des zones, sur le corpus réel :
 * - les 5 questions de zone réécrites (`GQCM9301` à `GQCM9305`) : 5 choix, la bonne réponse et
 *   un retour « Pas encore » par mauvais choix, aucune chaîne interdite ; les 5 anciennes sont
 *   sorties du tirage des parties ;
 * - la fiche `SP0277` (fourmi magnan) existe, dans son biome ;
 * - chaque zone active a une question présentable et une première fiche existante dans le biome
 *   de son plateau ;
 * - la zone `cz-p2-08` porte le feuillet `ep-I-06`, sa question et sa question de lecture.
 *
 * Porte sur les DONNÉES semées par la migration 365 et les catalogues : une base neuve de CI
 * (sans biomes ni corpus) le dit et passe.
 */

require('../helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../database');
const { findForbiddenString } = require('../../lib/shared/glGardeFousCore');

const SEUIL_CORPUS = 500;
const REECRITES = ['GQCM9301', 'GQCM9302', 'GQCM9303', 'GQCM9304', 'GQCM9305'];
const SORTIES = ['QCM0213', 'QCM0612', 'QCM0618', 'QCM0605', 'QCM0451'];
const BIOMES_PAR_PLATEAU = {
  1: ['jungle_afc', 'savane'],
  2: ['sahara', 'foret_mediterraneenne'],
  3: ['foret_caducifoliee', 'landes'],
  4: ['taiga', 'toundra', 'desert_froid'],
};

async function corpusPresent(t) {
  await db.initSchema();
  const row = await db.queryOne(
    "SELECT COUNT(*) AS n FROM gl_qcm_questions WHERE statut = 'actif' AND question_code REGEXP '^G?QCM[0-9]'",
  );
  if (Number(row?.n) >= SEUIL_CORPUS) return true;
  t.diagnostic(`Corpus QCM absent (${Number(row?.n) || 0} questions) : contrôle sauté`);
  return false;
}

/**
 * Catalogue réel des zones chargé (36 zones actives) : c'est ce qui distingue le corpus réel
 * d'une base de CI. Sur celle-ci, la suite backend importe des questions du corpus APRÈS les
 * migrations (le seuil de `corpusPresent` est donc franchi), mais la migration 365 a tourné sur
 * une base vide et n'a rien eu à retirer du tirage.
 */
async function cataloguePresent(t) {
  const row = await db.queryOne('SELECT COUNT(*) AS n FROM gl_chasse_zones WHERE actif = 1');
  if (Number(row?.n) >= 30) return true;
  t.diagnostic(`Catalogue des zones absent (${Number(row?.n) || 0} zones) : contrôle sauté`);
  return false;
}

test('les 5 questions de zone réécrites : 5 choix, retours « Pas encore », aucune chaîne interdite', async (t) => {
  if (!(await corpusPresent(t))) return;
  const rows = await db.queryAll(
    `SELECT * FROM gl_qcm_questions WHERE question_code IN (${REECRITES.map(() => '?').join(', ')})
      ORDER BY question_code ASC`,
    REECRITES,
  );
  assert.deepEqual(
    rows.map((r) => r.question_code),
    REECRITES,
  );
  for (const q of rows) {
    const code = q.question_code;
    assert.equal(q.statut, 'actif', code);
    assert.equal(Number(q.usage_tenir), 1, code);
    assert.equal(q.niveau, '6ème', code);
    const lettres = ['a', 'b', 'c', 'd', 'e'];
    const choix = lettres.map((l) => String(q[`choix_${l}`] || '').trim());
    assert.ok(choix.every(Boolean), `${code} : 5 choix non vides`);
    assert.equal(new Set(choix.map((c) => c.toLowerCase())).size, 5, `${code} : choix distincts`);
    const juste = String(q.reponse_correcte).toLowerCase();
    assert.match(String(q.feedback_correct || ''), /\S/, `${code} : retour de la bonne réponse`);
    assert.equal(q[`feedback_${juste}`], null, `${code} : pas de retour sur la bonne lettre`);
    for (const l of lettres.filter((x) => x !== juste)) {
      assert.match(String(q[`feedback_${l}`] || ''), /^Pas encore/, `${code} : retour ${l}`);
    }
    for (const texte of [
      q.question,
      q.feedback_correct,
      ...choix,
      ...lettres.map((l) => q[`feedback_${l}`]),
    ]) {
      assert.equal(findForbiddenString(texte), null, `${code} : ${texte}`);
    }
  }
});

test('les 5 questions remplacées sont sorties du tirage des parties', async (t) => {
  if (!(await corpusPresent(t))) return;
  if (!(await cataloguePresent(t))) return;
  const rows = await db.queryAll(
    `SELECT question_code, usage_tenir FROM gl_qcm_questions
      WHERE question_code IN (${SORTIES.map(() => '?').join(', ')})`,
    SORTIES,
  );
  assert.equal(rows.length, SORTIES.length);
  assert.deepEqual(
    rows.filter((r) => Number(r.usage_tenir) !== 0).map((r) => r.question_code),
    [],
  );
  // Aucune zone active ne les pose plus.
  const zones = await db.queryAll(
    `SELECT zone_key FROM gl_chasse_zones
      WHERE actif = 1 AND question_code IN (${SORTIES.map(() => '?').join(', ')})`,
    SORTIES,
  );
  assert.deepEqual(
    zones.map((z) => z.zone_key),
    [],
  );
});

test('fiche SP0277 (fourmi magnan) : en base, active, dans la jungle', async (t) => {
  if (!(await corpusPresent(t))) return;
  const fiche = await db.queryOne(
    "SELECT species_code, biome_slug, type, nom_commun, statut, description_courte, anecdote FROM gl_species WHERE species_code = 'SP0277'",
  );
  assert.ok(fiche, 'SP0277 existe');
  assert.equal(fiche.biome_slug, 'jungle_afc');
  assert.equal(fiche.type, 'faune');
  assert.equal(fiche.statut, 'actif');
  assert.match(fiche.nom_commun, /magnan/i);
  for (const texte of [fiche.nom_commun, fiche.description_courte, fiche.anecdote]) {
    assert.equal(findForbiddenString(texte), null, texte);
  }
});

test('chaque zone active : question présentable, première fiche existante dans un biome de son plateau', async (t) => {
  if (!(await corpusPresent(t))) return;
  const zones = await db.queryAll(
    'SELECT zone_key, plateau, question_code, especes_json, glossaire_json FROM gl_chasse_zones WHERE actif = 1 ORDER BY zone_key ASC',
  );
  if (!(await cataloguePresent(t))) return;
  assert.equal(zones.length, 36, '36 zones actives (8, 8, 10, 10)');
  const manques = [];
  for (const z of zones) {
    const question = await db.queryOne(
      "SELECT question_code FROM gl_qcm_questions WHERE question_code = ? AND statut = 'actif' LIMIT 1",
      [z.question_code],
    );
    if (!question) manques.push(`${z.zone_key} : question ${z.question_code} absente`);
    const especes = JSON.parse(z.especes_json || '[]');
    if (!especes.length) {
      manques.push(`${z.zone_key} : aucune fiche reliée`);
      continue;
    }
    const fiche = await db.queryOne(
      "SELECT biome_slug FROM gl_species WHERE species_code = ? AND statut = 'actif' LIMIT 1",
      [especes[0]],
    );
    if (!fiche) manques.push(`${z.zone_key} : fiche ${especes[0]} absente`);
    else if (!(BIOMES_PAR_PLATEAU[Number(z.plateau)] || []).includes(String(fiche.biome_slug))) {
      manques.push(`${z.zone_key} : fiche ${especes[0]} hors du plateau (${fiche.biome_slug})`);
    }
    for (const code of JSON.parse(z.glossaire_json || '[]')) {
      if (!/^GL\d{4}$/.test(code)) manques.push(`${z.zone_key} : code de glossaire ${code}`);
    }
  }
  assert.deepEqual(manques, []);
});

test('L5 : cz-p2-08 est active avec le feuillet ep-I-06, sa question et sa question de lecture', async (t) => {
  if (!(await corpusPresent(t))) return;
  // Une base de test garde des zones de fixtures (dont une `cz-p2-08` d'exemple) : le contrôle
  // ne vaut que sur le catalogue réel.
  if (!(await cataloguePresent(t))) return;
  const zone = await db.queryOne(
    "SELECT z.actif, z.feuillet_code, z.question_code, z.geometrie_prete, f.plateau_number, f.statut FROM gl_chasse_zones z LEFT JOIN gl_lore_feuillets f ON f.feuillet_code = z.feuillet_code WHERE z.zone_key = 'cz-p2-08'",
  );
  if (!zone) {
    t.diagnostic('Catalogue des zones absent : contrôle sauté');
    return;
  }
  assert.equal(Number(zone.actif), 1);
  assert.equal(zone.feuillet_code, 'ep-I-06');
  assert.equal(zone.question_code, 'GQCM9305');
  assert.equal(Number(zone.geometrie_prete), 1);
  assert.equal(Number(zone.plateau_number), 2, 'le feuillet est du plateau 2');
  assert.equal(zone.statut, 'actif');
  const lecture = await db.queryOne(
    "SELECT feuillet_code, reponse, retours_json, actif FROM gl_tenir_questions_lecture WHERE zone_key = 'cz-p2-08'",
  );
  assert.ok(lecture, 'question de lecture chargée');
  assert.equal(Number(lecture.actif), 1);
  assert.equal(lecture.feuillet_code, 'ep-I-06');
  const retours = JSON.parse(lecture.retours_json || '{}');
  assert.equal(Object.keys(retours).length, 3, 'un retour par mauvais choix');
  assert.equal(retours[lecture.reponse], undefined);
});
