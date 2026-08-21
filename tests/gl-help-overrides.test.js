// Dégel des bulles d'aide GL : la base ne stocke plus que la surcharge
// (dette symétrique du §11.2 de docs/MASCOT_NARRATEUR_OLU.md).
// Tests purs (aucune base) — la persistance est couverte par tests/gl-help.test.js.
'use strict';

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');

const {
  buildGlHelpOverride,
  loadDefaultGlHelpConfig,
  loadNormalizedGlHelpDefaults,
  normalizeGlHelpConfig,
} = require('../lib/glHelp');

test('enregistrer les défauts sans y toucher ne stocke rien', () => {
  assert.deepStrictEqual(buildGlHelpOverride(loadDefaultGlHelpConfig()), {});
});

test('seule l’entrée réellement réécrite est stockée', () => {
  const draft = loadNormalizedGlHelpDefaults();
  draft.entries['tab:maps'] = { title: 'Cartes du MJ', body: 'Texte maison' };
  assert.deepStrictEqual(buildGlHelpOverride(draft), {
    entries: { 'tab:maps': { title: 'Cartes du MJ', body: 'Texte maison' } },
  });
});

test('une entrée partiellement réécrite ne fige pas l’autre champ', () => {
  const draft = loadNormalizedGlHelpDefaults();
  draft.entries['tab:forum'].body = 'Consigne locale';
  const override = buildGlHelpOverride(draft);
  assert.deepStrictEqual(override, { entries: { 'tab:forum': { body: 'Consigne locale' } } });
  // Le titre non réécrit continue de suivre le dépôt : c'est tout l'objet du dégel.
  assert.strictEqual(
    normalizeGlHelpConfig(override).entries['tab:forum'].title,
    loadNormalizedGlHelpDefaults().entries['tab:forum'].title,
  );
});

test('la surcharge se relit à l’identique de la configuration dense', () => {
  const draft = loadNormalizedGlHelpDefaults();
  draft.entries['tab:rules'] = { title: 'Nos règles', body: 'Version de la classe' };
  assert.deepStrictEqual(normalizeGlHelpConfig(buildGlHelpOverride(draft)), draft);
});

// Variante MJ (`bodyMj`) : champ optionnel, pendant du `textTeacher` de ForetMap.
test('une entrée sans variante MJ n’en gagne pas une vide', () => {
  const defaults = loadNormalizedGlHelpDefaults();
  assert.ok(!('bodyMj' in defaults.entries['tab:discovery']));
  assert.ok(defaults.entries['tab:maps'].bodyMj, 'la carte doit porter une variante MJ');
});

test('la variante MJ se réécrit seule, sans emporter le texte joueur', () => {
  const draft = loadNormalizedGlHelpDefaults();
  draft.entries['tab:maps'].bodyMj = 'Consigne d’animation';
  const override = buildGlHelpOverride(draft);
  assert.deepStrictEqual(override, { entries: { 'tab:maps': { bodyMj: 'Consigne d’animation' } } });
  const resolved = normalizeGlHelpConfig(override).entries['tab:maps'];
  assert.strictEqual(resolved.bodyMj, 'Consigne d’animation');
  assert.strictEqual(resolved.body, loadNormalizedGlHelpDefaults().entries['tab:maps'].body);
});

test('une variante MJ blanche est écartée plutôt que stockée', () => {
  const draft = loadNormalizedGlHelpDefaults();
  draft.entries['tab:forum'].bodyMj = '   ';
  assert.deepStrictEqual(buildGlHelpOverride(draft), {});
});
