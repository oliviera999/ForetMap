'use strict';

/**
 * Marché v2 « Tenir à deux » (spec § 9) : place publique (annonces), dons immédiats, parures.
 *
 * - Annonce : `cherche` | `offre` | `propose` (les deux côtés). Répondre ouvre l'échange à deux
 *   existant (`gl_market_trades`), pré-rempli ; l'annonce se ferme à la conclusion.
 * - Don : une ressource (n gemmes OU n cœurs) ou une copie de page à la fois, immédiat, sans
 *   accord ; le plafond du receveur est respecté, le surplus reste au donneur.
 * - Parure : achetée par un membre (ressource au choix), portée par la mascotte de SON équipe
 *   de la partie `live` jusqu'au seuil (`rendue_at`). Aucun effet de jeu.
 */

const { queryAll, queryOne, execute, withTransaction } = require('../database');
const { getGameplaySettings } = require('./glSettings');
const {
  clampVitality,
  applyPlayerVitalityDelta,
  resolveVitalityCaps,
  normalizeVitalityCap,
} = require('./glVitality');
const { createTrade, updateOffer } = require('./glMarket');
const { assertPlayerOwnsFeuillets, deliverFeuillets } = require('./glMarketFeuillets');
const { upsertPlayerFeuilletState } = require('./glLoreFeuillets');
const { insertGameEvent } = require('./glGameEvents');
const { emitGlGameEvent } = require('./realtime');
const { httpError } = require('./shared/httpError');
const { isTenirGame, resolveTenirSettings } = require('./glTenir');

const makeHttpError = (message, status) => httpError(status, message);

const ANNONCE_TYPES = new Set(['cherche', 'offre', 'propose']);

function resolveMarketPlaceError(err) {
  const map = {
    ANNONCE_TYPE_INVALID: {
      status: 400,
      error: 'Type d’annonce invalide (cherche, offre, propose)',
    },
    ANNONCE_EMPTY: {
      status: 400,
      error: 'Une annonce porte au moins une gemme, un cœur ou une page',
    },
    ANNONCE_NOT_FOUND: { status: 404, error: 'Annonce introuvable' },
    ANNONCE_NOT_OPEN: { status: 409, error: 'Cette annonce n’est plus ouverte' },
    ANNONCE_OWN: { status: 409, error: 'On ne répond pas à sa propre annonce' },
    ANNONCE_FORBIDDEN: { status: 403, error: 'Cette annonce n’est pas la vôtre' },
    DON_EMPTY: { status: 400, error: 'Un don porte une ressource ou une page, une à la fois' },
    DON_MULTIPLE: {
      status: 400,
      error: 'Un don : une seule ressource ou une seule page à la fois',
    },
    DON_SELF: { status: 409, error: 'On ne se fait pas de don à soi-même' },
    DON_INSUFFICIENT: { status: 409, error: 'Solde insuffisant pour ce don' },
    DON_RECEIVER_FULL: { status: 409, error: 'Le receveur est déjà au maximum : rien à donner' },
    HEARTS_NOT_TRADABLE: { status: 409, error: 'Les cœurs ne circulent pas sur le Marché' },
    PARURE_NOT_FOUND: { status: 404, error: 'Parure introuvable' },
    PARURE_NOT_BUYABLE: {
      status: 409,
      error: 'Cette parure n’est pas encore disponible au comptoir',
    },
    PARURE_CHAPTER: { status: 409, error: 'Cette parure n’est pas disponible à ce chapitre' },
    PARURE_RESSOURCE: { status: 400, error: 'Ressource invalide (gemmes, coeurs)' },
    PARURE_INSUFFICIENT: { status: 409, error: 'Solde insuffisant pour cette parure' },
    PARURES_DISABLED: { status: 409, error: 'Les parures sont désactivées' },
    NO_LIVE_GAME: { status: 409, error: 'Aucune partie en cours pour votre classe' },
    PLAYER_NOT_FOUND: { status: 404, error: 'Joueur introuvable' },
    PEER_NOT_IN_CLASS: { status: 403, error: 'Ce joueur n’est pas dans votre classe' },
  };
  if (err?.message && map[err.message]) return map[err.message];
  return null;
}

