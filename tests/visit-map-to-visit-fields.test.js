'use strict';

/**
 * Liste blanche carte → visite.
 *
 * Elle existait pour garantir qu'un complément réservé ne puisse jamais atterrir dans un champ
 * public de la visite (`subtitle`, `short_description`, `details_*`, `body_json`). Depuis la
 * migration 263, la garantie est **structurelle** : les compléments vivent dans
 * `location_notes`, clé sur l'identifiant du lieu — que la visite partage avec la carte. Il
 * n'y a donc plus rien à recopier, donc plus rien à faire fuir.
 *
 * Ce test fige ce fait : la liste blanche ne transporte **aucun** champ de complément.
 */

require('./helpers/setup');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  mapZoneToVisitWhitelistFields,
  mapMarkerToVisitWhitelistFields,
} = require('../lib/visitMapToVisitFields');

const NOTE_FIELDS = [
  'restricted_note',
  'restricted_note_role_slugs',
  'restricted_note_group_ids',
  'notes',
];

describe('visitMapToVisitFields — liste blanche carte → visite', () => {
  it('zone : description → short_description, audience reportée, rien d’autre', () => {
    const w = mapZoneToVisitWhitelistFields({
      id: 'z1',
      map_id: 'foret',
      name: 'Bureau',
      points: '[]',
      description: 'Accueil public',
      visible_role_slugs: '["personnel","prof"]',
      visible_group_ids: '["g1"]',
    });
    assert.equal(w.short_description, 'Accueil public');
    assert.equal(w.visible_role_slugs, '["personnel","prof"]');
    assert.equal(w.visible_group_ids, '["g1"]');
    for (const key of ['subtitle', 'details_text', 'body_json']) {
      assert.ok(!(key in w), `${key} ne doit pas être reporté`);
    }
  });

  it('repère : note → short_description', () => {
    const w = mapMarkerToVisitWhitelistFields({
      id: 'm1',
      map_id: 'foret',
      x_pct: 10,
      y_pct: 20,
      label: 'CDI',
      emoji: '📚',
      note: 'Ouvert aux élèves',
    });
    assert.equal(w.short_description, 'Ouvert aux élèves');
    assert.equal(w.label, 'CDI');
  });

  it('aucun champ de complément ne traverse la liste blanche, même fourni en entrée', () => {
    // La source peut encore porter ces clés (lignes anciennes, corps de requête bavard) :
    // la liste blanche ne les recopie pas, c'est tout l'intérêt de ne pas faire de spread.
    const source = {
      id: 'z2',
      map_id: 'foret',
      name: 'Local technique',
      points: '[]',
      description: 'Public',
      restricted_note: 'Code alarme 9988',
      restricted_note_role_slugs: '["personnel"]',
      restricted_note_group_ids: '["g1"]',
      notes: [{ body: 'Code alarme 9988' }],
    };
    for (const w of [
      mapZoneToVisitWhitelistFields(source),
      mapMarkerToVisitWhitelistFields({ ...source, label: 'L', x_pct: 1, y_pct: 2 }),
    ]) {
      for (const key of NOTE_FIELDS) {
        assert.ok(!(key in w), `${key} ne doit pas traverser la liste blanche`);
      }
      const serialized = JSON.stringify(w);
      assert.doesNotMatch(serialized, /alarme 9988/, 'aucun texte de complément ne doit passer');
    }
  });
});
