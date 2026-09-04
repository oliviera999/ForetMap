'use strict';

// Registre GL (`GL_SETTINGS_REGISTRY`, lib/glSettings.js) — sans base.
//
// Les validateurs vivaient dans `routes/gl/admin.js` (SETTINGS_VALUE_VALIDATORS) ; ils sont
// désormais déclarés dans le registre. Ce test GÈLE les messages d'erreur historiques que
// renvoyait la route en 400, clé par clé : un message qui change est un changement de contrat.

require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  GL_SETTINGS_REGISTRY,
  GAMEPLAY_KEYS,
  MODULE_KEYS,
  GATING_KEYS,
  DEFAULT_GAMEPLAY,
  DEFAULT_MODULES,
  camelKeyFor,
  moduleCamelKeyFor,
  validateGlSettingValue,
} = require('../lib/glSettings');
const { DEFAULT_MARKER_BACKGROUNDS } = require('../lib/glMarkerBackgrounds');

const HISTORICAL_GAMEPLAY_KEYS = [
  'gameplay.turns_enabled',
  'gameplay.narration_enabled',
  'gameplay.player_actions_enabled',
  'gameplay.scoring_enabled',
  'gameplay.marker_question_retrigger',
  'gameplay.zone_content_retrigger',
  'gameplay.vitality_enabled',
  'gameplay.default_health_points',
  'gameplay.default_power_points',
  'gameplay.max_health_points',
  'gameplay.max_power_points',
  'gameplay.spell_cast_contribution_mode',
  'gameplay.spell_cast_team_scope',
  'gameplay.spell_cast_mj_only',
  'gameplay.spell_cast_approval_mode',
  'gameplay.mascot_move_actor',
  'gameplay.qcm_mj_only',
  'gameplay.player_journal_max_chars',
  'gameplay.player_journal_max_assets',
  'gameplay.lore_feuillet_retrigger',
  'gameplay.lore_feuillet_preview_fields',
  'gameplay.lore_feuillet_acquisition_enabled',
  'gameplay.lore_feuillet_acquisition_channels',
  'gameplay.lore_effacement_enabled',
  'gameplay.lore_gemme_costs_enabled',
  'gameplay.lore_heart_rewards_enabled',
  'gameplay.lore_spoiler_max_level',
  'gameplay.plateau_markers_visible',
  'gameplay.plateau_zones_visible',
  'gameplay.plateau_marker_numbers_visible',
  'gameplay.marker_backgrounds',
  'gameplay.marker_effect_auto_move_enabled',
  'gameplay.market_hearts_enabled',
  'gameplay.market_feuillets_enabled',
];

const HISTORICAL_MODULE_KEYS = [
  'modules.mascot_packs_enabled',
  'modules.context_comments_enabled',
  'modules.forum_enabled',
  'modules.notifications_enabled',
  'modules.tutorials_enabled',
  'modules.help_enabled',
  'modules.journal_enabled',
  'modules.zone_music_enabled',
  'modules.market_enabled',
  'modules.spell_cast_enabled',
  'modules.virtual_dice_enabled',
  'modules.player_journal_enabled',
  'modules.lore_carnet_enabled',
  'modules.lore_glossary_enabled',
  'modules.intro_enabled',
];

test('les listes de clés gameplay / modules / gating sont inchangées', () => {
  assert.deepEqual(GAMEPLAY_KEYS, HISTORICAL_GAMEPLAY_KEYS);
  assert.deepEqual(MODULE_KEYS, HISTORICAL_MODULE_KEYS);
  for (const key of [...GAMEPLAY_KEYS, ...MODULE_KEYS, ...GATING_KEYS, 'platform.brand']) {
    assert.ok(GL_SETTINGS_REGISTRY[key], `${key} absent du registre`);
  }
  assert.ok(Object.isFrozen(GL_SETTINGS_REGISTRY));
});

test('les défauts du registre sont ceux de DEFAULT_GAMEPLAY / DEFAULT_MODULES', () => {
  for (const key of GAMEPLAY_KEYS) {
    assert.deepEqual(GL_SETTINGS_REGISTRY[key].default, DEFAULT_GAMEPLAY[camelKeyFor(key)], key);
  }
  for (const key of MODULE_KEYS) {
    assert.equal(GL_SETTINGS_REGISTRY[key].default, DEFAULT_MODULES[moduleCamelKeyFor(key)], key);
  }
});

const err = (key, value) => validateGlSettingValue(key, value).error;
const ok = (key, value) => validateGlSettingValue(key, value).value;

test('messages historiques — enums', () => {
  assert.equal(
    err('gameplay.marker_question_retrigger', 'x'),
    'Valeur marker_question_retrigger invalide',
  );
  assert.equal(
    err('gameplay.zone_content_retrigger', 'x'),
    'Valeur zone_content_retrigger invalide',
  );
  assert.equal(
    err('gameplay.spell_cast_contribution_mode', 'x'),
    'Mode de contribution invalide (coordinator, self_only, both)',
  );
  assert.equal(
    err('gameplay.spell_cast_team_scope', 'x'),
    'Périmètre équipe invalide (any_team, own_team, mj_any)',
  );
  assert.equal(
    err('gameplay.spell_cast_approval_mode', 'x'),
    'Mode d’approbation invalide (auto, mj_required, per_spell)',
  );
  assert.equal(
    err('gameplay.mascot_move_actor', 'x'),
    'Acteur de déplacement invalide (players, mj)',
  );
  assert.equal(
    err('gameplay.lore_feuillet_retrigger', 'x'),
    'Valeur lore_feuillet_retrigger invalide',
  );
  assert.equal(
    err('gameplay.lore_spoiler_max_level', 'x'),
    'Niveau spoiler lore invalide (cle, recit, secret)',
  );
  assert.equal(ok('gameplay.mascot_move_actor', ' players '), 'players', 'trim conservé');
});

