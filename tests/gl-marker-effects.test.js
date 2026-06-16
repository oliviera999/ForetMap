'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  normalizeEventTypeAlias,
  normalizeMarkerEffects,
  mergeEventConfigWithImport,
  isEffectMarker,
} = require('../lib/shared/glMarkerEventConfigCore');
const {
  resolveMarkerEffects,
  formatMarkerEffectSummary,
  buildMarkerArrivalPayload,
} = require('../lib/glMarkerEffects');

test('normalizeEventTypeAlias traduit les slugs plateau FR', () => {
  assert.strictEqual(normalizeEventTypeAlias('depart'), 'start');
  assert.strictEqual(normalizeEventTypeAlias('evenement'), 'event');
  assert.strictEqual(normalizeEventTypeAlias('souffle'), 'souffle');
  assert.strictEqual(normalizeEventTypeAlias('arrivee'), 'finish');
});

test('normalizeMarkerEffects conserve gnome et licorne', () => {
  const effects = normalizeMarkerEffects({
    gnome: { label: 'Gnome test', deltaPv: 1, deltaMove: -1 },
    unicorn: { label: 'Licorne test', deltaGems: 2, passTurn: true },
  });
  assert.strictEqual(effects.gnome.deltaPv, 1);
  assert.strictEqual(effects.unicorn.passTurn, true);
});

test('mergeEventConfigWithImport fusionne colonnes XLSX plates', () => {
  const cfg = mergeEventConfigWithImport(null, {
    effet_gnome: 'Gnome : -1 case',
    dmvt_gnome: -1,
    delta_pv: 0,
    delta_gemmes: 2,
    delta_mouvement: 2,
    categorie_question: 'faune',
    niveau_question: 'base',
    tonalite: 'positif',
  });
  assert.ok(cfg.effects.neutral);
  assert.strictEqual(cfg.effects.neutral.deltaGems, 2);
  assert.strictEqual(cfg.effects.gnome.deltaMove, -1);
  assert.deepStrictEqual(cfg.question.pool.categorieSlugs, ['faune']);
  assert.strictEqual(cfg.eventMeta.tonalite, 'positif');
});

test('resolveMarkerEffects choisit la branche peuple pour souffle', () => {
  const marker = {
    event_type: 'souffle',
    event_config_json: JSON.stringify({
      version: 2,
      effects: {
        gnome: { label: 'Gnome', deltaMove: -1 },
        unicorn: { label: 'Licorne', passTurn: true },
      },
    }),
  };
  const gnomeFx = resolveMarkerEffects(marker, 'gnome');
  const unicornFx = resolveMarkerEffects(marker, 'unicorn');
  assert.strictEqual(gnomeFx.branch, 'gnome');
  assert.strictEqual(gnomeFx.deltaMove, -1);
  assert.strictEqual(unicornFx.passTurn, true);
});

test('isEffectMarker détecte type event sans config', () => {
  assert.strictEqual(isEffectMarker({ event_type: 'trame' }), true);
  assert.strictEqual(isEffectMarker({ event_type: 'story' }), false);
});

test('buildMarkerArrivalPayload assemble le résumé', () => {
  const payload = buildMarkerArrivalPayload(
    {
      id: 3,
      label: 'Souffle',
      description: 'Chaleur',
      event_type: 'souffle',
      effet_mecanique: 'Moiteur',
      event_config_json: JSON.stringify({
        version: 2,
        effects: { gnome: { label: 'Recule', deltaMove: -1 } },
      }),
    },
    { type: 'gnome' },
  );
  assert.strictEqual(payload.markerId, 3);
  assert.ok(payload.effectSummary.includes('Moiteur'));
  assert.ok(payload.hasEffects);
});

test('formatMarkerEffectSummary inclut effet mécanique et label peuple', () => {
  const summary = formatMarkerEffectSummary(
    {
      effet_mecanique: 'Avance de 2 cases',
      event_type: 'event',
      event_config_json: JSON.stringify({
        version: 2,
        effects: { neutral: { deltaMove: 2 } },
      }),
    },
    'gnome',
  );
  assert.ok(summary.includes('Avance de 2 cases'));
});
