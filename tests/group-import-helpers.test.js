'use strict';

require('./helpers/setup');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  parseGroupRefsCell,
  normalizeGroupSlug,
  normalizeGroupKind,
  mapGroupImportRow,
  validateGroupImportPayload,
  buildGroupTemplateWorkbookRows,
  GROUP_TEMPLATE_COLUMNS,
} = require('../lib/groupImport');

describe('groupImport (parsing pur)', () => {
  it('parseGroupRefsCell : multi-groupes et chemins Parent>Enfant', () => {
    assert.deepEqual(parseGroupRefsCell(''), []);
    assert.deepEqual(parseGroupRefsCell('6A | 6B'), [{ path: ['6A'] }, { path: ['6B'] }]);
    assert.deepEqual(parseGroupRefsCell('6ème A > Atelier sciences'), [
      { path: ['6ème A', 'Atelier sciences'] },
    ]);
    assert.deepEqual(parseGroupRefsCell('6A;6B/Sous'), [
      { path: ['6A'] },
      { path: ['6B', 'Sous'] },
    ]);
  });

  it('normalizeGroupSlug / kind', () => {
    assert.equal(normalizeGroupSlug('6ème A'), '6eme-a');
    assert.equal(normalizeGroupKind('classe'), 'class');
    assert.equal(normalizeGroupKind('équipe'), 'team');
    assert.equal(normalizeGroupKind(''), 'class');
    assert.equal(normalizeGroupKind('xyz'), null);
  });

  it('map + validate ligne groupes', () => {
    const payload = mapGroupImportRow({
      Nom: '6ème A',
      'Type (class|team|unit|club)': 'class',
      'Parent (slug ou nom)': '',
      'Accorde n3beur (oui/non)': 'non',
    });
    assert.equal(payload.name, '6ème A');
    assert.equal(payload.kind, 'class');
    assert.deepEqual(validateGroupImportPayload(payload, 2), []);
    assert.ok(validateGroupImportPayload({ name: '', kind: null }, 3).length >= 2);
  });

  it('modèle : plusieurs lignes d’exemple', () => {
    const rows = buildGroupTemplateWorkbookRows();
    assert.ok(rows.length >= 3);
    assert.ok(rows.every((r) => Object.keys(r).length === GROUP_TEMPLATE_COLUMNS.length));
    assert.ok(rows.some((r) => r[GROUP_TEMPLATE_COLUMNS[3]]));
  });
});
