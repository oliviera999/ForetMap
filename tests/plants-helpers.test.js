'use strict';

require('./helpers/setup');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  PHOTO_FIELDS,
  PLANT_EXTRA_FIELDS,
  PLANT_COLUMNS,
  IMPORT_STRATEGIES,
  hasOwn,
  asTrimmedString,
  asOptionalText,
  parseLinkCandidates,
  normalizeHeader,
  mapImportRowToPlantShape,
  parseNumberish,
  validateRangeText,
  detectImageExtensionFromDataUrl,
  isLocalUploadsPath,
  isDirectImagePath,
  isDevLocalhostHttp,
  isDirectImageUrl,
  mergePlantPhotoUploadValue,
  extractUploadsRelativePath,
  extractUploadsRelativePaths,
  mergePlantPhotoFieldValue,
  validateHttpsPhotoLinks,
  toGoogleSheetCsvUrl,
  buildPlantPayload,
  buildImportReportBase,
  validateImportPayloadRow,
  MAX_PLANT_OBSERVATION_COUNT_IDS,
  parsePlantIdsQueryParam,
} = require('../lib/plantsRouteHelpers');

describe('plantsRouteHelpers (logique pure de routes/plants.js, sans DB)', () => {
  it('constantes : PLANT_COLUMNS = name/emoji/description + champs étendus, photos incluses', () => {
    assert.deepEqual(PLANT_COLUMNS.slice(0, 3), ['name', 'emoji', 'description']);
    assert.deepEqual(PLANT_COLUMNS, ['name', 'emoji', 'description', ...PLANT_EXTRA_FIELDS]);
    for (const f of PHOTO_FIELDS) assert.ok(PLANT_EXTRA_FIELDS.includes(f), `photo ${f} dans PLANT_EXTRA_FIELDS`);
    assert.deepEqual([...IMPORT_STRATEGIES].sort(), ['insert_only', 'replace_all', 'upsert_name']);
  });

  it('hasOwn : propriété propre uniquement, tolère null/undefined', () => {
    assert.equal(hasOwn({ a: 1 }, 'a'), true);
    assert.equal(hasOwn({ a: undefined }, 'a'), true);
    assert.equal(hasOwn({}, 'toString'), false);
    assert.equal(hasOwn(null, 'a'), false);
    assert.equal(hasOwn(undefined, 'a'), false);
  });

  it('asTrimmedString / asOptionalText : null → \'\' / null, trim sinon', () => {
    assert.equal(asTrimmedString(null), '');
    assert.equal(asTrimmedString('  a  '), 'a');
    assert.equal(asTrimmedString(12), '12');
    assert.equal(asOptionalText('   '), null);
    assert.equal(asOptionalText(' x '), 'x');
    assert.equal(asOptionalText(undefined), null);
  });

  it('parseLinkCandidates : découpe sur retours ligne et virgules, filtre le vide', () => {
    assert.deepEqual(parseLinkCandidates('a\nb, c,  d\n'), ['a', 'b', 'c', 'd']);
    assert.deepEqual(parseLinkCandidates('  '), []);
    assert.deepEqual(parseLinkCandidates(null), []);
  });

  it('normalizeHeader : accents/casse/séparateurs normalisés en snake_case ASCII', () => {
    assert.equal(normalizeHeader('Température idéale (°C)'), 'temperature_ideale_c');
    assert.equal(normalizeHeader('  Nom scientifique  '), 'nom_scientifique');
    assert.equal(normalizeHeader('pH optimal'), 'ph_optimal');
    assert.equal(normalizeHeader(''), '');
  });

  it('mapImportRowToPlantShape : alias français → colonnes canoniques, en-têtes inconnus ignorés', () => {
    const mapped = mapImportRowToPlantShape({
      'Nom commun': 'Chêne',
      'Nom scientifique': 'Quercus robur',
      'Température idéale (°C)': '5-20',
      'Photo espèce': 'https://x.fr/a.jpg',
      'Colonne mystère': 'ignorée',
      description: 'Grand arbre',
    });
    assert.deepEqual(mapped, {
      name: 'Chêne',
      scientific_name: 'Quercus robur',
      ideal_temperature_c: '5-20',
      photo_species: 'https://x.fr/a.jpg',
      description: 'Grand arbre',
    });
  });

  it('parseNumberish : virgule décimale acceptée, non-numérique → null', () => {
    assert.equal(parseNumberish('3,5'), 3.5);
    assert.equal(parseNumberish(' -2 '), -2);
    assert.equal(parseNumberish('abc'), null);
    assert.equal(parseNumberish(''), null);
  });

  it('validateRangeText : valeur simple dans la plage → null, hors plage → message', () => {
    assert.equal(validateRangeText('', 0, 14), null);
    assert.equal(validateRangeText('7', 0, 14), null);
    assert.match(String(validateRangeText('15', 0, 14)), /valeur hors plage \(0-14\)/);
    assert.match(String(validateRangeText('abc', 0, 14)), /valeur non numérique/);
  });

  it('validateRangeText : intervalles a-b ou a/b, inversé et hors plage refusés', () => {
    assert.equal(validateRangeText('5-20', -20, 80), null);
    assert.equal(validateRangeText('5,5/20', -20, 80), null);
    assert.match(String(validateRangeText('20-5', -20, 80)), /intervalle inversé/);
    assert.match(String(validateRangeText('-30-10', -20, 80)), /intervalle hors plage \(-20-80\)/);
  });

  it('detectImageExtensionFromDataUrl : jpeg → jpg, hors data URL image → null', () => {
    assert.equal(detectImageExtensionFromDataUrl('data:image/jpeg;base64,AAAA'), 'jpg');
    assert.equal(detectImageExtensionFromDataUrl('data:image/PNG;base64,AAAA'), 'png');
    assert.equal(detectImageExtensionFromDataUrl('data:text/plain;base64,AAAA'), null);
    assert.equal(detectImageExtensionFromDataUrl(''), null);
  });

  it('isLocalUploadsPath / isDirectImagePath : chemin /uploads/ et extension image', () => {
    assert.equal(isLocalUploadsPath('/uploads/plants/1/a.png'), true);
    assert.equal(isLocalUploadsPath('/autre/a.png'), false);
    assert.equal(isDirectImagePath('/uploads/a.webp?x=1'), true);
    assert.equal(isDirectImagePath('/uploads/a'), false);
  });

  it('isDevLocalhostHttp / isDirectImageUrl : localhost http toléré, FilePath Wikimedia accepté', () => {
    assert.equal(isDevLocalhostHttp(new URL('http://localhost:3000/a.png')), true);
    assert.equal(isDevLocalhostHttp(new URL('http://example.com/a.png')), false);
    assert.equal(isDevLocalhostHttp(new URL('https://localhost/a.png')), false);
    assert.equal(isDirectImageUrl(new URL('https://x.fr/img/photo.JPG')), true);
    assert.equal(isDirectImageUrl(new URL('https://commons.wikimedia.org/wiki/Special:FilePath/Quercus.jpg')), true);
    assert.equal(isDirectImageUrl(new URL('https://x.fr/page.html')), false);
  });

  it('mergePlantPhotoUploadValue : append/prepend, déduplication, vide → null', () => {
    assert.equal(mergePlantPhotoUploadValue('', 'u1'), 'u1');
    assert.equal(mergePlantPhotoUploadValue('u1\nu2', 'u3'), 'u1\nu2\nu3');
    assert.equal(mergePlantPhotoUploadValue('u1\nu2', 'u3', 'prepend'), 'u3\nu1\nu2');
    assert.equal(mergePlantPhotoUploadValue('u1\nu2', 'u2'), 'u1\nu2');
    assert.equal(mergePlantPhotoUploadValue('', ''), null);
  });

  it('mergePlantPhotoFieldValue : même fusion mais chaîne vide (jamais null) sans nouvelle URL', () => {
    assert.equal(mergePlantPhotoFieldValue('', ''), '');
    assert.equal(mergePlantPhotoFieldValue('u1', ''), 'u1');
    assert.equal(mergePlantPhotoFieldValue('u1', 'u2', 'prepend'), 'u2\nu1');
  });

  it('extractUploadsRelativePath(s) : chemin local, URL absolue, déduplication', () => {
    assert.equal(extractUploadsRelativePath('/uploads/plants/1/a.png'), 'plants/1/a.png');
    assert.equal(extractUploadsRelativePath('https://foretmap.fr/uploads/a/b.jpg'), 'a/b.jpg');
    assert.equal(extractUploadsRelativePath('https://foretmap.fr/autre/b.jpg'), null);
    assert.equal(extractUploadsRelativePath('pas-une-url'), null);
    assert.deepEqual(
      extractUploadsRelativePaths('/uploads/a.png\nhttps://x.fr/uploads/b.jpg, /uploads/a.png\nhttps://x.fr/c.jpg'),
      ['a.png', 'b.jpg']
    );
  });

  it('validateHttpsPhotoLinks : URLs https directes et /uploads/ valides → null', () => {
    assert.equal(validateHttpsPhotoLinks({}), null);
    assert.equal(validateHttpsPhotoLinks({ photo: 'https://x.fr/a.jpg\n/uploads/plants/1/b.png' }), null);
    assert.equal(validateHttpsPhotoLinks({ photo_leaf: 'http://localhost:5173/a.png' }), null);
  });

  it('validateHttpsPhotoLinks : http public, URL invalide, page non image, /uploads/ sans extension refusés', () => {
    assert.match(String(validateHttpsPhotoLinks({ photo: 'http://x.fr/a.jpg' })), /^photo: seules les URLs HTTPS/);
    assert.match(String(validateHttpsPhotoLinks({ photo_fruit: 'pas une url' })), /^photo_fruit: URL invalide/);
    assert.match(String(validateHttpsPhotoLinks({ photo: 'https://x.fr/page.html' })), /URL d'image directe requise/);
    assert.match(String(validateHttpsPhotoLinks({ photo: '/uploads/plants/1/b' })), /chemin local invalide/);
    assert.equal(validateHttpsPhotoLinks({ autre_champ: 'pas une url' }), null, 'seuls les champs photo sont validés');
  });

  it('toGoogleSheetCsvUrl : URL Sheets → export CSV avec gid (query ou hash), sinon null', () => {
    assert.equal(
      toGoogleSheetCsvUrl('https://docs.google.com/spreadsheets/d/ABC-123_x/edit#gid=42'),
      'https://docs.google.com/spreadsheets/d/ABC-123_x/export?format=csv&gid=42'
    );
    assert.equal(
      toGoogleSheetCsvUrl('https://docs.google.com/spreadsheets/d/ABC/edit?gid=7'),
      'https://docs.google.com/spreadsheets/d/ABC/export?format=csv&gid=7'
    );
    assert.equal(
      toGoogleSheetCsvUrl('https://docs.google.com/spreadsheets/d/ABC'),
      'https://docs.google.com/spreadsheets/d/ABC/export?format=csv&gid=0'
    );
    assert.equal(toGoogleSheetCsvUrl('https://example.com/spreadsheets/d/ABC'), null);
    assert.equal(toGoogleSheetCsvUrl('pas une url'), null);
    assert.equal(toGoogleSheetCsvUrl(''), null);
  });

  it('buildPlantPayload : trim, emoji par défaut 🌱, champs étendus optionnels → null', () => {
    const p = buildPlantPayload({ name: '  Chêne ', description: ' d ', habitat: '  ' });
    assert.equal(p.name, 'Chêne');
    assert.equal(p.emoji, '🌱');
    assert.equal(p.description, 'd');
    assert.equal(p.habitat, null);
    for (const f of PLANT_EXTRA_FIELDS) assert.ok(hasOwn(p, f), `champ ${f} présent`);
  });

  it('buildPlantPayload : fallback utilisé seulement pour les champs absents du body', () => {
    const fallback = { name: 'Ancien', emoji: '🌳', habitat: 'forêt', nutrition: 'n1' };
    const p = buildPlantPayload({ name: 'Nouveau', habitat: '' }, fallback);
    assert.equal(p.name, 'Nouveau');
    assert.equal(p.emoji, '🌳');
    assert.equal(p.habitat, null, 'habitat fourni vide écrase le fallback');
    assert.equal(p.nutrition, 'n1');
  });

  it('buildPlantPayload : dérive group_4 (végétal → group_3) si laissé vide', () => {
    const p = buildPlantPayload({ name: 'Chêne', group_1: 'Végétal', group_3: 'Fagacées' });
    assert.equal(p.group_4, 'Fagacées');
    const q = buildPlantPayload({ name: 'Chêne', group_1: 'Végétal', group_3: 'Fagacées', group_4: 'Déjà' });
    assert.equal(q.group_4, 'Déjà');
  });

  it('buildImportReportBase : structure et totaux initiaux', () => {
    const report = buildImportReportBase('upsert_name', true, 'csv', 12);
    assert.deepEqual(report, {
      strategy: 'upsert_name',
      dryRun: true,
      sourceType: 'csv',
      totals: { received: 12, valid: 0, created: 0, updated: 0, skipped_existing: 0, skipped_invalid: 0 },
      preview: [],
      errors: [],
    });
  });

  it('validateImportPayloadRow : ligne valide → payload, sans nom → erreur name', () => {
    const ok = validateImportPayloadRow({ Nom: 'Chêne', 'pH optimal': '6-7' }, 2);
    assert.equal(ok.payload.name, 'Chêne');
    assert.deepEqual(ok.errors, []);
    const ko = validateImportPayloadRow({ description: 'sans nom' }, 3);
    assert.equal(ko.payload, null);
    assert.deepEqual(ko.errors, [{ row: 3, field: 'name', error: 'Nom requis' }]);
  });

  it('validateImportPayloadRow : photo non https, température et pH hors plage signalés par champ', () => {
    const { payload, errors } = validateImportPayloadRow({
      Nom: 'Chêne',
      'Photo espèce': 'http://x.fr/a.jpg',
      'Température idéale (°C)': '999',
      'pH optimal': '20',
    }, 5);
    assert.ok(payload);
    assert.deepEqual(errors.map((e) => [e.row, e.field]), [
      [5, 'photo_species'],
      [5, 'ideal_temperature_c'],
      [5, 'optimal_ph'],
    ]);
    assert.match(errors[0].error, /seules les URLs HTTPS/);
  });

  it('parsePlantIdsQueryParam : entiers positifs dédupliqués, séparateurs , ; espaces', () => {
    assert.deepEqual(parsePlantIdsQueryParam('1,2;3 4,2'), [1, 2, 3, 4]);
    assert.deepEqual(parsePlantIdsQueryParam(' 7 '), [7]);
    assert.deepEqual(parsePlantIdsQueryParam('0,-1,2.5,abc'), []);
    assert.deepEqual(parsePlantIdsQueryParam(''), []);
    assert.deepEqual(parsePlantIdsQueryParam(null), []);
  });

  it(`parsePlantIdsQueryParam : borné à MAX_PLANT_OBSERVATION_COUNT_IDS (${MAX_PLANT_OBSERVATION_COUNT_IDS})`, () => {
    const raw = Array.from({ length: MAX_PLANT_OBSERVATION_COUNT_IDS + 50 }, (_, i) => i + 1).join(',');
    const ids = parsePlantIdsQueryParam(raw);
    assert.equal(ids.length, MAX_PLANT_OBSERVATION_COUNT_IDS);
    assert.equal(ids[0], 1);
    assert.equal(ids[ids.length - 1], MAX_PLANT_OBSERVATION_COUNT_IDS);
  });
});
