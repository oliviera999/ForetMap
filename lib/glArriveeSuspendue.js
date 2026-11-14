'use strict';

/**
 * « Tenir à deux » — arrivée en suspens (sort Relance, 9 novembre 2026).
 *
 * Relance sert à effacer un jet jugé nul (petit score, case d'arrivée défavorable). Pour qu'il ait
 * un sens, la case ne doit pas s'être déjà appliquée quand l'équipe décide. Après un jet, si
 * l'équipe peut encore lancer Relance (module des sorts actif, Relance ouvert au chapitre, limite
 * du tour non atteinte, bourses suffisantes), la mascotte avance et la case d'arrivée **s'affiche
 * sans s'appliquer**. Trois issues :
 *
 *  - **Relance** : le jet est annulé, la mascotte revient sur sa case de départ, la case
 *    d'arrivée ne s'applique jamais ; l'équipe rejette les dés (`annulerArriveeTx`) ;
 *  - **l'équipe garde son jet** (bouton « Garder ce jet », question de case, fouille) : la case
 *    s'applique (`confirmerArriveesTx`) ;
 *  - **la partie avance** (une autre équipe jette, équipe suivante, changement de phase, autre sort
 *    automatique, clôture du chapitre) : la case s'applique d'office.
 *
 * Stockage : une ligne `gl_game_tenir_effets` de `kind = 'arrivee_suspendue'`, payload
 * `{ markerId, fromMarkerId, fromX, fromY, index, total, faces, mode, saisieId, preview, issue? }`
 * — `issue` absent tant que l'arrivée est en suspens, puis `appliquee`, `annulee` ou `caduque`
 * (la mascotte a quitté la case par un autre moyen : rien n'est appliqué).
 */

const { insertGameEvent } = require('./glGameEvents');
const { applyTeamMoveTx } = require('./gl/gamesRuntime');
const { parseJsonColumn, resolveTenirSettings } = require('./glTenir');
const { formatMarkerEffectSummary } = require('./glMarkerEffects');
const { isQuestionMarker } = require('./glMarkerRow');
const { httpError } = require('./shared/httpError');

const KIND = 'arrivee_suspendue';

const fail = (message, status) => httpError(status, message);

function toView(row) {
  const p = parseJsonColumn(row.payload_json, {}) || {};
  return {
    id: Number(row.id),
    roundNumber: Number(row.round_number) || 0,
    teamId: Number(row.team_id),
    markerId: p.markerId != null ? Number(p.markerId) : null,
    fromMarkerId: p.fromMarkerId != null ? Number(p.fromMarkerId) : null,
    fromX: p.fromX != null ? Number(p.fromX) : null,
    fromY: p.fromY != null ? Number(p.fromY) : null,
    index: p.index != null ? Number(p.index) : null,
    total: Number(p.total) || 0,
    faces: Array.isArray(p.faces) ? p.faces.map(Number) : [],
    mode: p.mode || null,
    saisieId: p.saisieId != null ? Number(p.saisieId) : null,
    preview: p.preview || null,
  };
}

/** Arrivées en suspens d'une partie (d'une équipe si `teamId`). */
async function listEnSuspens(db, gameId, { teamId = null, forUpdate = false } = {}) {
  try {
    const rows = await db.queryAll(
      `SELECT id, round_number, team_id, payload_json FROM gl_game_tenir_effets
        WHERE game_id = ? AND kind = ? ${teamId != null ? 'AND team_id = ?' : ''}
          AND JSON_EXTRACT(COALESCE(payload_json, '{}'), '$.issue') IS NULL
        ORDER BY id ASC${forUpdate ? ' FOR UPDATE' : ''}`,
      teamId != null ? [gameId, KIND, teamId] : [gameId, KIND],
    );
    return rows.map(toView);
  } catch (err) {
    if (err?.errno === 1146 || err?.code === 'ER_NO_SUCH_TABLE') return [];
    throw err;
  }
}

async function marquerIssueTx(tx, id, issue) {
  await tx.execute(
    `UPDATE gl_game_tenir_effets SET payload_json = JSON_SET(COALESCE(payload_json, '{}'), '$.issue', ?)
      WHERE id = ?`,
    [issue, id],
  );
}

