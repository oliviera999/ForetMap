'use strict';

/**
 * L'escalier du chapitre 1 côté partie (« Tenir à deux », ensemble unifié, M8).
 *
 * Le cœur pur (`lib/shared/glTenirEscalierCore.js`) dit ce qui est ouvert à une séance ; ce
 * module tient le **pas** d'une partie : il le pose à la création d'une partie du plateau 1, le
 * fait avancer à la clôture d'un tour ou quand le prof touche « Ouvrir la suite » — jamais
 * reculer —, et pose la **page témoin** à l'ouverture de la séance 3.
 *
 * Le pas vit dans les surcharges de la partie (`gl_games.tenir_overrides_json` : `escalier`,
 * `escalier_pas`) : toutes les règles qui résolvent les réglages d'une partie
 * (`resolveTenirSettings`) le lisent sans rien changer à leurs requêtes.
 */

const core = require('./shared/glTenirEscalierCore');
const { parseOverrides } = require('./glTenir');
const { insertGameEvent } = require('./glGameEvents');

function tableAbsente(err) {
  return err?.errno === 1146 || err?.code === 'ER_NO_SUCH_TABLE';
}

/** Tours clos d'une partie : la séance en cours est ce nombre + 1. */
async function toursClos(db, gameId) {
  const row = await db.queryOne(
    "SELECT COUNT(*) AS n FROM gl_game_rounds WHERE game_id = ? AND phase = 'clos'",
    [gameId],
  );
  return Number(row?.n) || 0;
}

/**
 * Surcharges d'une partie neuve : au plateau 1, quand le réglage `tenir_escalier` est levé, elle
 * monte l'escalier depuis sa première marche. Ailleurs, rien n'est ajouté. L'état d'escalier
 * d'une partie copiée ne se reprend pas : il raconte une autre séance.
 * @param {object|null} overrides surcharges déjà décidées (copie de configuration…)
 * @param {{ plateau: number|null, gameplay: object }} p
 * @returns {object|null}
 */
