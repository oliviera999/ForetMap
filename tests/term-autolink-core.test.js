'use strict';

/**
 * Tronc commun des auto-liens de termes (audit glossaire 2026-08, lot 1).
 *
 * Couvre à la fois :
 *   - le miroir CJS `lib/term-autolink/termAutolink.js` (celui qui tourne en prod
 *     « runtime », sans dossier `src/`) ;
 *   - l'adaptateur ForetMap `lib/foretmapGlossaryAutolink.js` ;
 *   - la source ESM `src/utils/termAutolink.js`, chargée par import dynamique
 *     (même technique que `tests/gl-glossary-autolink.test.js`), pour vérifier que
 *     le miroir n'a pas divergé.
 *
 * Aucune base de données n'est requise.
 */

const { before, describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const { join } = require('path');

const {
  createTermAutolink: createTermAutolinkCjs,
  SKIP_TAGS,
  VOID_TAGS,
} = require('../lib/term-autolink/termAutolink');
const {
  buildGlossaryLinkEntries,
  autolinkPlainText,
  autolinkHtmlTextNodes,
  injectGlossaryAutolinkScript,
} = require('../lib/foretmapGlossaryAutolink');

let createTermAutolinkEsm;
let renderGlMarkdownWithGlossaryLinks;

before(async () => {
  const mod = await import(pathToFileURL(join(__dirname, '../src/utils/termAutolink.js')).href);
  createTermAutolinkEsm = mod.createTermAutolink;
  const gl = await import(
    pathToFileURL(join(__dirname, '../src/utils/glGlossaryAutolink.js')).href
  );
  renderGlMarkdownWithGlossaryLinks = gl.renderGlMarkdownWithGlossaryLinks;
});

const ITEMS = [
  { glossary_code: 'FM0001', terme: 'sol', variantes: 'sols' },
  { glossary_code: 'FM0002', terme: 'sol vivant' },
  {
    glossary_code: 'FM0003',
    terme: 'Écosystème',
    variantes: 'ecosysteme; écosystèmes | biotope\nmilieu',
  },
];

const entriesFor = (items = ITEMS) => buildGlossaryLinkEntries(items);
const countLinks = (html) => (html.match(/class="fm-glossary-inline-link"/g) || []).length;

describe('termAutolink — contenus à ne jamais lier (audit A3)', () => {
  const entries = entriesFor();

  test('le contenu d’un <style> reste intact', () => {
    const html = '<style>.sol{color:red}</style><p>Le sol est vivant.</p>';
    const linked = autolinkHtmlTextNodes(html, entries);
    assert.ok(linked.includes('<style>.sol{color:red}</style>'));
    assert.equal(countLinks(linked), 1);
  });

  test('le contenu d’un <script> reste intact', () => {
    const html = '<script>var sol = 1;</script><p>Le sol.</p>';
    const linked = autolinkHtmlTextNodes(html, entries);
    assert.ok(linked.includes('<script>var sol = 1;</script>'));
    assert.equal(countLinks(linked), 1);
  });

  test('<code> et <pre> sont ignorés', () => {
    const linked = autolinkHtmlTextNodes('<pre><code>sol()</code></pre><p>le sol</p>', entries);
    assert.ok(linked.includes('<pre><code>sol()</code></pre>'));
    assert.equal(countLinks(linked), 1);
  });

  test('un texte déjà dans un <a> n’est pas relié', () => {
    const linked = autolinkHtmlTextNodes('<a href="https://example.org">sol</a> et sol', entries);
    assert.equal(countLinks(linked), 1);
    assert.ok(linked.includes('<a href="https://example.org">sol</a>'));
  });

  test('le skip se referme correctement : le texte après </style> est lié', () => {
    const linked = autolinkHtmlTextNodes(
      '<style>a{}</style>Le sol.<style>b{}</style>Le sol.',
      entries,
    );
    assert.equal(countLinks(linked), 2);
  });
});

describe('termAutolink — éléments vides (audit A6)', () => {
  const entries = entriesFor();

  test('<img src="x"> non auto-fermé ne coupe pas les liens suivants', () => {
    const html =
      '<p>Le sol est vivant.</p><p><img src="https://ex.org/a.png"></p><p>Encore le sol après l’image.</p>';
    const linked = autolinkHtmlTextNodes(html, entries);
    assert.equal(countLinks(linked), 2);
    assert.ok(linked.includes('<img src="https://ex.org/a.png">'));
  });

  test('<img … /> auto-fermé se comporte de la même façon', () => {
    const linked = autolinkHtmlTextNodes('sol <img src="a.png" /> sol', entries);
    assert.equal(countLinks(linked), 2);
  });

  test('<br>, <hr> et <input> ne coupent pas non plus', () => {
    const linked = autolinkHtmlTextNodes('sol<br>sol<hr>sol<input name="x">sol', entries);
    assert.equal(countLinks(linked), 4);
  });

  test('tous les éléments vides HTML sont connus de VOID_TAGS', () => {
    for (const tag of [
      'area',
      'base',
      'br',
      'col',
      'embed',
      'hr',
      'img',
      'input',
      'link',
      'meta',
      'param',
      'source',
      'track',
      'wbr',
    ]) {
      assert.ok(VOID_TAGS.has(tag), `${tag} absent de VOID_TAGS`);
    }
    assert.ok(SKIP_TAGS.has('style') && SKIP_TAGS.has('script'));
  });
});

describe('termAutolink — tokenisation robuste (audit A10)', () => {
  const entries = entriesFor();

  test('un attribut contenant un « > » entre guillemets ne casse pas le découpage', () => {
    const html = '<p><img src="a.png" alt="la roche > le sol"> le sol</p>';
    const linked = autolinkHtmlTextNodes(html, entries);
    assert.ok(linked.includes('alt="la roche > le sol"'), 'la balise doit rester intacte');
    assert.equal(countLinks(linked), 1);
  });

  test('un attribut en guillemets simples est traité pareillement', () => {
    const html = "<p><span title='a > sol'>le sol</span></p>";
    const linked = autolinkHtmlTextNodes(html, entries);
    assert.ok(linked.includes("title='a > sol'"));
    assert.equal(countLinks(linked), 1);
  });

  test('un commentaire HTML contenant un « > » est opaque', () => {
    const html = '<!-- roche > sol --><p>le sol</p>';
    const linked = autolinkHtmlTextNodes(html, entries);
    assert.ok(linked.includes('<!-- roche > sol -->'));
    assert.equal(countLinks(linked), 1);
  });

  test('un commentaire contenant une balise à ignorer ne bloque pas la suite', () => {
    const linked = autolinkHtmlTextNodes('<!-- <style> --><p>le sol</p>', entries);
    assert.equal(countLinks(linked), 1);
  });

  test('le doctype est opaque', () => {
    const linked = autolinkHtmlTextNodes('<!DOCTYPE html><p>le sol</p>', entries);
    assert.ok(linked.startsWith('<!DOCTYPE html>'));
    assert.equal(countLinks(linked), 1);
  });

  test('aucun lien n’est jamais injecté à l’intérieur d’une balise', () => {
    const html = '<p data-note="sol"><img alt="a > sol" src="a.png"><!-- b > sol -->le sol</p>';
    const linked = autolinkHtmlTextNodes(html, entries);
    assert.equal(countLinks(linked), 1);
    assert.ok(!/<[^>]*<a href="#"/.test(linked));
  });
});

describe('termAutolink — échappement de l’attribut (audit A10)', () => {
  test('un code contenant « " » ou « & » est échappé', () => {
    const entries = entriesFor([{ glossary_code: 'A"B&C<D', terme: 'sol' }]);
    const linked = autolinkPlainText('le sol', entries);
    assert.ok(linked.includes('data-glossary-code="A&quot;B&amp;C&lt;D"'));
    assert.ok(!linked.includes('data-glossary-code="A"B'));
  });

  test('une apostrophe est échappée', () => {
    const entries = entriesFor([{ glossary_code: "L'A", terme: 'sol' }]);
    assert.ok(autolinkPlainText('le sol', entries).includes('data-glossary-code="L&#39;A"'));
  });
});

describe('termAutolink — non-régression de la détection', () => {
  const entries = entriesFor();

  test('le libellé le plus long gagne et il n’y a pas de chevauchement', () => {
    const linked = autolinkPlainText('Le sol vivant respire.', entries);
    assert.equal(countLinks(linked), 1);
    assert.ok(linked.includes('data-glossary-code="FM0002">sol vivant</a>'));
  });

  test('les variantes acceptent les séparateurs , ; | et retour ligne', () => {
    for (const [text, expected] of [
      ['un ecosysteme', 'FM0003'],
      ['des écosystèmes', 'FM0003'],
      ['un biotope', 'FM0003'],
      ['le milieu', 'FM0003'],
      ['des sols', 'FM0001'],
    ]) {
      const linked = autolinkPlainText(text, entries);
      assert.ok(linked.includes(`data-glossary-code="${expected}"`), text);
    }
  });

  test('casse et accents : « Écosystème » lie « écosystème »', () => {
    assert.ok(autolinkPlainText('un écosystème', entries).includes('data-glossary-code="FM0003"'));
    assert.ok(autolinkPlainText('Un Sol.', entries).includes('>Sol</a>'));
  });

  test('frontières de mots : une variante non déclarée ne matche pas', () => {
    const strict = entriesFor([{ glossary_code: 'FM0003', terme: 'Écosystème' }]);
    assert.equal(autolinkPlainText('des écosystèmes', strict), 'des écosystèmes');
    assert.equal(
      autolinkPlainText('parasol', entriesFor([{ glossary_code: 'S', terme: 'sol' }])),
      'parasol',
    );
  });

  test('le texte sans terme est renvoyé tel quel', () => {
    assert.equal(autolinkPlainText('rien à voir ici', entries), 'rien à voir ici');
    assert.equal(autolinkHtmlTextNodes('<p>rien à voir</p>', entries), '<p>rien à voir</p>');
  });

  test('les entrées sont triées par longueur de libellé décroissante', () => {
    const built = entriesFor();
    assert.equal(built[0].code, 'FM0003');
  });

  test('les regex précompilées sont réutilisables (lastIndex remis à zéro)', () => {
    const built = entriesFor();
    const first = autolinkPlainText('le sol et le sol', built);
    const second = autolinkPlainText('le sol et le sol', built);
    assert.equal(first, second);
    assert.equal(countLinks(first), 2);
  });
});

describe('foretmapGlossaryAutolink — surface publique et script injecté', () => {
  test('la sortie HTML légitime est inchangée (classe + attribut ForetMap)', () => {
    const entries = entriesFor([{ glossary_code: 'FM0001', terme: 'sol' }]);
    assert.equal(
      autolinkPlainText('Le sol est vivant.', entries),
      'Le <a href="#" class="fm-glossary-inline-link" data-glossary-code="FM0001">sol</a> est vivant.',
    );
  });

  test('injectGlossaryAutolinkScript cible l’origine de l’application', () => {
    const out = injectGlossaryAutolinkScript('<html><body><p>x</p></body></html>');
    assert.ok(out.includes('window.location.origin'));
    assert.ok(!out.includes("}, '*')"));
    assert.ok(out.includes('</script></body>'));
  });

  test('injectGlossaryAutolinkScript ajoute le script même sans </body>', () => {
    const out = injectGlossaryAutolinkScript('<p>x</p>');
    assert.ok(out.startsWith('<p>x</p><script>'));
  });
});

describe('miroir CJS ↔ source ESM', () => {
  const config = {
    codeField: 'glossary_code',
    cssClass: 'fm-glossary-inline-link',
    dataAttr: 'data-glossary-code',
  };
  const SAMPLE =
    '<!DOCTYPE html><style>.sol{}</style><p>Le sol vivant.</p><img alt="a > b" src="x.png"><p>Encore le sol.</p>';

  test('le miroir produit exactement la même sortie que la source', () => {
    const cjs = createTermAutolinkCjs(config);
    const esm = createTermAutolinkEsm(config);
    const outCjs = cjs.autolinkHtmlTextNodes(SAMPLE, cjs.buildEntries(ITEMS));
    const outEsm = esm.autolinkHtmlTextNodes(SAMPLE, esm.buildEntries(ITEMS));
    assert.equal(outCjs, outEsm);
    assert.equal(countLinks(outCjs), 2);
  });

  test('la fabrique reste paramétrable (configuration GL)', () => {
    const gl = createTermAutolinkCjs({
      codeField: 'lore_code',
      cssClass: 'gl-lore-glossary-link',
      dataAttr: 'data-gl-lore-code',
    });
    const entries = gl.buildEntries([
      { lore_code: 'LO0001', terme: 'Sylphe', variantes: 'sylphes' },
    ]);
    assert.equal(
      gl.autolinkPlainText('Un sylphe passe.', entries),
      'Un <a href="#" class="gl-lore-glossary-link" data-gl-lore-code="LO0001">sylphe</a> passe.',
    );
  });
});

describe('GL — bug jumeau A6 de bout en bout', () => {
  test('les termes situés après une image markdown restent liés', () => {
    const html = renderGlMarkdownWithGlossaryLinks(
      "Le sol est vivant.\n\n![photo](https://ex.org/a.png)\n\nEncore le sol après l'image.",
      [{ glossary_code: 'GL0001', terme: 'sol' }],
      { allowImages: true },
    );
    assert.ok(html.includes('<img'), 'l’image doit être rendue');
    assert.equal((html.match(/data-gl-glossary-code="GL0001"/g) || []).length, 2);
  });
});
