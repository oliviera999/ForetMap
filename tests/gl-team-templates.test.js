'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeTeamTemplates } = require('../lib/gl/teamTemplates');

test('normalizeTeamTemplates : objet { classId: [équipes] }, type déduit du nom', () => {
  const { templates, error } = normalizeTeamTemplates({
    12: [{ name: 'gnomes sylvestres' }, { name: 'licornes aquatiques', type: 'unicorn' }],
  });
  assert.equal(error, undefined);
  assert.deepEqual(templates[12], [
    { name: 'gnomes sylvestres', type: 'gnome' },
    { name: 'licornes aquatiques', type: 'unicorn' },
  ]);
});

test('normalizeTeamTemplates refuse un nom en double et un type impossible', () => {
  assert.match(normalizeTeamTemplates({ 1: [{ name: 'Sources' }] }).error, /gnome ou licorne/i);
  assert.match(
    normalizeTeamTemplates({
      1: [{ name: 'gnomes a' }, { name: 'Gnomes A' }],
    }).error,
    /double/i,
  );
  assert.match(normalizeTeamTemplates([]).error, /objet/);
});
