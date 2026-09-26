'use strict';

// Le moteur de migrations suit un seul compteur (`schema_version`) et saute **sans rien dire**
// tout fichier dont le numéro est inférieur à la version courante (database.js,
// `runMigrations`). Deux PR parallèles peuvent donc se doubler : si la PR qui apporte 300 est
// déployée avant celle qui apporte 298 et 299, ces deux migrations ne seront jamais appliquées.
// Garde : à partir de 252 (les trous plus anciens sont historiques), la numérotation est
// continue. Une PR qui saute un numéro — ou qui passe devant une autre — échoue ici, en CI,
// au lieu d'être ignorée en production (audit du 25/09/2026).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FIRST_CONTIGUOUS = 252;

test('migrations : numérotation continue à partir de 252', () => {
  const numbers = [
    ...new Set(
      fs
        .readdirSync(path.join(__dirname, '..', 'migrations'))
        .map((name) => /^(\d+)_.*\.sql$/.exec(name))
        .filter(Boolean)
        .map((m) => Number(m[1]))
        .filter((n) => n >= FIRST_CONTIGUOUS),
    ),
  ].sort((a, b) => a - b);
  assert.ok(numbers.length > 0);
  const gaps = [];
  for (let i = 1; i < numbers.length; i += 1) {
    if (numbers[i] !== numbers[i - 1] + 1) gaps.push(`${numbers[i - 1]} → ${numbers[i]}`);
  }
  assert.deepEqual(gaps, [], `trou(s) dans la numérotation des migrations : ${gaps.join(', ')}`);
  assert.equal(numbers[0], FIRST_CONTIGUOUS);
});
