const test = require('node:test');
const assert = require('node:assert/strict');

async function loadModule() {
  return import('../src/utils/visitMascotState.js');
}

test('resolveVisitMascotState priorise happy sur walking', async () => {
  const { VISIT_MASCOT_STATE, resolveVisitMascotState } = await loadModule();
  assert.equal(resolveVisitMascotState({ happy: true, walking: true }), VISIT_MASCOT_STATE.HAPPY);
  assert.equal(resolveVisitMascotState({ happy: false, walking: true }), VISIT_MASCOT_STATE.WALKING);
  assert.equal(resolveVisitMascotState({ happy: false, walking: false }), VISIT_MASCOT_STATE.IDLE);
});

test('pickMascotDialog renvoie toujours une phrase pour les événements connus', async () => {
  const { pickMascotDialog } = await loadModule();
  const move = pickMascotDialog('move');
  const seen = pickMascotDialog('mark_seen');
  const idle = pickMascotDialog('idle');
  assert.equal(typeof move, 'string');
  assert.equal(typeof seen, 'string');
  assert.equal(typeof idle, 'string');
  assert.ok(move.length > 0);
  assert.ok(seen.length > 0);
  assert.ok(idle.length > 0);
});
