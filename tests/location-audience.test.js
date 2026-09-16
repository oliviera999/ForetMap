'use strict';

require('./helpers/setup');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  FORETMAP_AUDIENCE_ROLE_SLUGS,
  parseRoleSlugList,
  serializeRoleSlugList,
  normalizeRoleSlugInput,
  normalizeRestrictedNoteInput,
  canViewLocation,
  canViewRestrictedNote,
  projectLocationAudienceForViewer,
  filterLocationsForViewer,
  resolveViewerRoleSlug,
  RESTRICTED_NOTE_MAX_LENGTH,
  RESTRICTED_NOTE_DEFAULT_ROLE_SLUGS,
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

  it('normalizeRestrictedNoteInput : borne de longueur', () => {
    assert.deepEqual(normalizeRestrictedNoteInput(undefined), { ok: true, value: null });
    assert.deepEqual(normalizeRestrictedNoteInput('  hello  '), { ok: true, value: 'hello' });
    assert.match(
      normalizeRestrictedNoteInput('x'.repeat(RESTRICTED_NOTE_MAX_LENGTH + 1)).error,
      /maximum/,
    );
  });
});

describe('locationAudience — droits de lecture', () => {
  const restricted = {
    visible_role_slugs: ['eleve_novice', 'prof'],
    restricted_note: 'Consigne secrète',
    restricted_note_role_slugs: ['prof'],
  };

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
    assert.equal(canViewRestrictedNote(restricted, manager), true);
    assert.equal(canViewRestrictedNote(restricted, { roleSlug: 'prof' }), true);
    assert.equal(canViewRestrictedNote(restricted, { roleSlug: 'eleve_novice' }), false);
  });

  it('complément sans rôle coché : encadrement par défaut (admin / n3boss / prof de classe)', () => {
    const byDefault = { restricted_note: 'Consigne', restricted_note_role_slugs: [] };
    assert.deepEqual([...RESTRICTED_NOTE_DEFAULT_ROLE_SLUGS], ['prof_classe', 'prof', 'admin']);
    for (const roleSlug of RESTRICTED_NOTE_DEFAULT_ROLE_SLUGS) {
      assert.equal(canViewRestrictedNote(byDefault, { roleSlug }), true, roleSlug);
    }
    for (const roleSlug of ['eleve_chevronne', 'personnel', 'visiteur']) {
      assert.equal(canViewRestrictedNote(byDefault, { roleSlug }), false, roleSlug);
    }
    // Surface publique : l'anonyme compte comme visiteur, donc toujours pas d'accès.
    assert.equal(canViewRestrictedNote(byDefault, null, { publicSurface: true }), false);
    // Une liste explicite reste prioritaire sur le défaut.
    assert.equal(
      canViewRestrictedNote(
        { restricted_note: 'x', restricted_note_role_slugs: ['visiteur'] },
        { roleSlug: 'prof_classe' },
      ),
      false,
    );
    // Prof de classe : le complément lui est transmis (pas de strip côté projection).
    const projected = projectLocationAudienceForViewer(byDefault, { roleSlug: 'prof_classe' });
    assert.equal(projected.restricted_note, 'Consigne');
    assert.equal(projected.restricted_note_role_slugs, undefined);
  });

  it('projectLocationAudienceForViewer : null / strip / filtre liste', () => {
    assert.equal(projectLocationAudienceForViewer(restricted, { roleSlug: 'eleve_avance' }), null);
    const eleve = projectLocationAudienceForViewer(restricted, { roleSlug: 'eleve_novice' });
    assert.equal(eleve.restricted_note, undefined);
    assert.equal(eleve.visible_role_slugs, undefined);
    const prof = projectLocationAudienceForViewer(restricted, { roleSlug: 'prof' });
    assert.equal(prof.restricted_note, 'Consigne secrète');
    assert.equal(prof.restricted_note_role_slugs, undefined);
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
