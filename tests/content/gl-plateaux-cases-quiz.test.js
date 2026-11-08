'use strict';

/**
 * Cases quiz et cases d'arrivée des plateaux 1-4 après la migration 330 (« Tenir à deux »,
 * § 7.3) : chaque case quiz tire dans TOUT le biome du chapitre (≥ 10 questions présentables),
 * et aucune case quiz ni d'arrivée ne promet de gemme. Porte sur les DONNÉES semées en
 * production : si la base n'a pas les chapitres de plateau 1-4 (base neuve de CI), le test le
 * dit et passe. Les chapitres d'essai (« foret-magique », « test ») et les corpus de test
 * (`tenir-ex-*`…) sont exclus même s'ils portent un `plateau_number` : seuls les quatre
 * plateaux réels sont contrôlés.
 */

require('../helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../database');
const { queryQuestionPool } = require('../../lib/glMarkerQuestionPool');
const { resolveMarkerEventConfig } = require('../../lib/glMarkerEventConfig');
const { loadBiomesForChapterIds } = require('../../lib/glChapterBiomes');
const { auditMarkerPromises } = require('../../lib/glMarkerPromiseAudit');

async function loadPlateauMarkers() {
  await db.initSchema();
  return db.queryAll(
    `SELECT m.id, m.chapter_id, m.label, m.event_type, m.description, m.effet_mecanique,
            m.event_config_json, m.qcm_categorie_slug, m.qcm_question_code, m.order_index, ch.plateau_number
       FROM gl_chapter_markers m INNER JOIN gl_chapters ch ON ch.id = m.chapter_id
      WHERE ch.plateau_number BETWEEN 1 AND 4
        AND ch.slug NOT IN ('foret-magique', 'test')
        AND ch.slug NOT LIKE 'tenir-ex-%' AND ch.slug NOT LIKE 'ch-concu-%'
        AND ch.slug NOT LIKE 'fst-%' AND ch.slug NOT LIKE 'locks-ch-%'
      ORDER BY ch.plateau_number, m.order_index`,
  );
}

test('chaque case quiz des 4 plateaux tire dans un pool ≥ 10 questions présentables', async (t) => {
  const markers = await loadPlateauMarkers();
  const quiz = markers.filter((m) => ['quiz', 'question'].includes(String(m.event_type)));
  if (!quiz.length) {
    t.diagnostic('Aucune case quiz de plateau 1-4 en base (base neuve) : contrôle sauté');
    return;
  }
  const chapterIds = [...new Set(quiz.map((m) => Number(m.chapter_id)))];
  const biomes = await loadBiomesForChapterIds(db, chapterIds);
  const failures = [];
  for (const marker of quiz) {
    const cfg = resolveMarkerEventConfig(marker);
    const pool = cfg?.question?.pool || {};
    const slugs = (biomes.get(Number(marker.chapter_id)) || []).map((b) => b.slug);
    const { items, error } = await queryQuestionPool(db, { pool, chapterBiomeSlugs: slugs });
    if (error || items.length < 10)
      failures.push(
        `${marker.label} (#${marker.id}, p${marker.plateau_number}) : ${error || items.length}`,
      );
  }
  assert.deepEqual(failures, []);
});

test('aucune promesse de gemme sur une case quiz ni sur une case d’arrivée', async (t) => {
  const markers = await loadPlateauMarkers();
  if (!markers.length) {
    t.diagnostic('Aucun repère de plateau 1-4 en base : contrôle sauté');
    return;
  }
  const report = auditMarkerPromises(markers);
  const offenders = [];
  for (const marker of markers) {
    const type = String(marker.event_type);
    if (type !== 'story' && type !== 'quiz' && type !== 'question') continue;
    const cfg = resolveMarkerEventConfig(marker);
    const effects = cfg?.effects || {};
    for (const branch of Object.values(effects))
      if (Number(branch?.deltaGems) > 0) offenders.push(`#${marker.id} deltaGems`);
    if (/gemme/i.test(String(marker.description || '')))
      offenders.push(`#${marker.id} description promet une gemme`);
    const row = report.rows.find((r) => Number(r.markerId) === Number(marker.id)) || null;
    if (
      row &&
      row.issues.some((i) =>
        /gemme/i.test(String(i.resource || '') + (i.resources || []).join(' ')),
      )
    ) {
      offenders.push(`#${marker.id} audit : ${row.issues.map((i) => i.code).join(', ')}`);
    }
  }
  assert.deepEqual(offenders, []);
});
