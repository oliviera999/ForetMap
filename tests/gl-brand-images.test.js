'use strict';

// Écrans de séance, étape 6 (constat K11) : variante WebP des images de marque de G&L —
// module `lib/glBrandImages.js`, route d'envoi, script `scripts/gl-brand-optimiser.js`.

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { getAbsolutePath, ensureDir, deleteDirectory, deleteFile } = require('../lib/uploads');
const { deleteMediaLibraryItem } = require('../lib/mediaLibrary');
const {
  GL_BRAND_VARIANT_DIR,
  GL_BRAND_VARIANT_PROFILES,
  uploadsRelativePathFromUrl,
  isGlBrandVariantUrl,
  ensureGlBrandVariant,
  optimizeGlBrandImages,
} = require('../lib/glBrandImages');
const optimiser = require('../scripts/gl-brand-optimiser');

const stamp = Date.now();
const SCRATCH = `gl_brand/test-${stamp}`;
const createdVariantUrls = new Set();
let adminToken = '';
let previousBrandRow;

/** Image lourde : du bruit ne se compresse pas, le fichier dépasse largement le poids visé. */
async function heavyImage(format, width = 2400, height = 1350) {
  const base = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 120, g: 160, b: 90 },
      noise: { type: 'gaussian', mean: 128, sigma: 40 },
    },
  });
  return format === 'png' ? base.png().toBuffer() : base.jpeg({ quality: 92 }).toBuffer();
}

async function writeScratch(name, buffer) {
  const rel = `${SCRATCH}/${name}`;
  const abs = getAbsolutePath(rel);
  ensureDir(path.dirname(abs));
  await fs.promises.writeFile(abs, buffer);
  return { rel, abs, url: `/uploads/${rel}` };
}

function rememberVariant(url) {
  if (isGlBrandVariantUrl(url)) createdVariantUrls.add(url);
}

before(async () => {
  await initSchema();
  await execute(
    `INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at)
     VALUES (?, 'MJ Images de marque', 'admin', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE is_active = 1, updated_at = NOW()`,
    [`brand.images.${stamp}@ecole.local`],
  );
  const admin = await queryOne('SELECT id FROM gl_admins WHERE email = ? LIMIT 1', [
    `brand.images.${stamp}@ecole.local`,
  ]);
  adminToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_admin',
    userId: String(admin.id),
    roleSlug: 'gl_admin',
    permissions: ['gl.read', 'gl.content.manage'],
    displayName: 'MJ Images de marque',
  });
  previousBrandRow = await queryOne(
    'SELECT value_json, updated_by FROM gl_settings WHERE `key` = ? LIMIT 1',
    [optimiser.BRAND_KEY],
  );
});

after(async () => {
  deleteDirectory(SCRATCH);
  for (const url of createdVariantUrls) deleteFile(uploadsRelativePathFromUrl(url));
  if (previousBrandRow?.value_json) {
    await execute('UPDATE gl_settings SET value_json = ?, updated_by = ? WHERE `key` = ?', [
      previousBrandRow.value_json,
      previousBrandRow.updated_by || null,
      optimiser.BRAND_KEY,
    ]);
  } else {
    await execute('DELETE FROM gl_settings WHERE `key` = ?', [optimiser.BRAND_KEY]);
  }
});

test('uploadsRelativePathFromUrl : seules les adresses /uploads propres passent', () => {
  assert.strictEqual(uploadsRelativePathFromUrl('/uploads/gl_brand/a.png'), 'gl_brand/a.png');
  assert.strictEqual(uploadsRelativePathFromUrl('/uploads/gl_brand/a.png?v=2'), 'gl_brand/a.png');
  assert.strictEqual(uploadsRelativePathFromUrl('/uploads/a%20b.png'), 'a b.png');
  assert.strictEqual(uploadsRelativePathFromUrl('/maps/map-foret.svg'), null);
  assert.strictEqual(uploadsRelativePathFromUrl('https://exemple.test/uploads/a.png'), null);
  assert.strictEqual(uploadsRelativePathFromUrl('/uploads/../.env'), null);
  assert.strictEqual(uploadsRelativePathFromUrl('/uploads/a/%2e%2e/b.png'), null);
  assert.strictEqual(uploadsRelativePathFromUrl(''), null);
});