async function getPlayer(playerId) {
  const row = await queryOne(
    'SELECT id, class_id, pseudo, health_points, power_points FROM gl_players WHERE id = ? AND is_active = 1 LIMIT 1',
    [playerId],
  );
  if (!row) throw makeHttpError('PLAYER_NOT_FOUND', 404);
  return row;
}

/** Partie `live` la plus récente de la classe (ou `null`). */
async function findLiveGameForClass(classId) {
  return queryOne(
    `SELECT g.id, g.class_id, g.chapter_id, g.status, g.tenir_profil, g.tenir_overrides_json,
            g.tenir_surface, ch.plateau_number
       FROM gl_games g LEFT JOIN gl_chapters ch ON ch.id = g.chapter_id
      WHERE g.class_id = ? AND g.status = 'live'
      ORDER BY g.id DESC LIMIT 1`,
    [classId],
  );
}

/** Équipe du joueur dans la partie `live` de sa classe (`{ gameId, teamId, teamType }` ou null). */
async function findLiveMembership(playerId, classId) {
  const row = await queryOne(
    `SELECT tm.game_id, tm.team_id, t.type AS team_type
       FROM gl_team_members tm
       INNER JOIN gl_games g ON g.id = tm.game_id
       INNER JOIN gl_teams t ON t.id = tm.team_id
      WHERE tm.player_id = ? AND g.class_id = ? AND g.status = 'live'
      ORDER BY g.id DESC LIMIT 1`,
    [playerId, classId],
  );
  if (!row) return null;
  return { gameId: Number(row.game_id), teamId: Number(row.team_id), teamType: row.team_type };
}

function parseAmount(value) {
  if (value == null || value === '') return 0;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 99) throw makeHttpError('INVALID_AMOUNT', 400);
  return n;
}

function parseSide(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const feuillets = Array.isArray(src.feuillets)
    ? [...new Set(src.feuillets.map((c) => String(c || '').trim()).filter(Boolean))]
    : [];
  return { gemmes: parseAmount(src.gemmes), coeurs: parseAmount(src.coeurs), feuillets };
}

function sideIsEmpty(side) {
  return !side || (side.gemmes === 0 && side.coeurs === 0 && side.feuillets.length === 0);
}

function parseJson(raw, fallback) {
  if (raw == null) return fallback;
  try {
    return JSON.parse(String(raw));
  } catch (_) {
    return fallback;
  }
}

function formatAnnonce(row, playersById, teamsByPlayer) {
  const player = playersById.get(Number(row.player_id)) || {};
  const team = teamsByPlayer.get(Number(row.player_id)) || null;
  return {
    id: Number(row.id),
    playerId: Number(row.player_id),
    pseudo: player.pseudo || null,
    teamName: team?.name || null,
    teamType: team?.type || null,
    type: String(row.type),
    cherche: parseJson(row.cherche_json, null),
    offre: parseJson(row.offre_json, null),
    statut: String(row.statut),
    tradeId: row.trade_id != null ? Number(row.trade_id) : null,
    createdAt: row.created_at,
    closedAt: row.closed_at || null,
  };
}

async function loadTeamsByPlayer(classId) {
  const live = await findLiveGameForClass(classId);
  const map = new Map();
  if (!live) return map;
  const rows = await queryAll(
    `SELECT tm.player_id, t.name, t.type FROM gl_team_members tm
       INNER JOIN gl_teams t ON t.id = tm.team_id WHERE tm.game_id = ?`,
    [live.id],
  );
  for (const r of rows) map.set(Number(r.player_id), { name: r.name, type: r.type });
  return map;
}

