'use strict';

const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const { join } = require('path');

let mod;

before(async () => {
  mod = await import(pathToFileURL(join(__dirname, '../src/utils/richTextFormatting.js')).href);
});

describe('hasMarkdownFormatting', () => {
  it('ignore un texte simple, même sur plusieurs lignes', () => {
    for (const text of [
      '',
      '   ',
      null,
      undefined,
      'Arroser les tomates',
      'Ligne 1\nLigne 2\n\nParagraphe',
      'Rendez-vous à 10h - pensez aux gants',
      'Prix : 3*4 = 12',
      'Adresse : https://www.exemple.fr',
      'nom_de_fichier_long.txt',
    ]) {
      assert.equal(mod.hasMarkdownFormatting(text), false, JSON.stringify(text));
    }
  });

  it('détecte titres, listes, gras, italique, liens, encadrés et séparateurs', () => {
    for (const text of [
      '## Objectif',
      '# Titre',
      '- planter\n- arroser',
      '1. semer\n2. récolter',
      'Un mot en **gras**',
      'Un mot en *italique*',
      'Un mot en _italique_',
      'Voir [la fiche](https://ex.org)',
      '> une citation',
      'Avant\n\n* * *\n\nAprès',
      'Avant\n\n---\n\nAprès',
    ]) {
      assert.equal(mod.hasMarkdownFormatting(text), true, JSON.stringify(text));
    }
  });
});

describe('divBlocksToParagraphs', () => {
  it('remplace les <div> du contenteditable par des paragraphes', () => {
    assert.equal(
      mod.divBlocksToParagraphs('abc<div>def</div><div class="x"><br></div>'),
      'abc<p>def</p><p><br></p>',
    );
  });

  it('laisse intact un HTML sans <div>', () => {
    assert.equal(mod.divBlocksToParagraphs('<p>a<br>b</p>'), '<p>a<br>b</p>');
    assert.equal(mod.divBlocksToParagraphs(null), '');
  });
});

describe('formatShortcut et toolTitle', () => {
  it('écrit Ctrl ou Cmd selon la plateforme', () => {
    assert.equal(mod.formatShortcut('b'), 'Ctrl+B');
    assert.equal(mod.formatShortcut('b', { mac: true }), 'Cmd+B');
    assert.equal(mod.formatShortcut('z', { mac: true, shift: true }), 'Cmd+Maj+Z');
  });

  it('ajoute le raccourci entre parenthèses, seulement s’il existe', () => {
    assert.equal(mod.toolTitle('Gras', 'Ctrl+B'), 'Gras (Ctrl+B)');
    assert.equal(mod.toolTitle('Titre'), 'Titre');
  });
});

describe('normalizeLinkInput', () => {
  it('ajoute https:// à une adresse de site tapée sans protocole', () => {
    assert.equal(mod.normalizeLinkInput(' www.exemple.fr '), 'https://www.exemple.fr');
    assert.equal(mod.normalizeLinkInput('exemple.fr/page?x=1'), 'https://exemple.fr/page?x=1');
  });

  it('laisse intacts protocoles, chemins internes et saisies non reconnues', () => {
    assert.equal(mod.normalizeLinkInput('https://ex.org'), 'https://ex.org');
    assert.equal(mod.normalizeLinkInput('mailto:a@b.fr'), 'mailto:a@b.fr');
    assert.equal(mod.normalizeLinkInput('tel:0102030405'), 'tel:0102030405');
    assert.equal(mod.normalizeLinkInput('/tutoriels/3'), '/tutoriels/3');
    assert.equal(mod.normalizeLinkInput('ftp://serveur'), 'ftp://serveur');
    assert.equal(mod.normalizeLinkInput('bonjour'), 'bonjour');
    assert.equal(mod.normalizeLinkInput(''), '');
  });
});

describe('escapeHtml', () => {
  it('neutralise les caractères HTML', () => {
    assert.equal(
      mod.escapeHtml('<a href="x">&\'</a>'),
      '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;',
    );
  });
});
