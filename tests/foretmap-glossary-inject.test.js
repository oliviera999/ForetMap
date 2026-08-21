'use strict';

/**
 * Lot 2 — injection, dans l'iframe d'un tutoriel, de la feuille de style des auto-liens
 * du glossaire (audit A8) et du relais de clic vers l'application (audit A10).
 *
 * Test pur (aucune base de données) : `injectGlossaryAutolinkScript` est une fonction
 * de chaîne de caractères. Les cas du moteur d'auto-liens lui-même appartiennent au
 * lot 1 (`tests/term-autolink-core.test.js`), qui n'est pas touché ici.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { injectGlossaryAutolinkScript } = require('../lib/foretmapGlossaryAutolink');

const PAGE = `<html><head><style>a{color:#f0f}</style></head><body><p>Le <a href="#" class="fm-glossary-inline-link" data-glossary-code="FM0001">sol</a>.</p></body></html>`;

function countOccurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

test.describe('injectGlossaryAutolinkScript — feuille de style dans l’iframe (A8)', () => {
  test('injecte une feuille de style ciblant la classe des auto-liens', () => {
    const out = injectGlossaryAutolinkScript(PAGE);
    assert.ok(out.includes('<style data-fm-glossary-style>'));
    assert.ok(out.includes('a.fm-glossary-inline-link'));
    assert.ok(out.includes('cursor: help'));
    assert.ok(out.includes('text-decoration-style: dotted'));
  });

  test('reste discrète : aucun !important imposé aux fiches', () => {
    const out = injectGlossaryAutolinkScript(PAGE);
    const styleBlock = out.slice(out.indexOf('<style'), out.indexOf('</style>'));
    assert.ok(!styleBlock.includes('!important'));
  });

  test('la feuille de style est posée avant </body>, et avant le script', () => {
    const out = injectGlossaryAutolinkScript(PAGE);
    const styleAt = out.indexOf('<style data-fm-glossary-style>');
    const scriptAt = out.indexOf('<script>');
    const bodyEndAt = out.indexOf('</body>');
    assert.ok(styleAt > -1 && scriptAt > -1 && bodyEndAt > -1);
    assert.ok(styleAt < scriptAt, 'le style doit précéder le script');
    assert.ok(scriptAt < bodyEndAt, 'style et script doivent précéder </body>');
    // Contrat conservé pour le lot 1 : le document se termine par `</script></body>`.
    assert.ok(out.includes('</script></body>'));
  });

  test('une seule feuille de style, même sur un HTML déjà enrichi', () => {
    const once = injectGlossaryAutolinkScript(PAGE);
    assert.equal(countOccurrences(once, 'data-fm-glossary-style'), 1);
    assert.equal(countOccurrences(once, "type: 'foretmap:glossary'"), 1);

    const twice = injectGlossaryAutolinkScript(once);
    assert.equal(twice, once, 'la seconde passe doit être un no-op (idempotence)');
    assert.equal(countOccurrences(twice, 'data-fm-glossary-style'), 1);
    assert.equal(countOccurrences(twice, "type: 'foretmap:glossary'"), 1);
  });

  test('repli sans </body> : contenu, puis script, puis style', () => {
    const out = injectGlossaryAutolinkScript('<p>x</p>');
    assert.ok(out.startsWith('<p>x</p><script>'));
    assert.ok(out.includes('data-fm-glossary-style'));
    assert.ok(out.indexOf('</script>') < out.indexOf('<style'));
  });

  test('entrée vide ou nulle : la fiche reste enrichissable sans planter', () => {
    assert.ok(injectGlossaryAutolinkScript('').includes('data-fm-glossary-style'));
    assert.ok(injectGlossaryAutolinkScript(null).includes('data-fm-glossary-style'));
  });
});

test.describe('injectGlossaryAutolinkScript — relais de clic ciblé (A10)', () => {
  test('le postMessage vise l’origine de l’application, jamais "*"', () => {
    const out = injectGlossaryAutolinkScript(PAGE);
    assert.ok(out.includes('window.location.origin'));
    assert.ok(!out.includes("}, '*')"));
    assert.ok(!out.includes('}, "*")'));
  });

  test('le relais ne réagit qu’aux auto-liens du glossaire', () => {
    const out = injectGlossaryAutolinkScript(PAGE);
    assert.ok(out.includes("closest('a.fm-glossary-inline-link')"));
    assert.ok(out.includes("getAttribute('data-glossary-code')"));
  });
});
