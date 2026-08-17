// Dégel du registre d'aide : la base ne stocke plus que la surcharge.
// Tests purs (aucune base) — la persistance elle-même est couverte par
// tests/help-content-routes.test.js.
require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');

const { buildStoredOverride, diffAgainstDefaults } = require('../lib/shared/jsonDefaultsStore');
const {
  buildHelpOverride,
  loadNormalizedDefaults,
  normalizeHelpConfig,
} = require('../lib/helpContent');

test('une valeur identique au défaut n’est pas stockée', () => {
  assert.strictEqual(diffAgainstDefaults('Fermer', 'Fermer'), undefined);
  assert.strictEqual(diffAgainstDefaults({ a: 'x' }, { a: 'x' }), undefined);
  assert.strictEqual(diffAgainstDefaults({ a: { b: 'x' } }, { a: { b: 'x' } }), undefined);
});

test('seule la valeur réellement modifiée est retenue', () => {
  const diff = diffAgainstDefaults({ a: 'x', b: 'neuf' }, { a: 'x', b: 'vieux' });
  assert.deepStrictEqual(diff, { b: 'neuf' });
});

test('vider un texte est une décision : la chaîne vide est conservée', () => {
  assert.deepStrictEqual(diffAgainstDefaults({ a: '' }, { a: 'Astuce :' }), { a: '' });
});

test('une clé absente des défauts est conservée telle quelle', () => {
  assert.deepStrictEqual(diffAgainstDefaults({ nouveau: 'v' }, {}), { nouveau: 'v' });
});

