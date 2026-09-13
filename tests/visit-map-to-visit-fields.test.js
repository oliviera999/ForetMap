'use strict';

require('./helpers/setup');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  mapZoneToVisitWhitelistFields,
  mapMarkerToVisitWhitelistFields,
  publicVisitFieldsLeakRestrictedNote,
} = require('../lib/visitMapToVisitFields');

describe('visitMapToVisitFields — liste blanche carte → visite', () => {
  it('zone : description → short_description ; restricted_note isolé', () => {
    const w = mapZoneToVisitWhitelistFields({
      id: 'z1',
      map_id: 'foret',
      name: 'Bureau',
      points: '[]',
      description: 'Accueil public',
      visible_role_slugs: '["personnel","prof"]',
      restricted_note: 'Tél. 0612345678 — marie@lycee.fr',
      restricted_note_role_slugs: '["personnel"]',
    });
    assert.equal(w.short_description, 'Accueil public');
    assert.equal(w.restricted_note, 'Tél. 0612345678 — marie@lycee.fr');
    assert.equal(w.visible_role_slugs, '["personnel","prof"]');
    assert.equal(w.restricted_note_role_slugs, '["personnel"]');
    assert.ok(!('subtitle' in w));
    assert.ok(!('details_text' in w));
    assert.ok(!('body_json' in w));
  });

  it('repère : note → short_description ; jamais dans d’autres clés', () => {
    const w = mapMarkerToVisitWhitelistFields({
      id: 'm1',
      map_id: 'foret',
      x_pct: 10,
      y_pct: 20,
      label: 'CDI',
      emoji: '📚',
      note: 'Ouvert aux élèves',
      restricted_note: 'Code alarme 9988',
      restricted_note_role_slugs: '[]',
    });
    assert.equal(w.short_description, 'Ouvert aux élèves');
    assert.equal(w.restricted_note, 'Code alarme 9988');
    assert.notEqual(w.short_description, w.restricted_note);
  });

  it('publicVisitFieldsLeakRestrictedNote détecte une fuite', () => {
    const secret = 'SECRET_X';
    assert.equal(
      publicVisitFieldsLeakRestrictedNote(
        { short_description: 'ok', details_text: '', body_json: null },
        secret,
      ),
      false,
    );
    assert.equal(
      publicVisitFieldsLeakRestrictedNote({ short_description: `voir ${secret}` }, secret),
      true,
    );
  });
});