function surchargesDeCreation(overrides, { plateau, gameplay }) {
  const out = { ...(overrides || {}) };
  delete out.escalier;
  delete out.escalier_pas;
  if (Number(plateau) === 1 && gameplay?.tenirEscalier !== false) {
    out.escalier = true;
    out.escalier_pas = 1;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Surcharges reçues du prof (`PUT /tenir/profil`), ramenées à ce que le moteur admet : le pas ne
 * se choisit pas. Escalier demandé → le pas déjà atteint est gardé, sinon il part de la séance
 * en cours (tours clos + 1). Escalier coupé ou absent → plus de pas : tout est ouvert.
 * @param {object} demandees surcharges validées
 * @param {{ actuelles: object, toursClos: number }} p
 */
function surchargesDuProf(demandees, { actuelles = {}, toursClos: clos = 0 } = {}) {
  const out = { ...(demandees || {}) };
  delete out.escalier_pas;
  if (out.escalier === true) {
    out.escalier_pas =
      actuelles.escalier === true && actuelles.escalier_pas != null
        ? core.normaliserPas(actuelles.escalier_pas)
        : core.normaliserPas(Number(clos) + 1);
  }
  return out;
}

/**
 * Monte une marche : le pas passe à `pas + 1` (jamais au-delà de la dernière). Sans effet sur une
 * partie hors escalier ou déjà en haut.
 * @param {{ gameId: number, motif: 'tour_clos'|'prof', actorId?: string|null,
 *   roundNumber?: number|null, depuis?: number|null }} p
 * @returns {Promise<null|{ pas: number, modules: string[], sorts: string[], events: Array }>}
 *   `modules` et `sorts` = ce que cette marche vient d'ouvrir
 */
async function avancerTx(tx, { gameId, motif, actorId = null, roundNumber = null, depuis = null }) {
  const row = await tx.queryOne(
    'SELECT tenir_overrides_json FROM gl_games WHERE id = ? LIMIT 1 FOR UPDATE',
    [gameId],
  );
  const overrides = parseOverrides(row?.tenir_overrides_json);
  const etat = core.etatEscalier(overrides);
  if (!etat || etat.monte) return null;
  // `depuis` = la séance que voyait celui qui demande : si l'escalier n'y est plus, la marche
  // demandée est déjà montée (double appui, tour clos entre-temps) — on n'en monte pas une autre.
  if (depuis != null && etat.pas !== core.normaliserPas(depuis)) return null;
  const marche = etat.prochaine;
  const pas = marche.seance;
  await tx.execute(
    'UPDATE gl_games SET tenir_overrides_json = ?, updated_at = NOW() WHERE id = ?',
    [JSON.stringify({ ...overrides, escalier_pas: pas }), gameId],
  );
  const event = await insertGameEvent(tx, {
    gameId,
    actorType: motif === 'prof' ? 'mj' : 'system',
    actorId: actorId != null ? String(actorId) : null,
    eventType: 'escalier_pas',
    payload: {
      pas,
      modules: marche.modules,
      sorts: marche.sorts,
      motif,
      roundNumber: Number(roundNumber) || null,
    },
  });
  return { pas, modules: marche.modules, sorts: marche.sorts, events: [event] };
}

/**
 * La page témoin : à l'ouverture de la séance 3, une zone encore endormie — la plus proche du
 * départ — pâlit d'office, pour que les Gnomes vivent la réparation sans danger (une zone pâlie
 * ne se fouille que par une équipe gnome). Une seule fois par partie ; rien si l'escalier ne
 * l'a pas ouverte, ou si plus aucune zone ne dort. Aucune ressource, aucune page retirée.
 * @returns {Promise<null|{ zoneKey: string, event: object }>}
 */
async function poserPageTemoinTx(tx, { gameId, roundNumber = 0, resolved }) {
  const etat = core.etatEscalier(resolved);
  if (!etat || !etat.modules.includes('page_temoin')) return null;
  try {
    const deja = await tx.queryOne(
      "SELECT id FROM gl_game_tenir_effets WHERE game_id = ? AND kind = 'page_temoin' LIMIT 1",
      [gameId],
    );
    if (deja) return null;
    const zone = await tx.queryOne(
      `SELECT p.zone_id, z.zone_key, z.feuillet_code
         FROM gl_game_chasse_pages p
         INNER JOIN gl_chasse_zones z ON z.id = p.zone_id
        WHERE p.game_id = ? AND p.etat = 'endormie'
        ORDER BY z.rang_case IS NULL, z.rang_case ASC, z.ordre ASC, z.id ASC
        LIMIT 1 FOR UPDATE`,
      [gameId],
    );
    if (!zone) return null;
    await tx.execute(
      "UPDATE gl_game_chasse_pages SET etat = 'palie', updated_at = NOW() WHERE game_id = ? AND zone_id = ? AND etat = 'endormie'",
      [gameId, zone.zone_id],
    );
    await tx.execute(
      `INSERT INTO gl_game_tenir_effets (game_id, round_number, kind, payload_json, created_at)
       VALUES (?, ?, 'page_temoin', ?, NOW())`,
      [gameId, Number(roundNumber) || 0, JSON.stringify({ zoneKey: String(zone.zone_key) })],
    );
    const event = await insertGameEvent(tx, {
      gameId,
      actorType: 'system',
      eventType: 'page_temoin',
      payload: { zoneKey: String(zone.zone_key), roundNumber: Number(roundNumber) || null },
    });
    return { zoneKey: String(zone.zone_key), event };
  } catch (err) {
    // Base en retard d'une migration : la page témoin attendra, le tour s'ouvre quand même.
    if (tableAbsente(err)) return null;
    throw err;
  }
}

/** Ce que l'écran reçoit de l'escalier d'une partie (`null` hors escalier). */
function vueEscalier(resolved) {
  const etat = core.etatEscalier(resolved);
  if (!etat) return null;
  return {
    pas: etat.pas,
    dernier: etat.dernier,
    monte: etat.monte,
    modules: etat.modules,
    sorts: etat.sorts,
    prochaine: etat.prochaine,
  };
}

module.exports = {
  toursClos,
  surchargesDeCreation,
  surchargesDuProf,
  avancerTx,
  poserPageTemoinTx,
  vueEscalier,
};
