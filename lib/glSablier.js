'use strict';

/**
 * « Tenir à deux » — sabliers réglables d'un clic (14 novembre 2026).
 *
 * - Réglages résolus d'une partie : `sablier_actif`, `sablier_secondes` (équipe active au
 *   tableau), `sablier_phase_secondes` (0 = sans), `sablier_phase_auto`. Le prof les change
 *   d'un clic : ils sont enregistrés comme **surcharges de la partie**
 *   (`gl_games.tenir_overrides_json`).
 * - Sablier de **phase** : commun à toutes les équipes pendant la phase `jeu`, en hybride et
 *   sur tablette. Son départ (entrée en phase `jeu`), ses pauses et sa remise à zéro vivent
 *   dans `gl_game_rounds.sablier_json` : console, tablettes et projection lisent le même état.
 * - Un sablier n'annule jamais rien. À zéro, la console met en avant le passage au souffle.
 *
 * Calcul pur dans `src/shared/glSablierCore.js` (miroir `lib/shared/`). Écriture réservée au
 * prof (`PUT /api/gl/games/:id/tenir/sablier`, permission `gl.game.manage`).
 */

const { insertGameEvent } = require('./glGameEvents');
const { resolveTenirSettings, resolveSurface, validateOverrides } = require('./glTenir');
const {
  SABLIER_ACTIONS,
  appliquerActionSablier,
  demarrerSablier,
  normaliserEtatSablier,
  restantSablier,
} = require('./shared/glSablierCore');

function fail(code, status) {
  const err = new Error(code);
  err.status = status;
  return err;
}

/** Le sablier de phase ne concerne que les surfaces où les équipes jouent en parallèle. */
function surfaceASablierDePhase(surface) {
  return surface === 'hybride' || surface === 'tablette';
}

/**
 * Vue des sabliers servie à tous (prof, élèves, projection) : aucun élément privé.
 *
 * @param {object} input
 * @param {object} input.resolved réglages résolus de la partie
 * @param {string} input.surface surface effective
 * @param {{ phase?: string|null, sablierEtat?: object|null }|null} input.round
 * @param {number} [input.nowMs]
 */
function buildSablierView({ resolved, surface, round, nowMs = Date.now() }) {
  const actif = resolved?.sablier_actif !== false;
  const equipeSecondes = Number(resolved?.sablier_secondes) || 180;
  const phaseSecondes = Math.max(0, Number(resolved?.sablier_phase_secondes) || 0);
  const phaseAuto = resolved?.sablier_phase_auto === true;
  let phase = null;
  if (actif && phaseSecondes > 0 && round?.phase === 'jeu' && surfaceASablierDePhase(surface)) {
    const etat = normaliserEtatSablier(round.sablierEtat);
    const { restantSecondes, enPause, termine } = restantSablier({
      secondes: phaseSecondes,
      etat,
      nowMs,
    });
    phase = { secondes: phaseSecondes, restantSecondes, enPause, termine, auto: phaseAuto };
  }
  return { actif, equipeSecondes, phaseSecondes, phaseAuto, phase };
}

/** Entrée en phase `jeu` : le sablier de phase démarre (appelé par `changerPhaseTx`). */
function etatAuDebutDuJeu(nowMs = Date.now()) {
  return JSON.stringify(demarrerSablier(nowMs));
}

