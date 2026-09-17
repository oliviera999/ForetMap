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
let applyMarkdownHtmlImage;
let classifyLinkHref;

before(async () => {
  const mod = await import(
    pathToFileURL(join(__dirname, '../src/shared/platform/markdown.js')).href
  );
  renderMarkdownToSafeHtml = mod.renderMarkdownToSafeHtml;
  applyMarkdownWrap = mod.applyMarkdownWrap;
  applyMarkdownList = mod.applyMarkdownList;
  applyMarkdownLink = mod.applyMarkdownLink;
  applyMarkdownImage = mod.applyMarkdownImage;
  applyMarkdownHtmlImage = mod.applyMarkdownHtmlImage;
  classifyLinkHref = mod.classifyLinkHref;
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

  it('renderMarkdownToSafeHtml conserve titres, citation et separateur', () => {
    const html = renderMarkdownToSafeHtml('# Titre\n\n> Citation\n\n---');
    assert.match(html, /<h1>Titre<\/h1>/);
    assert.match(html, /<blockquote>/);
    assert.match(html, /<hr>/);
  });

  it('renderMarkdownToSafeHtml ajoute rel noopener sur les liens http', () => {
    const html = renderMarkdownToSafeHtml('[site](https://example.com)');
    assert.match(html, /href="https:\/\/example\.com"/);
    assert.match(html, /rel="noopener noreferrer"/);
    assert.match(html, /target="_blank"/);
  });

  // --- Politique de lien (lots « liens dans les descriptions de repères / zones ») -------
  //
  // Le rendu ET l'enregistrement partagent ce même assainissement : `htmlToMarkdownWith`
  // assainit avant Turndown, donc une famille refusée ici ne perd pas seulement son `href`
  // à l'affichage — elle disparaît du Markdown stocké. D'où les cas des deux côtés.

  it('classifyLinkHref range chaque cible dans sa famille', () => {
    assert.equal(classifyLinkHref('https://exemple.org/a'), 'external');
    assert.equal(classifyLinkHref('http://exemple.org'), 'external');
    assert.equal(classifyLinkHref('/tutoriels/3?x=1#frag'), 'internal');
    assert.equal(classifyLinkHref('mailto:a@b.c'), 'contact');
    assert.equal(classifyLinkHref('tel:+212600000000'), 'contact');
    // Origines externes déguisées en chemin.
    assert.equal(classifyLinkHref('//exemple.org'), null);
    assert.equal(classifyLinkHref('/\\exemple.org'), null);
    // Schémas hors politique, et chemin relatif (ambigu selon la page courante).
    assert.equal(classifyLinkHref('ftp://exemple.org'), null);
    assert.equal(classifyLinkHref('tutoriels/3'), null);
    assert.equal(classifyLinkHref(''), null);
    assert.equal(classifyLinkHref(null), null);
  });

  it('renderMarkdownToSafeHtml annonce le nouvel onglet aux lecteurs d’écran', () => {
    const html = renderMarkdownToSafeHtml('[Fiche PDF](https://exemple.org/a.pdf)');
    assert.match(html, /aria-label="Fiche PDF \(ouvre un nouvel onglet\)"/);
  });

  it('renderMarkdownToSafeHtml garde les liens internes dans le même onglet', () => {
    const html = renderMarkdownToSafeHtml('[Le tutoriel](/tutoriels/3)');
    assert.match(html, /href="\/tutoriels\/3"/);
    assert.doesNotMatch(html, /target=/);
    assert.doesNotMatch(html, /aria-label=/);
  });

  it('renderMarkdownToSafeHtml garde mailto: et tel: sans nouvel onglet', () => {
    const mail = renderMarkdownToSafeHtml('[Écrire](mailto:jardin@exemple.org)');
    assert.match(mail, /href="mailto:jardin@exemple\.org"/);
    assert.doesNotMatch(mail, /target=/);
    const tel = renderMarkdownToSafeHtml('[Appeler](tel:+212600000000)');
    assert.match(tel, /href="tel:\+212600000000"/);
    assert.doesNotMatch(tel, /target=/);
  });

  it('renderMarkdownToSafeHtml neutralise les origines externes déguisées en chemin', () => {
    for (const source of ['[a](//exemple.org/x)', '<a href="/\\exemple.org/x">a</a>']) {
      const html = renderMarkdownToSafeHtml(source);
      assert.doesNotMatch(html, /href=/, source);
      assert.doesNotMatch(html, /exemple\.org/, source);
    }
  });

  it('renderMarkdownToSafeHtml retire target et rel avec le href refusé', () => {
    const html = renderMarkdownToSafeHtml(
      '<a href="ftp://exemple.org" target="_blank" rel="noopener">a</a>',
    );
    assert.doesNotMatch(html, /href=|target=|rel=/);
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
    const html = renderMarkdownToSafeHtml('![x](/uploads/media-library/image/2026/01/a.jpg)', {
      allowImages: true,
    });
    assert.match(html, /<img\b/i);
    assert.match(html, /\/uploads\/media-library\//);
  });

  it('renderMarkdownToSafeHtml allowImages supprime les sources image dangereuses', () => {
    const html = renderMarkdownToSafeHtml('![x](javascript:alert(1))', { allowImages: true });
    assert.match(html, /<img\b/i);
    assert.doesNotMatch(html, /src=/i);
  });

  it('renderMarkdownToSafeHtml normalise les attributs de cadre image GL', () => {
    const source = applyMarkdownHtmlImage(
      'intro',
      5,
      5,
      '/uploads/media-library/image/2026/01/a.jpg',
      'Photo',
      { aspectRatio: '16/9', objectFit: 'cover' },
    ).value;
    const html = renderMarkdownToSafeHtml(source, { allowImages: true });
    assert.match(html, /class="[^"]*gl-content-image/);
    assert.match(html, /class="[^"]*gl-content-image-wrap/);
    assert.match(html, /<figure[^>]*class="[^"]*gl-content-image-wrap/);
    assert.match(html, /data-gl-frame=/);
    assert.match(html, /object-fit:cover/);
    assert.match(html, /aspect-ratio:16\/9/);
  });

  it('applyMarkdownImage insère une image markdown', () => {
    const r = applyMarkdownImage('intro', 5, 5, '/uploads/test.jpg', 'Photo');
    assert.match(r.value, /!\[Photo\]\(\/uploads\/test\.jpg\)/);
  });
});