test('isGlBrandVariantUrl reconnaît une variante, et elle seule', () => {
  assert.strictEqual(
    isGlBrandVariantUrl(`/uploads/${GL_BRAND_VARIANT_DIR}/x-abc-w1600.webp`),
    true,
  );
  assert.strictEqual(isGlBrandVariantUrl('/uploads/gl_brand/hero.webp'), false);
  assert.strictEqual(isGlBrandVariantUrl('/uploads/media-library/image/2026/11/x.webp'), false);
});

test('une image lourde reçoit une variante WebP de 1 600 px au plus, l’original reste intact', async () => {
  const source = await writeScratch('lourde.png', await heavyImage('png'));
  const before = await fs.promises.readFile(source.abs);

  const dry = await ensureGlBrandVariant(source.url, { dryRun: true });
  assert.strictEqual(dry.status, 'a_creer');
  assert.ok(isGlBrandVariantUrl(dry.url));
  assert.strictEqual(
    fs.existsSync(getAbsolutePath(uploadsRelativePathFromUrl(dry.url))),
    false,
    'à blanc, aucun fichier ne doit être écrit',
  );

  const created = await ensureGlBrandVariant(source.url);
  rememberVariant(created.url);
  assert.strictEqual(created.status, 'creee');
  assert.strictEqual(created.url, dry.url, 'même image, même adresse de variante');
  assert.ok(created.bytesAfter < created.bytesBefore);

  const variantAbs = getAbsolutePath(uploadsRelativePathFromUrl(created.url));
  const meta = await sharp(variantAbs).metadata();
  assert.strictEqual(meta.format, 'webp');
  assert.strictEqual(meta.width, GL_BRAND_VARIANT_PROFILES.slot.maxWidth);
  assert.strictEqual(fs.statSync(variantAbs).size, created.bytesAfter);

  const afterBytes = await fs.promises.readFile(source.abs);
  assert.ok(before.equals(afterBytes), 'l’original ne doit pas être modifié');

  const again = await ensureGlBrandVariant(source.url);
  assert.strictEqual(again.status, 'existante');
  assert.strictEqual(again.url, created.url);

  const onVariant = await ensureGlBrandVariant(created.url);
  assert.strictEqual(onVariant.status, 'ignoree');
  assert.strictEqual(onVariant.reason, 'deja_variante');
  assert.strictEqual(onVariant.url, created.url);
});

test('une image douce de 2 400 px tient sous le poids visé', async () => {
  // Un dégradé se compresse bien : c'est le cas ordinaire d'une illustration.
  const width = 2400;
  const height = 1350;
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      raw[i] = Math.round((x / width) * 255);
      raw[i + 1] = Math.round((y / height) * 255);
      raw[i + 2] = Math.round(((x + y) / (width + height)) * 255);
    }
  }
  // PNG sans compression : assez lourd pour dépasser le poids visé, comme les PNG de l'accueil.
  const png = await sharp(raw, { raw: { width, height, channels: 3 } })
    .png({ compressionLevel: 0 })
    .toBuffer();
  const source = await writeScratch('douce.png', png);
  const created = await ensureGlBrandVariant(source.url);
  rememberVariant(created.url);
  assert.strictEqual(created.status, 'creee');
  assert.ok(
    created.bytesAfter <= GL_BRAND_VARIANT_PROFILES.slot.targetBytes,
    `variante de ${created.bytesAfter} octets, ${GL_BRAND_VARIANT_PROFILES.slot.targetBytes} visés`,
  );
});

test('rien n’est produit pour une image déjà légère, absente, hors /uploads ou d’un autre format', async () => {
  const light = await writeScratch(
    'legere.jpg',
    await sharp({ create: { width: 800, height: 600, channels: 3, background: '#336655' } })
      .jpeg()
      .toBuffer(),
  );
  const cases = [
    [light.url, 'deja_legere'],
    [`/uploads/${SCRATCH}/absente.png`, 'fichier_introuvable'],
    ['/maps/map-foret.svg', 'hors_uploads'],
    [`/uploads/${SCRATCH}/animation.gif`, 'format_non_pris_en_charge'],
    ['', 'vide'],
  ];
  for (const [url, reason] of cases) {
    const result = await ensureGlBrandVariant(url);
    assert.strictEqual(result.status, 'ignoree', url);
    assert.strictEqual(result.reason, reason, url);
    assert.strictEqual(result.url, url, 'l’adresse d’origine est rendue telle quelle');
  }
});

