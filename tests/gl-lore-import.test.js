'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');
const {
  parseFeuilletsWorkbook,
  buildFeuilletPayload,
  applyFeuilletsImport,
  normalizeLoreBiomeSlug,
  normalizeFeuilletImageUrl,
  buildFeuilletsExportWorkbook,
  loadFeuilletsExportRows,
} = require('../lib/glLoreFeuilletsImport');
const {
  parseLoreGlossaryWorkbook,
  buildLoreGlossaryPayload,
  applyLoreGlossaryImport,
} = require('../lib/glLoreGlossaryImport');
const { computeEffacementPct, maskFeuilletText } = require('../lib/glLoreFeuilletEffects');
const { filterLoreGlossaryList } = require('../lib/glLoreGlossaryMatch');

test('parseFeuilletsWorkbook lit le fichier de référence', async () => {
  const file = path.join(process.cwd(), 'data', 'gl', 'corpus-feuillets-selene.xlsx');
  assert.ok(fs.existsSync(file), 'fichier corpus attendu');
  const buffer = fs.readFileSync(file);
  const { feuilletRows, plateauRows } = await parseFeuilletsWorkbook(buffer);
  assert.ok(feuilletRows.length >= 100);
  assert.ok(plateauRows.length >= 5);
  assert.ok(feuilletRows.some((row) => row.feuillet_code === 'cop-cover'));
});

test('buildFeuilletPayload valide le code', () => {
  const { payload, errors } = buildFeuilletPayload({
    feuillet_code: 'test-feui',
    type: 'feuillet',
  });
  assert.strictEqual(errors.length, 0);
  assert.strictEqual(payload.feuillet_code, 'test-feui');
});

test('buildFeuilletPayload normalise les colonnes lien_*', () => {
  const { payload, errors } = buildFeuilletPayload({
    feuillet_code: 'test-lien',
    type: 'feuillet',
    lien_canal: 'Espece_Pays',
    lien_ref: 'SP0049',
    lien_pays: '5',
    lien_ordre_recit: '12',
    lien_note: 'note test',
  });
  assert.strictEqual(errors.length, 0);
  assert.strictEqual(payload.lien_canal, 'espece_pays');
  assert.strictEqual(payload.lien_ref, 'SP0049');
  assert.strictEqual(payload.lien_pays, 5);
  assert.strictEqual(payload.lien_ordre_recit, 12);
  assert.strictEqual(payload.lien_note, 'note test');
});

test('normalizeLoreBiomeSlug résout les alias corpus Sélène', () => {
  assert.strictEqual(normalizeLoreBiomeSlug('jungle'), 'jungle_afc');
  assert.strictEqual(normalizeLoreBiomeSlug('caduc'), 'foret_caducifoliee');
  assert.strictEqual(normalizeLoreBiomeSlug('toundra-hiver'), 'toundra');
  assert.strictEqual(normalizeLoreBiomeSlug('toundra (été / hiver polaire)'), 'toundra');
  assert.strictEqual(normalizeLoreBiomeSlug('jungle_afc'), 'jungle_afc');
});

test('parseLoreGlossaryWorkbook lit le fichier de référence', async () => {
  const file = path.join(process.cwd(), 'data', 'gl', 'glossaire-lore-gnomes-et-licornes.xlsx');
  assert.ok(fs.existsSync(file));
  const { glossaryRows } = await parseLoreGlossaryWorkbook(fs.readFileSync(file));
  assert.ok(glossaryRows.length >= 40);
});

test('buildLoreGlossaryPayload normalise chapitre', () => {
  const payload = buildLoreGlossaryPayload({
    id: 'LR0099',
    terme: 'Test',
    categorie: 'concept',
    niveau: 'cle',
    chapitre: 'tous',
  });
  assert.strictEqual(payload.lore_code, 'LR0099');
  assert.strictEqual(payload.chapitre_scope, 'tous');
});

test('computeEffacementPct progresse sur partiel', () => {
  const feuillet = { effacement: 'partiel', vitesse_effacement: 'normal' };
  assert.strictEqual(computeEffacementPct(feuillet, 0), 25);
  assert.strictEqual(computeEffacementPct(feuillet, 25), 50);
});

test('maskFeuilletText masque le texte', () => {
  const out = maskFeuilletText('abcdefghij', 50);
  assert.ok(out.length < 10);
});

