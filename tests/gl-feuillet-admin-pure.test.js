'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  classifyFeuilletChannel,
  isFeuilletOrphan,
  summarizeChannels,
} = require('../lib/glFeuilletChannelClassify');
const { feuilletChapters, chapterPaysSet } = require('../lib/glFeuilletChapterMembership');
const { buildBulkPatch, buildBulkUpdateSql } = require('../lib/glFeuilletBulkPatch');
const { resolveLinkLabel, assembleFeuilletOverview } = require('../lib/glFeuilletAdminOverview');

// --- classifyFeuilletChannel ---

test('classifyFeuilletChannel : zone prioritaire si le code est couvert par une zone', () => {
  const zoneCodes = new Set(['z-1']);
  assert.strictEqual(
    classifyFeuilletChannel(
      { feuillet_code: 'z-1', lien_canal: 'espece', biome_slug: 'savane' },
      { zoneCodes },
    ),
    'zone',
  );
});

test('classifyFeuilletChannel : lien_canal avant pool', () => {
  assert.strictEqual(
    classifyFeuilletChannel({
      feuillet_code: 'a',
      lien_canal: 'espece_pays',
      biome_slug: 'savane',
    }),
    'lien:espece_pays',
  );
  assert.strictEqual(
    classifyFeuilletChannel({ feuillet_code: 'b', lienCanal: 'intro_pays' }),
    'lien:intro_pays',
  );
});

test('classifyFeuilletChannel : cascade biome → plateau → pays → orphan', () => {
  assert.strictEqual(
    classifyFeuilletChannel({ feuillet_code: 'c', biome_slug: 'taiga' }),
    'biome-pool',
  );
  assert.strictEqual(
    classifyFeuilletChannel({ feuillet_code: 'd', plateau_number: 3 }),
    'plateau-pool',
  );
  assert.strictEqual(classifyFeuilletChannel({ feuillet_code: 'e', lien_pays: 2 }), 'pays-pool');
  assert.strictEqual(classifyFeuilletChannel({ feuillet_code: 'f' }), 'orphan');
  assert.strictEqual(classifyFeuilletChannel(null), 'orphan');
});

test('classifyFeuilletChannel : chaînes vides ignorées (orphan)', () => {
  assert.strictEqual(
    classifyFeuilletChannel({ feuillet_code: 'g', lien_canal: '  ', biome_slug: '' }),
    'orphan',
  );
  assert.ok(isFeuilletOrphan({ feuillet_code: 'g' }));
});

test('summarizeChannels : compte par canal + liste des orphelins', () => {
  const items = [
    { feuillet_code: 'z-1' },
    { feuillet_code: 'a', lien_canal: 'espece' },
    { feuillet_code: 'b', biome_slug: 'savane' },
    { feuillet_code: 'c' },
    { feuillet_code: 'd' },
  ];
  const res = summarizeChannels(items, { zoneCodes: new Set(['z-1']) });
  assert.strictEqual(res.total, 5);
  assert.strictEqual(res.counts.zone, 1);
  assert.strictEqual(res.counts['lien:espece'], 1);
  assert.strictEqual(res.counts['biome-pool'], 1);
  assert.strictEqual(res.counts.orphan, 2);
  assert.deepStrictEqual(res.orphans.sort(), ['c', 'd']);
});

// --- feuilletChapters ---

const CHAPTERS = [
  { id: 1, name: 'Chapitre 1', plateau_number: 1, biomeSlugs: ['jungle_afc', 'savane'] },
  { id: 2, name: 'Chapitre 2', plateau_number: 2, biomeSlugs: ['sahara'] },
  { id: 5, name: 'Chapitre 5', plateau_number: 5, biomeSlugs: ['toundra'] },
];

test('feuilletChapters : rattache par biome', () => {
  const res = feuilletChapters({ biome_slug: 'savane' }, CHAPTERS);
  assert.deepStrictEqual(res, [{ id: 1, name: 'Chapitre 1' }]);
});

test('feuilletChapters : rattache par plateau', () => {
  const res = feuilletChapters({ plateau_number: 2 }, CHAPTERS);
  assert.deepStrictEqual(res, [{ id: 2, name: 'Chapitre 2' }]);
});

test('feuilletChapters : rattache par lien_pays (via biomes du chapitre)', () => {
  // pays 5 = toundra => chapitre 5.
  const res = feuilletChapters({ lien_pays: 5 }, CHAPTERS);
  assert.deepStrictEqual(res, [{ id: 5, name: 'Chapitre 5' }]);
});

test('feuilletChapters : aucun rattachement => []', () => {
  assert.deepStrictEqual(feuilletChapters({ biome_slug: 'inconnu' }, CHAPTERS), []);
  assert.deepStrictEqual(feuilletChapters({}, CHAPTERS), []);
});

test('chapterPaysSet : ensemble des pays couverts', () => {
  const set = chapterPaysSet(['savane', 'toundra', 'inconnu']);
  assert.deepStrictEqual([...set].sort(), [1, 5]);
});

