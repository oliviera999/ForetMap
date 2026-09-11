'use strict';

/**
 * Contrôle de configuration Moodle (`lib/moodle/check.js`) : conseils de dépannage par
 * `errorcode`, et surtout le tri du cas `accessexception` sur `core_webservice_get_site_info`
 * — refus global du jeton ou simple fonction absente du service externe.
 */

const test = require('node:test');
const assert = require('node:assert');
const {
  runMoodleCheck,
  summarizeError,
  ERROR_HINTS,
  SITE_INFO_ACCESS_HINTS,
  PROBE_FUNCTION,
} = require('../lib/moodle/check');
const {
  createMoodleClient,
  MoodleApiError,
  MoodleTransportError,
} = require('../lib/moodle/client');
const { compilePolicies, DEFAULT_POLICIES } = require('../lib/moodle/policies');
const { createFakeMoodleServer } = require('./helpers/fakeMoodleServer');

const silentLog = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return silentLog;
  },
};

const SETTINGS = {
  yearPrefix: '26',
  policies: DEFAULT_POLICIES,
  compiledPolicies: compilePolicies(DEFAULT_POLICIES, '26'),
  chapterCourses: {},
};

/** Serveur bidon démarré, client branché dessus, arrêt garanti. */
async function withFake(options, fn) {
  const fake = createFakeMoodleServer(options);
  await fake.start();
  const client = createMoodleClient({
    baseUrl: fake.baseUrl,
    token: options.token || 'test-token',
    retryDelaysMs: [],
    log: silentLog,
  });
  try {
    return await fn({ fake, client });
  } finally {
    await fake.stop();
  }
}

test('check : site joignable, toutes les fonctions autorisées', async () => {
  await withFake({}, async ({ fake, client }) => {
    fake.addCohort({ id: 1, name: '6e3', idnumber: '26#603' });
    const report = await runMoodleCheck({ client, settings: SETTINGS });
    assert.strictEqual(report.ok, true);
    assert.strictEqual(report.functionsUnknown, false);
    assert.strictEqual(report.tokenProbe, null);
    assert.deepStrictEqual(report.missingFunctions, []);
    assert.ok(report.functions.every((f) => f.allowed === true));
    assert.deepStrictEqual(
      report.cohorts.map((c) => [c.idnumber, c.policyKey]),
      [['26#603', 'classe6']],
    );
  });
});

test('check : seule core_webservice_get_site_info manque au service → contrôle poursuivi', async () => {
  const functions = createFakeMoodleServer().state.functions.filter(
    (f) => f !== 'core_webservice_get_site_info',
  );
  await withFake({ functions }, async ({ fake, client }) => {
    fake.addCohort({ id: 7, name: '6e3', idnumber: '26#603' });
    fake.addCohort({ id: 8, name: 'Club', idnumber: '26#club-echecs' });
    const report = await runMoodleCheck({ client, settings: SETTINGS });

    assert.strictEqual(report.ok, false);
    assert.strictEqual(report.functionsUnknown, true);
    assert.strictEqual(report.site, null);
    // Indéterminé, jamais « manquante » : le service n'a pas été listé.
    assert.ok(report.functions.every((f) => f.allowed === null));
    assert.deepStrictEqual(report.missingFunctions, []);
    // La sonde a répondu : le jeton s'authentifie.
    assert.deepStrictEqual(report.tokenProbe, {
      wsfunction: PROBE_FUNCTION,
      ok: true,
      scope: 'function',
      errorcode: null,
      message: null,
    });
    assert.strictEqual(report.errors.length, 1);
    assert.strictEqual(report.errors[0].step, 'site_info');
    assert.strictEqual(report.errors[0].errorcode, 'accessexception');
    assert.strictEqual(report.errors[0].hint, SITE_INFO_ACCESS_HINTS.function);
    // Le reste du contrôle a bien été mené malgré tout.
    assert.deepStrictEqual(
      report.cohorts.map((c) => c.idnumber),
      ['26#603', '26#club-echecs'],
    );
    assert.deepStrictEqual(report.cohortsOfYearWithoutPolicy, ['26#club-echecs']);
  });
});

