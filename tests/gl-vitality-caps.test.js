'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  VITALITY_MAX,
  clampVitality,
  normalizeVitalityCap,
  resolveVitalityCaps,
  applyDeltaWithCap,
  wouldGainExceedCap,
  getDefaultVitalityFromSettings,
  applyPlayerVitalityDelta,
} = require('../lib/glVitality');

test('normalizeVitalityCap : 0 / absent / négatif = pas de plafond de jeu', () => {
  assert.strictEqual(normalizeVitalityCap(0), VITALITY_MAX);
  assert.strictEqual(normalizeVitalityCap(null), VITALITY_MAX);
  assert.strictEqual(normalizeVitalityCap(undefined), VITALITY_MAX);
  assert.strictEqual(normalizeVitalityCap(-3), VITALITY_MAX);
  assert.strictEqual(normalizeVitalityCap('pas un nombre'), VITALITY_MAX);
});

test('normalizeVitalityCap borne au plafond technique', () => {
  assert.strictEqual(normalizeVitalityCap(5), 5);
  assert.strictEqual(normalizeVitalityCap(5.9), 5);
  assert.strictEqual(normalizeVitalityCap(1000), VITALITY_MAX);
});

test('resolveVitalityCaps lit les réglages gameplay', () => {
  assert.deepStrictEqual(resolveVitalityCaps({ maxHealthPoints: 5, maxPowerPoints: 8 }), {
    maxHealth: 5,
    maxPower: 8,
  });
  // Réglages par défaut (0/0) : comportement historique, aucun plafond de jeu.
  assert.deepStrictEqual(resolveVitalityCaps({}), {
    maxHealth: VITALITY_MAX,
    maxPower: VITALITY_MAX,
  });
});

test('applyDeltaWithCap bloque le gain au plafond', () => {
  assert.strictEqual(applyDeltaWithCap(4, 2, 5), 5);
  assert.strictEqual(applyDeltaWithCap(5, 1, 5), 5);
  assert.strictEqual(applyDeltaWithCap(3, 1, 5), 4);
});

test('applyDeltaWithCap ne confisque jamais un solde déjà au-dessus du plafond', () => {
  // Un élève à 9 cœurs le jour où le plafond passe à 5 ne perd rien : le plafond bloque
  // les gains, il ne reprend pas l'acquis.
  assert.strictEqual(applyDeltaWithCap(9, 1, 5), 9);
  assert.strictEqual(applyDeltaWithCap(9, 0, 5), 9);
  assert.strictEqual(applyDeltaWithCap(9, -1, 5), 8);
  assert.strictEqual(applyDeltaWithCap(6, -1, 5), 5);
});

test('applyDeltaWithCap ne descend jamais sous zéro', () => {
  assert.strictEqual(applyDeltaWithCap(0, -1, 5), 0);
  assert.strictEqual(applyDeltaWithCap(2, -5, 5), 0);
});

test('wouldGainExceedCap refuse le gain qui dépasserait le plafond, pas la dépense', () => {
  assert.strictEqual(wouldGainExceedCap(5, 1, 5), true, 'déjà au plafond : +1 refusé');
  assert.strictEqual(wouldGainExceedCap(4, 2, 5), true, '4+2=6 > 5');
  assert.strictEqual(wouldGainExceedCap(4, 1, 5), false, '4+1=5 tenant');
  assert.strictEqual(wouldGainExceedCap(5, -1, 5), false, 'dépense jamais bloquée');
  assert.strictEqual(wouldGainExceedCap(5, 0, 5), false);
  // Solde déjà au-dessus : on ne confisque pas, mais on n'accepte plus de gain.
  assert.strictEqual(wouldGainExceedCap(9, 1, 5), true);
  assert.strictEqual(wouldGainExceedCap(9, -2, 5), false);
  // Pas de plafond de jeu (0 → technique 99).
  assert.strictEqual(wouldGainExceedCap(5, 2, 0), false);
});

test('clampVitality accepte un plafond explicite', () => {
  assert.strictEqual(clampVitality(9), 9);
  assert.strictEqual(clampVitality(9, 5), 5);
  assert.strictEqual(clampVitality(-2, 5), 0);
  assert.strictEqual(clampVitality(200), VITALITY_MAX);
});

test('getDefaultVitalityFromSettings respecte le plafond de jeu', () => {
  assert.deepStrictEqual(getDefaultVitalityFromSettings({ defaultHealthPoints: 3 }), {
    health: 3,
    power: 3,
  });
  assert.deepStrictEqual(
    getDefaultVitalityFromSettings({
      defaultHealthPoints: 8,
      defaultPowerPoints: 8,
      maxHealthPoints: 5,
      maxPowerPoints: 5,
    }),
    { health: 5, power: 5 },
  );
});

/** Transaction factice : juste ce qu'il faut pour observer l'UPDATE émis. */
function fakeTx(player) {
  const writes = [];
  return {
    writes,
    queryOne: async () => ({ ...player }),
    execute: async (sql, params) => {
      writes.push({ sql, params });
      return { affectedRows: 1 };
    },
  };
}

test('applyPlayerVitalityDelta écrit la valeur plafonnée et signale le rognage', async () => {
  const tx = fakeTx({ id: 7, health_points: 4, power_points: 2 });
  const res = await applyPlayerVitalityDelta(tx, {
    playerId: 7,
    healthDelta: 3,
    powerDelta: 1,
    caps: { maxHealth: 5, maxPower: 5 },
  });
  assert.strictEqual(res.health, 5);
  assert.strictEqual(res.power, 3);
  assert.strictEqual(res.healthCapped, true, 'le gain de cœurs a été rogné');
  assert.strictEqual(res.powerCapped, false, 'le gain de gemmes est passé entier');
  assert.deepStrictEqual(tx.writes[0].params, [5, 3, 7]);
});

test('applyPlayerVitalityDelta sans caps conserve le comportement historique', async () => {
  const tx = fakeTx({ id: 7, health_points: 9, power_points: 9 });
  const res = await applyPlayerVitalityDelta(tx, { playerId: 7, healthDelta: 2, powerDelta: 2 });
  assert.strictEqual(res.health, 11);
  assert.strictEqual(res.power, 11);
  assert.strictEqual(res.healthCapped, false);
});

test('applyPlayerVitalityDelta lève PLAYER_NOT_FOUND si le joueur n’existe pas', async () => {
  const tx = { queryOne: async () => null, execute: async () => ({}) };
  await assert.rejects(() => applyPlayerVitalityDelta(tx, { playerId: 404, healthDelta: 1 }), {
    message: 'PLAYER_NOT_FOUND',
  });
});
