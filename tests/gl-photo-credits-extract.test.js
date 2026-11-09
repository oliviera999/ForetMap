'use strict';

/**
 * `scripts/gl-photo-credits-backfill.js` — fonctions pures : extraction `extmetadata` →
 * `{ credit, licence }`, résolution du fichier Commons, plan d'écriture. Aucun appel réseau :
 * réponses Wikimedia factices. La boucle `backfill` est exercée avec une base et un réseau
 * simulés (rien n'est écrit sans source identifiée, une colonne renseignée n'est pas écrasée).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const script = require('../scripts/gl-photo-credits-backfill');

test('extractCreditFromExtmetadata : Artist en HTML, licence CC normalisée, e-mail retiré', () => {
  const out = script.extractCreditFromExtmetadata({
    Artist: {
      value:
        '<a href="//commons.wikimedia.org/wiki/User:X">Jean&nbsp;Dupont</a> (jean@example.org)',
    },
    LicenseShortName: { value: 'CC BY-SA 4.0' },
    LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' },
    Credit: { value: '<span>Own work</span>' },
  });
  assert.deepEqual(out, {
    credit: 'Jean Dupont',
    licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
  });
});

test('extractCreditFromExtmetadata : repli sur Credit, domaine public, vide quand rien', () => {
  assert.deepEqual(
    script.extractCreditFromExtmetadata({
      Credit: { value: 'Bibliothèque nationale, <i>Gallica</i>' },
      LicenseShortName: { value: 'Public domain' },
    }),
    { credit: 'Bibliothèque nationale, Gallica', licence: 'Public domain', licenceUrl: '' },
  );
  assert.equal(script.normalizeLicence('cc-by-2.0'), 'CC BY 2.0');
  assert.equal(script.normalizeLicence('CC0'), 'CC0');
  assert.equal(script.normalizeLicence('PD-US'), 'Public domain');
  assert.deepEqual(script.extractCreditFromExtmetadata(null), {
    credit: '',
    licence: '',
    licenceUrl: '',
  });
  assert.deepEqual(script.extractCreditFromExtmetadata({ Artist: { value: '<br/>' } }), {
    credit: '',
    licence: '',
    licenceUrl: '',
  });
});

test('résolution du fichier Commons : page de description, URL de téléversement, pageimages', () => {
  assert.equal(
    script.fileTitleFromDescriptionUrl(
      'https://commons.wikimedia.org/wiki/File:Kapok_tree-pod.jpg',
    ),
    'File:Kapok tree-pod.jpg',
  );
  assert.equal(
    script.fileTitleFromDescriptionUrl(
      'https://commons.wikimedia.org/wiki/File:%C3%89lan_01.jpg?x=1',
    ),
    'File:Élan 01.jpg',
  );
  assert.equal(script.fileTitleFromDescriptionUrl('https://fr.wikipedia.org/wiki/Lemming'), '');
  assert.equal(
    script.fileTitleFromUploadUrl(
      'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bf/Kapok_tree-pod.jpg/960px-Kapok_tree-pod.jpg',
    ),
    'File:Kapok tree-pod.jpg',
  );
  assert.equal(
    script.fileTitleFromUploadUrl(
      'https://upload.wikimedia.org/wikipedia/commons/6/67/Wading_moose.jpg',
    ),
    'File:Wading moose.jpg',
  );
  assert.equal(script.fileTitleFromUploadUrl('https://example.org/photo.jpg'), '');
  assert.equal(
    script.fileTitleFromPageimagesResponse({
      query: { pages: [{ pageid: 1, title: 'Lemming', pageimage: 'Berglemming-drawing.jpg' }] },
    }),
    'File:Berglemming-drawing.jpg',
  );
  assert.equal(
    script.fileTitleFromPageimagesResponse({ query: { pages: [{ missing: true }] } }),
    '',
  );
  assert.deepEqual(
    script.extmetadataFromCommonsResponse({
      query: { pages: { 12: { imageinfo: [{ extmetadata: { Artist: { value: 'A' } } }] } } },
    }),
    { Artist: { value: 'A' } },
  );
});

test('planRowUpdate : seulement les colonnes vides, rien sans métadonnée', () => {
  const extracted = {
    credit: 'Jean Dupont',
    licence: 'CC BY 2.0',
    licenceUrl: 'https://cc/by/2.0',
  };
  assert.deepEqual(
    script.planRowUpdate(
      { photo_credit: '', photo_licence: 'Public domain', photo_licence_url: null },
      extracted,
    ),
    { photo_credit: 'Jean Dupont' },
    'licence déjà saisie : ni la licence ni son URL (autre source) ne sont touchées',
  );
  assert.deepEqual(
    script.planRowUpdate(
      { photo_credit: 'X', photo_licence: '', photo_licence_url: '' },
      extracted,
    ),
    { photo_licence: 'CC BY 2.0', photo_licence_url: 'https://cc/by/2.0' },
    'l’URL accompagne la licence écrite au même passage',
  );
  assert.deepEqual(
    script.planRowUpdate({ photo_credit: 'Déjà là', photo_licence: 'CC0' }, extracted),
    {},
    'une colonne renseignée n’est jamais écrasée',
  );
  assert.deepEqual(
    script.planRowUpdate(
      { photo_credit: '', photo_licence: '' },
      { credit: '', licence: '', licenceUrl: '' },
    ),
    {},
    'aucune source : rien',
  );
});

test('backfill : simulation sans écriture, écriture seulement avec --apply et source identifiée', async () => {
  const rows = [
    {
      question_code: 'GQ-A',
      photo_url: 'https://upload.wikimedia.org/wikipedia/commons/6/67/A.jpg',
      photo_description_url: 'https://commons.wikimedia.org/wiki/File:A.jpg',
      wikipedia_title: null,
      photo_credit: '',
      photo_licence: 'Public domain',
      photo_licence_url: null,
    },
    {
      question_code: 'GQ-B',
      photo_url: 'https://example.org/b.jpg',
      photo_description_url: null,
      wikipedia_title: 'Lemming',
      photo_credit: null,
      photo_licence: null,
      photo_licence_url: null,
    },
    {
      question_code: 'GQ-C',
      photo_url: 'https://example.org/c.jpg',
      photo_description_url: null,
      wikipedia_title: null,
      photo_credit: null,
      photo_licence: null,
      photo_licence_url: null,
    },
  ];
  const writes = [];
  const db = {
    queryAll: async () => rows.map((r) => ({ ...r })),
    execute: async (sql, params) => writes.push({ sql, params }),
  };
  const net = {
    fetchExtmetadata: async (title) => {
      if (title === 'File:A.jpg') return { Artist: { value: 'Alice Martin' } };
      if (title === 'File:B.jpg') {
        return { Artist: { value: 'Bob' }, LicenseShortName: { value: 'CC BY-SA 3.0' } };
      }
      return null;
    },
    fetchPageImage: async (title) => (title === 'Lemming' ? 'File:B.jpg' : ''),
    sleep: async () => {},
  };
  const flags = script.parseFlags(['--limit=10', '--delay=0']);
  assert.equal(flags.apply, false, 'simulation par défaut');
  const dry = await script.backfill(db, flags, net);
  assert.equal(dry.mode, 'dry-run');
  assert.equal(dry.updated, 2);
  assert.deepEqual(dry.remaining, [
    { question_code: 'GQ-C', reason: 'aucun fichier Commons identifiable' },
  ]);
  assert.deepEqual(dry.sources, { photo_description_url: 1, photo_url: 0, wikipedia_title: 1 });
  assert.equal(writes.length, 0, 'rien n’est écrit en simulation');

  const applied = await script.backfill(db, script.parseFlags(['--apply', '--delay=0']), net);
  assert.equal(applied.mode, 'apply');
  assert.equal(writes.length, 2);
  assert.match(
    writes[0].sql,
    /^UPDATE gl_qcm_questions SET photo_credit = \?, updated_at = NOW\(\) WHERE question_code = \?$/,
  );
  assert.deepEqual(writes[0].params, ['Alice Martin', 'GQ-A']);
  assert.match(writes[1].sql, /photo_credit = \?, photo_licence = \?/);
  assert.deepEqual(writes[1].params, ['Bob', 'CC BY-SA 3.0', 'GQ-B']);
  assert.ok(!JSON.stringify(applied).includes('@'), 'aucune adresse dans le rapport');
  assert.match(script.USER_AGENT, /^ForetMap\/1\.0 /);
});
