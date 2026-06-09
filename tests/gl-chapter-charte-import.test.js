'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const XLSX = require('xlsx');
const {
  CHARTE_SHEET,
  buildChapterChartePayload,
  validateChapterChartePayload,
  parseChapterCharteWorkbook,
  mergeThemeWithColorDeltas,
  buildChapterCharteTemplateWorkbook,
  buildChapterCharteExportWorkbook,
} = require('../lib/glChapterCharteImport');

const slug = 'exemple-chapitre';

function buildWorkbookBuffer(rows) {
  const wb = XLSX.utils.book_new();
  const data = [
    [
      'slug', 'titre', 'image_carte_url',
      'couleur_primaire', 'couleur_secondaire', 'couleur_tertiaire', 'couleur_texte',
      'couleur_liens', 'couleur_liens_survol', 'couleur_barre_haute', 'couleur_fond',
      'cadre_ratio', 'cadre_ajustement', 'cadre_focal_x', 'cadre_focal_y',
      'cadre_largeur_max', 'cadre_hauteur_max',
    ],
    ...rows,
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), CHARTE_SHEET);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function normalizeFrame() {
  return {
    aspectRatio: 'auto',
    objectFit: 'contain',
    focalX: 50,
    focalY: 50,
    maxWidthPx: null,
    maxHeightPx: null,
    crop: null,
  };
}

test('buildChapterChartePayload parse couleurs et cadre', () => {
  const payload = buildChapterChartePayload({
    slug,
    titre: 'Titre',
    image_carte_url: '/maps/new.svg',
    couleur_primaire: '#aabbcc',
    couleur_secondaire: 'reset',
    cadre_focal_x: '40',
  });
  assert.strictEqual(payload.slug, slug);
  assert.strictEqual(payload.hasMapImageUrl, true);
  assert.strictEqual(payload.colorDeltas.primary, '#aabbcc');
  assert.strictEqual(payload.colorDeltas.secondary, null);
  assert.strictEqual(payload.hasFrame, true);
  assert.strictEqual(payload.framePartial.focalX, 40);
});

test('validateChapterChartePayload refuse hex invalide', () => {
  const payload = buildChapterChartePayload({
    slug,
    couleur_primaire: 'rouge',
  });
  const errors = validateChapterChartePayload(payload, 2);
  assert.ok(errors.some((e) => e.field === 'theme'));
});

test('mergeThemeWithColorDeltas retire une couleur sur reset', () => {
  const merged = mergeThemeWithColorDeltas(
    { colors: { primary: '#111111', secondary: '#222222' } },
    { primary: null }
  );
  assert.strictEqual(merged.colors.primary, undefined);
  assert.strictEqual(merged.colors.secondary, '#222222');
});

test('parseChapterCharteWorkbook lit la feuille chapitres_charte', async () => {
  const buffer = buildWorkbookBuffer([[slug, 'T', '', '#012345', '', '', '', '', '', '', '', '', '', '', '', '', '']]);
  const { rows } = await parseChapterCharteWorkbook(buffer);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].slug, slug);
});

test('buildChapterCharteTemplateWorkbook et export sont des XLSX valides', async () => {
  const tpl = await buildChapterCharteTemplateWorkbook();
  assert.strictEqual(tpl.slice(0, 2).toString('latin1'), 'PK');
  const wb = XLSX.read(tpl, { type: 'buffer' });
  assert.ok(wb.SheetNames.includes(CHARTE_SHEET));

  const exp = await buildChapterCharteExportWorkbook([{
    slug,
    title: 'Charte test',
    map_image_url: '/maps/map-foret.svg',
    theme_json: JSON.stringify({ colors: { primary: '#111111' } }),
    map_image_frame_json: JSON.stringify(normalizeFrame()),
  }]);
  assert.strictEqual(exp.slice(0, 2).toString('latin1'), 'PK');
});

test('modèle XLSX contient une ligne d’exemple valide', async () => {
  const buffer = await buildChapterCharteTemplateWorkbook();
  const { rows } = await parseChapterCharteWorkbook(buffer);
  assert.ok(rows.length >= 1);
  assert.strictEqual(validateChapterChartePayload(buildChapterChartePayload(rows[0]), 2).length, 0);
});
