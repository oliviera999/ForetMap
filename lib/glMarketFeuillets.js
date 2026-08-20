'use strict';

const { queryAll } = require('../database');
const { getGameplaySettings, getGlModulesSettings } = require('./glSettings');
const {
  loadPlayerFeuilletStates,
  upsertFeuilletState,
  isFeuilletFound,
} = require('./glLoreFeuillets');

/**
 * Échange de feuillets sur le Marché.
 *
 * Trois règles structurent ce module :
 *  1. **Copie, pas transfert** — le donneur garde son feuillet ; le receveur en
 *     gagne l'accès. Thématiquement, le copiste recopie ; mécaniquement, rien ne
 *     se perd et personne n'est puni d'avoir partagé.
 *  2. **Le don puise dans un carnet personnel, la réception écrit dans une équipe.**
 *     Un joueur peut donner ce qu'il a trouvé lors d'un chapitre précédent (son
 *     carnet est personnel et durable) ; ce qu'il donne profite à toute l'équipe
 *     courante du receveur, comme n'importe quelle découverte.
 *  3. **Un feuillet reçu n'est pas un feuillet trouvé** — `unlocked_via`
 *     ('echange') et `acquired_via` le distinguent, pour qu'un futur bonus de
 *     complétion de chapitre récompense l'exploration et non le troc.
 */

const MAX_FEUILLETS_PER_SIDE = 10;

function makeHttpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function normalizeFeuilletCodes(input) {
  if (input == null) return [];
  const raw = Array.isArray(input) ? input : [input];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const code = String(item || '').trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  if (out.length > MAX_FEUILLETS_PER_SIDE) {
    throw makeHttpError('TOO_MANY_FEUILLETS', 400);
  }
  return out;
}

/** L'échange de feuillets exige le module Carnet **et** le réglage dédié. */
async function assertFeuilletsTradable(codes) {
  if (!codes.length) return;
  const [gameplay, modules] = await Promise.all([getGameplaySettings(), getGlModulesSettings()]);
  if (modules.loreCarnetEnabled !== true || gameplay.marketFeuilletsEnabled !== true) {
    throw makeHttpError('FEUILLETS_NOT_TRADABLE', 409);
  }
}

/**
 * Feuillets qu'un joueur peut proposer : ceux de son carnet personnel (union
 * équipes + possession propre), enrichis du titre pour l'affichage.
 */
async function listTradableFeuilletsForPlayer(playerId) {
  const states = await loadPlayerFeuilletStates({ queryAll }, playerId);
  const codes = [...states.keys()];
  if (!codes.length) return [];
  const rows = await queryAll(
    `SELECT feuillet_code, titre, liasse, plateau_number
       FROM gl_lore_feuillets
      WHERE statut = 'actif'
        AND feuillet_code IN (${codes.map(() => '?').join(', ')})
      ORDER BY ordre_voyage ASC, ordre_liasse ASC, feuillet_code ASC`,
    codes,
  );
  return rows.map((row) => {
    const state = states.get(String(row.feuillet_code));
    return {
      feuilletCode: row.feuillet_code,
      titre: row.titre || null,
      liasse: row.liasse || null,
      plateauNumber: row.plateau_number != null ? Number(row.plateau_number) : null,
      effacementPct: Number(state?.effacement_pct) || 0,
    };
  });
}

/**
 * Vérifie que le joueur possède bien chaque feuillet proposé.
 * @returns {Promise<Map<string, object>>} états du donneur, indexés par code
 */
async function assertPlayerOwnsFeuillets(playerId, codes) {
  if (!codes.length) return new Map();
  const states = await loadPlayerFeuilletStates({ queryAll }, playerId);
  for (const code of codes) {
    if (!states.has(code)) {
      throw makeHttpError('FEUILLET_NOT_OWNED', 409);
    }
  }
  return states;
}

/** Remplace l'ensemble des feuillets proposés par un joueur dans un échange. */
async function replaceSideFeuillets(tx, { tradeId, playerId, codes }) {
  await tx.execute(
    'DELETE FROM gl_market_trade_side_feuillets WHERE trade_id = ? AND player_id = ?',
    [tradeId, playerId],
  );
  for (const code of codes) {
    await tx.execute(
      `INSERT INTO gl_market_trade_side_feuillets (trade_id, player_id, feuillet_code, created_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE created_at = created_at`,
      [tradeId, playerId, code],
    );
  }
}

