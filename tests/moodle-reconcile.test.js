'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { reconcileMembers, reconcileName, membersHashOf } = require('../lib/moodle/reconcile');

function byUser(result) {
  return Object.fromEntries(result.decisions.map((d) => [d.userId, d.decision]));
}

test('membersHashOf : indépendant de l’ordre et des doublons', () => {
  assert.strictEqual(membersHashOf(['b', 'a', 'a']), membersHashOf(['a', 'b']));
  assert.notStrictEqual(membersHashOf(['a']), membersHashOf(['a', 'b']));
  assert.match(membersHashOf([]), /^[0-9a-f]{64}$/);
});

test('table de décision : identique / identique → rien (I-8)', () => {
  const r = reconcileMembers({
    moodle: ['u1', 'u2'],
    foretmap: ['u1', 'u2'],
    last: ['u1', 'u2'],
    tracked: new Map([
      ['u1', 'sync'],
      ['u2', 'sync'],
    ]),
  });
  assert.deepStrictEqual(r.decisions, []);
  assert.deepStrictEqual(r.notices, []);
});

test('table de décision : le maître a bougé → propagation (ajout, retrait) ; adoption conservée ; suivi périmé oublié', () => {
  const r = reconcileMembers({
    moodle: ['u1', 'u3'],
    foretmap: ['u1', 'u2', 'u4'],
    last: ['u1', 'u2', 'u4', 'u8'],
    tracked: new Map([
      ['u1', 'sync'],
      ['u2', 'sync'],
      ['u4', 'manual'],
      ['u8', 'sync'],
    ]),
  });
  assert.deepStrictEqual(
    byUser(r),
    { u3: 'add', u2: 'remove', u8: 'untrack' },
    'u4 (adopté, resté à la main) : rien, I-4',
  );
  assert.strictEqual(r.decisions.find((d) => d.userId === 'u8').source, 'sync');
});

test('table de décision : accord non suivi → adoption, jamais de conflit', () => {
  const r = reconcileMembers({ moodle: ['u1'], foretmap: ['u1'], last: [], tracked: new Map() });
  assert.deepStrictEqual(byUser(r), { u1: 'adopt' });
});

test('table de décision : le reflet a bougé → conflits, sauf droit d’écrire vers le maître', () => {
  const args = {
    moodle: ['u1', 'u2'],
    foretmap: ['u2', 'u5'],
    last: ['u1', 'u2'],
    tracked: new Map([
      ['u1', 'sync'],
      ['u2', 'sync'],
    ]),
  };
  assert.deepStrictEqual(byUser(reconcileMembers(args)), {
    u1: 'conflict_removed',
    u5: 'conflict_added',
  });
  assert.deepStrictEqual(byUser(reconcileMembers({ ...args, pushMembership: true })), {
    u1: 'outbound_remove',
    u5: 'outbound_add',
  });
});

test('table de décision : les deux ont bougé → conflit systématique sur ce membre', () => {
  // u1 retiré côté ForetMap (F ≠ H) alors que Moodle l’a gardé ; u6 ajouté côté Moodle (M ≠ H).
  const r = reconcileMembers({
    moodle: ['u1', 'u6'],
    foretmap: [],
    last: ['u1'],
    tracked: new Map([['u1', 'sync']]),
  });
  assert.deepStrictEqual(byUser(r), { u1: 'conflict_removed', u6: 'add' });
});

test('filtre d’éligibilité : un compte exempté ou non élève n’ouvre pas de conflit', () => {
  const r = reconcileMembers({
    moodle: ['u1'],
    foretmap: ['prof'],
    last: ['u1'],
    tracked: new Map([['u1', 'sync']]),
    isEligible: (id) => id !== 'prof' && id !== 'u1',
  });
  assert.deepStrictEqual(r.decisions, []);
});

test('exception miroir d’équipe (master = foretmap) : reconstruit sans conflit, retouches Moodle signalées', () => {
  const r = reconcileMembers({
    moodle: ['u1', 'u9'], // u9 ajouté dans Moodle à la main, u2 retiré dans Moodle à la main
    foretmap: ['u1', 'u2'], // équipe G&L (maître)
    last: ['u1', 'u2'],
    tracked: new Map([
      ['u1', 'sync'],
      ['u2', 'sync'],
    ]),
    master: 'foretmap',
    teamMirror: true,
  });
  assert.ok(
    !r.decisions.some((d) => d.decision.startsWith('conflict')),
    JSON.stringify(r.decisions),
  );
  // Décisions appliquées au reflet (Moodle) : u2 remis, u9 retiré.
  assert.deepStrictEqual(byUser(r), { u2: 'add', u9: 'remove' });
  assert.deepStrictEqual(r.notices.map((n) => n.userId).sort(), ['u2', 'u9']);
  assert.ok(r.notices.every((n) => n.code === 'team_mirror_overwritten'));
  // Sans l'exception (master = foretmap, groupe ordinaire), la même divergence ouvrirait des conflits.
  const strict = reconcileMembers({
    moodle: ['u1', 'u9'],
    foretmap: ['u1', 'u2'],
    last: ['u1', 'u2'],
    tracked: new Map([
      ['u1', 'sync'],
      ['u2', 'sync'],
    ]),
    master: 'foretmap',
  });
  assert.deepStrictEqual(byUser(strict), { u2: 'conflict_removed', u9: 'conflict_added' });
});

test('master = foretmap sans miroir d’équipe : les rôles s’inversent, la table de décision reste la même', () => {
  const r = reconcileMembers({
    moodle: ['u7'],
    foretmap: [],
    last: [],
    tracked: new Map(),
    master: 'foretmap',
  });
  assert.deepStrictEqual(
    byUser(r),
    { u7: 'conflict_added' },
    'ajout fait côté reflet (Moodle) → conflit',
  );
});

test('reconcileName : renommage côté Moodle propagé, renommage côté ForetMap en conflit', () => {
  assert.strictEqual(reconcileName({ moodle: '6e 3', foretmap: '6e 3', last: '6e 3' }), 'noop');
  assert.strictEqual(
    reconcileName({ moodle: '6e 3 bis', foretmap: '6e 3', last: '6e 3' }),
    'rename',
  );
  assert.strictEqual(
    reconcileName({ moodle: '6e 3', foretmap: 'Ma classe', last: '6e 3' }),
    'conflict',
  );
  assert.strictEqual(
    reconcileName({ moodle: '6e 3 bis', foretmap: 'Ma classe', last: '6e 3' }),
    'conflict',
  );
  assert.strictEqual(
    reconcileName({ moodle: '6e 3 bis', foretmap: '6e 3', last: null }),
    'rename',
    'sans dernier état : le maître a raison',
  );
  assert.strictEqual(
    reconcileName({ moodle: '6e 3', foretmap: null, last: null }),
    'noop',
    'groupe pas encore créé',
  );
  assert.strictEqual(
    reconcileName({ moodle: 'x', foretmap: 'y', last: 'y', master: 'foretmap' }),
    'noop',
  );
});
