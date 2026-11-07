'use strict';

const {
  parseVitalityDelta,
  lockGlTeamRow,
  applyTeamVitalityDelta,
  applyPlayerVitalityDelta,
  resolveVitalityCaps,
} = require('./glVitality');
const { resolveMarkerEffects } = require('./glMarkerEffects');
const { resolveMarkerEventConfig } = require('./glMarkerEventConfig');
const { peopleDelta } = require('./glTenir');

/** Tonalité d'une case (`eventMeta.tonalite`) : `trame`, `souffle`, ou autre. */
function markerTonalite(marker) {
  const cfg = resolveMarkerEventConfig(marker);
  const meta = String(cfg?.eventMeta?.tonalite || '')
    .trim()
    .toLowerCase();
  if (meta === 'trame' || meta === 'souffle') return meta;
  // Les types de case `trame` / `souffle` valent tonalité quand la méta ne la porte pas.
  const type = String(marker?.event_type || marker?.eventType || '')
    .trim()
    .toLowerCase();
  if (type === 'trame' || type === 'souffle') return type;
  return meta;
}

/**
 * « Tenir à deux » (spec § 4) : une case Trame donne +1 de SA ressource à chaque membre
 * (gemme si licorne, cœur si gnome), quels que soient les deltas écrits dans la case ;
 * une case Souffle garde l'effet du plateau. `sentierActif` : un Sentier (sort gnome)
 * annule la prochaine case Souffle de l'équipe.
 */
function resolveTenirMarkerDeltas(
  marker,
  teamType,
  resolved,
  { sentierActif = false, casesPositives = 'ressource_peuple' } = {},
) {
  const tonalite = markerTonalite(marker);
  const base = resolveMarkerVitalityDeltas(resolved);
  if (tonalite === 'trame') {
    return { ...peopleDelta(teamType, 1), moveDelta: base.moveDelta, tonalite };
  }
  if (tonalite === 'souffle' && sentierActif) {
    return { healthDelta: 0, powerDelta: 0, moveDelta: 0, tonalite, sentier: true };
  }
  if (tonalite === 'souffle') return { ...base, tonalite };
  // Choix C4 (simulation du 7 novembre 2026) : une branche `neutral` du plateau qui donne une
  // ressource (+1 cœur, +2 cœurs, +1 gemme…) devient +1 de la ressource du peuple, comme la
  // Trame ; une branche `neutral` qui en retire (hors Souffle) ne retire rien (garde-fou § 1.5 :
  // rien ne retire une ressource sinon un sort, un échange, un don, une case Souffle, le
  // chapardeur). Les branches gnome / unicorn explicites restent telles quelles. `brut` rétablit
  // les deltas du plateau.
  const branch = String(resolved?.branch || '');
  const mode = String(casesPositives || 'ressource_peuple');
  if (branch === 'neutral' && mode !== 'brut') {
    const gain = base.healthDelta > 0 || base.powerDelta > 0;
    const perte = base.healthDelta < 0 || base.powerDelta < 0;
    if (gain) {
      if (mode === 'neutre') {
        return { healthDelta: 0, powerDelta: 0, moveDelta: base.moveDelta, tonalite: 'positif' };
      }
      return { ...peopleDelta(teamType, 1), moveDelta: base.moveDelta, tonalite: 'positif' };
    }
    if (perte) {
      return {
        healthDelta: 0,
        powerDelta: 0,
        moveDelta: base.moveDelta,
        tonalite: tonalite || null,
      };
    }
  }
  return { ...base, tonalite };
}

/** Cause du grand livre selon la tonalité de la case (Trame, Souffle, positive, autre). */
function ledgerCauseForTonalite(tonalite) {
  const t = String(tonalite || '').toLowerCase();
  if (t === 'trame') return 'trame';
  if (t === 'souffle') return 'case_souffle';
  if (t === 'positif') return 'case_positive';
  return 'case_plateau';
}

function parseMarkerIdFromPayload(payloadJson) {
  try {
    const payload = payloadJson ? JSON.parse(payloadJson) : {};
    const markerId = Number(payload.markerId);
    return Number.isFinite(markerId) ? markerId : null;
  } catch (_) {
    return null;
  }
}

async function hasMarkerVitalityApplied(deps, { gameId, teamId, markerId }) {
  const events = await deps.queryAll(
    `SELECT payload_json
       FROM gl_game_events
      WHERE game_id = ?
        AND team_id = ?
        AND event_type = 'marker_effect'
      ORDER BY id ASC`,
    [gameId, teamId],
  );
  const targetId = Number(markerId);
  for (const evt of events) {
    if (parseMarkerIdFromPayload(evt.payload_json) === targetId) {
      return true;
    }
  }
  return false;
}

function resolveMarkerVitalityDeltas(resolved) {
  return {
    healthDelta: parseVitalityDelta(resolved?.deltaPv),
    powerDelta: parseVitalityDelta(resolved?.deltaGems),
    moveDelta: parseVitalityDelta(resolved?.deltaMove),
  };
}

function hasNonZeroVitalityDeltas(healthDelta, powerDelta) {
  return healthDelta !== 0 || powerDelta !== 0;
}

/**
 * Chaque joueur ciblé appartient-il bien à l'équipe de cette partie ?
 *
 * `playerIds` désigne des lignes de `gl_players`, pas des membres de l'équipe : rien
 * n'obligeait l'identifiant reçu à faire partie du roster. Un appelant pouvait donc
 * créditer ou débiter le joueur d'une autre équipe, d'une autre classe, ou un compte
 * ne participant à aucune partie. On refuse en bloc plutôt que d'appliquer partiellement.
 *
 * @throws {Error} `PLAYER_NOT_ON_TEAM` (status 400) au premier joueur hors roster
 */
