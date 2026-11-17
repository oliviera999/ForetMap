'use strict';

/**
 * Retours de QCM de « Tenir à deux » (14 novembre 2026) : ils expliquent sans punir.
 *
 * Sur les DONNÉES (corpus semé par les imports et corrigé par la migration 344, rejouée ici :
 * une autre suite peut avoir réimporté le classeur QCM entre-temps) :
 * - aucun retour d'une question active ne porte un mot de la liste des garde-fous, une fois
 *   l'amorce « Non » retirée comme à l'affichage (`lib/glRetourQcm.js › nettoyerAmorce`) ;
 * - chaque question de zone de chasse active a un `feedback_correct` et un retour par mauvais
 *   choix ;
 * - chaque question de lecture active a un `feedback_incorrect`.
 *
 * Sur le FICHIER `data/gl/tenir/qcm-feedbacks-zones.json` : 36 retours pour 9 questions, sans
 * amorce « Non » ni mot interdit, et le bloc `remplacement` est bien celui de la migration 344.
 *
 * Une base neuve de CI sans corpus le dit et passe (contrôles sur les lignes présentes).
 */

require('../helpers/setup');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../database');
const { findForbiddenString } = require('../../lib/shared/glGardeFousCore');
const { nettoyerAmorce } = require('../../lib/glRetourQcm');

const ROOT = path.join(__dirname, '..', '..');
const LETTERS = ['a', 'b', 'c', 'd', 'e'];
const FICHIER = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data', 'gl', 'tenir', 'qcm-feedbacks-zones.json'), 'utf8'),
);

test('fichier : 36 retours pour 9 questions, sans amorce « Non » ni mot interdit', () => {
  const codes = Object.keys(FICHIER.feedbacks);
  assert.equal(codes.length, 9);
  let total = 0;
  const failures = [];
  for (const code of codes) {
    for (const [letter, text] of Object.entries(FICHIER.feedbacks[code])) {
      total += 1;
      assert.ok(LETTERS.includes(letter), `${code} : lettre ${letter}`);
      if (!String(text || '').trim()) failures.push(`${code}.${letter} : vide`);
      if (/^non([\s,.:!;]|$)/i.test(String(text)))
        failures.push(`${code}.${letter} : amorce « Non »`);
      const mot = findForbiddenString(text);
      if (mot) failures.push(`${code}.${letter} : « ${mot} »`);
    }
  }
  assert.equal(total, 36);
  assert.deepEqual(failures, []);
});

test('fichier : le bloc `remplacement` est celui que pose la migration 344', () => {
  const r = FICHIER.remplacement;
  assert.equal(r.question_code, 'GQCM0766');
  assert.equal(r.reponse_correcte, 'A');
  const sql = fs.readFileSync(
    path.join(ROOT, 'migrations', '344_gl_tenir_retours_qcm.sql'),
    'utf8',
  );
  const champs = ['question', 'choix_a', 'choix_b', 'choix_c', 'choix_d', 'choix_e'];
  champs.push('feedback_correct', 'feedback_b', 'feedback_c', 'feedback_d', 'feedback_e');
  for (const champ of champs) {
    const valeur = String(r[champ] || '');
    assert.ok(valeur.trim(), `remplacement.${champ} vide`);
    assert.equal(findForbiddenString(valeur), null, `remplacement.${champ}`);
    assert.ok(
      sql.includes(`${champ} = '${valeur.replace(/'/g, "''")}'`),
      `la migration 344 ne pose pas remplacement.${champ} tel quel`,
    );
  }
});

/**
 * Rejoue la migration 344 (réécritures gardées par l'ancienne valeur : idempotente). La suite
 * `tests/gl-qcm-catalog.test.js` réimporte le classeur `data/gl/qcm-biomes-…-consolide.xlsx`, qui
 * porte encore les anciens retours : sans ce rejeu, ce contrôle dépendrait de l'ordre des suites.
 */
async function rejouerMigration344() {
  const sql = fs.readFileSync(
    path.join(ROOT, 'migrations', '344_gl_tenir_retours_qcm.sql'),
    'utf8',
  );
  for (const stmt of db.splitSqlStatements(sql)) await db.pool.query(stmt);
}