// ---------------------------------------------------------------------
// Relance encore possible ?
// ---------------------------------------------------------------------

/**
 * Sort de relance que l'équipe pourrait encore lancer ce tour, ou `null`. Mêmes règles que le
 * lancement : module des sorts et vitalité actifs, sort v2 officiel ouvert au chapitre, peuple,
 * limite, et bourses (membres + réserve de la caravane) qui couvrent le coût dans au moins une
 * ressource admise. Une base en retard (colonne ou table absente) vaut « non » : la case
 * s'applique comme avant.
 */
async function relanceDisponibleTx(tx, { gameId, game, teamId, roundNumber, settings }) {
  try {
    const { getGlModulesSettings } = require('./glSettings');
    const modules = await getGlModulesSettings();
    if (modules?.spellCastEnabled !== true || settings?.vitalityEnabled !== true) return null;
    const { resolveSpellEffect } = require('./glSpellEffectsApply');
    const { effectType } = require('./glSpellEffects');
    const rows = await tx.queryAll(
      `SELECT s.spell_code, s.nom, s.peuple, s.cout, s.ressource, s.limite_json, s.effet_auto_json
         FROM gl_spells s
   INNER JOIN gl_chapter_spells cs ON cs.spell_code = s.spell_code AND cs.chapter_id = ?
        WHERE s.tenir_v2 = 1 AND s.statut = 'officiel' AND s.execution = 'auto'`,
      [game.chapter_id],
    );
    const candidats = rows.filter(
      (r) =>
        effectType(
          resolveSpellEffect({ spellCode: r.spell_code, effetAutoJson: r.effet_auto_json }) || {},
        ) === 'reroll',
    );
    if (!candidats.length) return null;
    const team = await tx.queryOne('SELECT id, type FROM gl_teams WHERE id = ? LIMIT 1', [teamId]);
    if (!team) return null;
    const bourse = await tx.queryOne(
      `SELECT COALESCE(SUM(p.health_points), 0) AS h, COALESCE(SUM(p.power_points), 0) AS g
         FROM gl_team_members tm INNER JOIN gl_players p ON p.id = tm.player_id
        WHERE tm.game_id = ? AND tm.team_id = ?`,
      [gameId, teamId],
    );
    const { loadReserve } = require('./glBourses');
    const reserve = await loadReserve(tx, gameId, teamId);
    const dispo = {
      coeurs: (Number(bourse?.h) || 0) + (Number(reserve?.health) || 0),
      gemmes: (Number(bourse?.g) || 0) + (Number(reserve?.power) || 0),
    };
    const peupleEquipe = String(team.type) === 'unicorn' ? 'unicorn' : 'gnome';
    const ressourcePeuple = peupleEquipe === 'unicorn' ? 'gemmes' : 'coeurs';
    const { assertLimite } = require('./glSpellFenetres');
    const resolved = resolveTenirSettings(settings, game);
    for (const r of candidats) {
      const peuple = String(r.peuple || 'any');
      if ((peuple === 'unicorn' || peuple === 'gnome') && peuple !== peupleEquipe) continue;
      const cout = Math.max(0, Number(r.cout) || 0);
      const ressource = String(r.ressource || 'choix');
      const admises =
        ressource === 'choix'
          ? ['coeurs', 'gemmes']
          : ressource === 'peuple'
            ? [ressourcePeuple]
            : [ressource];
      if (!admises.some((res) => (dispo[res] ?? 0) >= cout)) continue;
      try {
        await assertLimite(tx, {
          spell: { spellCode: r.spell_code, limiteJson: r.limite_json },
          gameId,
          teamId,
          roundNumber,
          resolved,
        });
      } catch (err) {
        if (err?.code === 'SPELL_LIMITE_ELEVE') return { spellCode: String(r.spell_code) };
        if (err?.code === 'SPELL_LIMITE') continue;
        throw err;
      }
      return { spellCode: String(r.spell_code), nom: String(r.nom || r.spell_code) };
    }
    return null;
  } catch (err) {
    if (err?.errno === 1054 || err?.code === 'ER_BAD_FIELD_ERROR') return null;
    if (err?.errno === 1146 || err?.code === 'ER_NO_SUCH_TABLE') return null;
    throw err;
  }
}

