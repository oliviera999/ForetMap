'use strict';

/**
 * Contrôles de passage au **temps 3** des retraits de schéma (audit du 25/09/2026, § 3.5 :
 * T1 le code cesse de lire → T2 il cesse d'écrire → T3 une migration supprime).
 *
 * Lecture seule. Chaque candidat liste ses contrôles chiffrés ; un candidat est « prêt »
 * quand tous valent la valeur attendue. Les conditions qui ne se mesurent pas en base (un
 * cycle de production sans retour arrière, sauvegarde vérifiée, retrait du code lecteur dans
 * la PR du T3) sont rappelées par `docs/RUNBOOK_RETRAITS_T3.md`, qui décrit chaque retrait.
 *
 * Les replis « table ou anciennes colonnes » sont comptés avec les résolveurs du code
 * lui-même (`resolvePlantPhotos`, `resolvePlantNames`, `resolvePlantRemarks`) : une fiche
 * « lue en repli » ici est exactement une fiche que l'application lit encore dans les
 * colonnes à supprimer.
 *
 * Une table ou une colonne absente (erreurs 1146 / 1054) vaut « déjà retirée » : le contrôle
 * est sauté et ne bloque rien.
 */

const { PHOTO_KINDS, resolvePlantPhotos } = require('./biodiv/plantPhotos');
const { resolvePlantNames } = require('./biodiv/plantNames');
const { resolvePlantRemarks, LEGACY_REMARK_FIELDS } = require('./biodiv/plantRemarks');

const MISSING_SCHEMA_ERRNOS = new Set([1146, 1054]);

/** Identifiants des lignes en écart, pour que le rapport montre où regarder (10 au plus). */
const SAMPLE_SIZE = 10;

function isMissingSchema(err) {
  return Boolean(err && MISSING_SCHEMA_ERRNOS.has(err.errno));
}

async function countSql(db, sql) {
  const row = await db.queryOne(sql);
  return Number(row?.c) || 0;
}

