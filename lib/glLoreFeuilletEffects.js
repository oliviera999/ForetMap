'use strict';

const { applyTeamVitalityDelta } = require('./glVitality');

function parseFeuilletDelta(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

function computeEffacementPct(feuillet, currentPct = 0) {
  const effacement = String(feuillet?.effacement || 'non').toLowerCase();
  if (effacement === 'non') return 0;
  if (effacement === 'total' || effacement === 'oui') return 100;
  const vitesse = String(feuillet?.vitesse_effacement || 'normal').toLowerCase();
  const stepMap = {
    lente: 10,
    normal: 25,
    rapide: 40,
    accelere: 60,
    quasi_total: 90,
  };
  const step = stepMap[vitesse] ?? 25;
  if (effacement === 'partiel') return Math.min(100, currentPct + step);
  return Math.min(100, currentPct + step);
}

function canHoldFeuillet(feuillet) {
  const tenir = String(feuillet?.tenir || '').trim();
  return tenir.length > 0 && tenir !== '—' && tenir !== '-';
}

async function applyFeuilletVitalityEffects(
  tx,
  { gameId, teamId, feuillet, settings, loreSettings, actorId, reason },
) {
  const gemmeCostsEnabled = loreSettings.gemmeCostsEnabled;
  const heartRewardsEnabled = loreSettings.heartRewardsEnabled;
  const vitalityEnabled = settings?.vitalityEnabled;

  let healthDelta = 0;
  let powerDelta = 0;

  if (heartRewardsEnabled) {
    healthDelta += parseFeuilletDelta(feuillet.gain_coeur);
  }
  if (gemmeCostsEnabled) {
    powerDelta -= parseFeuilletDelta(feuillet.cout_gemme);
  }

  if (!vitalityEnabled || (healthDelta === 0 && powerDelta === 0)) {
    return { healthDelta, powerDelta, vitalityResults: null };
  }

  const vitalityResults = await applyTeamVitalityDelta(tx, {
    gameId,
    teamId,
    healthDelta,
    powerDelta,
  });
  return {
    healthDelta,
    powerDelta,
    vitalityResults,
    reason: reason || feuillet.titre || feuillet.feuillet_code,
  };
}

function maskFeuilletText(text, effacementPct) {
  const raw = String(text ?? '');
  if (!raw || effacementPct <= 0) return raw;
  if (effacementPct >= 100) return '';
  const visibleRatio = Math.max(0, 1 - effacementPct / 100);
  const visibleLen = Math.max(0, Math.floor(raw.length * visibleRatio));
  return `${raw.slice(0, visibleLen)}${raw.length > visibleLen ? '…' : ''}`;
}

module.exports = {
  parseFeuilletDelta,
  computeEffacementPct,
  canHoldFeuillet,
  applyFeuilletVitalityEffects,
  maskFeuilletText,
};