async function listAnnonces(playerId) {
  const self = await getPlayer(playerId);
  const rows = await queryAll(
    `SELECT * FROM gl_market_annonces WHERE class_id = ? AND statut = 'ouverte' ORDER BY id DESC LIMIT 200`,
    [self.class_id],
  );
  const playerIds = [...new Set(rows.map((r) => Number(r.player_id)))];
  const playersById = new Map();
  if (playerIds.length) {
    const players = await queryAll(
      `SELECT id, pseudo FROM gl_players WHERE id IN (${playerIds.map(() => '?').join(', ')})`,
      playerIds,
    );
    for (const p of players) playersById.set(Number(p.id), p);
  }
  const teamsByPlayer = await loadTeamsByPlayer(self.class_id);
  return rows.map((r) => formatAnnonce(r, playersById, teamsByPlayer));
}

async function createAnnonce(playerId, { type, cherche, offre }) {
  const self = await getPlayer(playerId);
  const kind = String(type || '').trim();
  if (!ANNONCE_TYPES.has(kind)) throw makeHttpError('ANNONCE_TYPE_INVALID', 400);
  const chercheSide = kind === 'offre' ? null : parseSide(cherche);
  const offreSide = kind === 'cherche' ? null : parseSide(offre);
  if (kind === 'cherche' && sideIsEmpty(chercheSide)) throw makeHttpError('ANNONCE_EMPTY', 400);
  if (kind === 'offre' && sideIsEmpty(offreSide)) throw makeHttpError('ANNONCE_EMPTY', 400);
  if (kind === 'propose' && (sideIsEmpty(chercheSide) || sideIsEmpty(offreSide))) {
    throw makeHttpError('ANNONCE_EMPTY', 400);
  }
  const settings = await getGameplaySettings();
  if (
    !settings.marketHeartsEnabled &&
    ((offreSide?.coeurs || 0) > 0 || (chercheSide?.coeurs || 0) > 0)
  ) {
    throw makeHttpError('HEARTS_NOT_TRADABLE', 409);
  }
  const insert = await execute(
    `INSERT INTO gl_market_annonces (class_id, player_id, type, cherche_json, offre_json, statut, created_at)
     VALUES (?, ?, ?, ?, ?, 'ouverte', NOW())`,
    [
      self.class_id,
      self.id,
      kind,
      chercheSide ? JSON.stringify(chercheSide) : null,
      offreSide ? JSON.stringify(offreSide) : null,
    ],
  );
  await recordClassEvent(self.class_id, 'annonce', {
    annonceId: Number(insert.insertId),
    type: kind,
  });
  const row = await queryOne('SELECT * FROM gl_market_annonces WHERE id = ? LIMIT 1', [
    insert.insertId,
  ]);
  const teamsByPlayer = await loadTeamsByPlayer(self.class_id);
  return formatAnnonce(row, new Map([[Number(self.id), self]]), teamsByPlayer);
}

async function deleteAnnonce(playerId, annonceId) {
  const row = await queryOne('SELECT * FROM gl_market_annonces WHERE id = ? LIMIT 1', [annonceId]);
  if (!row) throw makeHttpError('ANNONCE_NOT_FOUND', 404);
  if (Number(row.player_id) !== Number(playerId)) throw makeHttpError('ANNONCE_FORBIDDEN', 403);
  if (String(row.statut) !== 'ouverte') throw makeHttpError('ANNONCE_NOT_OPEN', 409);
  await execute(`UPDATE gl_market_annonces SET statut = 'fermee', closed_at = NOW() WHERE id = ?`, [
    annonceId,
  ]);
  return { ok: true };
}

/**
 * Répondre à une annonce : ouvre (ou reprend) l'échange à deux et le pré-remplit.
 * `propose` : l'auteur offre `offre`, le répondant offre `cherche` ; `offre` : seul l'auteur
 * est pré-rempli ; `cherche` : seul le répondant est pré-rempli.
 */
