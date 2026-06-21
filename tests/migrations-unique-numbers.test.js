'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert');

test('chaque préfixe numérique migrations/NNN_ est unique', () => {
  const dir = path.join(__dirname, '..', 'migrations');
  const byNum = new Map();
  for (const file of fs.readdirSync(dir)) {
    const match = /^(\d{3})_.*\.sql$/.exec(file);
    if (!match) continue;
    const num = match[1];
    const list = byNum.get(num) || [];
    list.push(file);
    byNum.set(num, list);
  }
  const duplicates = [...byNum.entries()].filter(([num, files]) => files.length > 1);
  /** Doublons historiques déjà appliqués en prod avant garde-fou CI — ne pas renommer sans plan de migration. */
  const legacyDuplicateNums = new Set(['021', '037']);
  const blocking = duplicates.filter(([num]) => !legacyDuplicateNums.has(num));
  assert.deepStrictEqual(
    blocking,
    [],
    `Numéros de migration en double (schema_version n'en exécute qu'une par numéro) : ${blocking
      .map(([num, files]) => `${num} → ${files.join(', ')}`)
      .join(' ; ')}`,
  );
});
