'use strict';

// Cache d'usage de la médiathèque (T1 de docs/AUDIT_CHARGE_BIODIVERSITE_2026-09.md).
//
// Ce que ces tests tiennent :
//   1. le coût du scan, mesuré et non estimé — c'est le chiffre que l'audit annonce ;
//   2. le fait que le cache le supprime entièrement au deuxième appel ;
//   3. le fait qu'une écriture le périme AUSSITÔT — la propriété qui autorise à cacher
//      un agrégat servant à prévenir avant une suppression de média ;
//   4. l'absence de collision entre les deux produits, qui partagent le module.
//
// Aucune base : `queryAll` est injecté, `listMediaLibraryItems` lit le disque (vide en test).

const { test } = require('node:test');
const assert = require('node:assert');
const {
  collectMediaLibraryUsage,
  createMediaLibraryUsageCache,
  FORETMAP_SOURCES,
  GL_SOURCES,
} = require('../lib/mediaLibraryUsage');

/** `queryAll` de comptage : colonnes plausibles, aucune ligne. */
function countingQueryAll() {
  const calls = [];
  const queryAll = async (sql) => {
    calls.push(String(sql));
    if (/^SHOW COLUMNS/.test(sql)) {
      return [{ Field: 'id' }, { Field: 'title' }, { Field: 'value_json' }];
    }
    return [];
  };
  return { queryAll, calls };
}

test('sans cache, le scan interroge deux fois chaque table source, à chaque appel', async () => {
  for (const [app, sources] of [
    ['foretmap', FORETMAP_SOURCES],
    ['gl', GL_SOURCES],
  ]) {
    const { queryAll, calls } = countingQueryAll();
    await collectMediaLibraryUsage({ queryAll }, { app });
    // Un SHOW COLUMNS + un SELECT par source : c'est le coût fixe que T1 décrit.
    assert.strictEqual(
      calls.length,
      sources.length * 2,
      `${app} : ${sources.length} sources attendues en ${sources.length * 2} requêtes`,
    );
    assert.strictEqual(calls.filter((s) => s.startsWith('SHOW COLUMNS')).length, sources.length);

    await collectMediaLibraryUsage({ queryAll }, { app });
    assert.strictEqual(calls.length, sources.length * 4, `${app} : second appel non caché`);
  }
});

test('avec cache, le deuxième appel ne coûte aucune requête et rend la même charge utile', async () => {
  const { queryAll, calls } = countingQueryAll();
  const cache = createMediaLibraryUsageCache({ writeVersion: () => 1 });

  const first = await collectMediaLibraryUsage({ queryAll }, { app: 'foretmap', cache });
  const afterFirst = calls.length;
  assert.ok(afterFirst > 0, 'le premier appel doit bien scanner');

  const second = await collectMediaLibraryUsage({ queryAll }, { app: 'foretmap', cache });
  assert.strictEqual(calls.length, afterFirst, 'le deuxième appel ne doit émettre aucune requête');
  assert.deepStrictEqual(second, first);
});

test('toute écriture périme le cache — un média supprimé ne peut pas passer inaperçu', async () => {
  const { queryAll, calls } = countingQueryAll();
  let writes = 7;
  const cache = createMediaLibraryUsageCache({ writeVersion: () => writes });

  await collectMediaLibraryUsage({ queryAll }, { app: 'foretmap', cache });
  const afterFirst = calls.length;

  await collectMediaLibraryUsage({ queryAll }, { app: 'foretmap', cache });
  assert.strictEqual(calls.length, afterFirst, 'sans écriture, le cache doit servir');

  // L'import comme la suppression d'un média écrivent au journal d'audit : la version bouge.
  writes += 1;
  await collectMediaLibraryUsage({ queryAll }, { app: 'foretmap', cache });
  assert.strictEqual(calls.length, afterFirst * 2, 'après écriture, le scan doit être refait');
});

test('les deux produits ne partagent pas la même entrée de cache', async () => {
  const { queryAll, calls } = countingQueryAll();
  const cache = createMediaLibraryUsageCache({ writeVersion: () => 1 });

  await collectMediaLibraryUsage({ queryAll }, { app: 'foretmap', cache });
  const afterForet = calls.length;
  assert.strictEqual(afterForet, FORETMAP_SOURCES.length * 2);

  // Si les clés se confondaient, G&L recevrait l'usage de ForetMap sans rien interroger.
  await collectMediaLibraryUsage({ queryAll }, { app: 'gl', cache });
  assert.strictEqual(calls.length, afterForet + GL_SOURCES.length * 2);
  assert.ok(
    calls.slice(afterForet).some((s) => s.includes('gl_chapters')),
    'le scan G&L doit bien avoir interrogé ses propres tables',
  );
});