async function repondreAnnonce(playerId, annonceId) {
  const row = await queryOne('SELECT * FROM gl_market_annonces WHERE id = ? LIMIT 1', [annonceId]);
  if (!row) throw makeHttpError('ANNONCE_NOT_FOUND', 404);
  if (String(row.statut) !== 'ouverte') throw makeHttpError('ANNONCE_NOT_OPEN', 409);
  if (Number(row.player_id) === Number(playerId)) throw makeHttpError('ANNONCE_OWN', 409);
  const self = await getPlayer(playerId);
  if (Number(self.class_id) !== Number(row.class_id)) throw makeHttpError('PEER_NOT_IN_CLASS', 403);
  let trade;
  try {
    trade = await createTrade(playerId, Number(row.player_id));
  } catch (err) {
    if (err?.message === 'ACTIVE_TRADE_EXISTS' && err.trade) trade = err.trade;
    else throw err;
  }
  const offre = parseJson(row.offre_json, null);
  const cherche = parseJson(row.cherche_json, null);
  const fill = async (sidePlayerId, side) => {
    if (!side || sideIsEmpty(parseSide(side))) return;
    const parsed = parseSide(side);
    try {
      trade = await updateOffer(trade.id, sidePlayerId, {
        offerHealth: parsed.coeurs,
        offerPower: parsed.gemmes,
        offerFeuillets: parsed.feuillets,
      });
    } catch (_) {
      // Une page vendue entre-temps ou un solde insuffisant : l'échange reste ouvert, à ajuster.
    }
  };
  await fill(Number(row.player_id), offre);
  await fill(Number(playerId), cherche);
  await execute('UPDATE gl_market_annonces SET trade_id = ? WHERE id = ? AND trade_id IS NULL', [
    trade.id,
    annonceId,
  ]);
  return trade;
}

/** Appelé à la conclusion d'un échange (depuis `settleTradeInTx`) : l'annonce liée passe `conclue`. */
async function closeAnnoncesForTradeTx(tx, tradeId) {
  await tx.execute(
    `UPDATE gl_market_annonces SET statut = 'conclue', closed_at = NOW() WHERE trade_id = ? AND statut = 'ouverte'`,
    [tradeId],
  );
}

/** À la clôture d'une partie : les annonces ouvertes de la classe expirent. */
async function expireAnnoncesForClassTx(tx, classId) {
  await tx.execute(
    `UPDATE gl_market_annonces SET statut = 'expiree', closed_at = NOW() WHERE class_id = ? AND statut = 'ouverte'`,
    [classId],
  );
}

async function recordClassEvent(
  classId,
  eventType,
  payload,
  { teamId = null, actorId = null } = {},
) {
  const live = await findLiveGameForClass(classId);
  if (!live) return null;
  const evt = await insertGameEvent(
    { execute, queryOne },
    { gameId: Number(live.id), teamId, actorType: 'team', actorId, eventType, payload },
  );
  emitGlGameEvent(Number(live.id), evt);
  return evt;
}

/**
 * Don immédiat. Une seule chose à la fois : `gemmes` OU `coeurs` OU `feuilletCode`.
 * @returns {{ gemmes, coeurs, feuilletCode, transferred, surplus }}
 */
