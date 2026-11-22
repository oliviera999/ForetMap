'use strict';

// Corpus des étiquettes simples (`plants.usage_label`, chantier collège, flux D5) : contrôle
// des fichiers de données contre l'instantané de contenu, et migration générée à jour.
// Aucune I/O base de données. Le fichier de migration est retrouvé par son suffixe.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  runChecks,
  loadData,
  checkLabel,
  headNoun,
} = require('../../scripts/college-2026-11/check-D5-etiquettes');
const { buildSql, findMigrationFile } = require('../../scripts/college-2026-11/build-D5-migration');

test('étiquettes D5 : aucune erreur de contrôle, 644 fiches couvertes', () => {
  const { errors, count } = runChecks();
  assert.deepEqual(errors, []);
  assert.equal(count, 644);
});

test('étiquettes D5 : les noms opaques ou trompeurs cités par le prompt ont une étiquette', () => {
  const labels = new Map();
  for (const d of loadData()) for (const f of d.fiches) labels.set(f.name, f.usage_label);
  for (const name of [
    'Souci',
    'Gamma',
    'Tircis',
    'Mégère',
    'Plexippe de Paykull',
    'Tétranyque tisserand',
    'Trichoderma',
    'Tubifex',
    'Nitrobacter',
  ]) {
    assert.ok(labels.get(name), `étiquette manquante : ${name}`);
  }
  assert.match(labels.get('Souci'), /papillon/);
  assert.match(labels.get('Souci officinal'), /fleur/);
});

test('étiquettes D5 : la migration versionnée est la sortie du générateur', () => {
  const file = findMigrationFile();
  assert.match(path.basename(file), /^\d{3}_college_etiquettes_simples\.sql$/);
  assert.equal(fs.readFileSync(file, 'utf8'), buildSql());
});

test('étiquettes D5 : le contrôle de forme refuse les cas interdits', () => {
  assert.deepEqual(checkLabel('ok', 'une araignée sauteuse'), []);
  assert.ok(checkLabel('x', 'Araignée sauteuse').length > 0, 'article manquant');
  assert.ok(checkLabel('x', 'une plante à cueillir').length > 0, 'verbe interdit');
  assert.ok(checkLabel('x', 'une araignée très très très très sauteuse').length > 0, 'longueur');
  assert.ok(checkLabel('x', 'une araignée 🕷').length > 0, 'emoji');
  assert.ok(checkLabel('x', 'une plante d’ombre').length > 0, 'apostrophe courbe');
  assert.equal(headNoun('un tout petit sauteur du sol'), 'sauteur');
  assert.equal(headNoun('une grande araignée sauteuse'), 'araignée');
});
