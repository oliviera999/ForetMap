'use strict';

/**
 * `foretmap_ops retention_preview` — aperçu de la conservation des observations d'espèces.
 *
 * Ce que ce fichier protège :
 * - la catégorie `observations` est acceptée par l'outil et annoncée dans sa liste ;
 * - l'aperçu rend des comptages et les durées appliquées, et NE SUPPRIME RIEN (ni ligne, ni
 *   fichier), même pour une observation refusée depuis longtemps ;
 * - la réponse ne contient ni texte d'observation, ni chemin de fichier, ni identité ;
 * - la purge réelle reste verrouillée sans `RETENTION_PURGE_APPLY=1` dans l'environnement.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const sharp = require('sharp');
const fx = require('./helpers/mcpFixtures');
const fm = require('./helpers/fmFixtures');
const { initSchema, queryOne, execute } = require('../database');

fx.enableMcpEnv();

const { app } = require('../server');
const { getAbsolutePath } = require('../lib/uploads');
const policy = require('../lib/retention/policy');
const service = require('../lib/terrain/observationService');

const STAMP = `${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;
const SECRET_TEXT = `Texte privé ${STAMP}`;
let token;
let studentId;
let mapId;
let observationId;
let photoPath;
let retentionRunsBefore = 0;

const call = (args) => fx.callTool(app, token, 'foretmap_ops', args);

test.before(async () => {
  await initSchema();
  const admin = await fx.createAccount('admin');
  token = (await fx.obtainTokens(app, admin)).access_token;
  mapId = (await fm.createMap({ label: `Carte aperçu ${STAMP}` })).id;
  studentId = crypto.randomUUID();
  await execute(
    `INSERT INTO users (id, user_type, first_name, last_name, display_name, is_active,
                        auth_provider, created_at, updated_at)
     VALUES (?, 'student', 'Apercu', ?, ?, 1, 'local', NOW(), NOW())`,
    [studentId, `Nom${STAMP}`, `Apercu Nom${STAMP}`],
  );
  const { observation } = await service.recordObservation({
    observerId: studentId,
    mapId,
    text: SECRET_TEXT,
  });
  observationId = observation.id;
  const jpeg = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 2, b: 3 } },
  })
    .jpeg()
    .toBuffer();
  const photo = await service.addObservationPhoto(
    observationId,
    `data:image/jpeg;base64,${jpeg.toString('base64')}`,
  );
  photoPath = (
    await queryOne('SELECT file_path FROM species_observation_photos WHERE id = ?', [photo.id])
  ).file_path;
  // Refusée depuis bien plus longtemps que toutes les durées.
  await execute(
    `UPDATE species_observations
        SET status = 'refusee', decided_at = NOW() - INTERVAL ? DAY,
            created_at = NOW() - INTERVAL ? DAY
      WHERE id = ?`,
    [
      policy.OBSERVATION_REFUSED_RETENTION_DAYS + 10,
      policy.OBSERVATION_REFUSED_RETENTION_DAYS + 20,
      observationId,
    ],
  );
  const row = await queryOne('SELECT COALESCE(MAX(id), 0) AS id FROM retention_purge_runs');
  retentionRunsBefore = Number(row.id);
});

test.after(async () => {
  await execute('DELETE FROM species_observations WHERE id = ?', [observationId]);
  if (photoPath) fs.rmSync(getAbsolutePath(photoPath), { force: true });
  await execute('DELETE FROM users WHERE id = ?', [studentId]);
  await execute('DELETE FROM maps WHERE id = ?', [mapId]);
  await execute('DELETE FROM retention_purge_runs WHERE id > ?', [retentionRunsBefore]);
  await fx.cleanupAccounts();
});

test.beforeEach(() => fx.enableMcpEnv());

test('retention_preview observations : comptages et durées, rien n’est supprimé', async () => {
  const prev = await call({ action: 'retention_preview', only: ['observations'] });
  assert.equal(prev.isError, false, prev.text);
  assert.equal(prev.data.mode, 'simulation');
  assert.equal(prev.data.outcome, 'success');
  assert.ok(prev.data.categories.includes('observations'));
  assert.ok(prev.data.runId > retentionRunsBefore, 'une ligne au journal de purge');

  const counts = prev.data.counts.observations;
  assert.ok(counts.photos_refusees >= 1);
  assert.ok(counts.observations_refusees >= 1);
  assert.equal(typeof counts.observations_non_examinees, 'number');
  assert.deepEqual(counts.jours, {
    photo_refusee: policy.OBSERVATION_REFUSED_PHOTO_RETENTION_DAYS,
    observation_refusee: policy.OBSERVATION_REFUSED_RETENTION_DAYS,
    observation_non_examinee: policy.OBSERVATION_PENDING_RETENTION_DAYS,
    plant_observation_event: policy.PLANT_OBSERVATION_EVENT_RETENTION_DAYS,
  });

  // Aperçu seulement : l'observation échue, sa ligne de photo et son fichier sont intacts.
  assert.ok(await queryOne('SELECT id FROM species_observations WHERE id = ?', [observationId]));
  assert.ok(
    await queryOne('SELECT id FROM species_observation_photos WHERE observation_id = ?', [
      observationId,
    ]),
  );
  assert.equal(fs.existsSync(getAbsolutePath(photoPath)), true);

  // Des nombres, rien de nominatif.
  for (const needle of [SECRET_TEXT, photoPath, studentId, `Nom${STAMP}`]) {
    assert.equal(prev.text.includes(needle), false, `« ${needle} » absent de la réponse`);
  }
  assert.match(prev.data.log.join('\n'), /SIMULATION/);
});

test('retention_run observations : verrouillée sans la clé d’environnement', async () => {
  delete process.env.RETENTION_PURGE_APPLY;
  const real = await call({ action: 'retention_run', only: ['observations'] });
  assert.equal(real.isError, true);
  assert.match(real.text, /RETENTION_PURGE_APPLY/);
  assert.ok(await queryOne('SELECT id FROM species_observations WHERE id = ?', [observationId]));
  assert.equal(fs.existsSync(getAbsolutePath(photoPath)), true);
});

test('une catégorie inconnue est refusée par le schéma de l’outil', async () => {
  const bad = await call({ action: 'retention_preview', only: ['observation'] });
  assert.equal(bad.isError, true);
});
