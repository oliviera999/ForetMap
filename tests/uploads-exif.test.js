'use strict';

/**
 * Retrait des métadonnées des images téléversées — filet du lot F de
 * `docs/AUDIT_SECURITE_2026-09-22.md` (constat **S7**).
 *
 * Ce que ces cas garantissent, et pourquoi chacun compte :
 * - une photo porteuse de **coordonnées GPS** ne peut plus arriver telle quelle sur le disque,
 *   par aucun des deux points de passage d'écriture — c'était le constat ;
 * - le test le plus fort passe par une **vraie route HTTP** : un correctif posé dans un
 *   utilitaire mais non atteint par le chemin réel ne protège personne ;
 * - l'orientation EXIF est **appliquée** avant d'être jetée, sinon le correctif coucherait
 *   les photos prises de côté ;
 * - un contenu que `sharp` ne sait pas traiter (JSON, SVG, image animée) ressort **intact** :
 *   un scrubbing qui casse des fichiers finit désactivé.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const sharp = require('sharp');

const { initSchema, initDatabase, execute } = require('../database');
const { app } = require('../server');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const fx = require('./helpers/fmFixtures');
const {
  UPLOADS_DIR,
  saveBase64ToDisk,
  writeBufferToDisk,
  getAbsolutePath,
  deleteFile,
} = require('../lib/uploads');
const { stripImageMetadata, describeImageMetadata } = require('../lib/imageMetadata');

/** Dossier de travail des cas unitaires, sous `uploads/` pour rester dans la garde de chemin. */
const SCRATCH = '_test-exif';

let teacherToken;
let mapId;
const createdZoneIds = [];

/** JPEG uni de `size` px, sans aucune métadonnée. */
async function plainJpeg(size = 48) {
  return sharp({
    create: { width: size, height: size, channels: 3, background: { r: 30, g: 120, b: 60 } },
  })
    .jpeg()
    .toBuffer();
}

/**
 * JPEG portant des coordonnées GPS — la forme exacte du constat : une photo prise au
 * téléphone sur le terrain, avec le lieu où elle a été prise.
 */
async function jpegWithGps(size = 48) {
  return sharp(await plainJpeg(size))
    .withExif({
      IFD0: { Make: 'ACME', Model: 'Telephone X' },
      GPS: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '33/1 35/1 0/1',
        GPSLongitudeRef: 'W',
        GPSLongitude: '7/1 35/1 0/1',
      },
    })
    .toBuffer();
}

test.before(async () => {
  await initSchema();
  await initDatabase();
  await ensureRbacBootstrap();
  teacherToken = await ensureAdminTeacherAuthToken({ elevated: true });
  mapId = (await fx.createMap({ label: 'Carte EXIF' })).id;
});

test.after(async () => {
  for (const id of createdZoneIds) {
    await execute('DELETE FROM zone_photos WHERE zone_id = ?', [id]);
    await execute('DELETE FROM zones WHERE id = ?', [id]);
  }
  await execute('DELETE FROM zones WHERE map_id = ?', [mapId]);
  await execute('DELETE FROM maps WHERE id = ?', [mapId]);
  fs.rmSync(path.join(UPLOADS_DIR, SCRATCH), { recursive: true, force: true });
});

test('une photo géolocalisée perd ses coordonnées en passant par saveBase64ToDisk', async () => {
  const source = await jpegWithGps();
  const before = await describeImageMetadata(source);
  assert.equal(before.hasExif, true, 'le cas de test doit bien porter des métadonnées');

  const relative = `${SCRATCH}/base64.jpg`;
  await saveBase64ToDisk(relative, source.toString('base64'));
  const written = fs.readFileSync(getAbsolutePath(relative));

  const after = await describeImageMetadata(written);
  assert.equal(after.hasExif, false, 'EXIF encore présent sur le fichier écrit');
  assert.equal(after.format, 'jpeg', 'le format doit être conservé');
  // Et pas seulement au sens de `sharp` : la chaîne de la latitude ne doit plus figurer
  // nulle part dans les octets du fichier.
  assert.ok(!written.toString('latin1').includes('33/1'), 'coordonnée résiduelle dans le fichier');
  deleteFile(relative);
});

