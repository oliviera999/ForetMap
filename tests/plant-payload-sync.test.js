'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { syncNormalizedAndLegacyPlantFields } = require('../lib/plantPayloadSync');

test('syncNormalizedAndLegacyPlantFields — import legacy vers taxon', () => {
  const payload = syncNormalizedAndLegacyPlantFields({
    group_1: 'Végétal',
    optimal_ph: '6-7',
    ideal_temperature_c: '10-20',
  });
  assert.equal(payload.taxon_kingdom, 'Végétal');
  assert.equal(payload.ph_min, 6);
  assert.equal(payload.ph_max, 7);
  assert.equal(payload.temp_min_c, 10);
  assert.equal(payload.temp_max_c, 20);
  assert.equal(payload.group_1, undefined);
  assert.equal(payload.optimal_ph, undefined);
});

test('syncNormalizedAndLegacyPlantFields — origin_status', () => {
  assert.equal(
    syncNormalizedAndLegacyPlantFields({ origin_status: 'Envahissante' }).origin_status,
    'envahissant',
  );
  assert.equal(syncNormalizedAndLegacyPlantFields({ origin_status: 'n/a' }).origin_status, null);
});

test('syncNormalizedAndLegacyPlantFields — iucn_status', () => {
  assert.equal(syncNormalizedAndLegacyPlantFields({ iucn_status: 'vulnerable' }).iucn_status, 'VU');
  assert.equal(syncNormalizedAndLegacyPlantFields({ iucn_status: 'XYZ' }).iucn_status, null);
});

test('syncNormalizedAndLegacyPlantFields — taxon_rank breed / alias race', () => {
  assert.equal(syncNormalizedAndLegacyPlantFields({ taxon_rank: 'breed' }).taxon_rank, 'breed');
  assert.equal(syncNormalizedAndLegacyPlantFields({ taxon_rank: 'race' }).taxon_rank, 'breed');
  assert.equal(syncNormalizedAndLegacyPlantFields({ taxon_rank: 'subspecies' }).taxon_rank, null);
});
