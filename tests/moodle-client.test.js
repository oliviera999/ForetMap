'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  encodeMoodleParams,
  createMoodleClient,
  MoodleApiError,
  MoodleTransportError,
} = require('../lib/moodle/client');
const { readMoodleEnv, isMoodleConfigured, notConfiguredError } = require('../lib/moodle/config');
const { createFakeMoodleServer, parseNested } = require('./helpers/fakeMoodleServer');

const silentLog = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return silentLog;
  },
};

test('encodeMoodleParams : listes, objets imbriqués, booléens, valeurs nulles omises', () => {
  const pairs = encodeMoodleParams({
    cohortids: [12, 13],
    members: [{ groupid: 7, userid: 42 }],
    context: { contextid: 1 },
    flag: true,
    none: null,
    query: '',
  });
  assert.deepStrictEqual(pairs, [
    ['cohortids[0]', '12'],
    ['cohortids[1]', '13'],
    ['members[0][groupid]', '7'],
    ['members[0][userid]', '42'],
    ['context[contextid]', '1'],
    ['flag', '1'],
    ['query', ''],
  ]);
  assert.throws(() => encodeMoodleParams('x'), TypeError);
});

test('parseNested (faux serveur) inverse encodeMoodleParams', () => {
  const form = new URLSearchParams();
  for (const [k, v] of encodeMoodleParams({ cohortids: [12, 13], members: [{ groupid: 7 }] }))
    form.append(k, v);
  const parsed = parseNested(form);
  assert.deepStrictEqual(parsed, { cohortids: ['12', '13'], members: [{ groupid: '7' }] });
});

test('readMoodleEnv : non configuré sans jeton, interrupteur MOODLE_SYNC_ENABLED=0', () => {
  assert.strictEqual(readMoodleEnv({}).configured, false);
  assert.strictEqual(
    isMoodleConfigured({ MOODLE_BASE_URL: 'https://m.test/', MOODLE_WS_TOKEN: 'abc' }),
    true,
  );
  const cfg = readMoodleEnv({ MOODLE_BASE_URL: 'https://m.test/', MOODLE_WS_TOKEN: 'abc' });
  assert.strictEqual(cfg.baseUrl, 'https://m.test');
  const off = readMoodleEnv({
    MOODLE_BASE_URL: 'https://m.test',
    MOODLE_WS_TOKEN: 'abc',
    MOODLE_SYNC_ENABLED: '0',
  });
  assert.strictEqual(off.configured, false);
  assert.strictEqual(off.killSwitchOff, true);
  assert.strictEqual(notConfiguredError().status, 503);
});

test('client : site_info, erreur applicative en HTTP 200 sans réessai, réessai sur 5xx', async () => {
  const fake = createFakeMoodleServer();
  await fake.start();
  try {
    const client = createMoodleClient({
      baseUrl: fake.baseUrl,
      token: fake.state.token,
      retryDelaysMs: [0, 0],
      log: silentLog,
    });
    const info = await client.siteInfo();
    assert.strictEqual(info.sitename, 'Moodle de test');
    assert.ok(Array.isArray(info.functions));

    // Jeton invalide : HTTP 200 + errorcode → MoodleApiError, une seule requête.
    const bad = createMoodleClient({
      baseUrl: fake.baseUrl,
      token: 'nope',
      retryDelaysMs: [0, 0],
      log: silentLog,
    });
    fake.resetCalls();
    await assert.rejects(
      bad.siteInfo(),
      (err) => err instanceof MoodleApiError && err.errorcode === 'invalidtoken',
    );
    assert.strictEqual(fake.calls.length, 1);

    // 5xx : réessayé, puis succès.
    fake.resetCalls();
    fake.state.failNext = { status: 503 };
    const again = await client.siteInfo();
    assert.strictEqual(again.sitename, 'Moodle de test');
    assert.strictEqual(fake.calls.length, 2);

    // Fonction non autorisée → accessexception.
    fake.state.functions = fake.state.functions.filter((f) => f !== 'core_cohort_search_cohorts');
    await assert.rejects(
      client.searchCohorts(''),
      (err) => err instanceof MoodleApiError && err.errorcode === 'accessexception',
    );
  } finally {
    await fake.stop();
  }
});

test('client : lots de 100 en série et paramètres encodés côté serveur', async () => {
  const fake = createFakeMoodleServer();
  await fake.start();
  try {
    const client = createMoodleClient({
      baseUrl: fake.baseUrl,
      token: fake.state.token,
      retryDelaysMs: [],
      log: silentLog,
    });
    for (let i = 1; i <= 250; i += 1)
      fake.addUser({
        id: i,
        username: `u${i}`,
        firstname: 'U',
        lastname: String(i),
        email: `u${i}@x.test`,
      });
    const users = await client.getUsersByIds(Array.from({ length: 250 }, (_, i) => i + 1));
    assert.strictEqual(users.length, 250);
    const calls = fake.callsFor('core_user_get_users_by_field');
    assert.strictEqual(calls.length, 3);
    assert.strictEqual(calls[0].params.values.length, 100);
    assert.strictEqual(calls[2].params.values.length, 50);

    fake.addCohort({ id: 5, name: 'C', idnumber: '26#601' });
    await client.addCohortMembers([{ cohortid: 5, userid: 7 }]);
    const add = fake.callsFor('core_cohort_add_cohort_members')[0];
    assert.deepStrictEqual(add.params.members[0], {
      cohorttype: { type: 'id', value: '5' },
      usertype: { type: 'id', value: '7' },
    });
    assert.deepStrictEqual(fake.cohortMembers(5), ['7']);
  } finally {
    await fake.stop();
  }
});

test('client : erreur réseau → MoodleTransportError après épuisement des réessais', async () => {
  const client = createMoodleClient({
    baseUrl: 'http://127.0.0.1:9',
    token: 't',
    retryDelaysMs: [0],
    log: silentLog,
    fetchImpl: async () => {
      throw new Error('ECONNREFUSED');
    },
  });
  await assert.rejects(
    client.siteInfo(),
    (err) => err instanceof MoodleTransportError && err.retryable === true,
  );
});
