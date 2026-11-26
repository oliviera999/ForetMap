'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { collectAutoArchiveMapIds } = require('../lib/autoArchive');

test('collectAutoArchiveMapIds fusionne les cartes des tâches et des projets éligibles', async () => {
  const cutoff = new Date('2020-01-01T00:00:00.000Z');
  let call = 0;
  const mapIds = await collectAutoArchiveMapIds(
    {
      queryAll: async () => {
        call += 1;
        return call === 1 ? [{ map_id: 'foret' }, { map_id: 'foret' }] : [{ map_id: 'n3' }];
      },
    },
    cutoff,
  );
  assert.deepEqual(mapIds.sort(), ['foret', 'n3']);
});
