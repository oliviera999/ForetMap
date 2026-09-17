'use strict';

/**
 * Aller-retour d'un lien dans l'éditeur riche (`RichTextEditor`, `GLRichTextEditor`).
 *
 * Régression visée : `htmlToMarkdownWith` assainit le HTML de la surface éditable **avant**
 * Turndown. Tant que la politique de lien refusait tout ce qui n'était pas `http(s)`, un lien
 * interne posé par le bouton « Lien » perdait son `href` à l'assainissement, puis son ancre à
 * la conversion — l'auteur enregistrait un texte nu en croyant avoir posé un lien, sans le
 * moindre message. Ce test fige les deux sens : ce qui doit survivre, et ce qui doit être
 * refusé (une origine externe déguisée en chemin ne doit pas ressusciter par ce chemin-là).
 */

const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const { join } = require('path');

let createRichTextTurndownService;
let htmlToMarkdownWith;
let service;

before(async () => {
  const mod = await import(
    pathToFileURL(join(__dirname, '../src/shared/richtext/richTextCore.js')).href
  );
  createRichTextTurndownService = mod.createRichTextTurndownService;
  htmlToMarkdownWith = mod.htmlToMarkdownWith;
  service = createRichTextTurndownService();
});

const toMarkdown = (html) => htmlToMarkdownWith(service, html);

describe('éditeur riche — aller-retour des liens', () => {
  it('conserve un lien externe', () => {
    assert.equal(
      toMarkdown('<p><a href="https://exemple.org/a">Fiche</a></p>'),
      '[Fiche](https://exemple.org/a)',
    );
  });

  it('conserve un lien interne (régression : il était effacé en silence)', () => {
    assert.equal(
      toMarkdown('<p><a href="/tutoriels/3">Le tutoriel</a></p>'),
      '[Le tutoriel](/tutoriels/3)',
    );
  });

  it('conserve mailto: et tel:', () => {
    assert.equal(
      toMarkdown('<p><a href="mailto:jardin@exemple.org">Écrire</a></p>'),
      '[Écrire](mailto:jardin@exemple.org)',
    );
    assert.equal(
      toMarkdown('<p><a href="tel:+212600000000">Appeler</a></p>'),
      '[Appeler](tel:+212600000000)',
    );
  });

  it('refuse une origine externe déguisée en chemin', () => {
    assert.equal(toMarkdown('<p><a href="//exemple.org">proto</a></p>'), 'proto');
    assert.equal(toMarkdown('<p><a href="/\\exemple.org">backslash</a></p>'), 'backslash');
  });

  it('refuse un schéma hors politique', () => {
    assert.equal(toMarkdown('<p><a href="javascript:alert(1)">js</a></p>'), 'js');
    assert.equal(toMarkdown('<p><a href="ftp://exemple.org">ftp</a></p>'), 'ftp');
  });
});
