const test = require('node:test');
const assert = require('node:assert/strict');

async function load() {
  return import('../src/utils/mapLocationContext.js');
}

test('taskLocationIds fusionne zone_ids et zone_id', async () => {
  const { taskLocationIds } = await load();
  assert.deepEqual(
    taskLocationIds({ zone_ids: ['1'], zone_id: '2' }).zoneIds.sort(),
    ['1', '2'].sort(),
  );
});

test('tutorialsFromTasksAtLocation ignore les tâches terminées', async () => {
  const { tutorialsFromTasksAtLocation } = await load();
  const tu = { id: 9, title: 'T', is_active: true };
  const tasks = [
    { id: 1, zone_id: 'z1', status: 'done', tutorial_ids: [9] },
    { id: 2, zone_id: 'z1', status: 'available', tutorial_ids: [9] },
  ];
  const out = tutorialsFromTasksAtLocation('zone', 'z1', tasks, [tu]);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 9);
});

test('livingBeingNamesFromTasksAtLocation dédoublonne et respecte l’ordre', async () => {
  const { livingBeingNamesFromTasksAtLocation } = await load();
  const tasks = [
    { id: 1, marker_id: 'm1', status: 'available', living_beings_list: ['A', 'B'] },
    { id: 2, marker_id: 'm1', status: 'available', living_beings_list: ['A', 'C'] },
  ];
  const names = livingBeingNamesFromTasksAtLocation('marker', 'm1', tasks);
  assert.deepEqual(names, ['A', 'B', 'C']);
});
