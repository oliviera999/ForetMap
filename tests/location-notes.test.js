'use strict';

/**
 * Compléments réservés **multiples** d'un lieu (`location_notes`, migration 263) — validation
 * pure et filtrage par lecteur. Le parcours HTTP est couvert par
 * `tests/location-notes-api.test.js`.
 */

require('./helpers/setup');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  LOCATION_NOTES_MAX,
  NOTE_TITLE_MAX_LENGTH,
  NOTE_BODY_MAX_LENGTH,
  normalizeLocationNotesInput,
  serializeLocationNoteRow,
  attachNotesToEntity,
} = require('../lib/locationNotes');
const {
  canViewLocationNote,
  projectLocationNotesForViewer,
  projectLocationAudienceForViewer,
} = require('../lib/locationAudience');

describe('locationNotes — normalisation d’entrée', () => {
  it('distingue « non fourni » de « liste vide »', () => {
    // `undefined` = champ absent du corps → compléments inchangés en UPDATE ; `[]` = tout
    // retirer, ce qu'envoie l'interface quand on supprime le dernier complément.
    assert.deepEqual(normalizeLocationNotesInput(undefined), { ok: true, value: null });
    assert.deepEqual(normalizeLocationNotesInput(null), { ok: true, value: [] });
    assert.deepEqual(normalizeLocationNotesInput([]), { ok: true, value: [] });
    assert.match(normalizeLocationNotesInput('oups').error, /tableau/);
    assert.match(normalizeLocationNotesInput([42]).error, /objet/);
  });

  it('numérote l’ordre reçu et complète les audiences absentes', () => {
    const { ok, value } = normalizeLocationNotesInput([
      { body: ' Premier ' },
      { title: ' Consigne ', body: 'Second', audience_role_slugs: ['prof'] },
    ]);
    assert.equal(ok, true);
    assert.deepEqual(value, [
      {
        title: '',
        body: 'Premier',
        audience_role_slugs: [],
        audience_group_ids: [],
        sort_order: 0,
      },
      {
        title: 'Consigne',
        body: 'Second',
        audience_role_slugs: ['prof'],
        audience_group_ids: [],
        sort_order: 1,
      },
    ]);
  });

  it('exige un texte : un intitulé seul n’est pas un complément', () => {
    assert.match(normalizeLocationNotesInput([{ title: 'Consigne' }]).error, /body : texte requis/);
  });

  it('borne le plafond par lieu, l’intitulé et le corps', () => {
    const one = { body: 'x' };
    assert.equal(normalizeLocationNotesInput(Array(LOCATION_NOTES_MAX).fill(one)).ok, true);
    assert.match(
      normalizeLocationNotesInput(Array(LOCATION_NOTES_MAX + 1).fill(one)).error,
      new RegExp(`${LOCATION_NOTES_MAX} compléments maximum`),
    );
    assert.match(
      normalizeLocationNotesInput([{ title: 'x'.repeat(NOTE_TITLE_MAX_LENGTH + 1), body: 'y' }])
        .error,
      /title/,
    );
    assert.match(
      normalizeLocationNotesInput([{ body: 'y'.repeat(NOTE_BODY_MAX_LENGTH + 1) }]).error,
      /body/,
    );
  });

  it('refuse un rôle hors catalogue plutôt que de l’ignorer silencieusement', () => {
    assert.match(
      normalizeLocationNotesInput([{ body: 'x', audience_role_slugs: ['gl_mj'] }]).error,
      /audience_role_slugs/,
    );
  });

  it('sérialise une ligne SQL en forme d’API', () => {
    assert.deepEqual(
      serializeLocationNoteRow({
        id: '7',
        title: 'Accès',
        body: 'Clé au bureau',
        audience_role_slugs: '["prof"]',
        audience_group_ids: '["g1"]',
        sort_order: '2',
      }),
      {
        id: 7,
        title: 'Accès',
        body: 'Clé au bureau',
        audience_role_slugs: ['prof'],
        audience_group_ids: ['g1'],
        sort_order: 2,
      },
    );
  });

  it('pose toujours un tableau, même sans complément', () => {
    assert.deepEqual(attachNotesToEntity({ id: 'z1' }, undefined), { id: 'z1', notes: [] });
  });
});

describe('locationNotes — lecture par audience', () => {
  const encadrement = {
    id: 1,
    body: 'Code alarme',
    audience_role_slugs: [],
    audience_group_ids: [],
  };

  it('audience vide = encadrement, pas « public »', () => {
    // Différence assumée avec `location_links`, dont l'audience vide vaut « suit le lieu » :
    // un complément est confidentiel par nature.
    for (const slug of ['prof_classe', 'prof', 'admin']) {
      assert.equal(canViewLocationNote(encadrement, { roleSlug: slug }), true, slug);
    }
    for (const slug of ['eleve_novice', 'personnel', 'visiteur']) {
      assert.equal(canViewLocationNote(encadrement, { roleSlug: slug }), false, slug);
    }
    assert.equal(canViewLocationNote(encadrement, null, { publicSurface: true }), false);
  });

  it('le gestionnaire du jardin lit tout — c’est lui qui édite', () => {
    const reserve = { id: 2, body: 'x', audience_role_slugs: ['visiteur'] };
    assert.equal(canViewLocationNote(reserve, { permissions: ['zones.manage'] }), true);
  });

  it('un complément au texte vide n’est jamais servi', () => {
    assert.equal(canViewLocationNote({ id: 3, body: '   ' }, { roleSlug: 'admin' }), false);
  });

  it('la projection garde l’ordre, retire les listes d’audience et omet les compléments interdits', () => {
    const notes = [
      { id: 1, title: 'A', body: 'pour personnel', audience_role_slugs: ['personnel'] },
      { id: 2, title: 'B', body: 'encadrement', audience_role_slugs: [] },
      { id: 3, title: 'C', body: 'pour personnel aussi', audience_role_slugs: ['personnel'] },
    ];
    const seen = projectLocationNotesForViewer(notes, { roleSlug: 'personnel' });
    assert.deepEqual(
      seen.map((n) => n.title),
      ['A', 'C'],
    );
    assert.equal(seen[0].audience_role_slugs, undefined);
    assert.equal(seen[0].audience_group_ids, undefined);
    assert.equal(seen[0].body, 'pour personnel');
  });

  it('un lecteur sans aucun complément lisible reçoit un tableau vide, pas le champ absent', () => {
    // La fiche doit pouvoir faire `place.notes.map(...)` sans garde : l'absence de droit
    // n'est pas l'absence de champ.
    const row = { id: 'z9', visible_role_slugs: [], notes: [{ id: 1, body: 'secret' }] };
    const projected = projectLocationAudienceForViewer(row, { roleSlug: 'eleve_novice' });
    assert.deepEqual(projected.notes, []);
  });
});
