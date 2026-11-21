'use strict';

/**
 * Purge planifiée — catégorie `observations` : observations d'espèces et leurs photos.
 *
 * Ce que ce fichier protège :
 * - les durées sont des constantes nommées de `lib/retention/policy.js`, cohérentes entre elles ;
 * - la SIMULATION (mode par défaut, celui de `retention_preview`) compte sans rien supprimer,
 *   ni ligne ni fichier ;
 * - en exécution réelle (base de test seulement) : la photo d'une observation refusée part du
 *   disque après le délai court, l'observation refusée après le délai de lecture, l'observation
 *   jamais examinée au bout d'un an — et rien d'autre ;
 * - une observation VALIDÉE n'est jamais touchée, quelle que soit son ancienneté ;
 * - la sortie ne contient que des comptages : ni nom, ni texte, ni chemin de fichier.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const sharp = require('sharp');

const { initSchema, queryOne, execute } = require('../database');
const { getAbsolutePath } = require('../lib/uploads');
const fm = require('./helpers/fmFixtures');
const {
  STAMP,
  createDatedAccount,
  captureLog,
  leakedPersonalData,
} = require('./helpers/retentionFixtures');
const policy = require('../lib/retention/policy');
const { runRetentionPurge, CATEGORY_KEYS } = require('../lib/retention/retentionPurge');
const service = require('../lib/terrain/observationService');

const APPLY_ENV = { RETENTION_PURGE_APPLY: '1' };
const ONLY = '--only=observations';
const SECRET_TEXT = `Texte confidentiel ${STAMP}`;

let mapId;
let plantId;
let student;
let teacher;
const cases = {};

async function tinyJpegDataUrl() {
  const buf = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 90, b: 40 } },
  })
    .jpeg()
    .toBuffer();
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

/**
 * Observation avec une photo réelle sur le disque, puis vieillie : `status`, date de décision
 * et date de création reculées de `daysAgo` jours.
 */
async function seedCase(key, { status, daysAgo }) {
  const { observation } = await service.recordObservation({
    observerId: student.id,
    mapId,
    plantId,
    text: `${SECRET_TEXT} ${key}`,
  });
  const photo = await service.addObservationPhoto(observation.id, await tinyJpegDataUrl());
  const row = await queryOne('SELECT file_path FROM species_observation_photos WHERE id = ?', [
    photo.id,
  ]);
  const decided = status !== 'soumise';
  await execute(
    `UPDATE species_observations
        SET status = ?, validated_by = ?, decision_note = ?,
            decided_at = IF(?, NOW() - INTERVAL ? DAY, NULL),
            created_at = NOW() - INTERVAL ? DAY,
            updated_at = NOW() - INTERVAL ? DAY
      WHERE id = ?`,
    [
      status,
      decided ? teacher.id : null,
      decided ? `Note ${STAMP}` : null,
      decided ? 1 : 0,
      daysAgo,
      daysAgo,
      daysAgo,
      observation.id,
    ],
  );
  cases[key] = {
    id: observation.id,
    photoId: photo.id,
    filePath: row.file_path,
    abs: getAbsolutePath(row.file_path),
  };
}

async function observationExists(key) {
  return Boolean(
    await queryOne('SELECT id FROM species_observations WHERE id = ?', [cases[key].id]),
  );
}
async function photoRowExists(key) {
  return Boolean(
    await queryOne('SELECT id FROM species_observation_photos WHERE id = ?', [cases[key].photoId]),
  );
}
const fileExists = (key) => fs.existsSync(cases[key].abs);

async function assertUntouched(key) {
  assert.equal(await observationExists(key), true, `${key} : observation gardée`);
  assert.equal(await photoRowExists(key), true, `${key} : ligne de photo gardée`);
  assert.equal(fileExists(key), true, `${key} : fichier gardé`);
}

