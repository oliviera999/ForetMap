'use strict';

// Tests purs (aucune BDD) du cache de sortie du HTML enrichi de tutoriel.
// Cf. `lib/tutorialViewCache.js` et l'audit `docs/AUDIT_GLOSSAIRE_FORETMAP_2026-08.md` (A4/A9).

const test = require('node:test');
const assert = require('node:assert');

const {
  fingerprintText,
  buildGlossaryIndexVersion,
  buildTutorialViewCacheKey,
  createTutorialViewCache,
  sharedTutorialViewCache,
  clearTutorialViewCache,
  NULL_UPDATED_AT,
} = require('../lib/tutorialViewCache');

/** Fausse fonction d'enrichissement : compte ses appels pour détecter les recalculs. */
function makeCompute(prefix = 'html') {
  let calls = 0;
  const compute = () => {
    calls += 1;
    return `${prefix}#${calls}`;
  };
  compute.getCalls = () => calls;
  return compute;
}

function keyFor({ id = 1, updatedAt = '2026-08-01T10:00:00Z', version = 'v1', html = '<p>a</p>' }) {
  return buildTutorialViewCacheKey({
    tutorialId: id,
    updatedAt,
    glossaryIndexVersion: version,
    htmlFingerprint: fingerprintText(html),
  });
}

test('même clé -> aucun recalcul au deuxième appel', async () => {
  const cache = createTutorialViewCache();
  const compute = makeCompute();
  const key = keyFor({});

  const first = await cache.getOrCompute(key, compute);
  const second = await cache.getOrCompute(key, compute);
  const third = await cache.getOrCompute(key, compute);

  assert.strictEqual(compute.getCalls(), 1);
  assert.strictEqual(first, 'html#1');
  assert.strictEqual(second, first);
  assert.strictEqual(third, first);
  assert.strictEqual(cache.stats().entries, 1);
});

test('`updated_at` différent -> recalcul', async () => {
  const cache = createTutorialViewCache();
  const compute = makeCompute();

  await cache.getOrCompute(keyFor({ updatedAt: '2026-08-01T10:00:00Z' }), compute);
  await cache.getOrCompute(keyFor({ updatedAt: '2026-08-02T11:30:00Z' }), compute);

  assert.strictEqual(compute.getCalls(), 2);
  assert.strictEqual(cache.stats().entries, 2);
});

test('version d’index glossaire différente -> recalcul', async () => {
  const cache = createTutorialViewCache();
  const compute = makeCompute();

  await cache.getOrCompute(keyFor({ version: 'v1' }), compute);
  await cache.getOrCompute(keyFor({ version: 'v1' }), compute);
  await cache.getOrCompute(keyFor({ version: 'v2' }), compute);

  assert.strictEqual(compute.getCalls(), 2);
});

test('HTML source modifié (même `updated_at`) -> recalcul', async () => {
  // Cas des tutoriels servis depuis `source_file_path` : le fichier peut changer sans
  // que la ligne SQL bouge.
  const cache = createTutorialViewCache();
  const compute = makeCompute();

  await cache.getOrCompute(keyFor({ html: '<p>version A</p>' }), compute);
  await cache.getOrCompute(keyFor({ html: '<p>version B</p>' }), compute);

  assert.strictEqual(compute.getCalls(), 2);
});

test('id de tutoriel différent -> entrées distinctes', async () => {
  const cache = createTutorialViewCache();
  const compute = makeCompute();

  await cache.getOrCompute(keyFor({ id: 1 }), compute);
  await cache.getOrCompute(keyFor({ id: 2 }), compute);

  assert.strictEqual(compute.getCalls(), 2);
});

test('`updated_at` NULL : mis en cache, mais jamais confondu avec une valeur réelle', async () => {
  const cache = createTutorialViewCache();
  const compute = makeCompute();

  const nullKey = keyFor({ updatedAt: null });
  // Construite directement : `keyFor` retomberait sur sa valeur par défaut.
  const undefinedKey = buildTutorialViewCacheKey({
    tutorialId: 1,
    glossaryIndexVersion: 'v1',
    htmlFingerprint: fingerprintText('<p>a</p>'),
  });
  const emptyKey = keyFor({ updatedAt: '' });

  // `null` et `undefined` donnent le même marqueur, distinct de la chaîne vide.
  assert.strictEqual(nullKey, undefinedKey);
  assert.notStrictEqual(nullKey, emptyKey);
  assert.ok(nullKey.includes(NULL_UPDATED_AT));

  // Le contenu reste mis en cache : c'est l'empreinte du HTML source qui garantit
  // l'identité en l'absence d'`updated_at`.
  await cache.getOrCompute(nullKey, compute);
  await cache.getOrCompute(nullKey, compute);
  assert.strictEqual(compute.getCalls(), 1);

  // Mais un HTML différent, toujours sans `updated_at`, est bien recalculé.
  await cache.getOrCompute(keyFor({ updatedAt: null, html: '<p>autre</p>' }), compute);
  assert.strictEqual(compute.getCalls(), 2);
});

