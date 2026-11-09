'use strict';

/**
 * « Tenir à deux » v2 — le Seuil (clôture d'une partie, spec § 4 et § 12).
 *
 * `cloreTenirPartieTx` : la caravane porte les retardataires (avance libre au camp, motif
 * fixe), tour courant clos, annonces expirées, retraits clos, parures rendues, Héritages mis en
 * attente, honneurs / sceaux / titres / badges (étape 4, `lib/glHonneurs.js` si présent),
 * événement `seuil_clos`. Appelée une seule fois (garde sur l'événement).
 */

const { insertGameEvent } = require('./glGameEvents');
const { applyTeamMoveTx } = require('./gl/gamesRuntime');
const { teamPathIndex } = require('./shared/glBoardPathCore');
const { loadPathMarkers, loadTeams, loadGameRow } = require('./glTour');
const { rendreParuresTx, expireAnnoncesForClassTx } = require('./glMarketPlace');
const { loadOrCreateTenirState } = require('./glTenir');

const MOTIF_CARAVANE = 'La caravane porte les retardataires';

async function dejaClose(db, gameId) {
  const row = await db.queryOne(
    "SELECT id FROM gl_game_events WHERE game_id = ? AND event_type = 'seuil_clos' LIMIT 1",
    [gameId],
  );
  return !!row;
}

async function cloreTenirPartieTx(tx, { gameId, actorId, settings }) {
  const game = await loadGameRow(tx, gameId);
  if (!game) return { closed: false, events: [] };
  if (await dejaClose(tx, gameId)) return { closed: false, alreadyClosed: true, events: [] };
  const events = [];
  const markers = await loadPathMarkers(tx, game.chapter_id);
  const teams = await loadTeams(tx, gameId);
  const camp = markers.length ? markers[markers.length - 1] : null;
  const state = await loadOrCreateTenirState(tx, gameId);
  let premiere = state.premiereArriveeTeamId;

  // 1. La caravane porte les retardataires.
  for (const team of teams) {
    if (!camp) break;
    const idx = teamPathIndex(team, markers);
    if (idx != null && idx >= markers.length - 1) continue;
    await applyTeamMoveTx(tx, { gameId, teamId: team.id, markerId: camp.id });
    events.push(
      await insertGameEvent(tx, {
        gameId,
        teamId: team.id,
        actorType: 'mj',
        actorId: String(actorId),
        eventType: 'avance_libre',
        payload: {
          cases: markers.length - 1 - (idx ?? 0),
          motif: MOTIF_CARAVANE,
          caravane: true,
          markerId: Number(camp.id),
        },
      }),
    );
    // Aucune équipe arrivée d'elle-même (`premiere == null`) : pas d'honneur Éclaireurs,
    // `computeHonneurs` le déduit de `premiere_arrivee_team_id` resté nul.
  }

  // 2. Tour courant clos.
  const roundNumber = Number(game.current_round_number) || 0;
  if (roundNumber > 0) {
    await tx.execute(
      "UPDATE gl_game_rounds SET phase = 'clos', ended_at = COALESCE(ended_at, NOW()), phase_changed_at = NOW() WHERE game_id = ? AND round_number = ? AND phase <> 'clos'",
      [gameId, roundNumber],
    );
  }

  // 3. Marché : annonces expirées, parures rendues au comptoir.
  await expireAnnoncesForClassTx(tx, Number(game.class_id));
  await rendreParuresTx(tx, gameId);

  // 4. Retraits clos.
  await tx.execute(
    'UPDATE gl_game_retraits SET sortie_at = NOW() WHERE game_id = ? AND sortie_at IS NULL',
    [gameId],
  );

  // 4 bis. E4 : la réserve de la caravane s'éteint au Seuil, sans transfert (cause `reserve_seuil`).
  {
    const { listReserves, debitReserveTx } = require('./glBourses');
    for (const r of await listReserves(tx, gameId)) {
      if (!r.health && !r.power) continue;
      await debitReserveTx(tx, {
        gameId,
        teamId: r.teamId,
        dh: r.health,
        dg: r.power,
        cause: 'reserve_seuil',
      });
    }
  }

  // 5. Honneurs, sceaux, titres, badges, Héritage (étape 4).
  let honneurs = null;
  try {
    const { attribuerHonneursTx } = require('./glHonneurs');
    honneurs = await attribuerHonneursTx(tx, {
      gameId,
      actorId,
      settings,
      game,
      teams,
      markers,
      premiereArriveeTeamId: premiere,
    });
    events.push(...(honneurs?.events || []));
  } catch (err) {
    if (err?.code !== 'MODULE_NOT_FOUND') throw err;
  }

  events.push(
    await insertGameEvent(tx, {
      gameId,
      actorType: 'mj',
      actorId: String(actorId),
      eventType: 'seuil_clos',
      payload: {
        roundNumber,
        premiereArriveeTeamId: premiere,
        honneurs: honneurs?.honneurs || null,
      },
    }),
  );
  return { closed: true, events, honneurs };
}

module.exports = { MOTIF_CARAVANE, cloreTenirPartieTx, dejaClose };
