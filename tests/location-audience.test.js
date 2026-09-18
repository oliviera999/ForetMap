'use strict';

require('./helpers/setup');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  FORETMAP_AUDIENCE_ROLE_SLUGS,
  parseRoleSlugList,
  serializeRoleSlugList,
  normalizeRoleSlugInput,
  canViewLocation,
  canViewLocationNote,
  projectLocationAudienceForViewer,
  filterLocationsForViewer,
  resolveViewerRoleSlug,
  LOCATION_NOTE_DEFAULT_ROLE_SLUGS,
} = require('../lib/locationAudience');

describe('locationAudience — parse / sérialisation', () => {
  it('parseRoleSlugList : JSON, CSV, tableau, ordre canonique', () => {
    assert.deepEqual(parseRoleSlugList('["prof","visiteur"]'), ['visiteur', 'prof']);
    assert.deepEqual(parseRoleSlugList('eleve_novice, admin'), ['eleve_novice', 'admin']);
    assert.deepEqual(parseRoleSlugList(['PROF ', 'zzz', 'admin']), ['prof', 'admin']);
    assert.deepEqual(parseRoleSlugList(''), []);
    assert.deepEqual(parseRoleSlugList(null), []);
  });

  it('serializeRoleSlugList → JSON', () => {
    assert.equal(serializeRoleSlugList(['admin', 'prof']), '["prof","admin"]');
    assert.equal(serializeRoleSlugList([]), '[]');
  });

  it('normalizeRoleSlugInput : undefined / vide / inconnu', () => {
    assert.deepEqual(normalizeRoleSlugInput(undefined), { ok: true, value: null });
    assert.deepEqual(normalizeRoleSlugInput([]), { ok: true, value: [] });
    assert.deepEqual(normalizeRoleSlugInput(['visiteur']), {
      ok: true,
      value: ['visiteur'],
    });
    assert.match(normalizeRoleSlugInput(['gl_mj']).error, /rôle inconnu/);
    assert.match(normalizeRoleSlugInput(3).error, /tableau/);
  });
});

describe('locationAudience — droits de lecture', () => {
  const restricted = {
    visible_role_slugs: ['eleve_novice', 'prof'],
    notes: [{ id: 1, title: '', body: 'Consigne secrète', audience_role_slugs: ['prof'] }],
  };
  const secretNote = restricted.notes[0];

  it('lieu public visible pour tous ; restreint absent hors audience', () => {
    assert.equal(canViewLocation({ visible_role_slugs: [] }, null), true);
    assert.equal(canViewLocation(restricted, { roleSlug: 'eleve_novice' }), true);
    assert.equal(canViewLocation(restricted, { roleSlug: 'eleve_avance' }), false);
    assert.equal(canViewLocation(restricted, null), false);
  });

  it('surface publique : anonyme = visiteur', () => {
    assert.equal(resolveViewerRoleSlug(null, { publicSurface: true }), 'visiteur');
    assert.equal(
      canViewLocation({ visible_role_slugs: ['visiteur'] }, null, { publicSurface: true }),
      true,
    );
    assert.equal(
      canViewLocation({ visible_role_slugs: ['prof'] }, null, { publicSurface: true }),
      false,
    );
  });

  it('gestionnaire voit tout ; complément réservé', () => {
    const manager = { permissions: ['zones.manage'] };
    assert.equal(canViewLocation(restricted, manager), true);
    assert.equal(canViewLocationNote(secretNote, manager), true);
    assert.equal(canViewLocationNote(secretNote, { roleSlug: 'prof' }), true);
    assert.equal(canViewLocationNote(secretNote, { roleSlug: 'eleve_novice' }), false);
  });

  it('complément sans rôle coché : encadrement par défaut (admin / n3boss / prof de classe)', () => {
    const byDefault = { id: 9, body: 'Consigne', audience_role_slugs: [] };
    assert.deepEqual([...LOCATION_NOTE_DEFAULT_ROLE_SLUGS], ['prof_classe', 'prof', 'admin']);
    for (const roleSlug of LOCATION_NOTE_DEFAULT_ROLE_SLUGS) {
      assert.equal(canViewLocationNote(byDefault, { roleSlug }), true, roleSlug);
    }
    for (const roleSlug of ['eleve_chevronne', 'personnel', 'visiteur']) {
      assert.equal(canViewLocationNote(byDefault, { roleSlug }), false, roleSlug);
    }
    // Surface publique : l'anonyme compte comme visiteur, donc toujours pas d'accès.
    assert.equal(canViewLocationNote(byDefault, null, { publicSurface: true }), false);
    // Une liste explicite reste prioritaire sur le défaut.
    assert.equal(
      canViewLocationNote(
        { id: 10, body: 'x', audience_role_slugs: ['visiteur'] },
        { roleSlug: 'prof_classe' },
      ),
      false,
    );
    // Prof de classe : le complément lui est transmis (pas de strip côté projection).
    const projected = projectLocationAudienceForViewer(
      { visible_role_slugs: [], notes: [byDefault] },
      { roleSlug: 'prof_classe' },
    );
    assert.equal(projected.notes[0].body, 'Consigne');
    assert.equal(projected.notes[0].audience_role_slugs, undefined);
  });

  it('projectLocationAudienceForViewer : null / strip / filtre liste', () => {
    assert.equal(projectLocationAudienceForViewer(restricted, { roleSlug: 'eleve_avance' }), null);
    const eleve = projectLocationAudienceForViewer(restricted, { roleSlug: 'eleve_novice' });
    assert.deepEqual(eleve.notes, [], 'un élève hors audience ne reçoit aucun complément');
    assert.equal(eleve.visible_role_slugs, undefined);
    const prof = projectLocationAudienceForViewer(restricted, { roleSlug: 'prof' });
    assert.equal(prof.notes[0].body, 'Consigne secrète');
    assert.equal(prof.notes[0].audience_role_slugs, undefined);
    const manager = projectLocationAudienceForViewer(restricted, {
      permissions: ['map.manage_markers'],
    });
    assert.deepEqual(manager.visible_role_slugs, ['eleve_novice', 'prof']);
    assert.deepEqual(
      filterLocationsForViewer([restricted, { id: 2, visible_role_slugs: [] }], {
        roleSlug: 'eleve_avance',
      }).map((r) => r.id),
      [2],
    );
  });

  it('catalogue de rôles ForetMap stable', () => {
    assert.ok(FORETMAP_AUDIENCE_ROLE_SLUGS.includes('visiteur'));
    assert.ok(FORETMAP_AUDIENCE_ROLE_SLUGS.includes('prof'));
    assert.ok(!FORETMAP_AUDIENCE_ROLE_SLUGS.includes('gl_mj'));
  });
});
