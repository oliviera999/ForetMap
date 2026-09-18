'use strict';

/**
 * Audience par **groupes** et **héritage par catégorie** (migration 262) — règles pures.
 * Le parcours HTTP est couvert par `tests/location-audience-groups-api.test.js`.
 */

require('./helpers/setup');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  parseGroupIdList,
  serializeGroupIdList,
  normalizeGroupIdInput,
  viewerMatchesAudience,
  resolveEffectiveLocationAudience,
  canViewLocation,
  canViewLocationNote,
  canViewLocationLink,
  projectLocationAudienceForViewer,
  GROUP_ID_MAX_LENGTH,
} = require('../lib/locationAudience');

describe('locationAudience — listes de groupes', () => {
  it('parse JSON, CSV et tableau, en dédoublonnant et en gardant l’ordre reçu', () => {
    assert.deepEqual(parseGroupIdList('["g2","g1","g2"]'), ['g2', 'g1']);
    assert.deepEqual(parseGroupIdList('g1, g2 ;g1'), ['g1', 'g2']);
    assert.deepEqual(parseGroupIdList(['  g3 ', '', null, 'g3']), ['g3']);
    assert.deepEqual(parseGroupIdList(''), []);
    assert.deepEqual(parseGroupIdList(null), []);
  });

  it('écarte un identifiant trop long plutôt que de le tronquer', () => {
    const tooLong = 'x'.repeat(GROUP_ID_MAX_LENGTH + 1);
    assert.deepEqual(parseGroupIdList([tooLong, 'ok']), ['ok']);
    assert.match(normalizeGroupIdInput([tooLong]).error, /trop long/);
  });

  it('sérialise en JSON', () => {
    assert.equal(serializeGroupIdList(['g1', 'g1', 'g2']), '["g1","g2"]');
    assert.equal(serializeGroupIdList([]), '[]');
  });

  it('distingue « non fourni » de « liste vide »', () => {
    assert.deepEqual(normalizeGroupIdInput(undefined), { ok: true, value: null });
    assert.deepEqual(normalizeGroupIdInput([]), { ok: true, value: [] });
    assert.deepEqual(normalizeGroupIdInput(null), { ok: true, value: [] });
    assert.match(normalizeGroupIdInput(3).error, /tableau/);
    assert.match(normalizeGroupIdInput([42]).error, /invalide/);
    assert.match(normalizeGroupIdInput('[oups').error, /JSON invalide/);
  });
});

describe('locationAudience — union rôles / groupes', () => {
  it('le lecteur passe par le rôle OU par le groupe, jamais les deux exigés', () => {
    const audience = { roleSlugs: ['prof'], groupIds: ['g1'] };
    assert.equal(viewerMatchesAudience(audience, { roleSlug: 'prof' }), true);
    assert.equal(
      viewerMatchesAudience(audience, { roleSlug: 'eleve_novice', groupIds: ['g1'] }),
      true,
    );
    assert.equal(
      viewerMatchesAudience(audience, { roleSlug: 'eleve_novice', groupIds: ['g9'] }),
      false,
    );
  });

  it('un lieu restreint à un groupe est invisible pour l’anonyme d’une surface publique', () => {
    const row = { visible_role_slugs: [], visible_group_ids: ['g1'] };
    assert.equal(canViewLocation(row, null, { publicSurface: true }), false);
    assert.equal(canViewLocation(row, { roleSlug: 'eleve_novice', groupIds: ['g1'] }), true);
    // Le gestionnaire voit tout, comme pour les rôles.
    assert.equal(canViewLocation(row, { permissions: ['zones.manage'] }), true);
  });

  it('un complément réservé accepte aussi un groupe', () => {
    const note = {
      id: 1,
      body: 'Clé dans le tiroir',
      audience_role_slugs: [],
      audience_group_ids: ['g1'],
    };
    assert.equal(canViewLocationNote(note, { roleSlug: 'eleve_novice', groupIds: ['g1'] }), true);
    assert.equal(canViewLocationNote(note, { roleSlug: 'eleve_novice', groupIds: ['g9'] }), false);
    // Liste explicite : elle remplace l'encadrement par défaut, y compris pour l'en exclure.
    assert.equal(canViewLocationNote(note, { roleSlug: 'prof' }), false);
  });

  it('les deux listes vides gardent l’encadrement par défaut du complément', () => {
    const note = { id: 2, body: 'x', audience_role_slugs: [], audience_group_ids: [] };
    assert.equal(canViewLocationNote(note, { roleSlug: 'prof_classe' }), true);
    assert.equal(canViewLocationNote(note, { roleSlug: 'eleve_novice' }), false);
  });

  it('un lien peut être réservé à un groupe', () => {
    const link = { audience_role_slugs: [], audience_group_ids: ['g1'] };
    assert.equal(canViewLocationLink(link, { roleSlug: 'eleve_novice', groupIds: ['g1'] }), true);
    assert.equal(canViewLocationLink(link, { roleSlug: 'prof' }), false);
    // Sans audience, le lien suit le lieu.
    assert.equal(
      canViewLocationLink({ audience_role_slugs: [], audience_group_ids: [] }, null),
      true,
    );
  });
});

