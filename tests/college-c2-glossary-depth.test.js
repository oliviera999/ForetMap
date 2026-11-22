'use strict';

/**
 * Chantier collège, flux C2 — barrière de vocabulaire **douce**.
 *
 * Tests purs (aucune base) : la profondeur maximale d'un palier (règle `glossary_depth_max`)
 * filtre l'index d'auto-lien ForêtMap avant `buildEntries`, côté serveur (tutoriels) comme
 * côté front ; le cœur partagé avec G&L (`termAutolinkCore`) n'est pas concerné.
 *
 * Valeurs de palier attendues (décision 2 du 21/11/2026) : cycle 3 = `base`, cycle 4 =
 * `base` + `approfondissement` (`depthMax = 'approfondissement'`), lycée = pas de filtre.
 * Tant que C1 n'a pas rempli la table de visibilité, ces valeurs sont passées explicitement.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const server = require('../lib/foretmapGlossaryAutolink');
const { PALIER_RULES_TABLE } = require('../lib/shared/pedagoVisibilityCore');

const CYCLE3 = 'base';
const CYCLE4 = 'approfondissement';
const LYCEE = null;

const ROWS = [
  { glossary_code: 'FM_POL', terme: 'pollinisateur', variantes: 'pollinisateurs', niveau: 'base' },
  { glossary_code: 'FM_HUM', terme: 'humus', variantes: '', niveau: 'approfondissement' },
  { glossary_code: 'FM_BIO', terme: 'biocénose', variantes: '', niveau: 'avance' },
  { glossary_code: 'FM_SNV', terme: 'mycélium', variantes: '', niveau: null },
];

const TEXT = '<p>Le pollinisateur, l’humus, la biocénose et le mycélium.</p>';

function linkedCodes(html) {
  return [...html.matchAll(/data-glossary-code="([^"]+)"/g)].map((m) => m[1]).sort();
}

function linkWith(depthMax) {
  const entries = server.createGlossaryEntriesByDepth(ROWS)(depthMax);
  return linkedCodes(server.autolinkHtmlTextNodes(TEXT, entries));
}

async function loadFront() {
  const url = pathToFileURL(
    path.join(__dirname, '..', 'src', 'utils', 'foretmapGlossaryAutolink.js'),
  ).href;
  return import(url);
}

test.describe('Barrière de vocabulaire — comparaison des profondeurs', () => {
  test('cycle 3 : seuls les termes « base » passent', () => {
    assert.equal(server.isGlossaryNiveauWithinDepth('base', CYCLE3), true);
    assert.equal(server.isGlossaryNiveauWithinDepth('approfondissement', CYCLE3), false);
    assert.equal(server.isGlossaryNiveauWithinDepth('avance', CYCLE3), false);
  });

  test('cycle 4 : « base » et « approfondissement » passent, pas « avancé »', () => {
    assert.equal(server.isGlossaryNiveauWithinDepth('base', CYCLE4), true);
    assert.equal(server.isGlossaryNiveauWithinDepth('approfondissement', CYCLE4), true);
    assert.equal(server.isGlossaryNiveauWithinDepth('avance', CYCLE4), false);
  });

  test('pas de filtre : profondeur maximale nulle, vide ou inconnue', () => {
    for (const depthMax of [null, undefined, '', 'inconnue']) {
      assert.equal(server.isGlossaryNiveauWithinDepth('avance', depthMax), true);
    }
  });

  test('un terme sans profondeur connue est gardé (prudence)', () => {
    assert.equal(server.isGlossaryNiveauWithinDepth(null, CYCLE3), true);
    assert.equal(server.isGlossaryNiveauWithinDepth('???', CYCLE3), true);
  });

  test('casse et accents tolérés (« Avancé »)', () => {
    assert.equal(server.isGlossaryNiveauWithinDepth('Avancé', CYCLE4), false);
    assert.equal(server.isGlossaryNiveauWithinDepth('BASE', CYCLE3), true);
  });

  test('sans filtre, le même tableau est rendu (mémoïsations stables)', () => {
    assert.equal(server.filterGlossaryItemsByDepth(ROWS, null), ROWS);
    assert.deepEqual(server.filterGlossaryItemsByDepth(null, CYCLE3), []);
  });
});

test.describe('Barrière de vocabulaire — auto-lien serveur (tutoriels)', () => {
  test('terme « avancé » non lié au collège, lié au lycée', () => {
    assert.ok(!linkWith(CYCLE3).includes('FM_BIO'));
    assert.ok(!linkWith(CYCLE4).includes('FM_BIO'));
    assert.ok(linkWith(LYCEE).includes('FM_BIO'));
  });

  test('terme « approfondissement » lié en 3e (cycle 4), pas en 6e (cycle 3)', () => {
    assert.ok(linkWith(CYCLE4).includes('FM_HUM'));
    assert.ok(!linkWith(CYCLE3).includes('FM_HUM'));
  });

  test('les termes « base » et sans profondeur restent liés partout', () => {
    for (const depth of [CYCLE3, CYCLE4, LYCEE]) {
      const codes = linkWith(depth);
      assert.ok(codes.includes('FM_POL'));
      assert.ok(codes.includes('FM_SNV'));
    }
  });

  test('l’index par palier mémorise les entrées par profondeur', () => {
    const entriesFor = server.createGlossaryEntriesByDepth(ROWS);
    assert.equal(entriesFor(CYCLE3), entriesFor('base'));
    assert.equal(entriesFor(null), entriesFor('inconnue'));
    assert.notEqual(entriesFor(CYCLE3), entriesFor(CYCLE4));
  });

  test('clé de cache : « all » sans filtre, valeur canonique sinon', () => {
    assert.equal(server.glossaryDepthCacheKey(null), 'all');
    assert.equal(server.glossaryDepthCacheKey('n’importe'), 'all');
    assert.equal(server.glossaryDepthCacheKey(' Base '), 'base');
  });

  test('glossaryDepthMaxForLearner lit la règle de palier (null tant que la table vaut S0)', () => {
    const rule = PALIER_RULES_TABLE.glossary_depth_max;
    const learners = {
      cycle3: { etape: 'college', maxPalier: 1 },
      cycle4: { etape: 'college', maxPalier: 2 },
      lycee: { etape: 'lycee', maxPalier: 5 },
      universite: { etape: 'universite' },
    };
    for (const [profile, learner] of Object.entries(learners)) {
      const expected = rule[profile] == null ? null : rule[profile];
      assert.equal(server.glossaryDepthMaxForLearner(learner), expected, profile);
    }
  });
});

test.describe('Barrière de vocabulaire — parité front ↔ serveur', () => {
  test('mêmes décisions pour toutes les combinaisons', async () => {
    const front = await loadFront();
    const values = [null, '', 'base', 'approfondissement', 'avance', 'Avancé', 'x'];
    for (const termNiveau of values) {
      for (const depthMax of values) {
        assert.equal(
          front.isGlossaryNiveauWithinDepth(termNiveau, depthMax),
          server.isGlossaryNiveauWithinDepth(termNiveau, depthMax),
          `${termNiveau} / ${depthMax}`,
        );
      }
    }
  });

  test('le front filtre l’index avant l’auto-lien (Markdown)', async () => {
    const front = await loadFront();
    const md = 'Le pollinisateur, l’humus et la biocénose.';
    const cycle3 = front.renderMarkdownWithGlossaryLinks(
      md,
      front.filterGlossaryItemsByDepth(ROWS, CYCLE3),
    );
    const lycee = front.renderMarkdownWithGlossaryLinks(
      md,
      front.filterGlossaryItemsByDepth(ROWS, LYCEE),
    );
    assert.deepEqual(linkedCodes(cycle3), ['FM_POL']);
    assert.deepEqual(linkedCodes(lycee), ['FM_BIO', 'FM_HUM', 'FM_POL']);
  });
});
