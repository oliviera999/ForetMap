'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  normalizePersonName,
  normalizeEmail,
  runUpstreamChecks,
  matchMembers,
} = require('../lib/moodle/matching');

function user(id, { type = 'student', email = null, first = '', last = '', exempt = 0 } = {}) {
  return {
    id,
    user_type: type,
    email,
    first_name: first,
    last_name: last,
    is_active: 1,
    sync_exempt: exempt,
    auth_provider: 'local',
    pseudo: null,
  };
}

function indexes(users, identities = []) {
  const usersByEmail = new Map();
  const studentsByName = new Map();
  for (const u of users) {
    const e = normalizeEmail(u.email);
    if (e) usersByEmail.set(e, [...(usersByEmail.get(e) || []), u]);
    if (u.user_type === 'student') {
      const k = normalizePersonName(u.first_name, u.last_name);
      studentsByName.set(k, [...(studentsByName.get(k) || []), u]);
    }
  }
  const identitiesByExternalId = new Map();
  const identitiesByUserId = new Map();
  for (const i of identities) {
    identitiesByExternalId.set(String(i.external_id), i);
    identitiesByUserId.set(String(i.user_id), i);
  }
  return { usersByEmail, studentsByName, identitiesByExternalId, identitiesByUserId };
}

test('normalizePersonName : accents, casse, tirets et espaces multiples', () => {
  assert.strictEqual(
    normalizePersonName('Élodie', 'De La  Tour'),
    normalizePersonName('elodie', 'de-la-tour'),
  );
  assert.strictEqual(
    normalizePersonName(' Jean-Baptiste ', 'N’Guyen'),
    normalizePersonName('jean baptiste', 'n’guyen'),
  );
  assert.strictEqual(normalizePersonName('', ''), '');
});

test('runUpstreamChecks : e-mail absent, domaine interdit, doublon → laissés de côté', () => {
  const { skips } = runUpstreamChecks({
    members: [
      { id: 1, email: 'a@lyautey.ma' },
      { id: 2, email: '' },
      { id: 3, email: 'A@Lyautey.ma' },
      { id: 4, email: 'x@gmail.com' },
      { id: 5, email: '', suspended: true },
    ],
    emailDomains: ['lyautey.ma'],
  });
  assert.deepStrictEqual(skips.map((e) => e.code).sort(), [
    'duplicate_email',
    'duplicate_email',
    'email_domain_not_allowed',
    'member_without_email',
  ]);
});

test('runUpstreamChecks : membre déjà lié sans e-mail → pas écarté', () => {
  const { skips } = runUpstreamChecks({
    members: [{ id: 9, email: '', username: 'deja' }],
    linkedExternalIds: new Set(['9']),
  });
  assert.deepStrictEqual(skips, []);
});

test('runUpstreamChecks : déjà lié + doublon / domaine → le lié reste, l’autre est écarté', () => {
  const { skips } = runUpstreamChecks({
    members: [
      { id: 10, email: 'a@lyautey.ma', username: 'lie' },
      { id: 11, email: 'A@Lyautey.ma', username: 'fantome' },
      { id: 12, email: 'perso@gmail.com', username: 'hors-domaine' },
    ],
    emailDomains: ['lyautey.ma'],
    linkedExternalIds: new Set(['10', '12']),
  });
  assert.deepStrictEqual(skips.map((s) => `${s.code}:${s.externalId}`).sort(), [
    'duplicate_email:11',
  ]);
});

test('matchMembers : les quatre règles dans l’ordre', () => {
  const linked = user('u-linked', { email: 'linked@x.test', first: 'Lina', last: 'Kedd' });
  const byEmail = user('u-email', { email: 'zoe@x.test', first: 'Zoé', last: 'Martin' });
  const byName = user('u-name', { email: null, first: 'Paul', last: 'Durand' });
  const teacher = user('t-1', { type: 'teacher', email: 'prof@x.test', first: 'Prof', last: 'X' });
  const homonymA = user('u-h1', { first: 'Ali', last: 'Ben' });
  const homonymB = user('u-h2', { first: 'Ali', last: 'Ben' });
  const idx = indexes(
    [linked, byEmail, byName, teacher, homonymA, homonymB],
    [{ external_id: '100', user_id: 'u-linked', origin: 'created', user: linked }],
  );
  const members = [
    { id: 100, firstname: 'Lina', lastname: 'Kedd', email: 'other@x.test' }, // identité connue prime
    { id: 101, firstname: 'Zoe', lastname: 'Martin', email: 'ZOE@x.test' }, // e-mail
    { id: 102, firstname: 'Paul', lastname: 'Durand', email: 'p.durand@x.test' }, // nom unique
    { id: 103, firstname: 'Prof', lastname: 'X', email: 'prof@x.test' }, // e-mail enseignant → conflit
    { id: 104, firstname: 'Ali', lastname: 'Ben', email: 'ali@x.test' }, // homonymes locaux → attente
    { id: 105, firstname: 'Neo', lastname: 'Vu', email: 'neo@x.test' }, // création
    { id: 106, firstname: 'Nop', lastname: 'Pas', email: 'nop@x.test' }, // création interdite
  ];
  const decisions = matchMembers({ members, ...idx, canCreate: (m) => m.id !== 106 });
  assert.strictEqual(decisions.get('100').rule, 'identity');
  assert.strictEqual(decisions.get('101').rule, 'email');
  assert.strictEqual(decisions.get('101').userId, 'u-email');
  assert.strictEqual(decisions.get('102').rule, 'name');
  assert.strictEqual(decisions.get('103').rule, 'conflict');
  assert.strictEqual(decisions.get('103').reason, 'email_on_teacher_account');
  assert.strictEqual(decisions.get('104').rule, 'pending');
  assert.strictEqual(decisions.get('104').candidates.length, 2);
  assert.strictEqual(decisions.get('105').rule, 'create');
  assert.strictEqual(decisions.get('106').rule, 'skipped');
});

test('matchMembers : homonymes côté Moodle → attente ; compte exempt → exempt ; compte déjà lié → conflit', () => {
  const local = user('u-1', { first: 'Sam', last: 'Roy' });
  const exempt = user('u-ex', { email: 'ex@x.test', first: 'Ex', last: 'Empt', exempt: 1 });
  const taken = user('u-taken', { email: 'taken@x.test', first: 'Ta', last: 'Ken' });
  const idx = indexes(
    [local, exempt, taken],
    [{ external_id: '900', user_id: 'u-taken', origin: 'linked', user: taken }],
  );
  const members = [
    { id: 1, firstname: 'Sam', lastname: 'Roy', email: 's1@x.test' },
    { id: 2, firstname: 'Sam', lastname: 'Roy', email: 's2@x.test' },
    { id: 3, firstname: 'Ex', lastname: 'Empt', email: 'ex@x.test' },
    { id: 4, firstname: 'Ta', lastname: 'Ken', email: 'taken@x.test' },
  ];
  const decisions = matchMembers({ members, ...idx, canCreate: () => true });
  assert.strictEqual(decisions.get('1').rule, 'pending');
  assert.strictEqual(decisions.get('1').reason, 'moodle_homonyms');
  assert.strictEqual(decisions.get('2').rule, 'pending');
  assert.strictEqual(decisions.get('3').rule, 'exempt');
  assert.strictEqual(decisions.get('4').rule, 'conflict');
  assert.strictEqual(decisions.get('4').reason, 'account_linked_to_other_member');
});
