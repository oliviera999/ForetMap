'use strict';

// Tests purs (sans BDD) du nommage / couleurs / mascottes — lib/gl/teamNaming.js.
const { test } = require('node:test');
const assert = require('node:assert');
const { createSeededRng } = require('../lib/gl/teamComposition');
const {
  MASCOT_POOL_TOO_SMALL,
  TEAM_COLOR_PALETTE,
  GNOME_TEAM_NAMES,
  UNICORN_TEAM_NAMES,
  buildTeamVocabulary,
  pickTeamNames,
  pickTeamColors,
  pickMascots,
  alternateTeamTypes,
  typeFromTeamName,
} = require('../lib/gl/teamNaming');

test('buildTeamVocabulary : biomes, mots porteurs du titre, plateau, sans doublon', () => {
  const words = buildTeamVocabulary({
    chapterTitle: 'Les Sources du Nord',
    plateauNumber: 2,
    biomeNames: ['Forêt', 'Savane', 'forêt'],
  });
  assert.deepEqual(words, ['Forêt', 'Savane', 'Sources', 'Nord', 'Plateau 2']);
  assert.deepEqual(buildTeamVocabulary({}), []);
});

test('pickTeamNames : distincts, vocabulaire d’abord, repli neutre puis « Équipe N »', () => {
  const rng = createSeededRng(4);
  const names = pickTeamNames({ count: 3, vocabulary: ['Forêt', 'Savane'], rng });
  assert.equal(names.length, 3);
  assert.equal(new Set(names.map((n) => n.toLowerCase())).size, 3);
  assert.ok(names.includes('Forêt') && names.includes('Savane'));

  const many = pickTeamNames({ count: 20, vocabulary: [], rng: createSeededRng(1) });
  assert.equal(new Set(many).size, 20);
  assert.ok(many.some((n) => /^Équipe \d+$/.test(n)));

  const excluded = pickTeamNames({
    count: 1,
    vocabulary: ['Forêt'],
    exclude: ['forêt'],
    rng: createSeededRng(2),
  });
  assert.notEqual(excluded[0].toLowerCase(), 'forêt');
  assert.deepEqual(pickTeamNames({ count: 0, rng }), []);
});

test('pickTeamColors : distinctes tant que la palette suffit, jamais celles exclues', () => {
  const colors = pickTeamColors({ count: 8, rng: createSeededRng(3), exclude: ['#22c55e'] });
  assert.equal(new Set(colors).size, 8);
  assert.ok(!colors.includes('#22c55e'));
  assert.ok(colors.every((c) => TEAM_COLOR_PALETTE.includes(c)));
  assert.equal(pickTeamColors({ count: 15, rng: createSeededRng(3) }).length, 15);
});

test('pickMascots : bon peuple, sans doublon, réduit les équipes si le vivier manque', () => {
  const catalog = [
    { id: 'g1', type: 'gnome' },
    { id: 'g2', type: 'gnome' },
    { id: 'u1', type: 'unicorn' },
    { id: 'fm', type: undefined }, // mascotte ForetMap sans peuple : ignorée
  ];
  const ok = pickMascots({
    types: ['gnome', 'unicorn', 'gnome'],
    catalog,
    rng: createSeededRng(8),
  });
  assert.deepEqual(ok.warnings, []);
  assert.equal(ok.mascotIds.length, 3);
  assert.equal(new Set(ok.mascotIds).size, 3);
  assert.ok(catalog.find((m) => m.id === ok.mascotIds[1]).type === 'unicorn');

  const short = pickMascots({
    types: ['gnome', 'unicorn', 'gnome', 'unicorn'],
    catalog,
    exclude: ['g2'],
    rng: createSeededRng(8),
  });
  assert.deepEqual(short.warnings, [MASCOT_POOL_TOO_SMALL]);
  assert.deepEqual(short.usableTypes, ['gnome', 'unicorn']);
  assert.equal(short.mascotIds.length, 2);

  // keepSlots (composition automatique) : le nombre d'équipes ne dépend pas des packs publiés ;
  // une équipe sans pack disponible garde sa case, à null, et jamais un doublon.
  const kept = pickMascots({
    types: ['gnome', 'unicorn', 'gnome', 'unicorn'],
    catalog,
    exclude: ['g2'],
    rng: createSeededRng(8),
    keepSlots: true,
  });
  assert.deepEqual(kept.warnings, [MASCOT_POOL_TOO_SMALL]);
  assert.deepEqual(kept.usableTypes, ['gnome', 'unicorn', 'gnome', 'unicorn']);
  assert.deepEqual(kept.mascotIds, ['g1', 'u1', null, null]);
  assert.ok(!kept.mascotIds.includes('fm'), 'un pack sans peuple n’est jamais tiré');
});

test('alternateTeamTypes alterne les peuples et accepte un départ licorne', () => {
  assert.deepEqual(alternateTeamTypes(5), ['gnome', 'unicorn', 'gnome', 'unicorn', 'gnome']);
  assert.deepEqual(alternateTeamTypes(2, 'unicorn'), ['unicorn', 'gnome']);
  assert.deepEqual(alternateTeamTypes(0), []);
});

test('typeFromTeamName déduit gnome / licorne du premier mot', () => {
  assert.equal(typeFromTeamName('gnomes sylvestres'), 'gnome');
  assert.equal(typeFromTeamName('Licornes des eaux'), 'unicorn');
  assert.equal(typeFromTeamName('  GNOME montagnards'), 'gnome');
  assert.equal(typeFromTeamName('Sources du nord'), null);
});

test('pickTeamNames typé : liste du peuple, jamais un nom déjà porté dans la classe, repli quand la liste est épuisée', () => {
  const rng = createSeededRng(11);
  const names = pickTeamNames({ count: 4, rng, types: ['gnome', 'unicorn', 'gnome', 'unicorn'] });
  assert.equal(names.length, 4);
  assert.ok(GNOME_TEAM_NAMES.includes(names[0]) && GNOME_TEAM_NAMES.includes(names[2]));
  assert.ok(UNICORN_TEAM_NAMES.includes(names[1]) && UNICORN_TEAM_NAMES.includes(names[3]));
  assert.equal(new Set(names).size, 4);
  for (const n of names) assert.ok(!/chapitre|plateau|tropiques|africains/i.test(n));

  // Les noms déjà portés dans la classe cette année sont exclus (même à la casse près).
  const exclude = GNOME_TEAM_NAMES.slice(0, 11).map((n) => n.toUpperCase());
  const reste = pickTeamNames({ count: 1, rng: createSeededRng(3), types: ['gnome'], exclude });
  assert.deepEqual(reste, [GNOME_TEAM_NAMES[11]]);

  // Liste épuisée : repli sur le vocabulaire puis « Équipe N », sans doublon.
  const epuise = pickTeamNames({
    count: 2,
    rng: createSeededRng(5),
    types: ['gnome', 'gnome'],
    exclude: [...GNOME_TEAM_NAMES],
    vocabulary: ['Clairière'],
  });
  assert.equal(epuise.length, 2);
  assert.ok(!GNOME_TEAM_NAMES.includes(epuise[0]) && !GNOME_TEAM_NAMES.includes(epuise[1]));
});
