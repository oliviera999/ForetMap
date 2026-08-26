'use strict';

// Réglages de PRÉSENTATION du conditionnement et sérialisation commune aux deux produits.
//
// Deux régressions que ces tests verrouillent :
//   - `announce_on_button` était un réglage MORT (exposé dans les deux grilles, consulté
//     par aucun code) ;
//   - les routes `challenge` omettaient `ask_count` et `allowed_wrong_attempts`, si bien
//     que le plafond par session ne s'appliquait jamais côté client et que les règles
//     annoncées promettaient un blocage dès la première erreur même avec tolérance.

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { initSchema, execute } = require('../database');
const { invalidateSettingsCache } = require('../lib/settings');
const { getGatingPresentation, decorateSummaryItem } = require('../lib/learningGatingPresentation');
const { serializeChallenge, serializeSummaryItem } = require('../lib/learningGatingSummary');
const gatingCore = require('../lib/shared/gatingSettingsCore');

async function setFmSetting(key, value) {
  await execute(
    "INSERT INTO app_settings (`key`, scope, value_json) VALUES (?, 'teacher', ?)\n     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json)",
    [key, JSON.stringify(value)],
  );
  invalidateSettingsCache();
}

before(async () => {
  await initSchema();
});

after(async () => {
  await execute('DELETE FROM app_settings WHERE `key` IN (?, ?)', [
    'learning.gating.announce_on_button',
    'learning.gating.state_icons',
  ]).catch(() => {});
  invalidateSettingsCache();
});

test('les deux réglages de présentation existent dans le catalogue COMMUN', () => {
  for (const name of ['announceOnButton', 'stateIcons']) {
    const def = gatingCore.GATING_SETTING_DEFS[name];
    assert.ok(def, `${name} absent du catalogue`);
    assert.equal(def.type, 'boolean');
    assert.equal(def.default, true, 'visible par défaut : on n’ajoute pas un réglage éteint');
    assert.ok(def.fmKey, 'ForetMap doit avoir une clé');
    assert.ok(def.glKey, 'Gnomes & Licornes aussi — sinon la divergence revient');
  }
});

test('getGatingPresentation : vrai par défaut, et suit le réglage', async () => {
  await execute("DELETE FROM app_settings WHERE `key` = 'learning.gating.announce_on_button'");
  invalidateSettingsCache();
  const par_defaut = await getGatingPresentation('fm');
  assert.equal(par_defaut.announce_on_button, true);
  assert.equal(par_defaut.state_icons, true);

  await setFmSetting('learning.gating.announce_on_button', false);
  const eteint = await getGatingPresentation('fm');
  assert.equal(eteint.announce_on_button, false, 'le réglage doit enfin avoir un effet');
  assert.equal(eteint.state_icons, true, 'les deux réglages sont indépendants');

  await setFmSetting('learning.gating.state_icons', false);
  const sansIcones = await getGatingPresentation('fm');
  assert.equal(sansIcones.state_icons, false);
});

test('decorateSummaryItem recopie la présentation sur chaque ligne', () => {
  const item = decorateSummaryItem(
    { resource_ref: '7', required: true },
    { announce_on_button: false, state_icons: true },
  );
  assert.equal(item.announce, false);
  assert.equal(item.show_icon, true);
  assert.equal(item.resource_ref, '7', 'la ligne d’origine est préservée');
});

test('serializeChallenge transmet les champs que le client attend', () => {
  const body = serializeChallenge({
    gating_enabled: true,
    required: true,
    mode: 'all',
    required_correct: 4,
    questions: [{ question_code: 'Q1' }],
    pending_count: 4,
    ask_count: 3,
    max_questions_per_session: 3,
    allowed_wrong_attempts: 2,
    cooldown_scope: 'question',
    satisfied: false,
    cooldown: { locked: false, retry_days: 3 },
  });
  // Ces trois-là manquaient : sans eux le client posait TOUTES les questions restantes
  // et annonçait un blocage dès la première erreur.
  assert.equal(body.ask_count, 3, 'plafond par session transmis');
  assert.equal(body.max_questions_per_session, 3);
  assert.equal(body.allowed_wrong_attempts, 2, 'tolérance transmise');
  assert.equal(body.cooldown_scope, 'question');
  assert.equal(body.pending_count, 4, 'le reste à faire est distinct de ce qui est posé');
});

test('serializeSummaryItem : forme stable, valeurs absentes ramenées à 0', () => {
  const item = serializeSummaryItem('12', {
    required: true,
    mode: 'any',
    satisfied: false,
    cooldown: { locked: true, remaining_days: 2, retry_days: 3 },
  });
  assert.equal(item.resource_ref, '12');
  assert.equal(item.locked, true);
  assert.equal(item.remaining_days, 2);
  assert.equal(item.ask_count, 0);
  assert.equal(item.pending_count, 0);
});