test('check : sonde admise puis refusée (politique du site) → conseil sans « a répondu »', async () => {
  const functions = createFakeMoodleServer().state.functions.filter(
    (f) => f !== 'core_webservice_get_site_info',
  );
  await withFake({ functions }, async ({ fake, client }) => {
    fake.addCohort({ id: 7, name: '6e 3', idnumber: '26#603' });
    fake.state.failFor = {
      core_cohort_search_cohorts: {
        errorcode: 'sitepolicynotagreed',
        message: 'Politique du site pas acceptée',
      },
    };
    const report = await runMoodleCheck({ client, settings: SETTINGS });

    // La sonde a été admise par le service, donc `site_info` manque bien — mais elle n'a pas
    // « répondu » : le conseil ne doit pas le prétendre.
    assert.strictEqual(report.tokenProbe.ok, false);
    assert.strictEqual(report.tokenProbe.scope, 'function');
    assert.strictEqual(report.tokenProbe.errorcode, 'sitepolicynotagreed');
    assert.strictEqual(report.errors[0].hint, SITE_INFO_ACCESS_HINTS.functionOther);
    assert.ok(!/a répondu/.test(report.errors[0].hint));

    // Le refus des cohortes est reporté avec son propre conseil, sans rejouer l'appel.
    const cohorts = report.errors.find((e) => e.step === 'cohorts');
    assert.strictEqual(cohorts.errorcode, 'sitepolicynotagreed');
    assert.strictEqual(cohorts.hint, ERROR_HINTS.sitepolicynotagreed);
    assert.strictEqual(
      fake.calls.filter((c) => c.wsfunction === 'core_cohort_search_cohorts').length,
      1,
    );
    assert.deepStrictEqual(report.cohorts, []);
  });
});

test('check : aucune fonction accessible → refus global, contrôle arrêté', async () => {
  await withFake({ functions: [] }, async ({ fake, client }) => {
    fake.addCohort({ id: 7, name: '6e3', idnumber: '26#603' });
    const report = await runMoodleCheck({ client, settings: SETTINGS });

    assert.strictEqual(report.ok, false);
    assert.strictEqual(report.functionsUnknown, false);
    assert.deepStrictEqual(report.functions, []);
    assert.deepStrictEqual(report.cohorts, []);
    assert.strictEqual(report.tokenProbe.ok, false);
    assert.strictEqual(report.tokenProbe.scope, 'global');
    assert.strictEqual(report.tokenProbe.errorcode, 'accessexception');
    assert.strictEqual(report.errors[0].hint, SITE_INFO_ACCESS_HINTS.global);
  });
});

test('check : jeton invalide → conseil de rotation, pas de sonde', async () => {
  await withFake({}, async ({ fake, client }) => {
    fake.state.token = 'un-autre-jeton';
    const report = await runMoodleCheck({ client, settings: SETTINGS });
    assert.strictEqual(report.ok, false);
    assert.strictEqual(report.tokenProbe, null);
    assert.strictEqual(report.errors[0].errorcode, 'invalidtoken');
    assert.strictEqual(report.errors[0].hint, ERROR_HINTS.invalidtoken);
    // Un seul appel : on ne sonde pas un jeton que Moodle ne reconnaît pas.
    assert.strictEqual(fake.calls.length, 1);
  });
});

test('summarizeError : exception et debuginfo conservés, conseil par errorcode', () => {
  const api = summarizeError(
    new MoodleApiError('core_cohort_search_cohorts', {
      exception: 'webservice_access_exception',
      errorcode: 'accessexception',
      message: 'Exception du contrôle d’accès',
      debuginfo: 'Access to the function is not allowed',
    }),
  );
  assert.strictEqual(api.kind, 'api');
  assert.strictEqual(api.exception, 'webservice_access_exception');
  assert.strictEqual(api.debuginfo, 'Access to the function is not allowed');
  assert.strictEqual(api.hint, ERROR_HINTS.accessexception);

  const transport = summarizeError(
    new MoodleTransportError('core_webservice_get_site_info', 'délai dépassé'),
  );
  assert.strictEqual(transport.kind, 'transport');
  assert.strictEqual(transport.errorcode, null);
  assert.ok(/MOODLE_WS_TIMEOUT_MS/.test(transport.hint));
});
