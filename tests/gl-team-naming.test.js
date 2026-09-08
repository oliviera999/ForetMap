'use strict';

// Tests purs (sans BDD) du nommage / couleurs / mascottes — lib/gl/teamNaming.js.
const { test } = require('node:test');
const assert = require('node:assert');
const { createSeededRng } = require('../lib/gl/teamComposition');
const {
  MASCOT_POOL_TOO_SMALL,
  TEAM_COLOR_PALETTE,
  buildTeamVocabulary,
  pickTeamNames,
  pickTeamColors,
  pickMascots,
  alternateTeamTypes,
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
});

test('alternateTeamTypes alterne les peuples et accepte un départ licorne', () => {
  assert.deepEqual(alternateTeamTypes(5), ['gnome', 'unicorn', 'gnome', 'unicorn', 'gnome']);
  assert.deepEqual(alternateTeamTypes(2, 'unicorn'), ['unicorn', 'gnome']);
  assert.deepEqual(alternateTeamTypes(0), []);
});