test('base : aucun retour d’une question active ne porte un mot interdit après nettoyage', async (t) => {
  await db.initSchema();
  await rejouerMigration344();
  const rows = await db.queryAll(
    `SELECT question_code, feedback_correct, feedback_a, feedback_b, feedback_c, feedback_d, feedback_e
       FROM gl_qcm_questions WHERE statut = 'actif'`,
  );
  if (!rows.length) {
    t.diagnostic('Aucune question active en base (base neuve) : contrôle sauté');
    return;
  }
  const failures = [];
  for (const row of rows) {
    for (const col of ['feedback_correct', ...LETTERS.map((l) => `feedback_${l}`)]) {
      const mot = findForbiddenString(nettoyerAmorce(row[col]));
      if (mot) failures.push(`${row.question_code}.${col} : « ${mot} »`);
    }
  }
  t.diagnostic(`${rows.length} questions actives relues`);
  assert.deepEqual(failures, []);
});

test('base : une question de zone active a un feedback_correct et un retour par mauvais choix', async (t) => {
  await db.initSchema();
  const rows = await db.queryAll(
    `SELECT z.zone_key, q.question_code, q.reponse_correcte, q.feedback_correct,
            q.choix_a, q.choix_b, q.choix_c, q.choix_d, q.choix_e,
            q.feedback_a, q.feedback_b, q.feedback_c, q.feedback_d, q.feedback_e
       FROM gl_chasse_zones z
      INNER JOIN gl_qcm_questions q ON q.question_code = z.question_code AND q.statut = 'actif'
      WHERE z.actif = 1 AND z.zone_key LIKE 'cz-p%'
        AND q.question_code NOT LIKE 'TEX-%'`,
  );
  if (!rows.length) {
    t.diagnostic('Aucune zone de chasse du corpus en base (base neuve) : contrôle sauté');
    return;
  }
  const failures = [];
  for (const row of rows) {
    const where = `${row.zone_key} (${row.question_code})`;
    if (!String(row.feedback_correct || '').trim())
      failures.push(`${where} : feedback_correct vide`);
    const bonne = String(row.reponse_correcte || '').toLowerCase();
    for (const letter of LETTERS) {
      if (letter === bonne) continue;
      if (!String(row[`choix_${letter}`] || '').trim()) continue;
      if (!String(row[`feedback_${letter}`] || '').trim()) {
        failures.push(`${where} : pas de retour pour le choix ${letter.toUpperCase()}`);
      }
    }
  }
  t.diagnostic(`${rows.length} questions de zone relues`);
  assert.deepEqual(failures, []);
});

test('base : une question de lecture active a un retour commun, ou un retour par mauvais choix', async (t) => {
  await db.initSchema();
  const rows = await db.queryAll(
    'SELECT zone_key, reponse, feedback_correct, feedback_incorrect, retours_json FROM gl_tenir_questions_lecture WHERE actif = 1',
  );
  if (!rows.length) {
    t.diagnostic('Aucune question de lecture en base (base neuve) : contrôle sauté');
    return;
  }
  const failures = [];
  for (const row of rows) {
    // Ensemble unifié (M22) : un retour propre à chaque mauvais choix (`retours_json`) dispense
    // du retour commun.
    let retours = {};
    try {
      retours = JSON.parse(row.retours_json || '{}') || {};
    } catch (_) {
      retours = {};
    }
    const mauvaises = ['A', 'B', 'C', 'D'].filter((l) => l !== String(row.reponse));
    const tous = mauvaises.every((l) => String(retours[l] || '').trim());
    if (!String(row.feedback_incorrect || '').trim() && !tous) {
      failures.push(`${row.zone_key} : ni retour commun ni retour par mauvais choix`);
    }
    for (const [lettre, texte] of Object.entries(retours)) {
      const mot = findForbiddenString(texte);
      if (mot) failures.push(`${row.zone_key}.retours.${lettre} : « ${mot} »`);
      if (!/^Pas encore/.test(String(texte))) {
        failures.push(`${row.zone_key}.retours.${lettre} : sans « Pas encore »`);
      }
    }
    for (const col of ['feedback_correct', 'feedback_incorrect']) {
      const mot = findForbiddenString(row[col]);
      if (mot) failures.push(`${row.zone_key}.${col} : « ${mot} »`);
    }
  }
  assert.deepEqual(failures, []);
});
