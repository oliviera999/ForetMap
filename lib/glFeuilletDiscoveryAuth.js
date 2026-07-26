'use strict';

/**
 * Garde-fous découverte / progression des feuillets Sélène (côté joueur).
 *
 * Contexte : le carnet masque le contenu des feuillets non trouvés (anti-spoiler),
 * mais les codes restent visibles. Sans ces contrôles, un joueur pouvait appeler
 * directement POST …/present|read|hold et débloquer n'importe quel feuillet actif.
 *
 * Canaux légitimes pour `present` (joueur) :
 * - zone carte déjà présentée (`feuillet_zone_presented` avec le même feuilletCode) ;
 * - zone du royaume fournie (`kingdomZoneId`) dont le feuillet est candidat.
 * MJ / admin : pas de restriction (tests, animation).
 */

const { PRESENT_EVENT_TYPE } = require('./glFeuilletZonePresent');
const { findFeuilletsForZone, isFeuilletFound } = require('./glLoreFeuillets');

/**
 * Décide si un joueur peut découvrir un feuillet d'après les preuves déjà collectées
 * (pur, testable sans BDD).
 * @param {{
 *   isMj?: boolean,
 *   kingdomZoneId?: number|null,
 *   candidateCodes?: Iterable<string>|null,
 *   presentedZoneCodes?: Iterable<string>|null,
 *   feuilletCode: string,
 * }} opts
 */
function discoveryAllowedFromEvidence({
  isMj = false,
  kingdomZoneId = null,
  candidateCodes = null,
  presentedZoneCodes = null,
  feuilletCode,
}) {
  if (isMj) return true;
  const code = String(feuilletCode || '').trim();
  if (!code) return false;
  if (kingdomZoneId != null && Number(kingdomZoneId) > 0) {
    const set = candidateCodes instanceof Set ? candidateCodes : new Set(candidateCodes || []);
    return set.has(code);
  }
  const presented =
    presentedZoneCodes instanceof Set ? presentedZoneCodes : new Set(presentedZoneCodes || []);
  return presented.has(code);
}

/**
 * Progression read/hold : le feuillet doit déjà être « trouvé » pour l'équipe.
 * @param {{ isMj?: boolean, status?: string|null }} opts
 */
function progressAllowedFromEvidence({ isMj = false, status = null }) {
  if (isMj) return true;
  return isFeuilletFound(status);
}

async function loadPresentedZoneFeuilletCodes(deps, { gameId, teamId }) {
  const events = await deps.queryAll(
    `SELECT payload_json
       FROM gl_game_events
      WHERE game_id = ?
        AND team_id = ?
        AND event_type = ?
      ORDER BY id ASC`,
    [gameId, teamId, PRESENT_EVENT_TYPE],
  );
  const codes = new Set();
  for (const evt of events) {
    try {
      const payload = evt.payload_json ? JSON.parse(evt.payload_json) : {};
      const code = String(payload.feuilletCode || '').trim();
      if (code) codes.add(code);
    } catch (_) {
      /* ignore payload invalide */
    }
  }
  return codes;
}

/**
 * Candidats feuillet pour une zone du royaume (même logique que GET …/zones/:zoneId/feuillets).
 * @returns {Promise<object[]|null>} null si partie/zone introuvable
 */
async function loadKingdomZoneFeuilletCandidates(deps, { gameId, kingdomZoneId }) {
  const game = await deps.queryOne('SELECT id, chapter_id FROM gl_games WHERE id = ? LIMIT 1', [
    gameId,
  ]);
  if (!game) return null;

  const zone = await deps.queryOne(
    'SELECT id, chapter_id, label FROM gl_kingdom_zones WHERE id = ? LIMIT 1',
    [kingdomZoneId],
  );
  if (!zone || Number(zone.chapter_id) !== Number(game.chapter_id)) {
    return null;
  }

  const biomeRows = await deps.queryAll(
    'SELECT biome_slug FROM gl_chapter_biomes WHERE chapter_id = ? ORDER BY order_index ASC',
    [game.chapter_id],
  );
  const biomeSlugs = biomeRows.map((r) => String(r.biome_slug));

  const linked = await deps.queryAll(
    `SELECT f.feuillet_code
       FROM gl_lore_feuillets f
      WHERE f.statut = 'actif' AND f.kingdom_zone_id = ?`,
    [kingdomZoneId],
  );
  if (linked.length) return linked;

  return findFeuilletsForZone(deps, {
    zoneId: kingdomZoneId,
    zoneLabel: zone.label,
    biomeSlugs,
  });
}

/**
 * @returns {Promise<{ ok: true } | { ok: false, status: number, error: string }>}
 */
async function authorizePlayerFeuilletDiscovery(
  deps,
  { isMj, gameId, teamId, feuilletCode, kingdomZoneId },
) {
  if (isMj) return { ok: true };

  const code = String(feuilletCode || '').trim();
  if (!code) return { ok: false, status: 400, error: 'Identifiants invalides' };

  if (kingdomZoneId != null && Number(kingdomZoneId) > 0) {
    const candidates = await loadKingdomZoneFeuilletCandidates(deps, {
      gameId,
      kingdomZoneId: Number(kingdomZoneId),
    });
    if (!candidates) return { ok: false, status: 404, error: 'Zone introuvable' };
    const candidateCodes = new Set(
      candidates.map((row) => String(row.feuillet_code || '').trim()).filter(Boolean),
    );
    if (
      !discoveryAllowedFromEvidence({
        isMj: false,
        kingdomZoneId,
        candidateCodes,
        feuilletCode: code,
      })
    ) {
      return { ok: false, status: 403, error: 'Feuillet non associé à cette zone' };
    }
    return { ok: true };
  }

  const presentedZoneCodes = await loadPresentedZoneFeuilletCodes(deps, { gameId, teamId });
  if (
    !discoveryAllowedFromEvidence({
      isMj: false,
      presentedZoneCodes,
      feuilletCode: code,
    })
  ) {
    return {
      ok: false,
      status: 403,
      error: "Découverte non autorisée : traversez d'abord la zone associée",
    };
  }
  return { ok: true };
}

/**
 * @returns {Promise<{ ok: true } | { ok: false, status: number, error: string }>}
 */
async function authorizePlayerFeuilletProgress(deps, { isMj, gameId, teamId, feuilletCode }) {
  if (isMj) return { ok: true };
  const code = String(feuilletCode || '').trim();
  if (!code) return { ok: false, status: 400, error: 'Identifiants invalides' };

  const state = await deps.queryOne(
    `SELECT status FROM gl_game_feuillet_states
      WHERE game_id = ? AND team_id = ? AND feuillet_code = ? LIMIT 1`,
    [gameId, teamId, code],
  );
  if (!progressAllowedFromEvidence({ isMj: false, status: state?.status })) {
    return { ok: false, status: 403, error: 'Feuillet non trouvé' };
  }
  return { ok: true };
}

module.exports = {
  discoveryAllowedFromEvidence,
  progressAllowedFromEvidence,
  loadPresentedZoneFeuilletCodes,
  loadKingdomZoneFeuilletCandidates,
  authorizePlayerFeuilletDiscovery,
  authorizePlayerFeuilletProgress,
};
