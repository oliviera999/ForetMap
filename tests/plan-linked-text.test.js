'use strict';

/**
 * Rendu des liens dans les textes éditoriaux du Plan (`src/plan/utils/planLinkedText.jsx`).
 *
 * Le Plan n'embarque pas la chaîne Markdown (`marked` + `DOMPurify`) : il est chargé sur le
 * téléphone d'un visiteur. Avant ce module, une description rédigée sur la carte de travail
 * s'y affichait sous sa forme brute — `[Fiche PDF](https://…)`, crochets compris.
 *
 * Ce test porte sur le découpage seul (`splitPlanTextLinks`) et sur la classification, qui
 * doivent suivre la politique de `src/shared/platform/markdown.js` sans l'importer.
 */

const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const { join } = require('path');

let splitPlanTextLinks;
let classifyPlanHref;
let classifyLinkHref;

before(async () => {
  const mod = await import(
    pathToFileURL(join(__dirname, '../src/plan/utils/planLinkedText.js')).href
  );
  splitPlanTextLinks = mod.splitPlanTextLinks;
  classifyPlanHref = mod.classifyPlanHref;
  ({ classifyLinkHref } = await import(
    pathToFileURL(join(__dirname, '../src/shared/platform/markdown.js')).href
  ));
});

describe('Plan — liens des textes éditoriaux', () => {
  it('extrait un lien Markdown et garde le texte autour', () => {
    const out = splitPlanTextLinks(
      'Voir la [Fiche PDF](https://exemple.org/a.pdf) avant la visite.',
    );
    assert.deepEqual(out, [
      { type: 'text', value: 'Voir la ' },
      { type: 'link', label: 'Fiche PDF', href: 'https://exemple.org/a.pdf', kind: 'external' },
      { type: 'text', value: ' avant la visite.' },
    ]);
  });

  it('transforme une URL nue sans avaler la ponctuation de la phrase', () => {
    const out = splitPlanTextLinks('Plus d’infos sur https://exemple.org/a, puis revenez.');
    assert.deepEqual(out, [
      { type: 'text', value: 'Plus d’infos sur ' },
      {
        type: 'link',
        label: 'https://exemple.org/a',
        href: 'https://exemple.org/a',
        kind: 'external',
      },
      { type: 'text', value: ', puis revenez.' },
    ]);
  });

  it('reconnaît les liens internes et les contacts', () => {
    assert.deepEqual(splitPlanTextLinks('[Tuto](/tutoriels/3)'), [
      { type: 'link', label: 'Tuto', href: '/tutoriels/3', kind: 'internal' },
    ]);
    assert.deepEqual(splitPlanTextLinks('[Écrire](mailto:a@b.c)'), [
      { type: 'link', label: 'Écrire', href: 'mailto:a@b.c', kind: 'contact' },
    ]);
  });

  it('laisse en texte une cible hors politique', () => {
    for (const source of [
      '[a](javascript:alert(1))',
      '[a](//exemple.org)',
      '[a](/\\exemple.org)',
      '[a](ftp://exemple.org)',
    ]) {
      assert.deepEqual(splitPlanTextLinks(source), [{ type: 'text', value: source }], source);
    }
  });

  it('gère plusieurs liens dans le même texte', () => {
    const out = splitPlanTextLinks('[A](https://a.org) et [B](/b) et rien.');
    assert.equal(out.filter((s) => s.type === 'link').length, 2);
    assert.equal(out[out.length - 1].value, ' et rien.');
  });

  it('rend le vide pour un texte vide', () => {
    assert.deepEqual(splitPlanTextLinks(''), []);
    assert.deepEqual(splitPlanTextLinks(null), []);
  });

  // Les deux implémentations sont volontairement séparées (étanchéité du bundle Plan) :
  // ce test les confronte pour qu'elles ne divergent pas en silence.
  it('classe les cibles comme le moteur ForetMap', () => {
    const cases = [
      'https://exemple.org/a',
      'http://exemple.org',
      '/tutoriels/3?x=1#frag',
      'mailto:a@b.c',
      'tel:+212600000000',
      '//exemple.org',
      '/\\exemple.org',
      'ftp://exemple.org',
      'tutoriels/3',
      '',
    ];
    for (const href of cases) {
      assert.equal(classifyPlanHref(href), classifyLinkHref(href), href);
    }
  });
});