test('optimizeGlBrandImages ne change que les adresses d’images, et ne refait rien au second passage', async () => {
  const hero = await writeScratch('hero.jpg', await heavyImage('jpeg'));
  const world = await writeScratch('world.png', await heavyImage('png', 2000, 1500));
  const logo = await writeScratch('logo.png', await heavyImage('png', 1024, 1024));
  const raw = {
    colors: { primary: '#013a40' },
    champLibre: { garde: true },
    logoUrl: logo.url,
    slots: {
      hero: { imageUrl: hero.url, title: 'Gnomes & Licornes', frame: { focalX: 40 } },
      card_world: { imageUrl: world.url, title: 'Un monde', tab: 'world' },
      card_rules: { imageUrl: '', title: 'Les règles du jeu', tab: 'rules' },
      card_spells: { imageUrl: '/maps/map-foret.svg', title: 'Les sortilèges', tab: 'spells' },
    },
  };
  const snapshot = JSON.parse(JSON.stringify(raw));

  const dry = await optimizeGlBrandImages(raw, { dryRun: true });
  assert.strictEqual(dry.changed, true);
  assert.ok(dry.items.every((item) => item.status !== 'creee'));

  const first = await optimizeGlBrandImages(raw);
  [
    first.brand.slots.hero.imageUrl,
    first.brand.slots.card_world.imageUrl,
    first.brand.logoUrl,
  ].forEach(rememberVariant);
  assert.deepStrictEqual(raw, snapshot, 'l’objet reçu n’est pas modifié');
  assert.strictEqual(first.changed, true);
  assert.ok(isGlBrandVariantUrl(first.brand.slots.hero.imageUrl));
  assert.ok(isGlBrandVariantUrl(first.brand.slots.card_world.imageUrl));
  assert.ok(isGlBrandVariantUrl(first.brand.logoUrl));
  assert.match(first.brand.logoUrl, /-w512\.webp$/);
  assert.strictEqual(first.brand.slots.card_rules.imageUrl, '');
  assert.strictEqual(first.brand.slots.card_spells.imageUrl, '/maps/map-foret.svg');
  assert.deepStrictEqual(first.brand.slots.hero.frame, { focalX: 40 });
  assert.strictEqual(first.brand.slots.hero.title, 'Gnomes & Licornes');
  assert.deepStrictEqual(first.brand.colors, raw.colors);
  assert.deepStrictEqual(first.brand.champLibre, raw.champLibre);
  const logoMeta = await sharp(
    getAbsolutePath(uploadsRelativePathFromUrl(first.brand.logoUrl)),
  ).metadata();
  assert.strictEqual(logoMeta.width, GL_BRAND_VARIANT_PROFILES.logo.maxWidth);

  const second = await optimizeGlBrandImages(first.brand);
  assert.strictEqual(second.changed, false, 'une image déjà allégée n’est pas retouchée');
  assert.deepStrictEqual(second.brand, first.brand);
  assert.ok(second.items.every((item) => item.status === 'ignoree'));
});