test.before(async () => {
  await initSchema();
  mapId = (await fm.createMap({ label: `Carte purge observations ${STAMP}` })).id;
  plantId = (await fm.createPlant()).id;
  student = await createDatedAccount({
    label: 'ObsEleve',
    createdDaysAgo: 600,
    lastSeenDaysAgo: 1,
  });
  teacher = await createDatedAccount({
    userType: 'teacher',
    label: 'ObsProf',
    createdDaysAgo: 600,
    lastSeenDaysAgo: 1,
  });
  const P = policy.OBSERVATION_REFUSED_PHOTO_RETENTION_DAYS;
  const R = policy.OBSERVATION_REFUSED_RETENTION_DAYS;
  const S = policy.OBSERVATION_PENDING_RETENTION_DAYS;
  await seedCase('refuseeRecente', { status: 'refusee', daysAgo: P - 1 });
  await seedCase('refuseePhotoEchue', { status: 'refusee', daysAgo: P + 1 });
  await seedCase('refuseeEchue', { status: 'refusee', daysAgo: R + 1 });
  await seedCase('soumiseRecente', { status: 'soumise', daysAgo: S - 1 });
  await seedCase('soumiseEchue', { status: 'soumise', daysAgo: S + 1 });
  await seedCase('valideeAncienne', { status: 'validee', daysAgo: S * 3 });
});

test.after(async () => {
  for (const c of Object.values(cases)) {
    await execute('DELETE FROM species_observations WHERE id = ?', [c.id]);
    fs.rmSync(c.abs, { force: true });
  }
  await execute('DELETE FROM users WHERE id IN (?, ?)', [student.id, teacher.id]);
  await execute('DELETE FROM plants WHERE id = ?', [plantId]);
  await execute('DELETE FROM maps WHERE id = ?', [mapId]);
});

test('durées : constantes nommées, entières, cohérentes entre elles', () => {
  const P = policy.OBSERVATION_REFUSED_PHOTO_RETENTION_DAYS;
  const R = policy.OBSERVATION_REFUSED_RETENTION_DAYS;
  const S = policy.OBSERVATION_PENDING_RETENTION_DAYS;
  for (const days of [P, R, S]) assert.ok(Number.isInteger(days) && days >= 1);
  assert.ok(P <= 31, 'photo refusée : délai court (un mois au plus)');
  assert.ok(P <= R, 'la photo part avant ou avec l’observation refusée');
  assert.ok(R <= S && S <= 366, 'rien de non validé ne dépasse une année');
  assert.ok(CATEGORY_KEYS.includes('observations'), 'catégorie branchée dans la purge planifiée');
});

test('simulation : des comptages, aucune ligne ni aucun fichier supprimé', async () => {
  const out = captureLog();
  // `--apply` sans la clé d'environnement : toujours une simulation.
  const res = await runRetentionPurge({ argv: ['--apply', ONLY], env: {}, log: out.log });
  assert.equal(res.exitCode, 0, out.text());
  assert.equal(res.mode, 'simulation');
  const counts = res.counts.observations;
  assert.ok(counts.photos_refusees >= 2, 'photo échue + photo de l’observation refusée échue');
  assert.ok(counts.observations_refusees >= 1);
  assert.ok(counts.observations_non_examinees >= 1);
  assert.ok(counts.photos_non_examinees >= 1);
  assert.deepEqual(counts.jours, {
    photo_refusee: policy.OBSERVATION_REFUSED_PHOTO_RETENTION_DAYS,
    observation_refusee: policy.OBSERVATION_REFUSED_RETENTION_DAYS,
    observation_non_examinee: policy.OBSERVATION_PENDING_RETENTION_DAYS,
  });
  for (const key of Object.keys(cases)) await assertUntouched(key);

  const run = await queryOne('SELECT mode, outcome FROM retention_purge_runs WHERE id = ?', [
    res.runId,
  ]);
  assert.equal(run.mode, 'simulation');
  assert.match(out.text(), /SIMULATION/);
  assert.match(out.text(), /à supprimer/);
});