test('messages historiques — booléens stricts (un booléen JSON, pas « true »)', () => {
  assert.equal(
    err('gameplay.spell_cast_mj_only', 'true'),
    'La valeur de spell_cast_mj_only doit être booléenne',
  );
  assert.equal(err('gameplay.qcm_mj_only', 1), 'La valeur de qcm_mj_only doit être booléenne');
  assert.equal(
    err('gameplay.vitality_enabled', null),
    'La valeur de vitality_enabled doit être booléenne',
  );
  assert.equal(
    err('gameplay.lore_feuillet_acquisition_enabled', 'oui'),
    'La valeur de lore_feuillet_acquisition_enabled doit être booléenne',
  );
  for (const key of [
    'gameplay.lore_effacement_enabled',
    'gameplay.lore_gemme_costs_enabled',
    'gameplay.lore_heart_rewards_enabled',
    'gameplay.plateau_markers_visible',
    'gameplay.plateau_zones_visible',
    'gameplay.plateau_marker_numbers_visible',
    'gameplay.market_hearts_enabled',
    'gameplay.market_feuillets_enabled',
    // Les cinq interrupteurs autrefois sans validateur rejoignent la même règle.
    'gameplay.turns_enabled',
    'gameplay.narration_enabled',
    'gameplay.player_actions_enabled',
    'gameplay.scoring_enabled',
    'gameplay.marker_effect_auto_move_enabled',
  ]) {
    assert.equal(err(key, 'true'), 'La valeur doit être booléenne', key);
    assert.equal(ok(key, true), true, key);
    assert.equal(ok(key, false), false, key);
  }
  for (const key of MODULE_KEYS) {
    assert.equal(err(key, 'false'), 'La valeur d’un module doit être booléenne', key);
  }
});

test('messages historiques — vitalité (entier strict, 0..99, plafond 0 = illimité)', () => {
  for (const key of ['gameplay.default_health_points', 'gameplay.default_power_points']) {
    assert.equal(err(key, 120), 'La valeur doit être un entier entre 0 et 99', key);
    assert.equal(err(key, 3.5), 'La valeur doit être un entier entre 0 et 99', key);
    assert.equal(err(key, -1), 'La valeur doit être un entier entre 0 et 99', key);
    assert.equal(err(key, 'abc'), 'La valeur doit être un entier entre 0 et 99', key);
    assert.equal(ok(key, '7'), 7, key);
    assert.equal(ok(key, 0), 0, key);
  }
  for (const key of ['gameplay.max_health_points', 'gameplay.max_power_points']) {
    const msg = 'La valeur doit être 0 (illimité) ou un entier entre 1 et 99';
    assert.equal(err(key, 100), msg, key);
    assert.equal(err(key, 2.5), msg, key);
    assert.equal(ok(key, 0), 0, key);
    assert.equal(ok(key, 99), 99, key);
  }
});

test('messages historiques — carnet personnel (0 = illimité, sinon plage)', () => {
  const chars = 'La valeur doit être 0 (illimité) ou un entier entre 500 et 200000';
  assert.equal(err('gameplay.player_journal_max_chars', 100), chars, '1..499 refusé');
  assert.equal(err('gameplay.player_journal_max_chars', 200001), chars);
  assert.equal(err('gameplay.player_journal_max_chars', 500.5), chars);
  assert.equal(ok('gameplay.player_journal_max_chars', 0), 0);
  assert.equal(ok('gameplay.player_journal_max_chars', 500), 500);
  const assets = 'La valeur doit être 0 (illimité) ou un entier entre 1 et 200';
  assert.equal(err('gameplay.player_journal_max_assets', 201), assets);
  assert.equal(err('gameplay.player_journal_max_assets', -1), assets);
  assert.equal(ok('gameplay.player_journal_max_assets', 12), 12);
});

test('messages historiques — listes, fonds de repères, marque', () => {
  assert.equal(
    err('gameplay.lore_feuillet_preview_fields', 'incipit'),
    'La valeur de lore_feuillet_preview_fields doit être une liste',
  );
  assert.deepEqual(ok('gameplay.lore_feuillet_preview_fields', ['incipit', 'zzz']), ['incipit']);
  assert.equal(
    err('gameplay.lore_feuillet_acquisition_channels', {}),
    'La valeur de lore_feuillet_acquisition_channels doit être une liste',
  );
  assert.equal(
    err('gameplay.marker_backgrounds', 'x'),
    'marker_backgrounds doit être un objet JSON',
  );
  assert.equal(
    err('gameplay.marker_backgrounds', [1]),
    'marker_backgrounds doit être un objet JSON',
  );
  assert.equal(
    err('gameplay.marker_backgrounds', { label: 'bad', emoji: 'transparent', icon: 'transparent' }),
    'Valeur marker_backgrounds.label invalide (transparent, classic ou #RRGGBB)',
  );
  assert.deepEqual(ok('gameplay.marker_backgrounds', DEFAULT_MARKER_BACKGROUNDS), {
    ...DEFAULT_MARKER_BACKGROUNDS,
  });
  assert.equal(err('platform.brand', null), 'La valeur de platform.brand doit etre un objet JSON');
  assert.equal(err('platform.brand', [1]), 'La valeur de platform.brand doit etre un objet JSON');
  assert.ok(ok('platform.brand', {}).colors.primary, 'normalisé par glBrand');
});

test('clé hors registre : valeur rendue telle quelle (contrat « persistée en l’état »)', () => {
  assert.deepEqual(validateGlSettingValue('platform.title', 'Titre libre'), {
    value: 'Titre libre',
  });
  assert.deepEqual(validateGlSettingValue('constructor', 1), { value: 1 });
});