test('même garantie par writeBufferToDisk (l’autre point de passage)', async () => {
  const relative = `${SCRATCH}/buffer.jpg`;
  await writeBufferToDisk(relative, await jpegWithGps());
  const after = await describeImageMetadata(fs.readFileSync(getAbsolutePath(relative)));
  assert.equal(after.hasExif, false);
  deleteFile(relative);
});

test('POST /api/zones/:id/photos — le fichier servi publiquement est propre', async () => {
  // Le cas qui compte vraiment : la route réelle, jusqu'au fichier sur disque. `uploads/zones/`
  // est servi sans authentification (`server.js`), c'est donc ce fichier-là que n'importe qui
  // peut télécharger.
  const zone = await fx.createZone({ mapId, name: 'Zone photo EXIF' });
  createdZoneIds.push(zone.id);

  const created = await request(app)
    .post(`/api/zones/${zone.id}/photos`)
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({
      image_data: `data:image/jpeg;base64,${(await jpegWithGps(64)).toString('base64')}`,
      caption: 'Photo de terrain',
    })
    .expect(201);

  const storedPath = String(created.body?.image_path || '');
  assert.ok(storedPath, 'la route doit rendre le chemin du fichier stocké');
  const onDisk = fs.readFileSync(getAbsolutePath(storedPath));
  const after = await describeImageMetadata(onDisk);
  assert.equal(after.hasExif, false, `EXIF encore présent dans uploads/${storedPath}`);
  assert.ok(!onDisk.toString('latin1').includes('33/1'), 'coordonnée résiduelle dans le fichier');
});

test('l’orientation EXIF est appliquée, pas seulement jetée', async () => {
  // Orientation 6 = « rotation de 90° à l'affichage ». Jeter l'EXIF sans l'appliquer
  // coucherait la photo : les côtés doivent donc s'échanger.
  const portrait = await sharp({
    create: { width: 80, height: 40, channels: 3, background: { r: 10, g: 10, b: 200 } },
  })
    .jpeg()
    .toBuffer();
  // `withExif({ IFD0: { Orientation } })` n'écrit **pas** l'orientation d'une façon que
  // `sharp` relise (vérifié : il la relit à 1) ; `withMetadata({ orientation })` si.
  const rotated = await sharp(portrait).withMetadata({ orientation: 6 }).toBuffer();
  assert.equal(
    (await sharp(rotated).metadata()).orientation,
    6,
    'le cas doit porter l’orientation',
  );

  const cleaned = await stripImageMetadata(rotated);
  const meta = await sharp(cleaned).metadata();
  assert.equal(meta.width, 40, 'largeur après application de l’orientation');
  assert.equal(meta.height, 80, 'hauteur après application de l’orientation');
  assert.equal(meta.exif, undefined, 'l’orientation ne doit pas être reconduite');
});

test('un contenu qui n’est pas une image ressort intact', async () => {
  const json = Buffer.from(JSON.stringify({ cle: 'valeur' }), 'utf8');
  assert.ok((await stripImageMetadata(json)).equals(json));

  // SVG : `sharp` sait le lire mais le rastériserait — il doit être rendu tel quel.
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>',
  );
  assert.ok((await stripImageMetadata(svg)).equals(svg), 'un SVG ne doit jamais être rastérisé');

  // Buffers dégénérés : ne doivent pas lever, et ressortir tels quels.
  const empty = await stripImageMetadata(Buffer.alloc(0));
  assert.ok(Buffer.isBuffer(empty) && empty.length === 0);
  assert.equal(await stripImageMetadata(null), null);
  assert.equal(await stripImageMetadata(undefined), undefined);
});

test('une image animée n’est pas aplatie sur sa première image', async () => {
  // Un GIF animé ré-encodé image par image sortirait fixe : la régression serait visible,
  // pour un gain nul (aucun appareil photo ne produit d’animation géolocalisée).
  const frames = await sharp({
    create: { width: 8, height: 16, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  })
    .gif()
    .toBuffer();
  const out = await stripImageMetadata(frames);
  assert.ok(out.equals(frames), 'un GIF doit ressortir tel quel');
});

test('une image déjà propre traverse sans perte de format ni de dimensions', async () => {
  const clean = await plainJpeg(72);
  const out = await stripImageMetadata(clean);
  const meta = await sharp(out).metadata();
  assert.equal(meta.format, 'jpeg');
  assert.equal(meta.width, 72);
  assert.equal(meta.height, 72);
});