// ---------------------------------------------------------------------
// Suspendre, confirmer, annuler
// ---------------------------------------------------------------------

/** Aperçu de la case d'arrivée, calculé comme `applyArrivalTx` mais sans rien appliquer. */
async function apercuArriveeTx(
  tx,
  { gameId, teamId, marker, resolved, markers, caseTirePeripetie },
) {
  const team = await tx.queryOne('SELECT id, type FROM gl_teams WHERE id = ? LIMIT 1', [teamId]);
  const question = isQuestionMarker(marker);
  const preview = {
    markerId: Number(marker.id),
    label: marker.label || null,
    eventType: marker.event_type || null,
    question,
    camp: markers.length > 0 && Number(markers[markers.length - 1].id) === Number(marker.id),
  };
  if (!question) {
    const { resolveTenirMarkerContext } = require('./glTourArrivalHelpers');
    const ctx = await resolveTenirMarkerContext(tx, gameId, teamId);
    preview.effectSummary =
      formatMarkerEffectSummary(marker, team?.type, {
        tenir: true,
        sentierActif: ctx.sentierActif,
        casesPositives: resolved?.cases_positives,
        peripetie: Boolean(resolved?.peripeties && caseTirePeripetie?.(marker, resolved)),
      }) || null;
  }
  return preview;
}

/**
 * Met en suspens l'arrivée d'une équipe qui vient de jeter (la mascotte est déjà déplacée).
 * @returns {Promise<{ summary: object, events: Array }>}
 */
async function suspendreArriveeTx(
  tx,
  {
    gameId,
    roundNumber,
    teamId,
    marker,
    index,
    from,
    total,
    faces,
    mode,
    saisieId,
    resolved,
    markers,
    relance,
    caseTirePeripetie,
    actorType,
    actorId,
  },
) {
  const preview = {
    ...(await apercuArriveeTx(tx, {
      gameId,
      teamId,
      marker,
      resolved,
      markers,
      caseTirePeripetie,
    })),
    relanceSpellCode: relance?.spellCode || null,
  };
  await tx.execute(
    `INSERT INTO gl_game_tenir_effets (game_id, round_number, kind, team_id, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, NOW())`,
    [
      gameId,
      Number(roundNumber) || 0,
      KIND,
      teamId,
      JSON.stringify({
        markerId: Number(marker.id),
        fromMarkerId: from?.markerId != null ? Number(from.markerId) : null,
        fromX: from?.x != null ? Number(from.x) : null,
        fromY: from?.y != null ? Number(from.y) : null,
        index,
        total,
        faces: Array.isArray(faces) ? faces : [],
        mode,
        saisieId: saisieId != null ? Number(saisieId) : null,
        preview,
      }),
    ],
  );
  const evt = await insertGameEvent(tx, {
    gameId,
    teamId,
    actorType,
    actorId,
    eventType: 'arrivee_suspendue',
    payload: {
      markerId: Number(marker.id),
      markerLabel: marker.label || null,
      index,
      total,
      question: preview.question,
      effectSummary: preview.effectSummary || null,
      relanceSpellCode: relance?.spellCode || null,
      roundNumber: Number(roundNumber) || 0,
    },
  });
  return {
    summary: { ...preview, enSuspens: true },
    events: [evt],
  };
}

/**
 * Applique les arrivées en suspens (d'une équipe si `teamId`, sinon de toute la partie). Une
 * arrivée dont la mascotte a quitté la case entre-temps devient `caduque` sans rien appliquer.
 * @returns {Promise<{ events: Array, arrivals: Array }>}
 */
