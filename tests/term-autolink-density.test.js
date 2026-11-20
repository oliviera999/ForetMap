'use strict';

/**
 * Densité des auto-liens de glossaire (audit UI/UX du 19/11/2026, constat U7) :
 *   - homographes jamais liés hors d'un contexte nominal (« droit vers le bas ») ;
 *   - premier emploi seulement par bloc de texte ;
 *   - même rendu des trois côtés : serveur (miroir CJS), client ForetMap, client G&L.
 *
 * Aucune base de données n'est requise.
 */

const { before, describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const { join } = require('path');

const core = require('../lib/shared/termAutolinkCore');
const server = require('../lib/foretmapGlossaryAutolink');

let fm;
let gl;
let lore;
let esmCore;

const load = (rel) => import(pathToFileURL(join(__dirname, '..', rel)).href);

before(async () => {
  fm = await load('src/utils/foretmapGlossaryAutolink.js');
  gl = await load('src/utils/glGlossaryAutolink.js');
  lore = await load('src/utils/glLoreGlossaryAutolink.js');
  esmCore = await load('src/shared/glossary/termAutolinkCore.js');
});

// Extrait réel du glossaire de prod (20/11/2026).
const ITEMS = [
  { glossary_code: 'FM0110', terme: 'ver', variantes: 'vers' },
  { glossary_code: 'FM0252', terme: 'ver de terre', variantes: 'vers de terre, lombric, lombrics' },
  { glossary_code: 'FM0142', terme: 'sol' },
  { glossary_code: 'GL0094', terme: 'été' },
];

const linkedCodes = (html) =>
  [...String(html).matchAll(/data-(?:gl-)?glossary-code="([^"]+)"/g)].map((m) => m[1]);

const serverLink = (text) => server.autolinkPlainText(text, server.buildGlossaryLinkEntries(ITEMS));

describe('U7 — homographes', () => {
  test('« plonge droit vers le bas » : « vers » n’est pas lié', () => {
    assert.deepEqual(linkedCodes(serverLink('Le martin-pêcheur plonge droit vers le bas.')), []);
  });

  test('« des vers de terre » : lié (au terme le plus long)', () => {
    assert.deepEqual(linkedCodes(serverLink('On trouve des vers de terre.')), ['FM0252']);
  });

  test('« vers de terre » est lié même sans déterminant', () => {
    assert.deepEqual(linkedCodes(serverLink('Vers de terre et cloportes.')), ['FM0252']);
  });

  test('« des vers » seul (nom pluriel) est lié à « ver »', () => {
    assert.deepEqual(linkedCodes(serverLink('Le merle mange des vers.')), ['FM0110']);
  });

  test('« a été » (verbe) non lié, « l’été » et « en été » liés', () => {
    assert.deepEqual(linkedCodes(serverLink('La mare a été creusée.')), []);
    assert.deepEqual(linkedCodes(serverLink('Pendant l’été, la mare sèche.')), ['GL0094']);
    assert.deepEqual(linkedCodes(serverLink("Pendant l'été.")), ['GL0094']);
    assert.deepEqual(linkedCodes(serverLink('En été, elle sèche.')), ['GL0094']);
  });

  test('la casse ne contourne pas la règle (« Vers le bas »)', () => {
    assert.deepEqual(linkedCodes(serverLink('Vers le bas, le sol.')), ['FM0142']);
  });

  test('liste de départ des homographes', () => {
    assert.deepEqual([...core.HOMOGRAPH_FORMS], ['vers', 'été', 'sens', 'son', 'fin', 'mare']);
  });

  test('un terme non homographe n’est pas concerné', () => {
    assert.equal(core.isBlockedHomograph('droit sol', 6, 'sol'), false);
    assert.equal(core.isBlockedHomograph('droit vers', 6, 'vers'), true);
    assert.equal(core.isBlockedHomograph('des vers', 4, 'vers'), false);
  });
});

describe('U7 — premier emploi seulement', () => {
  test('un même terme n’est lié qu’une fois dans un texte brut', () => {
    assert.deepEqual(linkedCodes(serverLink('Le sol, puis le sol, encore le sol.')), ['FM0142']);
  });

  test('un même terme n’est lié qu’une fois dans tout un document HTML', () => {
    const html = server.autolinkHtmlTextNodes(
      '<p>Le sol est vivant.</p><p>Sous le <em>sol</em>, des vers de terre.</p><p>Le sol encore.</p>',
      server.buildGlossaryLinkEntries(ITEMS),
    );
    assert.deepEqual(linkedCodes(html), ['FM0142', 'FM0252']);
  });

  test('une occurrence déjà liée ne laisse pas un terme plus court se lier à l’intérieur', () => {
    const html = serverLink('Des vers de terre, encore des vers de terre.');
    assert.deepEqual(linkedCodes(html), ['FM0252']);
  });

  test('deux rendus successifs sont indépendants (pas d’état global)', () => {
    assert.equal(serverLink('le sol'), serverLink('le sol'));
    assert.deepEqual(linkedCodes(serverLink('le sol')), ['FM0142']);
  });

  test('markdown ForetMap : premier emploi par fiche', () => {
    const html = fm.renderMarkdownWithGlossaryLinks('Le sol.\n\nLe sol.\n\n- le sol', ITEMS);
    assert.deepEqual(linkedCodes(html), ['FM0142']);
  });
});

describe('U7 — même rendu des trois côtés', () => {
  const SAMPLES = [
    'Le martin-pêcheur plonge droit vers le bas, vers le sol.',
    'Des vers de terre aèrent le sol ; le sol et les vers.',
    'La mare a été creusée ; en été, le sol craque.',
  ];

  test('miroir CJS et source ESM produisent la même sortie', () => {
    const cfg = { codeField: 'glossary_code', cssClass: 'x', dataAttr: 'data-glossary-code' };
    const a = core.createTermAutolink(cfg);
    const b = esmCore.createTermAutolink(cfg);
    for (const text of SAMPLES) {
      assert.equal(
        a.autolinkHtmlTextNodes(text, a.buildEntries(ITEMS)),
        b.autolinkHtmlTextNodes(text, b.buildEntries(ITEMS)),
      );
    }
  });

  test('serveur (tutoriels), client ForetMap et client G&L lient les mêmes codes', () => {
    for (const text of SAMPLES) {
      const s = linkedCodes(
        server.autolinkHtmlTextNodes(text, server.buildGlossaryLinkEntries(ITEMS)),
      );
      const f = linkedCodes(fm.autolinkHtmlTextNodes(text, fm.buildGlossaryLinkEntries(ITEMS)));
      const g = linkedCodes(gl.autolinkHtmlTextNodes(text, gl.buildGlossaryLinkEntries(ITEMS)));
      assert.deepEqual(f, s, text);
      assert.deepEqual(g, s, text);
    }
  });

  test('glossaire lore G&L : mêmes règles', () => {
    const items = [{ lore_code: 'LO0001', terme: 'fin', variantes: '' }];
    const entries = lore.buildLoreGlossaryLinkEntries(items);
    assert.ok(lore.autolinkLorePlainText('À la fin de la partie.', entries).includes('LO0001'));
    assert.ok(!lore.autolinkLorePlainText('Enfin, fin de partie.', entries).includes('<a'));
  });
});