async function assertPlayersOnTeam(tx, { gameId, teamId, playerIds }) {
  for (const playerId of playerIds) {
    const row = await tx.queryOne(
      `SELECT 1 AS ok
         FROM gl_team_members
        WHERE game_id = ? AND team_id = ? AND player_id = ?
        LIMIT 1`,
      [gameId, teamId, playerId],
    );
    if (!row) {
      const err = new Error('PLAYER_NOT_ON_TEAM');
      err.status = 400;
      throw err;
    }
  }
}

/**
 * Applique les deltas cœurs/gemmes d'un repère à l'équipe (chaque membre) ou à des joueurs ciblés.
 * Même mécanique que les sortilèges (solde par joueur) et les zones feuillets (équipe entière).
 */
async function applyMarkerVitalityEffects(
  tx,
  {
    gameId,
    teamId,
    marker,
    teamType,
    settings,
    playerIds = null,
    skipIfAlreadyApplied = true,
    checkAlreadyApplied = null,
    tenir = false,
    sentierActif = false,
    casesPositives = 'ressource_peuple',
  },
) {
  const resolved = resolveMarkerEffects(marker, teamType);
  // « Tenir à deux » : une case Trame donne +1 ressource du peuple même sans bloc `effects`.
  if (!resolved && !(tenir && markerTonalite(marker) === 'trame')) {
    return { applied: false, reason: 'NO_EFFECT', resolvedEffect: null };
  }

  const deltas = tenir
    ? resolveTenirMarkerDeltas(marker, teamType, resolved, { sentierActif, casesPositives })
    : resolveMarkerVitalityDeltas(resolved);
  const { healthDelta, powerDelta, moveDelta } = deltas;
  const vitalityEnabled = settings?.vitalityEnabled === true;
  const caps = resolveVitalityCaps(settings);
  const vitalityRequired = vitalityEnabled && hasNonZeroVitalityDeltas(healthDelta, powerDelta);

  const base = {
    resolvedEffect: resolved,
    healthDelta,
    powerDelta,
    moveDelta,
    passTurn: deltas.sentier ? false : Boolean(resolved?.passTurn),
    tonalite: deltas.tonalite || null,
    sentier: deltas.sentier === true,
    vitalityRequired,
    vitalityResults: null,
    vitalityTarget: 'team',
    alreadyApplied: false,
  };

  if (!vitalityRequired) {
    return { ...base, applied: false, reason: 'NO_VITALITY_DELTA' };
  }

  // Verrou AVANT le contrôle d'idempotence : c'est ce contrôle que la concurrence
  // prenait en défaut, pas l'écriture qui le suit.
  await lockGlTeamRow(tx, teamId);

  const alreadyApplied =
    typeof checkAlreadyApplied === 'function'
      ? await checkAlreadyApplied()
      : skipIfAlreadyApplied
        ? await hasMarkerVitalityApplied(
            { queryAll: tx.queryAll.bind(tx) },
            { gameId, teamId, markerId: marker.id },
          )
        : false;

  if (alreadyApplied) {
    return { ...base, applied: false, alreadyApplied: true, reason: 'ALREADY_APPLIED' };
  }

  // Dédoublonné : le même identifiant listé deux fois appliquerait le delta deux fois.
  const normalizedPlayerIds = Array.isArray(playerIds)
    ? [...new Set(playerIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))]
    : [];

  let vitalityResults;
  let vitalityTarget = 'team';

  if (normalizedPlayerIds.length > 0) {
    await assertPlayersOnTeam(tx, { gameId, teamId, playerIds: normalizedPlayerIds });
    vitalityTarget = 'players';
    vitalityResults = [];
    for (const playerId of normalizedPlayerIds) {
      const updated = await applyPlayerVitalityDelta(tx, {
        playerId,
        healthDelta,
        powerDelta,
        caps,
        cause: ledgerCauseForTonalite(deltas.tonalite),
        gameId,
      });
      vitalityResults.push(updated);
    }
  } else {
    vitalityResults = await applyTeamVitalityDelta(tx, {
      gameId,
      teamId,
      healthDelta,
      powerDelta,
      caps,
      cause: ledgerCauseForTonalite(deltas.tonalite),
    });
  }

  return {
    ...base,
    applied: true,
    vitalityResults,
    vitalityTarget,
    vitalityPlayerIds: normalizedPlayerIds.length > 0 ? normalizedPlayerIds : null,
  };
}

function buildMarkerEffectEventPayload({
  marker,
  resolved,
  healthDelta,
  powerDelta,
  moveDelta,
  passTurn,
  reason,
  vitalityTarget,
  vitalityPlayerIds,
  autoMoveApplied = false,
}) {
  return {
    markerId: Number(marker.id),
    markerLabel: marker.label,
    eventType: marker.event_type,
    branch: resolved?.branch ?? null,
    healthDelta,
    powerDelta,
    moveDelta,
    passTurn: Boolean(passTurn),
    reason,
    vitalityTarget: vitalityTarget || 'team',
    autoMoveApplied: Boolean(autoMoveApplied),
    ...(vitalityPlayerIds?.length ? { playerIds: vitalityPlayerIds } : {}),
  };
}

module.exports = {
  parseMarkerIdFromPayload,
  hasMarkerVitalityApplied,
  markerTonalite,
  ledgerCauseForTonalite,
  resolveTenirMarkerDeltas,
  resolveMarkerVitalityDeltas,
  hasNonZeroVitalityDeltas,
  assertPlayersOnTeam,
  applyMarkerVitalityEffects,
  buildMarkerEffectEventPayload,
};
