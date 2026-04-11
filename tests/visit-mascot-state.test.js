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

test('resolveVisitMascotState supporte les états étendus et la priorité explicite', async () => {
  const { VISIT_MASCOT_STATE, resolveVisitMascotState } = await loadModule();
  assert.equal(resolveVisitMascotState({ running: true }), VISIT_MASCOT_STATE.RUNNING);
  assert.equal(resolveVisitMascotState({ celebrating: true }), VISIT_MASCOT_STATE.CELEBRATE);
  assert.equal(resolveVisitMascotState({ inspecting: true }), VISIT_MASCOT_STATE.INSPECT);
  assert.equal(resolveVisitMascotState({ mapReading: true }), VISIT_MASCOT_STATE.MAP_READ);
  assert.equal(resolveVisitMascotState({ spinning: true }), VISIT_MASCOT_STATE.SPIN);
  assert.equal(resolveVisitMascotState({ talking: true }), VISIT_MASCOT_STATE.TALK);
  assert.equal(resolveVisitMascotState({ alert: true }), VISIT_MASCOT_STATE.ALERT);
  assert.equal(resolveVisitMascotState({ angry: true, happy: true }), VISIT_MASCOT_STATE.ANGRY);
  assert.equal(resolveVisitMascotState({ surprise: true }), VISIT_MASCOT_STATE.SURPRISE);
  assert.equal(resolveVisitMascotState({ state: 'talk', happy: true }), VISIT_MASCOT_STATE.TALK);
  assert.equal(resolveVisitMascotState({ state: 'inconnu', walking: true }), VISIT_MASCOT_STATE.WALKING);
});

test('pickMascotDialog renvoie toujours une phrase pour les événements connus', async () => {
  const { pickMascotDialog } = await loadModule();
  const move = pickMascotDialog('move');
  const seen = pickMascotDialog('mark_seen');
  const idle = pickMascotDialog('idle');
  const talk = pickMascotDialog('talk');
  const alert = pickMascotDialog('alert');
  const angry = pickMascotDialog('angry');
  const surprise = pickMascotDialog('surprise');
  const running = pickMascotDialog('running');
  const inspect = pickMascotDialog('inspect');
  const mapRead = pickMascotDialog('map_read');
  const celebrate = pickMascotDialog('celebrate');
  assert.equal(typeof move, 'string');
  assert.equal(typeof seen, 'string');
  assert.equal(typeof idle, 'string');
  assert.equal(typeof talk, 'string');
  assert.equal(typeof alert, 'string');
  assert.equal(typeof angry, 'string');
  assert.equal(typeof surprise, 'string');
  assert.equal(typeof running, 'string');
  assert.equal(typeof inspect, 'string');
  assert.equal(typeof mapRead, 'string');
  assert.equal(typeof celebrate, 'string');
  assert.ok(move.length > 0);
  assert.ok(seen.length > 0);
  assert.ok(idle.length > 0);
  assert.ok(talk.length > 0);
  assert.ok(alert.length > 0);
  assert.ok(angry.length > 0);
  assert.ok(surprise.length > 0);
  assert.ok(running.length > 0);
  assert.ok(inspect.length > 0);
  assert.ok(mapRead.length > 0);
  assert.ok(celebrate.length > 0);
});