test('éviction LRU : au-delà du plafond d’entrées, la plus ancienne disparaît', async () => {
  const cache = createTutorialViewCache({ maxEntries: 3 });
  const compute = makeCompute();

  for (const id of [1, 2, 3]) {
    await cache.getOrCompute(keyFor({ id }), compute);
  }
  assert.strictEqual(cache.stats().entries, 3);

  await cache.getOrCompute(keyFor({ id: 4 }), compute);
  assert.strictEqual(cache.stats().entries, 3);

  // La plus ancienne (id 1) est partie...
  assert.strictEqual(cache.get(keyFor({ id: 1 })), undefined);
  // ...les plus récentes sont restées.
  assert.notStrictEqual(cache.get(keyFor({ id: 2 })), undefined);
  assert.notStrictEqual(cache.get(keyFor({ id: 3 })), undefined);
  assert.notStrictEqual(cache.get(keyFor({ id: 4 })), undefined);
});

test('éviction LRU : une lecture rafraîchit l’entrée (réinsertion)', async () => {
  const cache = createTutorialViewCache({ maxEntries: 2 });
  const compute = makeCompute();

  await cache.getOrCompute(keyFor({ id: 1 }), compute);
  await cache.getOrCompute(keyFor({ id: 2 }), compute);
  // On relit l'entrée 1 : elle redevient la plus récente, c'est 2 qui doit sauter.
  cache.get(keyFor({ id: 1 }));
  await cache.getOrCompute(keyFor({ id: 3 }), compute);

  assert.notStrictEqual(cache.get(keyFor({ id: 1 })), undefined);
  assert.strictEqual(cache.get(keyFor({ id: 2 })), undefined);
  assert.notStrictEqual(cache.get(keyFor({ id: 3 })), undefined);
});

test('éviction : plafond d’octets cumulés respecté', async () => {
  const cache = createTutorialViewCache({ maxEntries: 100, maxBytes: 300 });

  for (const id of [1, 2, 3, 4, 5]) {
    // 100 octets par entrée -> 3 entrées maximum tiennent sous le plafond.
    await cache.getOrCompute(keyFor({ id }), () => 'x'.repeat(100));
  }

  const stats = cache.stats();
  assert.ok(stats.bytes <= 300, `octets cumulés=${stats.bytes}`);
  assert.strictEqual(stats.entries, 3);
  assert.strictEqual(cache.get(keyFor({ id: 1 })), undefined);
  assert.notStrictEqual(cache.get(keyFor({ id: 5 })), undefined);
});

test('un document plus lourd que le plafond global n’est pas mis en cache', async () => {
  const cache = createTutorialViewCache({ maxEntries: 10, maxBytes: 50 });
  const key = keyFor({ id: 9 });

  const value = await cache.getOrCompute(key, () => 'y'.repeat(500));

  // La valeur est bien renvoyée à l'appelant...
  assert.strictEqual(value.length, 500);
  // ...mais rien n'est conservé : le stocker viderait tout le cache pour lui seul.
  assert.strictEqual(cache.stats().entries, 0);
  assert.strictEqual(cache.stats().bytes, 0);
});

test('clear() vide tout : entrées et octets', async () => {
  const cache = createTutorialViewCache();
  const compute = makeCompute();

  await cache.getOrCompute(keyFor({ id: 1 }), compute);
  await cache.getOrCompute(keyFor({ id: 2 }), compute);
  assert.strictEqual(cache.stats().entries, 2);
  assert.ok(cache.stats().bytes > 0);

  cache.clear();
  assert.strictEqual(cache.stats().entries, 0);
  assert.strictEqual(cache.stats().bytes, 0);

  await cache.getOrCompute(keyFor({ id: 1 }), compute);
  assert.strictEqual(compute.getCalls(), 3);
});

