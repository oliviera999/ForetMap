'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const {
  parseFeuilletsWorkbook,
  buildFeuilletPayload,
  applyFeuilletsImport,
  normalizeLoreBiomeSlug,
} = require('../lib/glLoreFeuilletsImport');
const {
  parseLoreGlossaryWorkbook,
  buildLoreGlossaryPayload,
  applyLoreGlossaryImport,
} = require('../lib/glLoreGlossaryImport');
const { computeEffacementPct, maskFeuilletText } = require('../lib/glLoreFeuilletEffects');
const { filterLoreGlossaryList } = require('../lib/glLoreGlossaryMatch');

test('parseFeuilletsWorkbook lit le fichier de référence', () => {
  const file = path.join(process.cwd(), 'data', 'gl', 'corpus-feuillets-selene.xlsx');
  assert.ok(fs.existsSync(file), 'fichier corpus attendu');
  const buffer = fs.readFileSync(file);
  const { feuilletRows, plateauRows } = parseFeuilletsWorkbook(buffer);
  assert.ok(feuilletRows.length >= 100);
  assert.ok(plateauRows.length >= 5);
  assert.ok(feuilletRows.some((row) => row.feuillet_code === 'cop-cover'));
});

test('buildFeuilletPayload valide le code', () => {
  const { payload, errors } = buildFeuilletPayload({ feuillet_code: 'test-feui', type: 'feuillet' });
  assert.strictEqual(errors.length, 0);
  assert.strictEqual(payload.feuillet_code, 'test-feui');
});

test('normalizeLoreBiomeSlug résout les alias corpus Sélène', () => {
  assert.strictEqual(normalizeLoreBiomeSlug('jungle'), 'jungle_afc');
  assert.strictEqual(normalizeLoreBiomeSlug('caduc'), 'foret_caducifoliee');
  assert.strictEqual(normalizeLoreBiomeSlug('toundra-hiver'), 'toundra');
  assert.strictEqual(normalizeLoreBiomeSlug('toundra (été / hiver polaire)'), 'toundra');
  assert.strictEqual(normalizeLoreBiomeSlug('jungle_afc'), 'jungle_afc');
});

test('parseLoreGlossaryWorkbook lit le fichier de référence', () => {
  const file = path.join(process.cwd(), 'data', 'gl', 'glossaire-lore-gnomes-et-licornes.xlsx');
  assert.ok(fs.existsSync(file));
  const { glossaryRows } = parseLoreGlossaryWorkbook(fs.readFileSync(file));
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
    { lore_code: 'LR1', terme: 'A', categorie: 'concept', niveau: 'cle', chapitre_scope: 'tous', statut: 'actif' },
    { lore_code: 'LR2', terme: 'B', categorie: 'concept', niveau: 'secret', chapitre_scope: 'tous', statut: 'actif' },
  ];
  const filtered = filterLoreGlossaryList(rows, { maxSpoilerLevel: 'recit', isMj: false });
  assert.strictEqual(filtered.length, 1);
});

test('applyFeuilletsImport dry-run sans erreur fatale', async () => {
  const file = path.join(process.cwd(), 'data', 'gl', 'corpus-feuillets-selene.xlsx');
  const parsed = parseFeuilletsWorkbook(fs.readFileSync(file));
  const catalogBiomes = [
    'sahara', 'jungle_afc', 'toundra', 'foret_caducifoliee', 'savane', 'mangrove',
    'taiga', 'foret_mediterraneenne', 'prairie_steppe', 'desert_froid', 'landes',
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
  const { glossaryRows } = parseLoreGlossaryWorkbook(fs.readFileSync(file));
  const report = await applyLoreGlossaryImport(
    { queryAll: async () => [], execute: async () => ({}) },
    glossaryRows,
    { dryRun: true },
  );
  assert.ok(report.totals.valid >= 40);
});
