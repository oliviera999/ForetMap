'use strict';

require('./helpers/setup');
const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const { join } = require('path');

let buildAffiliationSelectOptions;

describe('affiliationSelectOptions', () => {
  before(async () => {
    const mod = await import(
      pathToFileURL(join(__dirname, '../src/utils/affiliationSelectOptions.js')).href
    );
    buildAffiliationSelectOptions = mod.buildAffiliationSelectOptions;
  });

  it('affiche "Tous les espaces" avec le nombre de cartes actives', () => {
    const options = buildAffiliationSelectOptions([
      { id: 'foret', label: 'Forêt comestible', is_active: true },
      { id: 'n3', label: 'N3', is_active: true },
      { id: 'potager', label: 'Potager', is_active: true },
    ]);
    const both = options.find((opt) => opt.value === 'both');
    assert.ok(both);
    assert.strictEqual(both.label, 'Tous les espaces (3)');
  });

  it('ajoute les cartes supplémentaires en conservant les options historiques', () => {
    const options = buildAffiliationSelectOptions([
      { id: 'foret', label: 'Forêt comestible', is_active: true },
      { id: 'n3', label: 'N3', is_active: true },
      { id: 'potager', label: 'Potager pédagogique', is_active: true },
    ]);
    assert.ok(options.some((opt) => opt.value === 'n3'));
    assert.ok(options.some((opt) => opt.value === 'foret'));
    assert.ok(
      options.some(
        (opt) => opt.value === 'potager' && opt.label === 'Potager pédagogique uniquement',
      ),
    );
  });
});