test('un tableau d’objets se diffe position par position, trous compris', () => {
  const diff = diffAgainstDefaults(
    [{ text: 'a' }, { text: 'B modifié' }, { text: 'c' }],
    [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
  );
  assert.deepStrictEqual(diff, [{}, { text: 'B modifié' }, {}]);
});

test('un tableau d’objets inchangé n’est pas stocké', () => {
  assert.strictEqual(
    diffAgainstDefaults([{ text: 'a' }, { text: 'b' }], [{ text: 'a' }, { text: 'b' }]),
    undefined,
  );
});

test('buildStoredOverride renvoie {} plutôt qu’undefined quand rien ne diffère', () => {
  assert.deepStrictEqual(buildStoredOverride({ a: 'x' }, { a: 'x' }), {});
});

test('le corpus par défaut ne produit aucune surcharge', () => {
  assert.deepStrictEqual(buildHelpOverride(loadNormalizedDefaults()), {});
});

test('réenregistrer sans rien changer ne stocke rien', () => {
  // Cas réel : un prof ouvre le studio et l'autosave repart avec le corpus intact.
  assert.deepStrictEqual(buildHelpOverride(normalizeHelpConfig({})), {});
});

test('une surcharge vide se relit exactement comme les défauts', () => {
  assert.deepStrictEqual(normalizeHelpConfig({}), loadNormalizedDefaults());
});

test('modifier un seul texte ne stocke que lui, et le rendu est inchangé', () => {
  const defaults = loadNormalizedDefaults();
  const edited = loadNormalizedDefaults();
  edited.panels.map.items[0].text = 'Texte réécrit à la voix d’OLU.';

  const override = buildHelpOverride(edited);

  assert.deepStrictEqual(Object.keys(override), ['panels']);
  assert.deepStrictEqual(Object.keys(override.panels), ['map']);
  assert.strictEqual(
    Object.keys(override.panels.map).length,
    1,
    'le titre du panneau n’est pas restocké',
  );
  assert.strictEqual(override.panels.map.items[0].text, 'Texte réécrit à la voix d’OLU.');
  assert.deepStrictEqual(override.panels.map.items[1], {});
  // Le rendu servi reste celui qu'on vient d'éditer, défauts compris ailleurs.
  const resolved = normalizeHelpConfig(override);
  assert.strictEqual(resolved.panels.map.items[0].text, 'Texte réécrit à la voix d’OLU.');
  assert.strictEqual(resolved.panels.tasks.title, defaults.panels.tasks.title);
});

// ── La propriété qui justifie tout le lot ────────────────────────────────────
test('un défaut amélioré reste visible partout où rien n’a été réécrit', () => {
  const defaultsV1 = loadNormalizedDefaults();

  // Un prof réécrit un seul point du panneau « Carte ».
  const edited = loadNormalizedDefaults();
  edited.panels.map.items[0].text = 'Choix du prof.';
  const override = buildHelpOverride(edited);

  // Le dépôt évolue : deux textes que personne n'a touchés sont réécrits.
  const defaultsV2 = loadNormalizedDefaults();
  defaultsV2.panels.tasks.title = 'Tâches — nouvelle formulation';
  defaultsV2.quickTips.map = 'Nouvelle mini-astuce.';
  defaultsV2.panels.map.items[1] = { text: 'Second point réécrit.' };

  // On simule la fusion contre les NOUVEAUX défauts (ce que fait la lecture après déploiement).
  const merged = mergeAgainst(override, defaultsV2);

  assert.strictEqual(
    merged.panels.map.items[0].text,
    'Choix du prof.',
    'la décision du prof tient',
  );
  assert.strictEqual(merged.panels.map.items[1].text, 'Second point réécrit.');
  assert.strictEqual(merged.panels.tasks.title, 'Tâches — nouvelle formulation');
  assert.strictEqual(merged.quickTips.map, 'Nouvelle mini-astuce.');
  assert.notStrictEqual(merged.quickTips.map, defaultsV1.quickTips.map);
});

test('l’ancien modèle dense, lui, gèle tout — c’est le comportement corrigé', () => {
  const dense = normalizeHelpConfig(loadNormalizedDefaults()); // ce que l'on stockait avant
  const defaultsV2 = loadNormalizedDefaults();
  defaultsV2.quickTips.map = 'Nouvelle mini-astuce.';

  const merged = mergeAgainst(dense, defaultsV2);
  assert.notStrictEqual(
    merged.quickTips.map,
    'Nouvelle mini-astuce.',
    'objet dense stocké ⇒ le nouveau défaut n’atteint jamais l’écran',
  );
});

/**
 * Rejoue `normalizeHelpConfig` contre un jeu de défauts arbitraire.
 *
 * Le chargeur de défauts est mémoïsé sur le fichier du dépôt : pour éprouver
 * « les défauts changent », on reproduit ici la règle de fusion du module
 * (surcharge prioritaire, repli positionnel sur les défauts) plutôt que de
 * réécrire `data/help.default.json` pendant un test.
 */
function mergeAgainst(override, defaults) {
  const pick = (a, b) => (a === undefined || a === null ? b : a);
  const panels = {};
  for (const [id, panel] of Object.entries(defaults.panels)) {
    const raw = override.panels?.[id] || {};
    const items = [];
    const maxLen = Math.max((raw.items || []).length, panel.items.length);
    for (let i = 0; i < maxLen; i += 1) {
      const over = (raw.items || [])[i] || {};
      const base = panel.items[i] || {};
      items.push({
        text: pick(over.text, base.text),
        textTeacher: pick(over.textTeacher, base.textTeacher),
      });
    }
    panels[id] = { title: pick(raw.title, panel.title), items };
  }
  const section = (name) => {
    const out = {};
    for (const [key, value] of Object.entries(defaults[name] || {})) {
      out[key] = pick(override[name]?.[key], value);
    }
    return out;
  };
  const tooltips = {};
  for (const key of new Set([
    ...Object.keys(defaults.tooltips || {}),
    ...Object.keys(override.tooltips || {}),
  ])) {
    const over = override.tooltips?.[key] || {};
    const base = defaults.tooltips?.[key] || {};
    tooltips[key] = {
      text: pick(over.text, base.text),
      textTeacher: pick(over.textTeacher, base.textTeacher),
    };
  }
  return {
    tooltips,
    panels,
    quickTips: section('quickTips'),
    chrome: section('chrome'),
    mapCanvasHints: section('mapCanvasHints'),
    realtime: section('realtime'),
  };
}