async function confirmerArriveesTx(
  tx,
  { gameId, settings, teamId = null, actorType = 'system', actorId = null, motif = 'auto' },
) {
  const pending = await listEnSuspens(tx, gameId, { teamId, forUpdate: true });
  if (!pending.length) return { events: [], arrivals: [] };
  const tour = require('./glTour');
  const game = await tour.loadGameRow(tx, gameId);
  const resolved = resolveTenirSettings(settings, game);
  const markers = await tour.loadPathMarkers(tx, game.chapter_id);
  const events = [];
  const arrivals = [];
  for (const entry of pending) {
    const team = await tx.queryOne(
      'SELECT id, position_marker_id FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1 FOR UPDATE',
      [entry.teamId, gameId],
    );
    const marker = markers.find((m) => Number(m.id) === Number(entry.markerId));
    if (!team || !marker || Number(team.position_marker_id) !== Number(entry.markerId)) {
      await marquerIssueTx(tx, entry.id, 'caduque');
      continue;
    }
    await marquerIssueTx(tx, entry.id, 'appliquee');
    events.push(
      await insertGameEvent(tx, {
        gameId,
        teamId: entry.teamId,
        actorType,
        actorId,
        eventType: 'arrivee_gardee',
        payload: {
          markerId: entry.markerId,
          markerLabel: marker.label || null,
          index: entry.index,
          motif,
          roundNumber: entry.roundNumber,
        },
      }),
    );
    const arrival = await tour.applyArrivalTx(tx, {
      gameId,
      teamId: entry.teamId,
      marker,
      game,
      settings,
      resolved,
      actorType,
      actorId,
      markers,
    });
    events.push(...arrival.events);
    arrivals.push({ teamId: entry.teamId, summary: arrival.summary });
  }
  return { events, arrivals };
}

/**
 * Relance : annule le jet en suspens de l'équipe — la mascotte revient sur sa case de départ,
 * la case d'arrivée n'est jamais appliquée. 409 `RELANCE_SANS_JET` sans arrivée en suspens.
 * @returns {Promise<{ events: Array, annule: object }>}
 */
async function annulerArriveeTx(tx, { gameId, teamId, actor, draftId = null, spellCode = null }) {
  const [entry] = await listEnSuspens(tx, gameId, { teamId, forUpdate: true });
  if (!entry) throw fail('RELANCE_SANS_JET', 409);
  await tx.queryOne('SELECT id FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1 FOR UPDATE', [
    teamId,
    gameId,
  ]);
  if (entry.fromMarkerId != null) {
    await applyTeamMoveTx(tx, { gameId, teamId, markerId: entry.fromMarkerId });
  } else {
    await applyTeamMoveTx(tx, { gameId, teamId, xp: entry.fromX, yp: entry.fromY });
  }
  await marquerIssueTx(tx, entry.id, 'annulee');
  const from =
    entry.fromMarkerId != null
      ? await tx.queryOne(
          'SELECT id, label, x_pct, y_pct FROM gl_chapter_markers WHERE id = ? LIMIT 1',
          [entry.fromMarkerId],
        )
      : null;
  const events = [];
  events.push(
    await insertGameEvent(tx, {
      gameId,
      teamId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      eventType: 'jet_annule',
      payload: {
        total: entry.total,
        annuleMarkerId: entry.markerId,
        annuleIndex: entry.index,
        markerLabel: entry.preview?.label || null,
        fromMarkerId: entry.fromMarkerId,
        spellCode,
        draftId: draftId != null ? Number(draftId) : null,
        roundNumber: entry.roundNumber,
      },
    }),
  );
  // Retour de la mascotte : la case de départ ne se re-présente pas (déjà jouée).
  events.push(
    await insertGameEvent(tx, {
      gameId,
      teamId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      eventType: 'move',
      payload: {
        markerId: entry.fromMarkerId,
        markerLabel: from?.label || null,
        xp: from ? Number(from.x_pct) : entry.fromX,
        yp: from ? Number(from.y_pct) : entry.fromY,
        relance: true,
        skipDestinationEffects: true,
      },
    }),
  );
  return { events, annule: entry };
}

module.exports = {
  KIND,
  listEnSuspens,
  relanceDisponibleTx,
  suspendreArriveeTx,
  confirmerArriveesTx,
  annulerArriveeTx,
};