test('exécution réelle (base de test) : seules les données échues partent, fichiers compris', async () => {
  const out = captureLog();
  const res = await runRetentionPurge({ argv: ['--apply', ONLY], env: APPLY_ENV, log: out.log });
  assert.equal(res.exitCode, 0, out.text());
  assert.equal(res.mode, 'apply');

  // Refusée depuis peu : rien ne bouge.
  await assertUntouched('refuseeRecente');

  // Refusée, délai court passé : la photo part (ligne et fichier), l'observation reste lisible.
  assert.equal(await observationExists('refuseePhotoEchue'), true);
  assert.equal(await photoRowExists('refuseePhotoEchue'), false);
  assert.equal(fileExists('refuseePhotoEchue'), false, 'fichier supprimé du disque');
  const kept = await service.getObservation(cases.refuseePhotoEchue.id);
  assert.equal(kept.status, 'refusee');
  assert.deepEqual(kept.photos, []);
  assert.match(kept.text, new RegExp(SECRET_TEXT), 'le texte reste pour que l’élève lise le refus');

  // Refusée, délai de lecture passé : tout part.
  assert.equal(await observationExists('refuseeEchue'), false);
  assert.equal(await photoRowExists('refuseeEchue'), false);
  assert.equal(fileExists('refuseeEchue'), false);

  // Soumise : gardée tant que l'année n'est pas passée, supprimée ensuite.
  await assertUntouched('soumiseRecente');
  assert.equal(await observationExists('soumiseEchue'), false);
  assert.equal(await photoRowExists('soumiseEchue'), false);
  assert.equal(fileExists('soumiseEchue'), false);

  // Validée : jamais, même trois ans après.
  await assertUntouched('valideeAncienne');

  const text = out.text();
  assert.deepEqual(leakedPersonalData(text, [student, teacher]), []);
  assert.equal(text.includes(SECRET_TEXT), false, 'aucun texte d’observation dans la sortie');
  for (const c of Object.values(cases)) {
    assert.equal(text.includes(c.filePath), false, 'aucun chemin de fichier dans la sortie');
  }
  assert.equal(JSON.stringify(res.counts).includes(SECRET_TEXT), false);
});

test('rejouée : plus rien à faire pour ces observations, les survivantes restent', async () => {
  const res = await runRetentionPurge({ argv: ['--apply', ONLY], env: APPLY_ENV, log: () => {} });
  assert.equal(res.exitCode, 0);
  await assertUntouched('refuseeRecente');
  await assertUntouched('soumiseRecente');
  await assertUntouched('valideeAncienne');
  assert.equal(await observationExists('refuseePhotoEchue'), true);
});

test('une observation validée entre le relevé et la suppression n’est pas emportée', async () => {
  const category = require('../lib/retention/categories/observations');
  await seedCase('valideeEnCours', {
    status: 'soumise',
    daysAgo: policy.OBSERVATION_PENDING_RETENTION_DAYS + 5,
  });
  const database = require('../database');
  const removed = [];
  // Base instrumentée : un enseignant valide l'observation juste avant le `DELETE`.
  const db = {
    queryOne: database.queryOne,
    queryAll: database.queryAll,
    execute: async (sql, params) => {
      if (/^\s*DELETE FROM species_observations/i.test(sql)) {
        await database.execute(
          "UPDATE species_observations SET status = 'validee', decided_at = NOW() WHERE id = ?",
          [cases.valideeEnCours.id],
        );
      }
      return database.execute(sql, params);
    },
  };
  await category.run({
    apply: true,
    db,
    deps: { deleteObservationFile: (p) => removed.push(p) },
    log: () => {},
  });
  assert.equal(await observationExists('valideeEnCours'), true);
  assert.equal(await photoRowExists('valideeEnCours'), true);
  assert.equal(removed.includes(cases.valideeEnCours.filePath), false, 'fichier de preuve gardé');
  assert.equal(fileExists('valideeEnCours'), true);
});