function parseOverridesJson(raw) {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object') return { ...raw };
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

/**
 * Lit le corps d'un réglage : `{ actif?, secondes?, phaseSecondes?, phaseAuto?, action? }`.
 * @returns {{ overrides: object, action: string|null }}
 * @throws 400 `SABLIER_INVALIDE`
 */
function lireReglage(body = {}) {
  const overrides = {};
  if (body.actif !== undefined) overrides.sablier_actif = body.actif;
  if (body.secondes !== undefined) overrides.sablier_secondes = Number(body.secondes);
  if (body.phaseSecondes !== undefined) {
    overrides.sablier_phase_secondes = Number(body.phaseSecondes);
  }
  if (body.phaseAuto !== undefined) overrides.sablier_phase_auto = body.phaseAuto;
  const checked = validateOverrides(overrides);
  if (checked.error) throw fail('SABLIER_INVALIDE', 400);
  const action = body.action == null || body.action === '' ? null : String(body.action);
  if (action != null && !SABLIER_ACTIONS.includes(action)) throw fail('SABLIER_INVALIDE', 400);
  if (!Object.keys(checked.value).length && !action) throw fail('SABLIER_INVALIDE', 400);
  return { overrides: checked.value, action };
}

/**
 * Règle les sabliers d'une partie (prof). Les réglages vont dans les surcharges de la partie ;
 * `pause`, `reprise` et `zero` agissent sur le sablier de phase du tour en cours. Changer la
 * durée du sablier de phase le fait repartir plein. Un évènement `sablier_regle` prévient les
 * écrans.
 *
 * @returns {Promise<{ sablier: object, event: object }>}
 */
async function reglerSablierTx(tx, { gameId, actorId, settings, body, nowMs = Date.now() }) {
  const { overrides, action } = lireReglage(body);
  const game = await tx.queryOne(
    `SELECT g.id, g.status, g.current_round_number, g.tenir_profil, g.tenir_overrides_json,
            g.tenir_surface
       FROM gl_games g WHERE g.id = ? LIMIT 1 FOR UPDATE`,
    [gameId],
  );
  if (!game) throw fail('GAME_NOT_FOUND', 404);
  const avant = resolveTenirSettings(settings, game);
  if (Object.keys(overrides).length) {
    const next = { ...parseOverridesJson(game.tenir_overrides_json), ...overrides };
    await tx.execute(
      'UPDATE gl_games SET tenir_overrides_json = ?, updated_at = NOW() WHERE id = ?',
      [JSON.stringify(next), gameId],
    );
    game.tenir_overrides_json = JSON.stringify(next);
  }
  const resolved = resolveTenirSettings(settings, game);
  const surface = resolveSurface(game, settings);
  const roundNumber = Number(game.current_round_number) || 0;
  const row = roundNumber
    ? await tx.queryOne(
        'SELECT phase, sablier_json FROM gl_game_rounds WHERE game_id = ? AND round_number = ? LIMIT 1 FOR UPDATE',
        [gameId, roundNumber],
      )
    : null;
  let etat = normaliserEtatSablier(row?.sablier_json);
  if (row && row.phase === 'jeu') {
    const dureeChangee =
      Number(avant.sablier_phase_secondes) !== Number(resolved.sablier_phase_secondes);
    let prochain = etat;
    // Durée changée, ou sablier allumé en cours de phase : il repart plein.
    if (dureeChangee || !prochain) prochain = demarrerSablier(nowMs);
    if (action) prochain = appliquerActionSablier(prochain, action, nowMs);
    if (JSON.stringify(prochain) !== JSON.stringify(etat)) {
      await tx.execute(
        'UPDATE gl_game_rounds SET sablier_json = ? WHERE game_id = ? AND round_number = ?',
        [JSON.stringify(prochain), gameId, roundNumber],
      );
      etat = prochain;
    }
  }
  const sablier = buildSablierView({
    resolved,
    surface,
    round: row ? { phase: row.phase, sablierEtat: etat } : null,
    nowMs,
  });
  // Ce que le prof vient de changer (le libellé du journal dit ce geste, pas l'état courant).
  let regle = 'action';
  if (!action) {
    if ('sablier_actif' in overrides) regle = 'actif';
    else if ('sablier_phase_secondes' in overrides) regle = 'phase';
    else if ('sablier_secondes' in overrides) regle = 'equipe';
    else regle = 'auto';
  }
  const event = await insertGameEvent(tx, {
    gameId,
    actorType: 'mj',
    actorId: String(actorId),
    eventType: 'sablier_regle',
    payload: {
      roundNumber,
      regle,
      actif: sablier.actif,
      equipeSecondes: sablier.equipeSecondes,
      phaseSecondes: sablier.phaseSecondes,
      phaseAuto: sablier.phaseAuto,
      action: action || null,
    },
  });
  return { sablier, event };
}

module.exports = {
  surfaceASablierDePhase,
  buildSablierView,
  etatAuDebutDuJeu,
  lireReglage,
  reglerSablierTx,
};