describe('locationAudience — héritage par catégorie', () => {
  const restrictedCategory = { id: 'c1', visible_role_slugs: ['prof'], visible_group_ids: [] };
  const neutralCategory = { id: 'c2', visible_role_slugs: [], visible_group_ids: [] };

  it('un lieu sans audience propre prend celle de ses catégories', () => {
    const row = { visible_role_slugs: [], visible_group_ids: [], categories: [restrictedCategory] };
    const effective = resolveEffectiveLocationAudience(row);
    assert.deepEqual(effective, { roleSlugs: ['prof'], groupIds: [], inherited: true });
    assert.equal(canViewLocation(row, { roleSlug: 'prof' }), true);
    assert.equal(canViewLocation(row, { roleSlug: 'eleve_novice' }), false);
  });

  it('une catégorie neutre ne rouvre pas un lieu restreint par une autre', () => {
    // Le piège central : l'union avec « public » vaudrait « public ». Seules les catégories
    // qui déclarent une audience comptent.
    const row = {
      visible_role_slugs: [],
      categories: [restrictedCategory, neutralCategory],
    };
    assert.equal(canViewLocation(row, { roleSlug: 'eleve_novice' }), false);
    assert.equal(canViewLocation(row, { roleSlug: 'prof' }), true);
  });

  it('deux catégories déclarantes s’unissent', () => {
    const row = {
      visible_role_slugs: [],
      categories: [restrictedCategory, { id: 'c3', visible_group_ids: ['g1'] }],
    };
    assert.deepEqual(resolveEffectiveLocationAudience(row), {
      roleSlugs: ['prof'],
      groupIds: ['g1'],
      inherited: true,
    });
    assert.equal(canViewLocation(row, { roleSlug: 'eleve_novice', groupIds: ['g1'] }), true);
  });

  it('une audience posée sur le lieu l’emporte sur celle de la catégorie', () => {
    const row = {
      visible_role_slugs: ['eleve_novice'],
      categories: [restrictedCategory],
    };
    assert.deepEqual(resolveEffectiveLocationAudience(row), {
      roleSlugs: ['eleve_novice'],
      groupIds: [],
      inherited: false,
    });
    assert.equal(canViewLocation(row, { roleSlug: 'eleve_novice' }), true);
    assert.equal(canViewLocation(row, { roleSlug: 'prof' }), false);
  });

  it('sans catégorie déclarante, le lieu reste public', () => {
    const row = { visible_role_slugs: [], categories: [neutralCategory] };
    assert.deepEqual(resolveEffectiveLocationAudience(row), {
      roleSlugs: [],
      groupIds: [],
      inherited: false,
    });
    assert.equal(canViewLocation(row, null, { publicSurface: true }), true);
  });

  it('la projection ne laisse pas fuir l’audience des catégories à un lecteur ordinaire', () => {
    const row = {
      id: 'z1',
      visible_role_slugs: [],
      categories: [{ ...restrictedCategory, label: 'Locaux techniques' }],
    };
    const forProf = projectLocationAudienceForViewer(row, { roleSlug: 'prof' });
    assert.equal(forProf.categories[0].label, 'Locaux techniques', 'la catégorie reste exposée');
    assert.equal(forProf.categories[0].visible_role_slugs, undefined);
    assert.equal(forProf.categories[0].visible_group_ids, undefined);
    // Le gestionnaire, lui, en a besoin pour éditer.
    const forManager = projectLocationAudienceForViewer(row, { permissions: ['zones.manage'] });
    assert.deepEqual(forManager.categories[0].visible_role_slugs, ['prof']);
  });

  it('la projection retire aussi les listes de groupes du lieu', () => {
    const row = {
      id: 'z2',
      visible_role_slugs: [],
      visible_group_ids: ['g1'],
      notes: [{ id: 3, body: 'secret', audience_role_slugs: [], audience_group_ids: ['g1'] }],
    };
    const viewer = { roleSlug: 'eleve_novice', groupIds: ['g1'] };
    const projected = projectLocationAudienceForViewer(row, viewer);
    assert.equal(projected.visible_group_ids, undefined);
    assert.equal(projected.notes[0].body, 'secret');
    assert.equal(projected.notes[0].audience_group_ids, undefined);
  });
});