async function donner(donneurId, { receveurId, gemmes, coeurs, feuilletCode }) {
  const receiverId = Number(receveurId);
  if (!Number.isFinite(receiverId) || receiverId <= 0) throw makeHttpError('PLAYER_NOT_FOUND', 404);
  if (receiverId === Number(donneurId)) throw makeHttpError('DON_SELF', 409);
  const g = parseAmount(gemmes);
  const c = parseAmount(coeurs);
  const code = feuilletCode ? String(feuilletCode).trim() : '';
  const kinds = [g > 0, c > 0, !!code].filter(Boolean).length;
  if (kinds === 0) throw makeHttpError('DON_EMPTY', 400);
  if (kinds > 1) throw makeHttpError('DON_MULTIPLE', 400);
  const donneur = await getPlayer(donneurId);
  const receveur = await getPlayer(receiverId);
  if (Number(donneur.class_id) !== Number(receveur.class_id))
    throw makeHttpError('PEER_NOT_IN_CLASS', 403);
  const settings = await getGameplaySettings();
  if (c > 0 && !settings.marketHeartsEnabled) throw makeHttpError('HEARTS_NOT_TRADABLE', 409);
  const caps = resolveVitalityCaps(settings);
  const live = await findLiveGameForClass(donneur.class_id);
  const membership = live ? await findLiveMembership(donneurId, donneur.class_id) : null;

  let transferred = 0;
  let surplus = 0;
  await withTransaction(async (tx) => {
    if (code) {
      const giverStates = await assertPlayerOwnsFeuillets(donneurId, [code]);
      await deliverFeuillets(tx, { giverStates, receiverId, codes: [code] });
      const state = giverStates.get(code) || {};
      await upsertPlayerFeuilletState(tx, {
        playerId: receiverId,
        feuilletCode: code,
        status: 'discovered',
        effacementPct: Number(state.effacement_pct) || 0,
        acquiredVia: 'echange',
        discoveredByPlayerId: state.discovered_by_player_id || null,
        discoveredByName: state.discovered_by_name || null,
        discoveredSource: 'don',
      });
      transferred = 1;
    } else {
      const giver = await tx.queryOne(
        'SELECT health_points, power_points FROM gl_players WHERE id = ? LIMIT 1 FOR UPDATE',
        [donneurId],
      );
      const taker = await tx.queryOne(
        'SELECT health_points, power_points FROM gl_players WHERE id = ? LIMIT 1 FOR UPDATE',
        [receiverId],
      );
      const wanted = g > 0 ? g : c;
      const giverBalance =
        g > 0 ? clampVitality(giver.power_points) : clampVitality(giver.health_points);
      if (giverBalance < wanted) throw makeHttpError('DON_INSUFFICIENT', 409);
      const cap =
        g > 0 ? normalizeVitalityCap(caps.maxPower) : normalizeVitalityCap(caps.maxHealth);
      const takerBalance =
        g > 0 ? clampVitality(taker.power_points) : clampVitality(taker.health_points);
      transferred = Math.max(0, Math.min(wanted, cap - takerBalance));
      surplus = wanted - transferred;
      if (transferred === 0) throw makeHttpError('DON_RECEIVER_FULL', 409);
      await applyPlayerVitalityDelta(tx, {
        playerId: donneurId,
        healthDelta: c > 0 ? -transferred : 0,
        powerDelta: g > 0 ? -transferred : 0,
        caps,
        cause: 'don',
        gameId: live ? Number(live.id) : null,
      });
      await applyPlayerVitalityDelta(tx, {
        playerId: receiverId,
        healthDelta: c > 0 ? transferred : 0,
        powerDelta: g > 0 ? transferred : 0,
        caps,
        cause: 'don',
        gameId: live ? Number(live.id) : null,
      });
    }
    await tx.execute(
      `INSERT INTO gl_market_dons (class_id, game_id, donneur_id, receveur_id, gemmes, coeurs, feuillet_code, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        donneur.class_id,
        live ? Number(live.id) : null,
        donneurId,
        receiverId,
        g > 0 ? transferred : 0,
        c > 0 ? transferred : 0,
        code || null,
      ],
    );
  });
  await recordClassEvent(
    donneur.class_id,
    'don',
    {
      donneurId: Number(donneurId),
      receveurId: receiverId,
      gemmes: g > 0 ? transferred : 0,
      coeurs: c > 0 ? transferred : 0,
      feuilletCode: code || null,
    },
    { teamId: membership?.teamId ?? null, actorId: String(donneurId) },
  );
  return {
    gemmes: g > 0 ? transferred : 0,
    coeurs: c > 0 ? transferred : 0,
    feuilletCode: code || null,
    transferred,
    surplus,
  };
}

/**
 * Pastille texte d'une parure sans image (choix C10) : initiale du nom, portée par la mascotte
 * de l'équipe tant que l'`asset` est nul. Jamais un nom d'oiseau ni un mot interdit : le nom
 * vient du catalogue déjà contrôlé.
 */
function parurePastille(row) {
  const nom = String(row?.nom || '').trim();
  const mot = nom.replace(/^(la |le |les |l'|l’|un |une )/i, '').trim();
  return { texte: (mot[0] || nom[0] || '?').toUpperCase(), titre: nom };
}

/** Type effectif : une parure sans image se porte en pastille (`asset` nul), quel que soit son type. */
function parureTypeEffectif(row) {
  return row?.asset ? String(row.type || 'pastille') : 'pastille';
}

function formatParure(row) {
  return {
    code: String(row.code),
    nom: String(row.nom || ''),
    description: row.description || null,
    prix: Number(row.prix) || 0,
    ressource: String(row.ressource || 'choix'),
    chapitreMin: Number(row.chapitre_min) || 1,
    type: String(row.type || 'pastille'),
    typeEffectif: parureTypeEffectif(row),
    asset: row.asset || null,
    pelage: row.pelage || null,
    pastille: row.asset ? null : parurePastille(row),
    // C10 : achetable même sans image (pastille texte sur la mascotte).
    achetable: true,
  };
}

/** Catalogue + parures portées par l'équipe du joueur dans la partie `live`. */
async function listParures(playerId) {
  const self = await getPlayer(playerId);
  const rows = await queryAll(
    'SELECT * FROM gl_tenir_parures WHERE actif = 1 ORDER BY chapitre_min ASC, prix ASC, code ASC',
  );
  const live = await findLiveGameForClass(self.class_id);
  const plateau = live?.plateau_number != null ? Number(live.plateau_number) : null;
  const membership = live ? await findLiveMembership(playerId, self.class_id) : null;
  const worn = membership
    ? await queryAll(
        `SELECT gp.id, gp.parure_code, gp.achetee_par, gp.ressource, gp.prix, gp.created_at, p.nom, p.type, p.asset, p.pelage
           FROM gl_game_parures gp INNER JOIN gl_tenir_parures p ON p.code = gp.parure_code
          WHERE gp.game_id = ? AND gp.team_id = ? AND gp.rendue_at IS NULL ORDER BY gp.id ASC`,
        [membership.gameId, membership.teamId],
      )
    : [];
  return {
    catalogue: rows.map((r) => ({
      ...formatParure(r),
      disponible: plateau == null || Number(r.chapitre_min) <= plateau,
    })),
    portees: worn.map((w) => ({
      id: Number(w.id),
      code: String(w.parure_code),
      nom: w.nom,
      type: w.type,
      typeEffectif: parureTypeEffectif(w),
      asset: w.asset,
      pelage: w.pelage,
      pastille: w.asset ? null : parurePastille(w),
      acheteePar: w.achetee_par != null ? Number(w.achetee_par) : null,
      ressource: w.ressource,
      prix: Number(w.prix) || 0,
      createdAt: w.created_at,
    })),
    teamId: membership?.teamId ?? null,
    gameId: membership?.gameId ?? null,
  };
}

/** Parures portées par les équipes d'une partie (affichage sur la mascotte). */
async function listParuresForGame(gameId) {
  const rows = await queryAll(
    `SELECT gp.team_id, gp.parure_code, p.nom, p.type, p.asset, p.pelage
       FROM gl_game_parures gp INNER JOIN gl_tenir_parures p ON p.code = gp.parure_code
      WHERE gp.game_id = ? AND gp.rendue_at IS NULL ORDER BY gp.id ASC`,
    [gameId],
  );
  const byTeam = {};
  for (const r of rows) {
    const key = String(r.team_id);
    if (!byTeam[key]) byTeam[key] = [];
    byTeam[key].push({
      code: String(r.parure_code),
      nom: r.nom,
      type: r.type,
      typeEffectif: parureTypeEffectif(r),
      asset: r.asset,
      pelage: r.pelage,
      pastille: r.asset ? null : parurePastille(r),
    });
  }
  return byTeam;
}

async function acheterParure(playerId, code, ressource) {
  const self = await getPlayer(playerId);
  const parure = await queryOne(
    'SELECT * FROM gl_tenir_parures WHERE code = ? AND actif = 1 LIMIT 1',
    [code],
  );
  if (!parure) throw makeHttpError('PARURE_NOT_FOUND', 404);
  // La ressource est celle du catalogue (`gemmes` | `coeurs`) ; seule une parure `choix`
  // laisse l'acheteur décider — le corps de la requête ne contourne jamais le prix prévu.
  const catalogue = String(parure.ressource || 'choix').toLowerCase();
  const res = catalogue === 'choix' ? String(ressource || '').toLowerCase() : catalogue;
  if (res !== 'gemmes' && res !== 'coeurs') throw makeHttpError('PARURE_RESSOURCE', 400);
  // C10 : une parure sans image se porte en pastille texte ; elle reste achetable.
  const live = await findLiveGameForClass(self.class_id);
  if (!live) throw makeHttpError('NO_LIVE_GAME', 409);
  const settings = await getGameplaySettings();
  if (isTenirGame(settings, live) && resolveTenirSettings(settings, live).parures === false) {
    throw makeHttpError('PARURES_DISABLED', 409);
  }
  if (live.plateau_number != null && Number(parure.chapitre_min) > Number(live.plateau_number)) {
    throw makeHttpError('PARURE_CHAPTER', 409);
  }
  const membership = await findLiveMembership(playerId, self.class_id);
  if (!membership) throw makeHttpError('NO_LIVE_GAME', 409);
  const prix = Number(parure.prix) || 0;
  let result;
  await withTransaction(async (tx) => {
    const row = await tx.queryOne(
      'SELECT health_points, power_points FROM gl_players WHERE id = ? LIMIT 1 FOR UPDATE',
      [playerId],
    );
    const balance =
      res === 'gemmes' ? clampVitality(row.power_points) : clampVitality(row.health_points);
    if (balance < prix) throw makeHttpError('PARURE_INSUFFICIENT', 409);
    await applyPlayerVitalityDelta(tx, {
      playerId,
      healthDelta: res === 'coeurs' ? -prix : 0,
      powerDelta: res === 'gemmes' ? -prix : 0,
      cause: 'parure',
      gameId: membership.gameId,
    });
    const insert = await tx.execute(
      `INSERT INTO gl_game_parures (game_id, team_id, parure_code, achetee_par, ressource, prix, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [membership.gameId, membership.teamId, parure.code, playerId, res, prix],
    );
    result = {
      id: Number(insert.insertId),
      code: parure.code,
      teamId: membership.teamId,
      prix,
      ressource: res,
    };
    const evt = await insertGameEvent(tx, {
      gameId: membership.gameId,
      teamId: membership.teamId,
      actorType: 'team',
      actorId: String(playerId),
      eventType: 'parure',
      payload: { parureCode: parure.code, nom: parure.nom, teamId: membership.teamId },
    });
    result.event = evt;
  });
  emitGlGameEvent(membership.gameId, result.event);
  return result;
}

/** Au seuil : toutes les parures de la partie reviennent au comptoir. */
async function rendreParuresTx(tx, gameId) {
  await tx.execute(
    'UPDATE gl_game_parures SET rendue_at = NOW() WHERE game_id = ? AND rendue_at IS NULL',
    [gameId],
  );
}

module.exports = {
  ANNONCE_TYPES,
  resolveMarketPlaceError,
  findLiveGameForClass,
  findLiveMembership,
  listAnnonces,
  createAnnonce,
  deleteAnnonce,
  repondreAnnonce,
  closeAnnoncesForTradeTx,
  expireAnnoncesForClassTx,
  donner,
  listParures,
  listParuresForGame,
  parurePastille,
  parureTypeEffectif,
  acheterParure,
  rendreParuresTx,
};