/** Regroupe des lignes par `plant_id`. */
function byPlant(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const key = Number(row.plant_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

/** Fiches lues en repli par `resolve(plant, rows)` (origine « colonnes »). */
async function countFallbackPlants(db, { columns, childSql, resolve }) {
  const plants = await db.queryAll(`SELECT id, ${columns.join(', ')} FROM plants`);
  const children = byPlant(childSql ? await db.queryAll(childSql) : []);
  const ids = [];
  for (const plant of plants || []) {
    const { origin } = resolve(plant, children.get(Number(plant.id)) || []);
    if (origin !== 'table') ids.push(Number(plant.id));
  }
  return { value: ids.length, sample: ids.slice(0, SAMPLE_SIZE) };
}

const QQS_NOT_IN_RQL = `SELECT COUNT(*) AS c FROM quiz_question_species q
  WHERE NOT EXISTS (SELECT 1 FROM resource_question_links r
                     WHERE r.resource_type = 'plant' AND r.question_code = q.question_code
                       AND CAST(r.resource_ref AS UNSIGNED) = q.plant_id)`;
const QQT_NOT_IN_RQL = `SELECT COUNT(*) AS c FROM quiz_question_tutorials q
  WHERE NOT EXISTS (SELECT 1 FROM resource_question_links r
                     WHERE r.resource_type = 'tutorial' AND r.question_code = q.question_code
                       AND CAST(r.resource_ref AS UNSIGNED) = q.tutorial_id)`;

/**
 * Candidats au T3, dans l'ordre du runbook. `deliveredBy` : ce qui a livré T1 et T2.
 * Un contrôle : `{ label, expected, sql }` (compte `c`) ou `{ label, expected, run(db) }`
 * (renvoie `{ value, sample? }`). `info: true` = mesure à archiver, jamais bloquante.
 */
const T3_CANDIDATES = Object.freeze([
  {
    id: 'quiz_question_links',
    label: 'Tables quiz_question_species et quiz_question_tutorials',
    deliveredBy: 'migration 300 (liens question ↔ ressource)',
    checks: [
      {
        label: 'liens espèce absents de resource_question_links',
        expected: 0,
        sql: QQS_NOT_IN_RQL,
      },
      {
        label: 'liens tutoriel absents de resource_question_links',
        expected: 0,
        sql: QQT_NOT_IN_RQL,
      },
    ],
  },
  {
    id: 'plant_photo_columns',
    label: 'Colonnes photo de plants (6 emplacements, photo_credit, photo_licence)',
    deliveredBy: 'migration 303 (photos des fiches)',
    checks: [
      {
        label: 'fiches encore lues dans les anciennes colonnes',
        expected: 0,
        run: (db) =>
          countFallbackPlants(db, {
            columns: [...PHOTO_KINDS, 'photo_credit', 'photo_licence'],
            childSql: 'SELECT * FROM plant_photos',
            resolve: resolvePlantPhotos,
          }),
      },
      {
        label: 'photos sans auteur ou sans licence (hors domaine public et CC0)',
        expected: 0,
        sql: `SELECT COUNT(*) AS c FROM plant_photos
               WHERE (credit IS NULL OR licence IS NULL)
                 AND COALESCE(licence, '') NOT IN ('Public domain', 'CC0')`,
      },
    ],
  },
  {
    id: 'plant_second_name',
    label: 'Colonne plants.second_name',
    deliveredBy: 'migration 304 (noms des fiches)',
    checks: [
      {
        label: 'fiches dont les autres noms ne sont pas tous dans plant_name_aliases',
        expected: 0,
        run: (db) =>
          countFallbackPlants(db, {
            columns: ['name', 'second_name'],
            childSql: 'SELECT plant_id, alias, kind, sort_order FROM plant_name_aliases',
            resolve: resolvePlantNames,
          }),
      },
    ],
  },
  {
    id: 'plant_remarks',
    label: 'Colonnes plants.remark_1, remark_2, remark_3',
    deliveredBy: 'migration 305 (sosies et remarques)',
    checks: [
      {
        label: 'fiches dont remarks ne reprend pas les trois anciens champs',
        expected: 0,
        run: (db) =>
          countFallbackPlants(db, {
            columns: ['remarks', ...LEGACY_REMARK_FIELDS],
            childSql: null,
            resolve: (plant) => resolvePlantRemarks(plant),
          }),
      },
    ],
  },
  {
    id: 'legacy_single_species',
    label: 'Colonnes zones.current_plant et map_markers.plant_name',
    deliveredBy: 'migration 306 (anciens noms mono-espèce rattachés aux jonctions)',
    checks: [
      {
        label: 'zones avec un ancien nom d’espèce',
        expected: 0,
        sql: "SELECT COUNT(*) AS c FROM zones WHERE current_plant <> ''",
      },
      {
        label: 'repères dont l’ancien nom d’espèce n’est pas rattaché à sa fiche',
        expected: 0,
        sql: `SELECT COUNT(*) AS c FROM map_markers m
               WHERE m.plant_name <> '' AND NOT EXISTS (
                 SELECT 1 FROM marker_species ms JOIN plants p ON p.id = ms.plant_id
                  WHERE ms.marker_id = m.id
                    AND LOWER(TRIM(p.name)) = LOWER(TRIM(m.plant_name)))`,
      },
    ],
  },
  {
    id: 'zones_stage',
    label: 'Colonne zones.stage',
    deliveredBy: 'lot terrain, sans migration (plus lue ni écrite)',
    checks: [
      {
        label: 'zones « special » sans le drapeau special',
        expected: 0,
        sql: "SELECT COUNT(*) AS c FROM zones WHERE stage = 'special' AND special <> 1",
      },
      {
        label: 'zones dont stage est renseigné (à archiver avant le retrait)',
        info: true,
        sql: "SELECT COUNT(*) AS c FROM zones WHERE stage IS NOT NULL AND stage <> 'empty'",
      },
    ],
  },
  {
    id: 'zone_history',
    label: 'Table zone_history',
    deliveredBy: 'lot terrain, sans migration (plus lue ni écrite)',
    checks: [
      {
        label: 'lignes d’historique (à exporter avant le retrait)',
        info: true,
        sql: 'SELECT COUNT(*) AS c FROM zone_history',
      },
    ],
  },
  {
    id: 'observation_logs',
    label: 'Tables observation_logs et user_journal_observation_map',
    deliveredBy: 'migration 307 (observations d’espèces ; routes /api/observations en 410)',
    checks: [
      {
        label: 'anciennes observations non recopiées dans le carnet',
        expected: 0,
        sql: `SELECT COUNT(*) AS c FROM observation_logs o
               WHERE NOT EXISTS (SELECT 1 FROM user_journal_observation_map m
                                  WHERE m.observation_id = o.id)`,
      },
    ],
  },
  {
    id: 'quiz_difficulte_label',
    label: 'Colonne quiz_questions.difficulte_label',
    deliveredBy: 'lot quiz, sans migration (libellé dérivé de la difficulté)',
    checks: [
      {
        label: 'libellés qui ne se déduisent pas de la difficulté',
        expected: 0,
        sql: `SELECT COUNT(*) AS c FROM quiz_questions
               WHERE difficulte_label IS NOT NULL
                 AND NOT (difficulte_label <=> CASE difficulte WHEN 1 THEN '⭐ Facile'
                           WHEN 2 THEN '⭐⭐ Moyen' WHEN 3 THEN '⭐⭐⭐ Difficile' END)`,
      },
    ],
  },
]);

async function runCheck(db, check) {
  try {
    if (typeof check.run === 'function') {
      const { value, sample = [] } = await check.run(db);
      return { value, sample };
    }
    return { value: await countSql(db, check.sql), sample: [] };
  } catch (err) {
    if (isMissingSchema(err)) return { value: null, sample: [], absent: true };
    throw err;
  }
}

/**
 * Évalue chaque candidat.
 * @param {{ queryOne: Function, queryAll: Function }} db
 * @returns {Promise<{ ready: boolean, candidates: Array<{ id: string, label: string,
 *   deliveredBy: string, ready: boolean, checks: Array<{ label: string, value: number|null,
 *   expected: number|null, info: boolean, absent: boolean, ok: boolean, sample: number[] }> }> }>}
 */
async function evaluateT3Readiness(db) {
  const candidates = [];
  for (const candidate of T3_CANDIDATES) {
    const checks = [];
    for (const check of candidate.checks) {
      const result = await runCheck(db, check);
      const info = Boolean(check.info);
      const absent = Boolean(result.absent);
      const ok = info || absent || result.value === check.expected;
      checks.push({
        label: check.label,
        value: result.value,
        expected: info ? null : check.expected,
        info,
        absent,
        ok,
        sample: result.sample,
      });
    }
    candidates.push({
      id: candidate.id,
      label: candidate.label,
      deliveredBy: candidate.deliveredBy,
      ready: checks.every((c) => c.ok),
      checks,
    });
  }
  return { ready: candidates.every((c) => c.ready), candidates };
}

/** Rapport lisible (une ligne par contrôle), pour la console ou « Run JS Script ». */
function formatT3Report(report) {
  const lines = [];
  for (const candidate of report.candidates) {
    const state = candidate.ready ? 'contrôles au vert' : 'PAS PRÊT';
    lines.push(`• ${candidate.label} — ${state}`);
    lines.push(`    T1 et T2 : ${candidate.deliveredBy}`);
    for (const check of candidate.checks) {
      let detail;
      if (check.absent) detail = 'table ou colonne absente (retirée)';
      else if (check.info) detail = `${check.value} (mesure à archiver)`;
      else detail = `${check.value} (attendu ${check.expected})`;
      const sample =
        !check.ok && check.sample.length > 0 ? ` — fiches n° ${check.sample.join(', ')}` : '';
      lines.push(`    ${check.ok ? '✓' : '✗'} ${check.label} : ${detail}${sample}`);
    }
  }
  return lines.join('\n');
}

module.exports = { T3_CANDIDATES, evaluateT3Readiness, formatT3Report };
