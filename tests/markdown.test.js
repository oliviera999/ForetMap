'use strict';

const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const { join } = require('path');

let renderMarkdownToSafeHtml;
let applyMarkdownWrap;
let applyMarkdownList;
let applyMarkdownLink;
let applyMarkdownImage;

before(async () => {
  const mod = await import(pathToFileURL(join(__dirname, '../src/utils/markdown.js')).href);
  renderMarkdownToSafeHtml = mod.renderMarkdownToSafeHtml;
  applyMarkdownWrap = mod.applyMarkdownWrap;
  applyMarkdownList = mod.applyMarkdownList;
  applyMarkdownLink = mod.applyMarkdownLink;
  applyMarkdownImage = mod.applyMarkdownImage;
});

describe('markdown utils', () => {
  it('renderMarkdownToSafeHtml retourne une chaîne vide pour entrée vide', () => {
    assert.equal(renderMarkdownToSafeHtml(''), '');
    assert.equal(renderMarkdownToSafeHtml('   '), '');
  });

  it('renderMarkdownToSafeHtml interprète le gras et les listes', () => {
    const html = renderMarkdownToSafeHtml('**gras**\n\n- un\n- deux');
    assert.match(html, /<strong>gras<\/strong>/);
    assert.match(html, /<ul>/);
    assert.match(html, /<li>un<\/li>/);
  });

  it('renderMarkdownToSafeHtml neutralise le HTML et scripts injectés', () => {
    const html = renderMarkdownToSafeHtml('<script>alert(1)</script>\n\n[x](javascript:alert(1))');
    assert.doesNotMatch(html, /<script/i);
    assert.doesNotMatch(html, /javascript:/i);
  });

  it('renderMarkdownToSafeHtml conserve le texte brut historique', () => {
    const plain = 'Ligne simple\nDeuxième ligne sans markdown';
    const html = renderMarkdownToSafeHtml(plain);
    assert.match(html, /Ligne simple/);
    assert.match(html, /Deuxième ligne/);
  });

  it('renderMarkdownToSafeHtml ajoute rel noopener sur les liens http', () => {
    const html = renderMarkdownToSafeHtml('[site](https://example.com)');
    assert.match(html, /href="https:\/\/example\.com"/);
    assert.match(html, /rel="noopener noreferrer"/);
    assert.match(html, /target="_blank"/);
  });

  it('applyMarkdownWrap entoure la sélection', () => {
    const r = applyMarkdownWrap('abc', 1, 2, '**', '**', 'x');
    assert.equal(r.value, 'a**b**c');
    assert.equal(r.selectionStart, 3);
    assert.equal(r.selectionEnd, 4);
  });

  it('applyMarkdownList préfixe les lignes', () => {
    const r = applyMarkdownList('a\nb', 0, 3, 'ul');
    assert.equal(r.value, '- a\n- b');
  });

  it('applyMarkdownLink insère un modèle de lien', () => {
    const r = applyMarkdownLink('hello', 0, 5);
    assert.equal(r.value, '[hello](https://)');
    assert.ok(r.selectionStart < r.selectionEnd);
  });

  it('renderMarkdownToSafeHtml allowImages conserve /uploads/', () => {
    const html = renderMarkdownToSafeHtml('![x](/uploads/media-library/image/2026/01/a.jpg)', { allowImages: true });
    assert.match(html, /<img\b/i);
    assert.match(html, /\/uploads\/media-library\//);
  });

  it('applyMarkdownImage insère une image markdown', () => {
    const r = applyMarkdownImage('intro', 5, 5, '/uploads/test.jpg', 'Photo');
    assert.match(r.value, /!\[Photo\]\(\/uploads\/test\.jpg\)/);
  });
});
