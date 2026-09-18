const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const {
  TEMPLATE_COLUMNS,
  buildImportStudentPayload,
  validateImportStudentPayload,
  parseCsvRowsFromBuffer,
  IMPORT_ROLE_SLUGS,
} = require('../lib/studentRouteHelpers');
const { buildFiles, MINIMAL_COLUMNS } = require('../scripts/build-users-import-templates');

const TEMPLATES_DIR = path.join(__dirname, '..', 'docs', 'templates');

test('docs/templates : les modèles d’import de comptes sont synchronisés avec le code', () => {
  for (const [name, expected] of Object.entries(buildFiles())) {
    const file = path.join(TEMPLATES_DIR, name);
    assert.ok(fs.existsSync(file), `fichier manquant : ${name} (npm run templates:users)`);
    assert.strictEqual(
      fs.readFileSync(file, 'utf8'),
      expected,
      `${name} désynchronisé — relancer « npm run templates:users »`,
    );
  }
});

test('docs/templates : le modèle complet se relit sans ligne fautive', () => {
  const buf = fs.readFileSync(path.join(TEMPLATES_DIR, 'users-import-template.csv'));
  const rows = parseCsvRowsFromBuffer(buf);
  assert.ok(rows.length >= IMPORT_ROLE_SLUGS.size);
  const slugs = new Set();
  rows.forEach((row, idx) => {
    const payload = buildImportStudentPayload(row);
    assert.deepEqual(
      validateImportStudentPayload(payload, idx + 2, {
        minPasswordStudent: 4,
        minPasswordTeacher: 12,
        passwordRequired: false,
      }),
      [],
      `ligne ${idx + 2} invalide`,
    );
    slugs.add(payload.roleSlug);
  });
  for (const slug of IMPORT_ROLE_SLUGS) assert.ok(slugs.has(slug), `profil sans exemple : ${slug}`);
});

test('docs/templates : modèle minimal et modèle vierge', () => {
  const minimal = parseCsvRowsFromBuffer(
    fs.readFileSync(path.join(TEMPLATES_DIR, 'users-import-template-minimal.csv')),
  );
  assert.ok(minimal.length > 0);
  for (const row of minimal) {
    assert.deepEqual(Object.keys(row), MINIMAL_COLUMNS);
    const payload = buildImportStudentPayload(row);
    assert.ok(IMPORT_ROLE_SLUGS.has(payload.roleSlug));
    // Colonne Affiliation absente → « both » par défaut, donc ligne valide.
    assert.deepEqual(validateImportStudentPayload(payload, 2, { minPasswordTeacher: 12 }), []);
  }

  const vierge = fs
    .readFileSync(path.join(TEMPLATES_DIR, 'users-import-template-vierge.csv'), 'utf8')
    .replace(/^﻿/, '')
    .trim();
  assert.strictEqual(
    vierge.split('\r\n').length,
    1,
    'le modèle vierge ne doit porter que l’en-tête',
  );
  for (const column of TEMPLATE_COLUMNS) {
    assert.ok(vierge.includes(column.split(' (')[0]), `en-tête manquant : ${column}`);
  }
});
