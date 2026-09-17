'use strict';

/**
 * Liens documentaires d'un lieu (`location_links`, migration 261) — validation pure.
 * Le parcours HTTP et le filtrage par rôle sont couverts par `tests/location-links-api.test.js`.
 */

require('./helpers/setup');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  LOCATION_LINKS_MAX,
  LINK_LABEL_MAX_LENGTH,
  LINK_URL_MAX_LENGTH,
  classifyLocationLinkUrl,
  normalizeLocationLinkUrl,
  normalizeLocationLinksInput,
  serializeLocationLinkRow,
} = require('../lib/locationLinks');
const {
  canViewLocationLink,
  projectLocationLinksForViewer,
  projectLocationAudienceForViewer,
} = require('../lib/locationAudience');

describe('locationLinks — politique d’URL', () => {
  it('classe chaque cible dans sa famille', () => {
    assert.equal(classifyLocationLinkUrl('https://exemple.org/a.pdf'), 'external');
    assert.equal(classifyLocationLinkUrl('http://exemple.org'), 'external');
    assert.equal(classifyLocationLinkUrl('/tutoriels/3?x=1#f'), 'internal');
    assert.equal(classifyLocationLinkUrl('mailto:a@b.c'), 'contact');
    assert.equal(classifyLocationLinkUrl('tel:+212600000000'), 'contact');
  });

  it('refuse les origines externes déguisées en chemin et les schémas hors politique', () => {
    for (const url of [
      '//exemple.org',
      '/\\exemple.org',
      'javascript:alert(1)',
      'data:text/html,<script>',
      'ftp://exemple.org',
      'tutoriels/3',
      '   ',
      '',
    ]) {
      assert.equal(classifyLocationLinkUrl(url), null, url);
      assert.equal(normalizeLocationLinkUrl(url).ok, false, url);
    }
  });

  it('borne la longueur d’URL', () => {
    const tooLong = `https://exemple.org/${'a'.repeat(LINK_URL_MAX_LENGTH)}`;
    assert.match(normalizeLocationLinkUrl(tooLong).error, /maximum/);
  });
});

describe('locationLinks — normalisation d’entrée', () => {
  it('distingue « non fourni » de « liste vide »', () => {
    // `undefined` = champ absent du corps → liens inchangés en UPDATE.
    assert.deepEqual(normalizeLocationLinksInput(undefined), { ok: true, value: null });
    // `[]` et `null` = effacer, ce que produit l’interface quand on retire la dernière ligne.
    assert.deepEqual(normalizeLocationLinksInput([]), { ok: true, value: [] });
    assert.deepEqual(normalizeLocationLinksInput(null), { ok: true, value: [] });
  });

  it('numérote les liens dans l’ordre reçu', () => {
    const out = normalizeLocationLinksInput([
      { label: 'A', url: 'https://a.org' },
      { label: 'B', url: '/b', audience_role_slugs: ['prof'] },
    ]);
    assert.equal(out.ok, true);
    assert.deepEqual(
      out.value.map((l) => [l.label, l.sort_order, l.audience_role_slugs]),
      [
        ['A', 0, []],
        ['B', 1, ['prof']],
      ],
    );
  });

  it('refuse libellé manquant, URL manquante, rôle inconnu et dépassement de plafond', () => {
    assert.match(normalizeLocationLinksInput([{ url: 'https://a.org' }]).error, /libellé requis/i);
    assert.match(normalizeLocationLinksInput([{ label: 'A' }]).error, /adresse requise/i);
    assert.match(
      normalizeLocationLinksInput([
        { label: 'A', url: 'https://a.org', audience_role_slugs: ['gl_mj'] },
      ]).error,
      /rôle inconnu/,
    );
    assert.match(
      normalizeLocationLinksInput([
        { label: 'x'.repeat(LINK_LABEL_MAX_LENGTH + 1), url: 'https://a.org' },
      ]).error,
      /maximum/,
    );
    const tooMany = Array.from({ length: LOCATION_LINKS_MAX + 1 }, (_, i) => ({
      label: `L${i}`,
      url: 'https://a.org',
    }));
    assert.match(normalizeLocationLinksInput(tooMany).error, /maximum/);
    assert.match(normalizeLocationLinksInput('nope').error, /tableau/);
    assert.match(normalizeLocationLinksInput(['nope']).error, /objet/);
  });

  it('dérive is_external de l’URL plutôt que de le stocker', () => {
    assert.equal(
      serializeLocationLinkRow({ id: 1, label: 'A', url: 'https://a.org' }).is_external,
      true,
    );
    assert.equal(serializeLocationLinkRow({ id: 2, label: 'B', url: '/b' }).is_external, false);
    assert.equal(
      serializeLocationLinkRow({ id: 3, label: 'C', url: 'mailto:a@b.c' }).is_external,
      false,
    );
  });
});

describe('locationLinks — audience par lien', () => {
  const publicLink = { id: 1, label: 'Public', url: 'https://a.org', audience_role_slugs: [] };
  const staffLink = { id: 2, label: 'Interne', url: '/notes', audience_role_slugs: ['prof'] };

  it('audience vide = le lien suit le lieu (pas de repli confidentiel)', () => {
    // Différence assumée avec `restricted_note`, dont l’audience vide vaut « encadrement » :
    // un complément réservé est confidentiel par nature, un lien ne l’est pas.
    assert.equal(canViewLocationLink(publicLink, null, { publicSurface: true }), true);
    assert.equal(canViewLocationLink(publicLink, { roleSlug: 'eleve_novice' }), true);
  });

  it('audience renseignée = lien réservé à ces rôles', () => {
    assert.equal(canViewLocationLink(staffLink, { roleSlug: 'prof' }), true);
    assert.equal(canViewLocationLink(staffLink, { roleSlug: 'eleve_novice' }), false);
    assert.equal(canViewLocationLink(staffLink, null, { publicSurface: true }), false);
    assert.equal(canViewLocationLink(staffLink, { permissions: ['zones.manage'] }), true);
  });

  it('retire audience_role_slugs aux non-gestionnaires', () => {
    const forProf = projectLocationLinksForViewer([publicLink, staffLink], { roleSlug: 'prof' });
    assert.deepEqual(
      forProf.map((l) => l.id),
      [1, 2],
    );
    assert.equal(forProf[1].audience_role_slugs, undefined);
    const forManager = projectLocationLinksForViewer([publicLink, staffLink], {
      permissions: ['zones.manage'],
    });
    assert.deepEqual(forManager[1].audience_role_slugs, ['prof']);
  });

  it('le filtrage passe par la projection commune des lieux (donc toutes les surfaces)', () => {
    const row = { id: 'z1', visible_role_slugs: [], links: [publicLink, staffLink] };
    const eleve = projectLocationAudienceForViewer(row, { roleSlug: 'eleve_novice' });
    assert.deepEqual(
      eleve.links.map((l) => l.id),
      [1],
    );
    const anonPublic = projectLocationAudienceForViewer(row, null, { publicSurface: true });
    assert.deepEqual(
      anonPublic.links.map((l) => l.id),
      [1],
    );
  });

  it('un lieu sans liens n’en invente pas', () => {
    const projected = projectLocationAudienceForViewer(
      { id: 'z2', visible_role_slugs: [] },
      { roleSlug: 'eleve_novice' },
    );
    assert.equal(projected.links, undefined);
  });
});
