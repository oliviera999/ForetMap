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
let splitPlanTextBlocks;
let classifyPlanHref;
let classifyLinkHref;

before(async () => {
  const mod = await import(
    pathToFileURL(join(__dirname, '../src/plan/utils/planLinkedText.js')).href
  );
  splitPlanTextLinks = mod.splitPlanTextLinks;
  splitPlanTextBlocks = mod.splitPlanTextBlocks;
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

/**
 * Mise en blocs (`splitPlanTextBlocks`).
 *
 * Les compléments réservés d'un lieu (`location_notes`) et les descriptions sont rédigés dans
 * la console, avec la chaîne Markdown complète : paragraphes séparés d'une ligne vide, listes
 * à puces « - ». Le Plan les rendait dans un unique `<p>`, et HTML replie les retours à la
 * ligne en espaces : un encart aéré en trois blocs et cinq puces arrivait sur proflyautey en
 * un seul pavé, tirets compris, alors que le même texte s'affichait correctement sur la carte
 * de travail et dans la Visite (`MarkdownContent`, `marked` avec `breaks: true`).
 */
describe('Plan — mise en blocs des textes éditoriaux', () => {
  /** Texte concaténé d'un bloc (les liens comptent pour leur libellé). */
  const flat = (block) =>
    block.lines.map((segs) => segs.map((s) => s.value ?? s.label).join('')).join('\n');

  it('une ligne vide ouvre un nouveau paragraphe', () => {
    const out = splitPlanTextBlocks('Premier bloc.\n\nSecond bloc.');
    assert.equal(out.length, 2);
    assert.equal(out[0].type, 'paragraph');
    assert.equal(flat(out[0]), 'Premier bloc.');
    assert.equal(flat(out[1]), 'Second bloc.');
  });

  it('un retour à la ligne simple reste dans le paragraphe, en deux lignes', () => {
    const out = splitPlanTextBlocks('Ligne une.\nLigne deux.');
    assert.equal(out.length, 1);
    assert.equal(out[0].type, 'paragraph');
    assert.equal(out[0].lines.length, 2);
    assert.equal(flat(out[0]), 'Ligne une.\nLigne deux.');
  });

  it('les puces « - » et « * » forment une liste, sans la puce', () => {
    const out = splitPlanTextBlocks('- premier\n* second\n  - troisième indenté');
    assert.equal(out.length, 1);
    assert.equal(out[0].type, 'list');
    assert.deepEqual(
      out[0].lines.map((segs) => segs.map((s) => s.value).join('')),
      ['premier', 'second', 'troisième indenté'],
    );
  });

  it('une puce qui suit un paragraphe ouvre un bloc sans ligne vide', () => {
    const out = splitPlanTextBlocks('Consignes :\n- fermer le portillon\n- prévenir la loge');
    assert.deepEqual(
      out.map((b) => b.type),
      ['paragraph', 'list'],
    );
    assert.equal(out[1].lines.length, 2);
  });

  it('les liens restent cliquables à l’intérieur d’une puce', () => {
    const out = splitPlanTextBlocks('- voir la [Fiche](https://exemple.org/a.pdf)');
    assert.equal(out[0].type, 'list');
    const [label, link] = out[0].lines[0];
    assert.deepEqual(label, { type: 'text', value: 'voir la ' });
    assert.equal(link.type, 'link');
    assert.equal(link.href, 'https://exemple.org/a.pdf');
    assert.equal(link.kind, 'external');
  });

  it('les fins de ligne Windows ne doublent pas les blocs', () => {
    const out = splitPlanTextBlocks('Un.\r\n\r\nDeux.');
    assert.equal(out.length, 2);
    assert.equal(flat(out[0]), 'Un.');
    assert.equal(flat(out[1]), 'Deux.');
  });

  it('un texte vide ou blanc ne rend aucun bloc ; une puce vide n’ouvre pas d’élément', () => {
    assert.deepEqual(splitPlanTextBlocks(''), []);
    assert.deepEqual(splitPlanTextBlocks('   \n\n  '), []);
    assert.deepEqual(splitPlanTextBlocks(null), []);
    const out = splitPlanTextBlocks('- \n- vrai');
    assert.equal(out[0].type, 'list');
    assert.equal(out[0].lines.length, 1);
  });

  it('un texte d’une seule ligne reste un paragraphe unique (rendu historique)', () => {
    const out = splitPlanTextBlocks('Entrée côté rue, code à la loge.');
    assert.equal(out.length, 1);
    assert.equal(out[0].type, 'paragraph');
    assert.equal(out[0].lines.length, 1);
    assert.deepEqual(out[0].lines[0], splitPlanTextLinks('Entrée côté rue, code à la loge.'));
  });
});