// --- buildBulkPatch ---

test('buildBulkPatch : ne retient que les champs fournis et valides', () => {
  const { patch, errors } = buildBulkPatch({
    lien_canal: 'espece_pays',
    lien_pays: 3,
    statut: 'inactif',
    titre: 'ignoré',
  });
  assert.deepStrictEqual(errors, []);
  assert.deepStrictEqual(patch, { lien_canal: 'espece_pays', lien_pays: 3, statut: 'inactif' });
  assert.strictEqual('titre' in patch, false);
});

test('buildBulkPatch : chaîne vide sur champ nullable => null', () => {
  const { patch } = buildBulkPatch({ lien_canal: '', lien_ref: '  ', biome_slug: '' });
  assert.deepStrictEqual(patch, { lien_canal: null, lien_ref: null, biome_slug: null });
});

test('buildBulkPatch : valide les bornes des entiers', () => {
  const bad = buildBulkPatch({ lien_pays: 9, plateau_number: 0, cout_gemme: -1 });
  assert.strictEqual(bad.errors.length, 3);
  const ok = buildBulkPatch({ cout_gemme: 2, gain_coeur: 0 });
  assert.deepStrictEqual(ok.patch, { cout_gemme: 2, gain_coeur: 0 });
});

test('buildBulkPatch : statut invalide rejeté', () => {
  const { errors } = buildBulkPatch({ statut: 'zombie' });
  assert.strictEqual(errors.length, 1);
});

test('buildBulkUpdateSql : fragment paramétré pour les colonnes du patch', () => {
  const { setSql, params, columns } = buildBulkUpdateSql({ lien_canal: 'espece', lien_pays: 2 });
  assert.strictEqual(setSql, 'lien_canal = ?, lien_pays = ?');
  assert.deepStrictEqual(params, ['espece', 2]);
  assert.deepStrictEqual(columns, ['lien_canal', 'lien_pays']);
});

// --- resolveLinkLabel ---

test('resolveLinkLabel : résout le code espèce en nom', () => {
  const names = new Map([['SP0001', 'Fennec']]);
  assert.strictEqual(
    resolveLinkLabel({ lien_canal: 'espece', lien_ref: 'SP0001' }, names),
    'espece · Fennec (SP0001)',
  );
});

test('resolveLinkLabel : espece_pays avec pays', () => {
  assert.strictEqual(
    resolveLinkLabel({ lien_canal: 'espece_pays', lien_pays: 3 }),
    'espece_pays · pays 3',
  );
});

test('resolveLinkLabel : ref inconnue laissée telle quelle ; null si aucun lien', () => {
  assert.strictEqual(resolveLinkLabel({ lien_canal: 'espece', lien_ref: 'SPXX' }), 'espece · SPXX');
  assert.strictEqual(resolveLinkLabel({}), null);
});

// --- assembleFeuilletOverview ---

test('assembleFeuilletOverview : agrège canaux, chapitres, stats et liens résolus', () => {
  const feuillets = [
    { feuillet_code: 'ep-I-01', titre: 'Zone A', statut: 'actif', biome_slug: 'savane' },
    {
      feuillet_code: 'a',
      titre: 'Espèce',
      statut: 'actif',
      lien_canal: 'espece',
      lien_ref: 'SP0001',
    },
    { feuillet_code: 'orph', titre: 'Orphelin', statut: 'inactif' },
  ];
  const chapters = [{ id: 1, name: 'Chapitre 1', plateauNumber: 1, biomeSlugs: ['savane'] }];
  const zoneCodes = new Set(['ep-I-01']);
  const speciesNames = new Map([['SP0001', 'Fennec']]);
  const discoveryStats = new Map([['ep-I-01', { games: 2, teams: 3 }]]);

  const res = assembleFeuilletOverview({
    feuillets,
    chapters,
    zoneCodes,
    speciesNames,
    discoveryStats,
  });

  assert.strictEqual(res.total, 3);
  assert.strictEqual(res.active, 2);
  assert.strictEqual(res.channels.counts.zone, 1);
  assert.strictEqual(res.channels.counts['lien:espece'], 1);
  assert.deepStrictEqual(res.channels.orphans, ['orph']);
  // 'ep-I-01' rattaché au chapitre 1 (biome savane) ; les autres non.
  assert.deepStrictEqual(res.byChapter, [{ id: 1, name: 'Chapitre 1', count: 1 }]);
  assert.strictEqual(res.unassignedChapterCount, 2);

  const zoneItem = res.items.find((i) => i.feuilletCode === 'ep-I-01');
  assert.strictEqual(zoneItem.channel, 'zone');
  assert.deepStrictEqual(zoneItem.discovery, { games: 2, teams: 3 });
  const speciesItem = res.items.find((i) => i.feuilletCode === 'a');
  assert.strictEqual(speciesItem.linkLabel, 'espece · Fennec (SP0001)');
});
