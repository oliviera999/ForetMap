'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

async function loadPlantFilters() {
  const mod = await import(
    pathToFileURL(path.join(__dirname, '../src/utils/plantFilters.js')).href
  );
  return mod;
}

test('plantPresentOnActiveMap — zone, repère ou map_ids', async () => {
  const { plantPresentOnActiveMap, plantMatchesZonePresence, ZONE_PRESENCE_FILTER } =
    await loadPlantFilters();

  const plant = { id: 7, name: 'Merle', map_ids: ['foret'] };
  assert.equal(plantPresentOnActiveMap(plant, [], [], 'foret'), true);
  assert.equal(plantPresentOnActiveMap(plant, [], [], 'n3'), false);

  const zonePlant = { id: 8, name: 'Menthe' };
  const zones = [{ id: 'z1', species_ids: [8], living_beings_list: ['Menthe'] }];
  assert.equal(plantPresentOnActiveMap(zonePlant, zones, [], 'foret'), true);

  assert.equal(plantMatchesZonePresence(plant, [], [], ZONE_PRESENCE_FILTER.IN_MAP, 'foret'), true);
  assert.equal(
    plantMatchesZonePresence(plant, [], [], ZONE_PRESENCE_FILTER.NOT_IN_MAP, 'foret'),
    false,
  );
  assert.equal(plantMatchesZonePresence(plant, [], [], ZONE_PRESENCE_FILTER.IN_MAP, 'n3'), false);
});
