'use strict';

/**
 * Vérité des cases (« Tenir à deux », migration 337) : sur les plateaux 1 à 4, aucune promesse
 * affichée à l'élève n'est laissée sans suite par le moteur, et aucun texte n'annonce une perte
 * en cas d'échec (garde-fou § 1.4).
 *
 * - texte d'auteur `effet_mecanique` (studio, jeu classique) et libellés de branche (lus en mode
 *   tenir) confrontés à l'effet appliqué (`lib/glMarkerPromiseAudit.js`, mode tenir) ;
 * - pour chaque case et chaque peuple, le texte **calculé** servi à l'élève
 *   (`glTenirCaseEffetCore`) ne contient aucune chaîne interdite et ne promet rien d'autre que
 *   l'effet appliqué (relecture du texte par le même détecteur de promesses).
 *
 * Porte sur les DONNÉES semées en production : une base neuve de CI sans plateau le dit et passe.
 */

require('../helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../database');
const {
  auditMarkerPromises,
  parsePromisedEffects,
  promisesLossOnFailure,
} = require('../../lib/glMarkerPromiseAudit');
const {
  resolveTenirCaseEffet,
  formatTenirCaseEffet,
} = require('../../lib/shared/glTenirCaseEffetCore');
const { findForbiddenString } = require('../../lib/glTenirImport');

async function loadPlateauMarkers() {
  await db.initSchema();
  return db.queryAll(
    `SELECT m.id, m.chapter_id, m.label, m.event_type, m.description, m.effet_mecanique,
            m.event_config_json, ch.plateau_number
       FROM gl_chapter_markers m INNER JOIN gl_chapters ch ON ch.id = m.chapter_id
      WHERE ch.plateau_number BETWEEN 1 AND 4
        AND ch.slug NOT IN ('foret-magique', 'test')
        AND ch.slug NOT LIKE 'tenir-ex-%' AND ch.slug NOT LIKE 'ch-concu-%'
        AND ch.slug NOT LIKE 'fst-%' AND ch.slug NOT LIKE 'locks-ch-%'
      ORDER BY ch.plateau_number, m.order_index, m.id`,
  );
}

function describe(m) {
  return `${m.label} (#${m.id}, p${m.plateau_number})`;
}

test('aucune promesse affichée que le moteur ne tient pas (texte d’auteur et libellés de branche)', async (t) => {
  const markers = await loadPlateauMarkers();
  if (!markers.length) {
    t.diagnostic('Aucun repère de plateau 1-4 en base (base neuve) : contrôle sauté');
    return;
  }
  const report = auditMarkerPromises(markers, { tenir: true });
  const failures = report.rows
    .filter((r) => r.severity === 'error')
    .map((r) => `#${r.markerId} « ${r.label} » : ${r.issues.map((i) => i.message).join(' / ')}`);
  assert.deepEqual(failures, []);
});

test('aucun « sinon / si échec / mauvaise réponse » suivi d’une perte', async (t) => {
  const markers = await loadPlateauMarkers();
  if (!markers.length) {
    t.diagnostic('Aucun repère de plateau 1-4 en base (base neuve) : contrôle sauté');
    return;
  }
  const failures = [];
  for (const m of markers) {
    if (promisesLossOnFailure(m.effet_mecanique)) failures.push(`${describe(m)} : texte`);
    let cfg = null;
    try {
      cfg = m.event_config_json ? JSON.parse(m.event_config_json) : null;
    } catch (_) {
      cfg = null;
    }
    for (const [branch, data] of Object.entries(cfg?.effects || {})) {
      if (promisesLossOnFailure(data?.label)) failures.push(`${describe(m)} : branche ${branch}`);
    }
  }
  assert.deepEqual(failures, []);
});

test('le texte calculé servi à l’élève est exact et sans chaîne interdite, case par case et peuple par peuple', async (t) => {
  const markers = await loadPlateauMarkers();
  if (!markers.length) {
    t.diagnostic('Aucun repère de plateau 1-4 en base (base neuve) : contrôle sauté');
    return;
  }
  const failures = [];
  for (const m of markers) {
    for (const teamType of ['gnome', 'unicorn']) {
      for (const sentierActif of [false, true]) {
        const effet = resolveTenirCaseEffet(m, teamType, { sentierActif });
        const text = formatTenirCaseEffet(effet);
        const forbidden = findForbiddenString(text) || findForbiddenString(m.label);
        if (forbidden)
          failures.push(`${describe(m)} ${teamType} : chaîne interdite « ${forbidden} »`);
        // Relecture : le texte ne promet rien d'autre que ce qui s'applique.
        const promised = parsePromisedEffects(text);
        const expect = {
          deltaPv: effet.healthDelta || null,
          deltaGems: effet.powerDelta || null,
          deltaMove: effet.moveDelta || null,
        };
        for (const key of Object.keys(expect)) {
          if ((promised[key] ?? null) !== expect[key]) {
            failures.push(
              `${describe(m)} ${teamType}${sentierActif ? ' (Sentier)' : ''} : le texte annonce ${key}=${promised[key]} ; appliqué ${expect[key]} — « ${text} »`,
            );
          }
        }
        if (promised.passTurn !== effet.passTurn) {
          failures.push(
            `${describe(m)} ${teamType} : tour passé annoncé ${promised.passTurn}, appliqué ${effet.passTurn}`,
          );
        }
        if (effet.tonalite === 'trame' && !/\+1 (cœur|gemme) pour chaque membre/.test(text)) {
          failures.push(`${describe(m)} ${teamType} : case Trame sans « +1 … pour chaque membre »`);
        }
      }
    }
  }
  assert.deepEqual(failures, []);
});