test('filterLoreGlossaryList respecte le plafond spoiler', () => {
  const rows = [
    {
      lore_code: 'LR1',
      terme: 'A',
      categorie: 'concept',
      niveau: 'cle',
      chapitre_scope: 'tous',
      statut: 'actif',
    },
    {
      lore_code: 'LR2',
      terme: 'B',
      categorie: 'concept',
      niveau: 'secret',
      chapitre_scope: 'tous',
      statut: 'actif',
    },
  ];
  const filtered = filterLoreGlossaryList(rows, { maxSpoilerLevel: 'recit', isMj: false });
  assert.strictEqual(filtered.length, 1);
});

test('buildFeuilletPayload accepte image_url et image_coupe_url', () => {
  const imageUrl = '/uploads/media-library/image/scene-test.png';
  const coupeUrl = '/uploads/media-library/image/coupe-test.png';
  const { payload, errors, warnings } = buildFeuilletPayload({
    feuillet_code: 'test-img-feui',
    type: 'feuillet',
    image_url: imageUrl,
    image_coupe_url: coupeUrl,
  });
  assert.strictEqual(errors.length, 0);
  assert.strictEqual(warnings.length, 0);
  assert.strictEqual(payload.image_url, imageUrl);
  assert.strictEqual(payload.image_coupe_url, coupeUrl);
});

test('normalizeFeuilletImageUrl avertit sur chemin non reconnu sans bloquer', () => {
  const warnings = [];
  const url = normalizeFeuilletImageUrl('/bad/local/path.png', 'image_url', warnings);
  assert.strictEqual(url, '/bad/local/path.png');
  assert.ok(warnings.some((w) => w.field === 'image_url'));
});

test('import feuillet image_url persiste et export round-trip', async () => {
  require('./helpers/setup');
  const { initSchema, queryOne } = require('../database');
  const execute = require('../database').execute;
  await initSchema();

  const code = `test-img-feui-${Date.now()}`;
  const imageUrl = '/uploads/media-library/image/test-scene.png';
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['code', 'type', 'titre', 'image_url'],
      [code, 'feuillet', 'Feuillet illustré test', imageUrl],
    ]),
    'feuillets',
  );
  const parsed = await parseFeuilletsWorkbook(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  const deps = { queryAll: require('../database').queryAll, execute };
  const report = await applyFeuilletsImport(deps, parsed, { dryRun: false });
  assert.strictEqual(report.feuillets.skipped, 0);

  const row = await queryOne(
    'SELECT image_url FROM gl_lore_feuillets WHERE feuillet_code = ? LIMIT 1',
    [code],
  );
  assert.strictEqual(row.image_url, imageUrl);

  const exportRows = await loadFeuilletsExportRows(deps);
  const exported = exportRows.find((r) => r.feuillet_code === code);
  assert.strictEqual(exported.image_url, imageUrl);

  const exportBuffer = await buildFeuilletsExportWorkbook([exported]);
  const reparsed = await parseFeuilletsWorkbook(exportBuffer);
  assert.strictEqual(reparsed.feuilletRows[0].image_url, imageUrl);
});

test('applyFeuilletsImport dry-run sans erreur fatale', async () => {
  const file = path.join(process.cwd(), 'data', 'gl', 'corpus-feuillets-selene.xlsx');
  const parsed = await parseFeuilletsWorkbook(fs.readFileSync(file));
  const catalogBiomes = [
    'sahara',
    'jungle_afc',
    'toundra',
    'foret_caducifoliee',
    'savane',
    'mangrove',
    'taiga',
    'foret_mediterraneenne',
    'prairie_steppe',
    'desert_froid',
    'landes',
  ];
  const deps = {
    queryAll: async (sql) => {
      if (String(sql).includes('gl_biomes')) {
        return catalogBiomes.map((slug) => ({ slug }));
      }
      return [];
    },
    execute: async () => ({ affectedRows: 1 }),
  };
  const report = await applyFeuilletsImport(deps, parsed, { dryRun: true });
  assert.strictEqual(report.dryRun, true);
  assert.strictEqual(report.feuillets.upserted, 144);
  assert.strictEqual(report.feuillets.skipped, 0);
  assert.strictEqual(report.feuillets.errors.length, 0);
});

test('applyLoreGlossaryImport dry-run', async () => {
  const file = path.join(process.cwd(), 'data', 'gl', 'glossaire-lore-gnomes-et-licornes.xlsx');
  const { glossaryRows } = await parseLoreGlossaryWorkbook(fs.readFileSync(file));
  const report = await applyLoreGlossaryImport(
    { queryAll: async () => [], execute: async () => ({}) },
    glossaryRows,
    { dryRun: true },
  );
  assert.ok(report.totals.valid >= 40);
});
