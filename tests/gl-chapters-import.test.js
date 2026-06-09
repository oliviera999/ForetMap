'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const XLSX = require('xlsx');
const {
  CHAPTERS_SHEET,
  MARKERS_SHEET,
  ZONES_SHEET,
  buildChapterPayload,
  validateChapterPayload,
  buildMarkerPayload,
  validateMarkerPayload,
  buildZonePayload,
  validateZonePayload,
  parseChaptersWorkbook,
  buildChaptersTemplateWorkbook,
  normalizeExportScope,
} = require('../lib/glChaptersImport');
const { CHARTE_SHEET } = require('../lib/glChapterCharteImport');

function buildWorkbookBuffer(sheets) {
  const wb = XLSX.utils.book_new();
  for (const { name, data } of sheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), name);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

test('normalizeExportScope défaut content', () => {
  assert.strictEqual(normalizeExportScope(''), 'content');
  assert.strictEqual(normalizeExportScope('full'), 'full');
  assert.strictEqual(normalizeExportScope('invalid'), 'content');
});

test('buildChapterPayload parse biomes et sorts CSV', () => {
  const payload = buildChapterPayload({
    slug: 'test-chap',
    titre: 'Titre',
    biomes_slugs: 'foret_temperee, lisiere',
    sorts_codes: 'SL01, SL02',
    histoire_markdown: 'Histoire',
  });
  assert.strictEqual(payload.slug, 'test-chap');
  assert.deepStrictEqual(payload.biomeSlugs, ['foret_temperee', 'lisiere']);
  assert.deepStrictEqual(payload.spellCodes, ['SL01', 'SL02']);
  assert.strictEqual(payload.hasStoryMarkdown, true);
});

test('validateChapterPayload refuse slug vide', () => {
  const errors = validateChapterPayload(buildChapterPayload({ titre: 'X' }), 2);
  assert.ok(errors.some((e) => e.field === 'slug'));
});

test('buildMarkerPayload et validation repère', () => {
  const payload = buildMarkerPayload({
    chapitre_slug: 'foret-magique',
    label: 'Départ',
    x_pct: '25',
    y_pct: '30',
    type_evenement: 'start',
  });
  assert.strictEqual(payload.chapterSlug, 'foret-magique');
  assert.strictEqual(payload.xPct, 25);
  const known = new Set(['foret-magique']);
  assert.strictEqual(validateMarkerPayload(payload, 2, known).length, 0);
});

test('validateMarkerPayload refuse chapitre inconnu', () => {
  const payload = buildMarkerPayload({
    chapitre_slug: 'inconnu',
    label: 'X',
    x_pct: '10',
    y_pct: '10',
  });
  const errors = validateMarkerPayload(payload, 2, new Set());
  assert.ok(errors.some((e) => e.field === 'chapitre_slug'));
});

test('buildZonePayload parse points_json', () => {
  const payload = buildZonePayload({
    chapitre_slug: 'foret-magique',
    label: 'Zone A',
    points_json: '[{"x":10,"y":10},{"x":50,"y":10},{"x":50,"y":50}]',
  });
  assert.strictEqual(payload.label, 'Zone A');
  assert.ok(Array.isArray(payload.points));
  assert.strictEqual(validateZonePayload(payload, 2, new Set(['foret-magique'])).length, 0);
});

test('parseChaptersWorkbook lit les feuilles présentes', async () => {
  const buffer = buildWorkbookBuffer([
    {
      name: CHAPTERS_SHEET,
      data: [
        ['slug', 'titre', 'ordre', 'biome', 'biomes_slugs', 'sorts_codes', 'image_carte_url',
          'histoire_markdown', 'biotope_markdown', 'biocenose_markdown', 'sortileges_markdown'],
        ['exemple', 'Exemple', '1', '', '', '', '', '', '', '', ''],
      ],
    },
    {
      name: MARKERS_SHEET,
      data: [
        ['chapitre_slug', 'id', 'label', 'x_pct', 'y_pct', 'type_evenement', 'description', 'ordre',
          'qcm_categorie_slug', 'qcm_question_code', 'mode_affichage', 'emoji', 'icon_url', 'event_config_json'],
        ['exemple', '', 'Repère', '20', '20', 'start', '', '0', '', '', 'label', '', '', ''],
      ],
    },
  ]);
  const parsed = await parseChaptersWorkbook(buffer);
  assert.strictEqual(parsed.chapterRows.length, 1);
  assert.strictEqual(parsed.markerRows.length, 1);
  assert.strictEqual(parsed.hasMarkersSheet, true);
  assert.strictEqual(parsed.hasZonesSheet, false);
});

test('buildChaptersTemplateWorkbook scope full inclut 4 feuilles', async () => {
  const buffer = await buildChaptersTemplateWorkbook('full');
  const wb = XLSX.read(buffer, { type: 'buffer' });
  assert.ok(wb.SheetNames.includes(CHAPTERS_SHEET));
  assert.ok(wb.SheetNames.includes(MARKERS_SHEET));
  assert.ok(wb.SheetNames.includes(ZONES_SHEET));
  assert.ok(wb.SheetNames.includes(CHARTE_SHEET));
});

test('buildChaptersTemplateWorkbook scope content une seule feuille', async () => {
  const buffer = await buildChaptersTemplateWorkbook('content');
  const wb = XLSX.read(buffer, { type: 'buffer' });
  assert.deepStrictEqual(wb.SheetNames, [CHAPTERS_SHEET]);
});