/** Feuillets proposés dans un échange, indexés par joueur. */
async function loadSideFeuilletsByPlayer(deps, tradeId) {
  const rows = await deps.queryAll(
    `SELECT sf.player_id, sf.feuillet_code, f.titre
       FROM gl_market_trade_side_feuillets sf
       LEFT JOIN gl_lore_feuillets f ON f.feuillet_code = sf.feuillet_code
      WHERE sf.trade_id = ?
      ORDER BY f.ordre_voyage ASC, sf.feuillet_code ASC`,
    [tradeId],
  );
  const byPlayer = new Map();
  for (const row of rows) {
    const key = Number(row.player_id);
    if (!byPlayer.has(key)) byPlayer.set(key, []);
    byPlayer.get(key).push({
      feuilletCode: row.feuillet_code,
      titre: row.titre || null,
    });
  }
  return byPlayer;
}

/**
 * Équipe destinataire d'un feuillet reçu : celle du receveur dans sa partie en
 * cours la plus récente. Le Marché vit hors partie alors que l'état d'un
 * feuillet est rattaché à une partie — il faut donc une cible explicite. Sans
 * partie en cours, l'échange est refusé plutôt que de créer un état orphelin.
 */
async function resolveReceiverTeam(deps, playerId) {
  const row = await deps.queryOne(
    `SELECT tm.game_id, tm.team_id
       FROM gl_team_members tm
       JOIN gl_games g ON g.id = tm.game_id
      WHERE tm.player_id = ?
        AND g.status IN ('live', 'paused')
      ORDER BY g.id DESC
      LIMIT 1`,
    [playerId],
  );
  if (!row?.team_id) {
    throw makeHttpError('RECEIVER_HAS_NO_GAME', 409);
  }
  return { gameId: Number(row.game_id), teamId: Number(row.team_id) };
}

/**
 * Livre les feuillets d'un donneur à l'équipe du receveur (copie).
 * L'attribution d'origine (« Découvert par … ») voyage avec la copie : le
 * feuillet reçu crédite toujours celui qui l'a trouvé, pas celui qui l'a donné.
 *
 * Un feuillet que l'équipe du receveur **possède déjà** n'est pas réécrit :
 * `upsertFeuilletState` écrase `status`, `effacement_pct` et `unlocked_via`, si bien
 * qu'une copie très effacée rendait illisible un feuillet que l'équipe avait trouvé
 * intact, et qu'une découverte sur la carte était reclassée en simple échange. On
 * offre une lecture, on ne dégrade pas celle qui existe.
 */
async function deliverFeuillets(tx, { giverStates, receiverId, codes }) {
  if (!codes.length) return { delivered: 0 };
  const target = await resolveReceiverTeam(tx, receiverId);
  let delivered = 0;
  for (const code of codes) {
    const existing = await tx.queryOne(
      `SELECT status FROM gl_game_feuillet_states
        WHERE game_id = ? AND team_id = ? AND feuillet_code = ? LIMIT 1`,
      [target.gameId, target.teamId, code],
    );
    if (existing && isFeuilletFound(existing.status)) continue;
    const state = giverStates.get(code) || {};
    const effacementPct = Number(state.effacement_pct) || 0;
    await upsertFeuilletState(tx, {
      gameId: target.gameId,
      teamId: target.teamId,
      feuilletCode: code,
      status: effacementPct >= 100 ? 'effaced' : 'discovered',
      effacementPct,
      unlockedVia: 'echange',
      acquiredVia: 'echange',
      discoveredByPlayerId: state.discovered_by_player_id || null,
      discoveredByName: state.discovered_by_name || null,
      discoveredSource: 'echange',
    });
    delivered += 1;
  }
  return { delivered, ...target };
}

function resolveFeuilletTradeError(err) {
  const map = {
    TOO_MANY_FEUILLETS: {
      status: 400,
      error: `Pas plus de ${MAX_FEUILLETS_PER_SIDE} feuillets par offre`,
    },
    FEUILLETS_NOT_TRADABLE: {
      status: 409,
      error: 'L’échange de feuillets est désactivé dans les réglages',
    },
    FEUILLET_NOT_OWNED: {
      status: 409,
      error: 'Tu ne peux proposer qu’un feuillet que tu as déjà dans ton carnet',
    },
    RECEIVER_HAS_NO_GAME: {
      status: 409,
      error:
        'Ce joueur ne participe à aucune partie en cours : il ne peut pas recevoir de feuillet',
    },
  };
  if (err?.message && map[err.message]) return map[err.message];
  return null;
}

module.exports = {
  MAX_FEUILLETS_PER_SIDE,
  normalizeFeuilletCodes,
  assertFeuilletsTradable,
  listTradableFeuilletsForPlayer,
  assertPlayerOwnsFeuillets,
  replaceSideFeuillets,
  loadSideFeuilletsByPlayer,
  resolveReceiverTeam,
  deliverFeuillets,
  resolveFeuilletTradeError,
};