test('clearTutorialViewCache() vide l’instance partagée du processus', async () => {
  const compute = makeCompute();
  clearTutorialViewCache();

  await sharedTutorialViewCache.getOrCompute(keyFor({ id: 42 }), compute);
  await sharedTutorialViewCache.getOrCompute(keyFor({ id: 42 }), compute);
  assert.strictEqual(compute.getCalls(), 1);

  clearTutorialViewCache();
  assert.strictEqual(sharedTutorialViewCache.stats().entries, 0);

  await sharedTutorialViewCache.getOrCompute(keyFor({ id: 42 }), compute);
  assert.strictEqual(compute.getCalls(), 2);
  clearTutorialViewCache();
});

test('une erreur de calcul n’est pas mise en cache', async () => {
  const cache = createTutorialViewCache();
  const key = keyFor({ id: 7 });

  await assert.rejects(
    () =>
      cache.getOrCompute(key, () => {
        throw new Error('boom');
      }),
    /boom/,
  );
  assert.strictEqual(cache.stats().entries, 0);

  const ok = await cache.getOrCompute(key, () => 'rendu');
  assert.strictEqual(ok, 'rendu');
});

test('buildGlossaryIndexVersion : stable par contenu, insensible à l’ordre des lignes', () => {
  const rows = [
    { glossary_code: 'humus', terme: 'Humus', variantes: 'humique' },
    { glossary_code: 'mycorhize', terme: 'Mycorhize', variantes: 'mycorhizes;mycorhizien' },
  ];
  const shuffled = [rows[1], rows[0]];

  assert.strictEqual(buildGlossaryIndexVersion(rows), buildGlossaryIndexVersion(shuffled));
  // Un rechargement TTL à contenu identique doit donner la même version, sinon le cache
  // de sortie serait invalidé toutes les 5 minutes pour rien (constat A9).
  assert.strictEqual(buildGlossaryIndexVersion(rows), buildGlossaryIndexVersion(rows.slice()));
});

test('buildGlossaryIndexVersion : change dès qu’un terme, une variante ou le nombre change', () => {
  const base = [{ glossary_code: 'humus', terme: 'Humus', variantes: 'humique' }];
  const v0 = buildGlossaryIndexVersion(base);

  assert.notStrictEqual(
    v0,
    buildGlossaryIndexVersion([{ glossary_code: 'humus', terme: 'Humus ', variantes: 'humique' }]),
  );
  assert.notStrictEqual(
    v0,
    buildGlossaryIndexVersion([{ glossary_code: 'humus', terme: 'Humus', variantes: 'humiques' }]),
  );
  assert.notStrictEqual(
    v0,
    buildGlossaryIndexVersion([...base, { glossary_code: 'litiere', terme: 'Litière' }]),
  );
  // Un terme passé en `statut = 'inactif'` disparaît de la requête : la version change.
  assert.notStrictEqual(v0, buildGlossaryIndexVersion([]));
});

test('buildGlossaryIndexVersion : accepte aussi les entrées construites { code, labels }', () => {
  const version = buildGlossaryIndexVersion([{ code: 'humus', labels: ['Humus', 'humique'] }]);
  assert.match(version, /^1:[0-9a-f]{40}$/);
  assert.notStrictEqual(version, buildGlossaryIndexVersion([{ code: 'humus', labels: ['Humus'] }]));
});

test('buildGlossaryIndexVersion : tolère null / lignes invalides', () => {
  assert.strictEqual(typeof buildGlossaryIndexVersion(null), 'string');
  assert.strictEqual(buildGlossaryIndexVersion(null), buildGlossaryIndexVersion([]));
  assert.strictEqual(buildGlossaryIndexVersion([null, 'x', 42]), buildGlossaryIndexVersion([]));
});

test('fingerprintText : longueur en octets + sha1, distingue les contenus proches', () => {
  assert.match(fingerprintText('abc'), /^3:[0-9a-f]{40}$/);
  assert.strictEqual(fingerprintText('abc'), fingerprintText('abc'));
  assert.notStrictEqual(fingerprintText('abc'), fingerprintText('abd'));
  // `null` / `undefined` sont normalisés en chaîne vide (pas de HTML = même empreinte).
  assert.strictEqual(fingerprintText(''), fingerprintText(null));
  assert.strictEqual(fingerprintText(''), fingerprintText(undefined));
  // La longueur est comptée en octets UTF-8, pas en points de code.
  assert.match(fingerprintText('é'), /^2:/);
});