test('script gl-brand-optimiser : à blanc par défaut, puis écrit une fois, puis plus rien', async () => {
  const hero = await writeScratch('script-hero.png', await heavyImage('png'));
  const brand = {
    logoUrl: '',
    slots: {
      hero: { imageUrl: hero.url, title: 'Héros' },
      card_world: { imageUrl: '', title: 'Un monde', tab: 'world' },
    },
  };
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_by, updated_at)
     VALUES (?, ?, 'test', NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_by = VALUES(updated_by)`,
    [optimiser.BRAND_KEY, JSON.stringify(brand)],
  );
  const readBrand = async () => {
    const row = await queryOne(
      'SELECT value_json, updated_by FROM gl_settings WHERE `key` = ? LIMIT 1',
      [optimiser.BRAND_KEY],
    );
    return { value: JSON.parse(row.value_json), updatedBy: row.updated_by };
  };

  const dry = await optimiser.run();
  assert.strictEqual(dry.apply, false);
  assert.strictEqual(dry.changed, true);
  assert.strictEqual(dry.written, false);
  assert.deepStrictEqual((await readBrand()).value, brand, 'à blanc, la base ne change pas');
  const planned = dry.items.find((item) => item.field === 'slots.hero.imageUrl');
  assert.strictEqual(planned.status, 'a_creer');
  assert.strictEqual(
    fs.existsSync(getAbsolutePath(uploadsRelativePathFromUrl(planned.url))),
    false,
  );
  assert.match(optimiser.describeItem(planned), /variante à écrire/);

  const applied = await optimiser.run({ apply: true });
  assert.strictEqual(applied.written, true);
  const stored = await readBrand();
  rememberVariant(stored.value.slots.hero.imageUrl);
  assert.ok(isGlBrandVariantUrl(stored.value.slots.hero.imageUrl));
  assert.strictEqual(stored.value.slots.hero.title, 'Héros');
  assert.strictEqual(stored.updatedBy, 'gl-brand-optimiser');
  assert.ok(fs.existsSync(hero.abs), 'l’original reste sur le disque');

  // Le réglage servi à l'écran de connexion pointe vers la variante.
  const cfg = await request(app).get('/api/gl/auth/config').expect(200);
  assert.strictEqual(cfg.body.brand.slots.hero.imageUrl, stored.value.slots.hero.imageUrl);

  let upserts = 0;
  const again = await optimiser.run({
    apply: true,
    upsert: async () => {
      upserts += 1;
    },
  });
  assert.strictEqual(again.changed, false);
  assert.strictEqual(again.written, false);
  assert.strictEqual(upserts, 0, 'rien à faire : le réglage n’est pas réécrit');
});

test('script gl-brand-optimiser : sans réglage en base, rien à faire', async () => {
  const report = await optimiser.run({ apply: true, queryOne: async () => null });
  assert.deepStrictEqual(report, {
    apply: true,
    found: false,
    changed: false,
    written: false,
    items: [],
  });
});

test('POST /api/gl/admin/media-library : usage « brand » rend la variante, sans cela rien ne change', async () => {
  const dataUrl = `data:image/jpeg;base64,${(await heavyImage('jpeg', 2000, 1200)).toString('base64')}`;
  const toDelete = [];
  try {
    const branded = await request(app)
      .post('/api/gl/admin/media-library')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ media_data: dataUrl, usage: 'brand' })
      .expect(201);
    toDelete.push(branded.body.relativePath);
    rememberVariant(branded.body?.optimized?.url);
    assert.ok(String(branded.body.url).startsWith('/uploads/media-library/image/'));
    assert.ok(isGlBrandVariantUrl(branded.body.optimized.url), 'adresse de la variante attendue');
    assert.ok(branded.body.optimized.size < branded.body.size);
    assert.ok(branded.body.optimized.width <= GL_BRAND_VARIANT_PROFILES.slot.maxWidth);
    assert.ok(
      fs.existsSync(getAbsolutePath(branded.body.relativePath)),
      'l’original est gardé dans la médiathèque',
    );
    const served = await request(app).get(branded.body.optimized.url).expect(200);
    assert.match(String(served.headers['content-type']), /image\/webp/);

    const plain = await request(app)
      .post('/api/gl/admin/media-library')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ media_data: dataUrl })
      .expect(201);
    toDelete.push(plain.body.relativePath);
    assert.strictEqual('optimized' in plain.body, false);

    const tiny = await request(app)
      .post('/api/gl/admin/media-library')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        media_data:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6pJkQAAAAASUVORK5CYII=',
        usage: 'brand',
      })
      .expect(201);
    toDelete.push(tiny.body.relativePath);
    assert.strictEqual(tiny.body.optimized, null, 'image déjà légère : pas de variante');
  } finally {
    for (const rel of toDelete.filter(Boolean)) deleteMediaLibraryItem(rel);
  }
});
