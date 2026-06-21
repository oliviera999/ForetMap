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
