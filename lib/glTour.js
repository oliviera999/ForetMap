'use strict';

/**
 * « Tenir à deux » v2 — moteur du tour (spec § 3-4, § 11).
 *
 * Un tour est un objet serveur à phases `ouverture → jeu → souffle → clos`, ouvert et fermé par
 * le prof. L'ordre des équipes est figé à l'ouverture : inverse du plateau (la plus en retard
 * d'abord, égalité → identifiant croissant). Verrou PAR ÉQUIPE pour les gestes (jamais par
 * partie) ; seules `ouvrirTourTx`, `changerPhaseTx` et le souffle verrouillent `gl_game_rounds`.
 */

const crypto = require('node:crypto');
const { insertGameEvent } = require('./glGameEvents');
const { applyTeamMoveTx, claimTeamRoundAction } = require('./gl/gamesRuntime');
const {
  sortMarkersByPath,
  teamPathIndex,
  resolveBoardPathStartIndex,
  targetMarkerAfterDice,
  targetMarkerAfterPathSteps,
} = require('./shared/glBoardPathCore');
const { MARKER_SELECT, formatMarkerRow, isQuestionMarker } = require('./glMarkerRow');
const {
  applyMarkerVitalityEffects,
  buildMarkerEffectEventPayload,
} = require('./glMarkerVitalityEffects');
const { applyMarkerEffectAutoMoveTx } = require('./glMarkerEffectAutoMove');
const { rollServerDice, DICE_SIDES } = require('./glDiceRoll');
const { loadBiomesForChapterIds } = require('./glChapterBiomes');
const { httpError } = require('./shared/httpError');
const {
  resolveTenirSettings,
  resolveSurface,
  resolveDesMode,
  resolveVoileBonus,
  loadOrCreateTenirState,
  parseJsonColumn,
  resolveTenirPermissions,
} = require('./glTenir');

const PHASES = ['ouverture', 'jeu', 'souffle', 'clos'];

const fail = (message, status) => httpError(status, message);

// ---------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------

async function loadRoundRow(db, gameId, roundNumber) {
  return db.queryOne(
    'SELECT * FROM gl_game_rounds WHERE game_id = ? AND round_number = ? LIMIT 1',
    [gameId, roundNumber],
  );
}

async function loadAbsences(db, gameId, roundNumber) {
  const rows = await db.queryAll(
    'SELECT player_id FROM gl_game_round_absences WHERE game_id = ? AND round_number = ?',
    [gameId, roundNumber],
  );
  return rows.map((r) => Number(r.player_id));
}

async function listEffets(db, gameId, roundNumber, kind = null) {
  const rows = kind
    ? await db.queryAll(
        'SELECT * FROM gl_game_tenir_effets WHERE game_id = ? AND round_number = ? AND kind = ? ORDER BY id ASC',
        [gameId, roundNumber, kind],
      )
    : await db.queryAll(
        'SELECT * FROM gl_game_tenir_effets WHERE game_id = ? AND round_number = ? ORDER BY id ASC',
        [gameId, roundNumber],
      );
  return rows.map((r) => ({
    id: Number(r.id),
    kind: String(r.kind),
    teamId: r.team_id != null ? Number(r.team_id) : null,
    sourceTeamId: r.source_team_id != null ? Number(r.source_team_id) : null,
    payload: parseJsonColumn(r.payload_json, {}),
  }));
}

/** Fenêtre de fouille (surface hybride) : dernier effet `fenetre_fouille` pour l'équipe ou pour tous. */
function isFouilleFenetreOuverte(effets, teamId) {
  let open = false;
  for (const e of effets) {
    if (e.kind !== 'fenetre_fouille') continue;
    if (e.teamId == null || Number(e.teamId) === Number(teamId)) open = e.payload?.ouverte === true;
  }
  return open;
}

async function listDesEnAttente(db, gameId, roundNumber) {
  const rows = await db.queryAll(
    `SELECT id, team_id, beneficiaire_team_id, mode, faces_json, total, motif, statut, saisie_par_type, created_at
       FROM gl_game_des_saisies WHERE game_id = ? AND round_number = ? AND statut = 'en_attente' ORDER BY id ASC`,
    [gameId, roundNumber],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    teamId: Number(r.team_id),
    mode: String(r.mode),
    faces: parseJsonColumn(r.faces_json, []),
    total: Number(r.total) || 0,
    createdAt: r.created_at,
  }));
}

/** Vue du tour courant servie dans `tenir.round` (jamais la correction d'Olu avant correction). */
async function loadRoundView(db, gameId, roundNumber) {
  const row = await loadRoundRow(db, gameId, roundNumber);
  if (!row)
    return { number: roundNumber, phase: null, ordre: [], equipeActiveId: null, ventTeamId: null };
  const effets = await listEffets(db, gameId, roundNumber);
  const oluErreur = parseJsonColumn(row.olu_erreur_json, null);
  return {
    number: Number(row.round_number),
    phase: row.phase || 'ouverture',
    ordre: parseJsonColumn(row.ordre_json, []),
    equipeActiveId: row.equipe_active_id != null ? Number(row.equipe_active_id) : null,
    ventTeamId: row.vent_team_id != null ? Number(row.vent_team_id) : null,
    souffle: parseJsonColumn(row.souffle_json, null),
    passeur: parseJsonColumn(row.passeur_json, null),
    oluErreur: oluErreur
      ? {
          id: oluErreur.id,
          texte: oluErreur.texte,
          ...(row.olu_corrige_team_id != null || row.phase === 'clos'
            ? { correction: oluErreur.correction }
            : {}),
        }
      : null,
    oluCorrigeTeamId: row.olu_corrige_team_id != null ? Number(row.olu_corrige_team_id) : null,
    operateurs: parseJsonColumn(row.operateurs_json, {}),
    absences: await loadAbsences(db, gameId, roundNumber),
    effets: effets.map((e) => ({
      kind: e.kind,
      teamId: e.teamId,
      sourceTeamId: e.sourceTeamId,
      payload: e.payload,
    })),
    fenetresFouille: Object.fromEntries(
      [
        ...new Set(
          effets.filter((e) => e.kind === 'fenetre_fouille').map((e) => String(e.teamId ?? 'tous')),
        ),
      ].map((k) => [k, isFouilleFenetreOuverte(effets, k === 'tous' ? null : Number(k))]),
    ),
    desEnAttente: await listDesEnAttente(db, gameId, roundNumber),
    startedAt: row.started_at || null,
    endedAt: row.ended_at || null,
    phaseChangedAt: row.phase_changed_at || null,
  };
}

// ---------------------------------------------------------------------
// Helpers de plateau
// ---------------------------------------------------------------------

async function loadPathMarkers(db, chapterId) {
  const rows = await db.queryAll(
    `SELECT ${MARKER_SELECT} FROM gl_chapter_markers WHERE chapter_id = ? ORDER BY order_index ASC, id ASC`,
    [chapterId],
  );
  return sortMarkersByPath(rows.map(formatMarkerRow));
}

async function loadTeams(db, gameId) {
  return db.queryAll(
    'SELECT id, game_id, name, type, mascot_id, position_marker_id, last_dice_round_number, last_move_round_number FROM gl_teams WHERE game_id = ? ORDER BY id ASC',
    [gameId],
  );
}

function campIndex(markers) {
  return markers.length ? markers.length - 1 : 0;
}

function isAtCamp(team, markers) {
  const idx = teamPathIndex(team, markers);
  return idx != null && idx >= campIndex(markers);
}

/** Ordre inverse du plateau : index croissant (retard d'abord ; sans position = 0), égalité → id. */
function ordreInverseDuPlateau(teams, markers) {
  return [...teams]
    .map((t) => ({ id: Number(t.id), idx: teamPathIndex(t, markers) ?? 0 }))
    .sort((a, b) => a.idx - b.idx || a.id - b.id)
    .map((t) => t.id);
}

/** L'équipe la plus en retard (hors camp), ou `null`. */
function equipeLaPlusEnRetard(teams, markers, excludeTeamId = null) {
  const candidates = teams
    .filter((t) => Number(t.id) !== Number(excludeTeamId) && !isAtCamp(t, markers))
    .map((t) => ({ team: t, idx: teamPathIndex(t, markers) ?? 0 }))
    .sort((a, b) => a.idx - b.idx || Number(a.team.id) - Number(b.team.id));
  return candidates.length ? candidates[0].team : null;
}

async function loadGameRow(db, gameId) {
  return db.queryOne(
    `SELECT g.id, g.class_id, g.chapter_id, g.status, g.current_round_number, g.tenir_profil,
            g.tenir_overrides_json, g.tenir_surface, g.board_movement_mode, g.board_path_start_index,
            ch.plateau_number
       FROM gl_games g LEFT JOIN gl_chapters ch ON ch.id = g.chapter_id WHERE g.id = ? LIMIT 1`,
    [gameId],
  );
}

// ---------------------------------------------------------------------
// Ouverture / phases
// ---------------------------------------------------------------------

async function tirerErreurDuJour(db) {
  const rows = await db.queryAll(
    "SELECT id, texte, correction FROM gl_tenir_olu_lignes WHERE moment = 'erreur' AND actif = 1",
  );
  if (!rows.length) return null;
  const pick = rows[crypto.randomInt(0, rows.length)];
  return {
    id: String(pick.id),
    texte: String(pick.texte),
    correction: pick.correction ? String(pick.correction) : null,
  };
}

/**
 * Ouvre un nouveau tour : ordre inverse du plateau, vent de la caravane (dès le tour 2, si une
 * seule équipe est dernière), cartes → cases du bilan précédent, erreur du jour d'Olu.
 */
async function ouvrirTourTx(tx, { gameId, actorId, settings }) {
  const game = await loadGameRow(tx, gameId);
  if (!game) throw fail('GAME_NOT_FOUND', 404);
  if (String(game.status) !== 'live') throw fail('GAME_NOT_LIVE', 409);
  const resolved = resolveTenirSettings(settings, game);
  const previous = Number(game.current_round_number) || 0;
  // Verrou de la ligne de partie pour sérialiser deux ouvertures concurrentes.
  await tx.queryOne('SELECT id FROM gl_games WHERE id = ? LIMIT 1 FOR UPDATE', [gameId]);
  if (previous > 0) {
    const prevRow = await loadRoundRow(tx, gameId, previous);
    if (prevRow && prevRow.phase !== 'clos') throw fail('TOUR_PRECEDENT_OUVERT', 409);
  }
  const next = previous + 1;
  const markers = await loadPathMarkers(tx, game.chapter_id);
  let teams = await loadTeams(tx, gameId);
  if (!teams.length) throw fail('NO_TEAMS', 400);
  const events = [];

  // Cartes Team Spirit → cases (réglage), d'après le bilan du tour précédent.
  if (resolved.cartes_vers_cases && previous > 0 && markers.length) {
    const bilans = await tx.queryAll(
      'SELECT team_id, cartes_gardees FROM gl_game_team_spirit WHERE game_id = ? AND round_number = ?',
      [gameId, previous],
    );
    for (const b of bilans) {
      const cartes = Number(b.cartes_gardees) || 0;
      const steps = cartes >= 6 ? 2 : cartes >= 4 ? 1 : 0;
      const team = teams.find((t) => Number(t.id) === Number(b.team_id));
      if (!steps || !team || isAtCamp(team, markers)) continue;
      const target = targetMarkerAfterPathSteps(
        markers,
        team,
        steps,
        resolveBoardPathStartIndex(game),
      );
      if (!target?.marker) continue;
      await applyTeamMoveTx(tx, { gameId, teamId: team.id, markerId: target.marker.id });
      events.push(
        await insertGameEvent(tx, {
          gameId,
          teamId: team.id,
          actorType: 'system',
          eventType: 'cartes_vers_cases',
          payload: { roundNumber: previous, cartes, cases: steps, markerId: target.marker.id },
        }),
      );
    }
    teams = await loadTeams(tx, gameId);
  }

  // L'ordre est figé AVANT le vent : la dernière joue en premier de toute façon (spec § 4).
  const ordre = ordreInverseDuPlateau(teams, markers);

  // Vent de la caravane : dès le tour 2, si une seule équipe est dernière.
  let ventTeamId = null;
  if (resolved.vent && next >= 2 && markers.length) {
    const ranked = teams
      .filter((t) => !isAtCamp(t, markers))
      .map((t) => ({ team: t, idx: teamPathIndex(t, markers) ?? 0 }))
      .sort((a, b) => a.idx - b.idx);
    if (ranked.length >= 2 && ranked[0].idx < ranked[1].idx) {
      const last = ranked[0].team;
      const cases = Number(resolved.vent_cases) || 3;
      const target = targetMarkerAfterPathSteps(
        markers,
        last,
        cases,
        resolveBoardPathStartIndex(game),
      );
      if (target?.marker) {
        await applyTeamMoveTx(tx, { gameId, teamId: last.id, markerId: target.marker.id });
        ventTeamId = Number(last.id);
        events.push(
          await insertGameEvent(tx, {
            gameId,
            teamId: last.id,
            actorType: 'system',
            eventType: 'vent_caravane',
            payload: { roundNumber: next, cases, markerId: target.marker.id },
          }),
        );
        teams = await loadTeams(tx, gameId);
      }
    }
  }

  const surface = resolveSurface(game, settings);
  const equipeActiveId = surface === 'tableau' ? ordre[0] || null : null;
  const oluErreur = resolved.olu_erreur_du_jour ? await tirerErreurDuJour(tx) : null;

  await tx.execute(
    'UPDATE gl_games SET current_round_number = ?, current_round_started_at = NOW(), current_team_id = ?, updated_at = NOW() WHERE id = ?',
    [next, equipeActiveId, gameId],
  );
  await tx.execute(
    `INSERT INTO gl_game_rounds (game_id, round_number, started_by, started_at, phase, ordre_json, equipe_active_id, vent_team_id, olu_erreur_json, phase_changed_at)
     VALUES (?, ?, ?, NOW(), 'ouverture', ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE started_by = VALUES(started_by), started_at = NOW(), ended_at = NULL, phase = 'ouverture',
       ordre_json = VALUES(ordre_json), equipe_active_id = VALUES(equipe_active_id), vent_team_id = VALUES(vent_team_id),
       olu_erreur_json = VALUES(olu_erreur_json), phase_changed_at = NOW()`,
    [
      gameId,
      next,
      String(actorId),
      JSON.stringify(ordre),
      equipeActiveId,
      ventTeamId,
      oluErreur ? JSON.stringify(oluErreur) : null,
    ],
  );
  await loadOrCreateTenirState(tx, gameId);
  const opened = await insertGameEvent(tx, {
    gameId,
    actorType: 'mj',
    actorId: String(actorId),
    eventType: 'tour_ouvert',
    payload: { roundNumber: next, ordre, equipeActiveId, ventTeamId, surface },
  });
  // Compat : `round_start` reste lu par le replay et les écrans classiques.
  await insertGameEvent(tx, {
    gameId,
    actorType: 'mj',
    actorId: String(actorId),
    eventType: 'round_start',
    payload: { roundNumber: next },
  });
  if (oluErreur) {
    events.push(
      await insertGameEvent(tx, {
        gameId,
        actorType: 'system',
        eventType: 'olu_erreur',
        payload: { roundNumber: next, id: oluErreur.id, texte: oluErreur.texte },
      }),
    );
  }
  return {
    roundNumber: next,
    ordre,
    equipeActiveId,
    ventTeamId,
    surface,
    events: [opened, ...events],
  };
}

/** Page de route du Passeur : `ordre` = tour modulo la longueur, sans reprendre une page déjà lue. */
async function pageDeRouteForRound(db, plateau, roundNumber, dejaLues = []) {
  const pages = await db.queryAll(
    'SELECT plateau, ordre, feuillet_code, titre, biome_slug, avertissement FROM gl_tenir_passeur_pages WHERE plateau = ? AND actif = 1 ORDER BY ordre ASC',
    [plateau],
  );
  if (!pages.length) return null;
  const lues = new Set((dejaLues || []).map(String));
  const start = (Math.max(1, roundNumber) - 1) % pages.length;
  for (let k = 0; k < pages.length; k += 1) {
    const page = pages[(start + k) % pages.length];
    if (lues.has(String(page.feuillet_code))) continue;
    const feuillet = await db.queryOne(
      'SELECT titre, texte, texte_accessible FROM gl_lore_feuillets WHERE feuillet_code = ? LIMIT 1',
      [page.feuillet_code],
    );
    return {
      feuilletCode: String(page.feuillet_code),
      // Une page `avertissement` nomme l'oiseau dans son titre : affichée sans titre.
      titre: page.avertissement ? null : page.titre || feuillet?.titre || null,
      texte: feuillet?.texte_accessible || feuillet?.texte || '',
      biomeSlug: page.biome_slug || null,
      ordre: Number(page.ordre),
    };
  }
  return null;
}

async function pagesDeRouteDejaLues(db, gameId) {
  const rows = await db.queryAll(
    'SELECT passeur_json FROM gl_game_rounds WHERE game_id = ? AND passeur_json IS NOT NULL',
    [gameId],
  );
  return rows.map((r) => parseJsonColumn(r.passeur_json, {})?.feuilletCode).filter(Boolean);
}

/**
 * Passe à la phase suivante (dans l'ordre, prof seul). `souffle` : dé gris (1d6 serveur ou
 * face saisie + bonus du plateau) ou « le voile dort », mot du Passeur, chapardeur, avance du
 * voile (étape 3, `lib/glVoile.js` si présent). `clos` : ferme le tour (correction d'Olu si
 * personne n'a corrigé).
 */
async function changerPhaseTx(
  tx,
  { gameId, phase, actorId, settings, faces = null, dort = false },
) {
  if (!PHASES.includes(phase) || phase === 'ouverture') throw fail('PHASE_INVALIDE', 400);
  const game = await loadGameRow(tx, gameId);
  if (!game) throw fail('GAME_NOT_FOUND', 404);
  const roundNumber = Number(game.current_round_number) || 0;
  if (!roundNumber) throw fail('AUCUN_TOUR', 409);
  const row = await tx.queryOne(
    'SELECT * FROM gl_game_rounds WHERE game_id = ? AND round_number = ? LIMIT 1 FOR UPDATE',
    [gameId, roundNumber],
  );
  if (!row) throw fail('AUCUN_TOUR', 409);
  const current = String(row.phase || 'ouverture');
  if (PHASES.indexOf(phase) !== PHASES.indexOf(current) + 1) throw fail('PHASE_ORDRE', 409);
  const resolved = resolveTenirSettings(settings, game);
  const events = [];
  const updates = { phase };
  let souffle = null;
  let passeur = null;

  if (phase === 'souffle') {
    const plateau = Number(game.plateau_number) || 1;
    if (resolved.voile && !dort) {
      const bonus = resolveVoileBonus(resolved, plateau);
      let face;
      if (Array.isArray(faces) && faces.length) {
        face = Number(faces[0]);
        if (!Number.isInteger(face) || face < 1 || face > DICE_SIDES)
          throw fail('FACE_INVALIDE', 400);
      } else {
        face = rollServerDice(1).total;
      }
      souffle = { faces: [face], bonus, total: face + bonus, dort: false };
    } else {
      souffle = { faces: [], bonus: 0, total: 0, dort: true };
    }
    updates.souffle_json = JSON.stringify(souffle);
    const dejaLues = await pagesDeRouteDejaLues(tx, gameId);
    passeur = await pageDeRouteForRound(tx, plateau, roundNumber, dejaLues);
    updates.passeur_json = passeur ? JSON.stringify(passeur) : null;
    if (souffle.dort) {
      events.push(
        await insertGameEvent(tx, {
          gameId,
          actorType: 'mj',
          actorId: String(actorId),
          eventType: 'voile_dort',
          payload: { roundNumber },
        }),
      );
    } else {
      try {
        const { advanceVoileTx } = require('./glVoile');
        const voileEvents = await advanceVoileTx(tx, {
          gameId,
          roundNumber,
          total: souffle.total,
          bonus: souffle.bonus,
          settings,
          resolved,
          game,
          actorId,
        });
        events.push(...(voileEvents || []));
      } catch (err) {
        if (err?.code !== 'MODULE_NOT_FOUND') throw err;
        events.push(
          await insertGameEvent(tx, {
            gameId,
            actorType: 'mj',
            actorId: String(actorId),
            eventType: 'voile_avance',
            payload: { roundNumber, ...souffle },
          }),
        );
      }
    }
    try {
      const { chapardeurTx } = require('./glChapardeur');
      const chap = await chapardeurTx(tx, { gameId, roundNumber, resolved, actorId });
      if (chap?.event) {
        events.push(chap.event);
        updates.chapardeur_at = new Date();
      }
    } catch (err) {
      if (err?.code !== 'MODULE_NOT_FOUND') throw err;
    }
  }

  if (phase === 'clos') {
    updates.ended_at = new Date();
    const olu = parseJsonColumn(row.olu_erreur_json, null);
    if (olu && row.olu_corrige_team_id == null && olu.correction) {
      events.push(
        await insertGameEvent(tx, {
          gameId,
          actorType: 'system',
          eventType: 'olu_corrige',
          payload: { roundNumber, id: olu.id, correction: olu.correction, teamId: null },
        }),
      );
    }
    await tx.execute(
      'UPDATE gl_games SET current_team_id = NULL, updated_at = NOW() WHERE id = ?',
      [gameId],
    );
  }

  const sets = Object.keys(updates).map((k) => `${k} = ?`);
  await tx.execute(
    `UPDATE gl_game_rounds SET ${sets.join(', ')}, phase_changed_at = NOW() WHERE game_id = ? AND round_number = ?`,
    [...Object.values(updates), gameId, roundNumber],
  );
  const phaseEvent = await insertGameEvent(tx, {
    gameId,
    actorType: 'mj',
    actorId: String(actorId),
    eventType: phase === 'clos' ? 'tour_clos' : 'tour_phase',
    payload: {
      roundNumber,
      phase,
      from: current,
      ...(souffle ? { souffle } : {}),
      ...(passeur ? { passeur: { feuilletCode: passeur.feuilletCode, titre: passeur.titre } } : {}),
    },
  });
  return { roundNumber, phase, souffle, passeur, events: [phaseEvent, ...events] };
}

/** Surface tableau : équipe suivante dans l'ordre figé (boucle). */
async function equipeSuivanteTx(tx, { gameId, actorId }) {
  const game = await loadGameRow(tx, gameId);
  const roundNumber = Number(game?.current_round_number) || 0;
  const row = await tx.queryOne(
    'SELECT * FROM gl_game_rounds WHERE game_id = ? AND round_number = ? LIMIT 1 FOR UPDATE',
    [gameId, roundNumber],
  );
  if (!row) throw fail('AUCUN_TOUR', 409);
  const ordre = parseJsonColumn(row.ordre_json, []);
  if (!ordre.length) throw fail('NO_TEAMS', 400);
  const idx = ordre.findIndex((id) => Number(id) === Number(row.equipe_active_id));
  const next = Number(ordre[(idx + 1) % ordre.length]);
  await tx.execute(
    'UPDATE gl_game_rounds SET equipe_active_id = ? WHERE game_id = ? AND round_number = ?',
    [next, gameId, roundNumber],
  );
  await tx.execute('UPDATE gl_games SET current_team_id = ?, updated_at = NOW() WHERE id = ?', [
    next,
    gameId,
  ]);
  const evt = await insertGameEvent(tx, {
    gameId,
    teamId: next,
    actorType: 'mj',
    actorId: String(actorId),
    eventType: 'turn_change',
    payload: { teamId: next, roundNumber },
  });
  return { equipeActiveId: next, event: evt };
}

async function setAbsencesTx(tx, { gameId, roundNumber, playerIds, actorId }) {
  const ids = [
    ...new Set((playerIds || []).map(Number).filter((n) => Number.isFinite(n) && n > 0)),
  ];
  await tx.execute('DELETE FROM gl_game_round_absences WHERE game_id = ? AND round_number = ?', [
    gameId,
    roundNumber,
  ]);
  for (const pid of ids) {
    await tx.execute(
      'INSERT IGNORE INTO gl_game_round_absences (game_id, round_number, player_id) VALUES (?, ?, ?)',
      [gameId, roundNumber, pid],
    );
  }
  const evt = await insertGameEvent(tx, {
    gameId,
    actorType: 'mj',
    actorId: String(actorId),
    eventType: 'absences',
    // Identités des absents : prof seul (payload privé) ; le nombre reste public.
    payload: {
      roundNumber,
      playerIds: ids,
      count: ids.length,
      private: true,
      publicKeys: ['roundNumber', 'count'],
    },
  });
  return { playerIds: ids, event: evt };
}

async function setOperateurTx(tx, { gameId, roundNumber, teamId, playerId, role }) {
  const row = await tx.queryOne(
    'SELECT operateurs_json FROM gl_game_rounds WHERE game_id = ? AND round_number = ? LIMIT 1 FOR UPDATE',
    [gameId, roundNumber],
  );
  if (!row) throw fail('AUCUN_TOUR', 409);
  const current = parseJsonColumn(row.operateurs_json, {}) || {};
  if (playerId == null) delete current[String(teamId)];
  else current[String(teamId)] = { playerId: Number(playerId), role: String(role || 'operateur') };
  await tx.execute(
    'UPDATE gl_game_rounds SET operateurs_json = ? WHERE game_id = ? AND round_number = ?',
    [JSON.stringify(current), gameId, roundNumber],
  );
  return current;
}

async function setFouilleFenetreTx(tx, { gameId, roundNumber, teamId, ouverte, actorId }) {
  await tx.execute(
    'INSERT INTO gl_game_tenir_effets (game_id, round_number, kind, team_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
    [
      gameId,
      roundNumber,
      'fenetre_fouille',
      teamId ?? null,
      JSON.stringify({ ouverte: ouverte === true }),
    ],
  );
  return insertGameEvent(tx, {
    gameId,
    teamId: teamId ?? null,
    actorType: 'mj',
    actorId: String(actorId),
    eventType: 'fouille_fenetre',
    payload: { roundNumber, teamId: teamId ?? null, ouverte: ouverte === true },
  });
}

// ---------------------------------------------------------------------
// Permissions d'action
// ---------------------------------------------------------------------

/**
 * Rejoue les permissions par surface côté serveur pour un geste d'équipe.
 * @throws 409 `TENIR_PHASE` hors phase `jeu`, 403 `TENIR_PERMISSION` sinon.
 */
function assertActionOuverte({
  round,
  surface,
  teamId,
  actorKind,
  geste,
  fouilleFenetreOuverte = false,
  enRetrait = false,
  resolved = null,
}) {
  if (actorKind === 'mj') return;
  if (!round || round.phase !== 'jeu') throw fail('TENIR_PHASE', 409);
  if (
    surface === 'tableau' &&
    round.equipeActiveId != null &&
    Number(round.equipeActiveId) !== Number(teamId)
  ) {
    throw fail('TENIR_EQUIPE_INACTIVE', 403);
  }
  const perms = resolveTenirPermissions({
    surface,
    phase: round.phase,
    actorKind,
    isMember: true,
    isActiveTeam: round.equipeActiveId != null && Number(round.equipeActiveId) === Number(teamId),
    fouilleFenetreOuverte,
    enRetrait,
    settings: resolved || {},
  });
  if (!perms[geste]) throw fail('TENIR_PERMISSION', 403);
}

// ---------------------------------------------------------------------
// Arrivée sur une case (effets, péripétie, camp)
// ---------------------------------------------------------------------

async function tirerPeripetie(tx, { gameId, chapterId, plateau }) {
  const biomes = await loadBiomesForChapterIds(tx, [Number(chapterId)]);
  const slugs = (biomes.get(Number(chapterId)) || []).map((b) => b.slug);
  const used = await tx.queryAll(
    "SELECT payload_json FROM gl_game_events WHERE game_id = ? AND event_type = 'peripetie'",
    [gameId],
  );
  const usedIds = new Set(used.map((r) => parseJsonColumn(r.payload_json, {})?.id).filter(Boolean));
  const rows = await tx.queryAll(
    `SELECT id, biome_slug, texte, passable FROM gl_tenir_peripeties
      WHERE actif = 1 AND (plateau = ? ${slugs.length ? `OR biome_slug IN (${slugs.map(() => '?').join(', ')})` : ''})`,
    [plateau, ...slugs],
  );
  if (!rows.length) return null;
  let pool = rows.filter((r) => !usedIds.has(String(r.id)));
  if (!pool.length) pool = rows;
  const pick = pool[crypto.randomInt(0, pool.length)];
  return {
    id: String(pick.id),
    texte: String(pick.texte),
    biomeSlug: pick.biome_slug,
    passable: Number(pick.passable) === 1,
  };
}

/**
 * Applique l'arrivée d'une équipe sur `marker` : effets de vitalité (Trame = +1 ressource du
 * peuple, Souffle = plateau), déplacement automatique, péripétie (case événement sans texte),
 * première arrivée au camp (honneur Éclaireurs réservé).
 */
async function applyArrivalTx(
  tx,
  { gameId, teamId, marker, game, settings, resolved, actorType, actorId, markers },
) {
  const events = [];
  const team = await tx.queryOne(
    'SELECT id, type, name, position_marker_id FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1',
    [teamId, gameId],
  );
  const summary = {
    markerId: Number(marker.id),
    label: marker.label,
    eventType: marker.event_type,
    question: isQuestionMarker(marker),
  };
  if (!isQuestionMarker(marker)) {
    const { resolveTenirMarkerContext, consumeSentier } = require('./glTourArrivalHelpers');
    const ctx = await resolveTenirMarkerContext(tx, gameId, teamId);
    const vitality = await applyMarkerVitalityEffects(tx, {
      gameId,
      teamId,
      marker,
      teamType: team.type,
      settings,
      skipIfAlreadyApplied: true,
      tenir: true,
      sentierActif: ctx.sentierActif,
    });
    if (vitality?.sentier) await consumeSentier(tx, gameId, teamId);
    if (vitality?.applied || vitality?.resolvedEffect) {
      events.push(
        await insertGameEvent(tx, {
          gameId,
          teamId,
          actorType,
          actorId,
          eventType: 'marker_effect',
          payload: {
            ...buildMarkerEffectEventPayload({
              marker,
              resolved: vitality.resolvedEffect,
              healthDelta: vitality.healthDelta,
              powerDelta: vitality.powerDelta,
              moveDelta: vitality.moveDelta,
              passTurn: vitality.passTurn,
              reason: marker.label,
              vitalityTarget: vitality.vitalityTarget,
              vitalityPlayerIds: vitality.vitalityPlayerIds,
              autoMoveApplied:
                Boolean(vitality.moveDelta) && settings?.markerEffectAutoMoveEnabled === true,
            }),
            tonalite: vitality.tonalite || null,
            sentier: vitality.sentier === true,
          },
        }),
      );
      summary.vitality = {
        applied: vitality.applied === true,
        healthDelta: vitality.healthDelta,
        powerDelta: vitality.powerDelta,
        moveDelta: vitality.moveDelta,
        tonalite: vitality.tonalite || null,
        sentier: vitality.sentier === true,
      };
    }
    if (vitality?.moveDelta && !vitality.sentier) {
      const autoMove = await applyMarkerEffectAutoMoveTx(tx, {
        gameId,
        teamId,
        team,
        game,
        chapterMarkers: markers,
        moveDelta: vitality.moveDelta,
        settings,
        actorType,
        actorId,
        originMarkerId: marker.id,
        roundNumber: null,
      });
      if (autoMove?.moveEvent) events.push(autoMove.moveEvent);
      summary.autoMove = autoMove?.applied ? { markerId: autoMove.targetMarkerId ?? null } : null;
    }
    if (
      String(marker.event_type) === 'event' &&
      !String(marker.description || '').trim() &&
      resolved?.peripeties
    ) {
      const peripetie = await tirerPeripetie(tx, {
        gameId,
        chapterId: game.chapter_id,
        plateau: Number(game.plateau_number) || 1,
      });
      if (peripetie) {
        events.push(
          await insertGameEvent(tx, {
            gameId,
            teamId,
            actorType: 'system',
            eventType: 'peripetie',
            payload: { ...peripetie, markerId: Number(marker.id) },
          }),
        );
        summary.peripetie = peripetie;
      }
    }
  }
  const finalIdx = markers.length - 1;
  const markerIdx = markers.findIndex((m) => Number(m.id) === Number(marker.id));
  if (markers.length && markerIdx === finalIdx) {
    const state = await loadOrCreateTenirState(tx, gameId);
    if (state.premiereArriveeTeamId == null) {
      await tx.execute(
        'UPDATE gl_game_tenir_state SET premiere_arrivee_team_id = ?, updated_at = NOW() WHERE game_id = ? AND premiere_arrivee_team_id IS NULL',
        [teamId, gameId],
      );
      events.push(
        await insertGameEvent(tx, {
          gameId,
          teamId,
          actorType: 'system',
          eventType: 'arrivee_camp',
          payload: { premiere: true, markerId: Number(marker.id) },
        }),
      );
      summary.premiereArrivee = true;
    } else {
      events.push(
        await insertGameEvent(tx, {
          gameId,
          teamId,
          actorType: 'system',
          eventType: 'arrivee_camp',
          payload: { premiere: false, markerId: Number(marker.id) },
        }),
      );
    }
    summary.camp = true;
  }
  return { summary, events };
}

// ---------------------------------------------------------------------
// Lancer (serveur / physique / libre), bénéficiaire, saisies en attente
// ---------------------------------------------------------------------

/** Vrai si une Relance (sort) a réarmé le dé de l'équipe ce tour. */
async function consumeRelanceTx(tx, gameId, roundNumber, teamId) {
  const row = await tx.queryOne(
    `SELECT id FROM gl_game_tenir_effets WHERE game_id = ? AND round_number = ? AND team_id = ? AND kind = 'relance'
        AND JSON_EXTRACT(COALESCE(payload_json, '{}'), '$.consomme') IS NULL ORDER BY id DESC LIMIT 1`,
    [gameId, roundNumber, teamId],
  );
  if (!row) return false;
  await tx.execute(
    `UPDATE gl_game_tenir_effets SET payload_json = JSON_SET(COALESCE(payload_json, '{}'), '$.consomme', 1) WHERE id = ?`,
    [row.id],
  );
  return true;
}

/**
 * Cordée active pour `teamId` ce tour : enregistre son jet ; si le partenaire a déjà jeté, le
 * meilleur des deux s'applique (l'équipe en cours prend `best`, le partenaire rattrape).
 * @returns {Promise<null|{ partnerTeamId, best, partnerCatchUp }>}
 */
async function resolveCordeeTx(tx, { gameId, roundNumber, teamId, steps }) {
  const row = await tx.queryOne(
    `SELECT id, team_id, source_team_id, payload_json FROM gl_game_tenir_effets
      WHERE game_id = ? AND round_number = ? AND kind = 'cordee' AND (team_id = ? OR source_team_id = ?)
      ORDER BY id DESC LIMIT 1 FOR UPDATE`,
    [gameId, roundNumber, teamId, teamId],
  );
  if (!row) return null;
  const payload = parseJsonColumn(row.payload_json, {}) || {};
  const jets = payload.jets && typeof payload.jets === 'object' ? payload.jets : {};
  const partnerTeamId =
    Number(row.team_id) === Number(teamId) ? Number(row.source_team_id) : Number(row.team_id);
  const partnerSteps = Number(jets[String(partnerTeamId)]) || 0;
  const best = Math.max(steps, partnerSteps);
  jets[String(teamId)] = steps;
  await tx.execute('UPDATE gl_game_tenir_effets SET payload_json = ? WHERE id = ?', [
    JSON.stringify({ ...payload, jets }),
    row.id,
  ]);
  return {
    partnerTeamId,
    best,
    partnerCatchUp: partnerSteps > 0 && steps > partnerSteps ? steps - partnerSteps : 0,
  };
}

/**
 * Applique un jet (ou une avance libre) à son bénéficiaire : l'équipe elle-même, ou — si elle est
 * au camp — l'équipe la plus en retard. Déplacement + effets d'arrivée, événements
 * `dice_roll` (ou `avance_libre`) et `move`. Verrou PAR ÉQUIPE (`FOR UPDATE` sur gl_teams).
 */
async function appliquerJetTx(
  tx,
  {
    gameId,
    roundNumber,
    teamId,
    mode,
    faces,
    total,
    motif = null,
    saisieId = null,
    actorType,
    actorId,
    settings,
    skipClaim = false,
  },
) {
  const game = await loadGameRow(tx, gameId);
  if (!game) throw fail('GAME_NOT_FOUND', 404);
  const resolved = resolveTenirSettings(settings, game);
  const markers = await loadPathMarkers(tx, game.chapter_id);
  if (!markers.length) throw fail('NO_PATH', 409);
  await tx.queryOne('SELECT id FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1 FOR UPDATE', [
    teamId,
    gameId,
  ]);
  const teams = await loadTeams(tx, gameId);
  const team = teams.find((t) => Number(t.id) === Number(teamId));
  if (!team) throw fail('TEAM_NOT_FOUND', 404);

  let beneficiary = team;
  if (isAtCamp(team, markers)) {
    const late = equipeLaPlusEnRetard(teams, markers, teamId);
    if (!late) throw fail('TOUTES_AU_CAMP', 409);
    beneficiary = late;
    await tx.queryOne('SELECT id FROM gl_teams WHERE id = ? LIMIT 1 FOR UPDATE', [late.id]);
  }
  if (!skipClaim && mode !== 'libre') {
    const relance = await consumeRelanceTx(tx, gameId, roundNumber, teamId);
    const claimed = await claimTeamRoundAction(tx, {
      gameId,
      teamId,
      roundNumber,
      action: 'dice',
    });
    // Sans Relance, un second jet dans le tour est refusé ; avec, le dé réarmé est reconsommé
    // (l'équipe compte alors comme ayant jeté : fenêtres « avant / après le jet »).
    if (!claimed && !relance) throw fail('DICE_ALREADY_ROLLED', 409);
  }
  let steps = Math.max(1, Number(total) || 1);
  const events = [];
  // Cordée (pacte, spec § 10) : les deux équipes avancent du meilleur de leurs deux jets.
  let cordee = null;
  if (mode !== 'libre') {
    cordee = await resolveCordeeTx(tx, { gameId, roundNumber, teamId, steps });
    if (cordee && cordee.best > steps) steps = cordee.best;
  }
  const target = targetMarkerAfterDice(
    markers,
    beneficiary,
    steps,
    resolveBoardPathStartIndex(game),
  );
  if (!target?.marker) throw fail('NO_PATH', 409);
  const beneficiaryTeamId = Number(beneficiary.id);
  events.push(
    await insertGameEvent(tx, {
      gameId,
      teamId,
      actorType,
      actorId,
      eventType: mode === 'libre' ? 'avance_libre' : 'dice_roll',
      payload:
        mode === 'libre'
          ? {
              cases: steps,
              motif,
              beneficiaryTeamId,
              roundNumber,
              private: true,
              publicKeys: ['cases', 'beneficiaryTeamId', 'roundNumber'],
            }
          : {
              mode,
              faces,
              values: faces,
              total: steps,
              beneficiaryTeamId,
              saisieId,
              roundNumber,
              serverRoll: mode === 'serveur',
            },
    }),
  );
  await applyTeamMoveTx(tx, {
    gameId,
    teamId: beneficiaryTeamId,
    markerId: target.marker.id,
    roundNumber: mode === 'libre' ? null : roundNumber,
  });
  events.push(
    await insertGameEvent(tx, {
      gameId,
      teamId: beneficiaryTeamId,
      actorType,
      actorId,
      eventType: 'move',
      payload: {
        markerId: Number(target.marker.id),
        xp: Number(target.marker.x_pct),
        yp: Number(target.marker.y_pct),
        fromDice: true,
      },
    }),
  );
  const arrival = await applyArrivalTx(tx, {
    gameId,
    teamId: beneficiaryTeamId,
    marker: target.marker,
    game,
    settings,
    resolved,
    actorType,
    actorId,
    markers,
  });
  events.push(...arrival.events);
  // Cordée : le partenaire déjà passé rattrape la différence (sans jet supplémentaire).
  if (cordee && cordee.partnerCatchUp > 0) {
    const partner = teams.find((t) => Number(t.id) === Number(cordee.partnerTeamId));
    if (partner && !isAtCamp(partner, markers)) {
      const dest = targetMarkerAfterDice(
        markers,
        partner,
        cordee.partnerCatchUp,
        resolveBoardPathStartIndex(game),
      );
      if (dest?.marker) {
        await applyTeamMoveTx(tx, { gameId, teamId: partner.id, markerId: dest.marker.id });
        events.push(
          await insertGameEvent(tx, {
            gameId,
            teamId: Number(partner.id),
            actorType,
            actorId,
            eventType: 'move',
            payload: {
              markerId: Number(dest.marker.id),
              xp: Number(dest.marker.x_pct),
              yp: Number(dest.marker.y_pct),
              cordee: true,
            },
          }),
        );
        const partnerArrival = await applyArrivalTx(tx, {
          gameId,
          teamId: Number(partner.id),
          marker: dest.marker,
          game,
          settings,
          resolved,
          actorType,
          actorId,
          markers,
        });
        events.push(...partnerArrival.events);
      }
    }
  }
  if (saisieId) {
    await tx.execute(
      "UPDATE gl_game_des_saisies SET statut = 'appliquee', appliquee_at = NOW(), beneficiaire_team_id = ? WHERE id = ?",
      [beneficiaryTeamId, saisieId],
    );
  }
  return {
    beneficiaryTeamId,
    target: { markerId: Number(target.marker.id), index: target.index },
    total: steps,
    arrival: arrival.summary,
    events,
  };
}

/** Saisie physique en attente de validation du prof (surface tablette). */
async function creerSaisieTx(tx, { gameId, roundNumber, teamId, faces, actorId }) {
  const total = faces.reduce((s, f) => s + Number(f), 0);
  const insert = await tx.execute(
    `INSERT INTO gl_game_des_saisies (game_id, round_number, team_id, mode, faces_json, total, statut, saisie_par_type, saisie_par_id, created_at)
     VALUES (?, ?, ?, 'physique', ?, ?, 'en_attente', 'player', ?, NOW())`,
    [gameId, roundNumber, teamId, JSON.stringify(faces), total, String(actorId)],
  );
  const evt = await insertGameEvent(tx, {
    gameId,
    teamId,
    actorType: 'team',
    actorId: String(actorId),
    eventType: 'des_saisie_attente',
    payload: { saisieId: Number(insert.insertId), faces, total, roundNumber },
  });
  return { saisieId: Number(insert.insertId), total, event: evt };
}

async function validerSaisieTx(tx, { gameId, saisieId, actorId, settings, decision }) {
  const row = await tx.queryOne(
    'SELECT * FROM gl_game_des_saisies WHERE id = ? AND game_id = ? LIMIT 1 FOR UPDATE',
    [saisieId, gameId],
  );
  if (!row) throw fail('SAISIE_NOT_FOUND', 404);
  if (String(row.statut) !== 'en_attente') throw fail('SAISIE_NOT_PENDING', 409);
  if (decision === 'refuser') {
    await tx.execute(
      "UPDATE gl_game_des_saisies SET statut = 'refusee', validee_par_id = ? WHERE id = ?",
      [String(actorId), saisieId],
    );
    const evt = await insertGameEvent(tx, {
      gameId,
      teamId: Number(row.team_id),
      actorType: 'mj',
      actorId: String(actorId),
      eventType: 'des_saisie_refusee',
      payload: { saisieId },
    });
    return { refused: true, events: [evt] };
  }
  await tx.execute('UPDATE gl_game_des_saisies SET validee_par_id = ? WHERE id = ?', [
    String(actorId),
    saisieId,
  ]);
  const faces = parseJsonColumn(row.faces_json, []);
  return appliquerJetTx(tx, {
    gameId,
    roundNumber: Number(row.round_number),
    teamId: Number(row.team_id),
    mode: 'physique',
    faces,
    total: Number(row.total),
    saisieId,
    actorType: 'mj',
    actorId: String(actorId),
    settings,
  });
}

// ---------------------------------------------------------------------
// Question de case (spec § 4) : juste → +1 case et relance
// ---------------------------------------------------------------------

async function bonneReponseDeCaseTx(
  tx,
  { gameId, teamId, roundNumber, actorType, actorId, settings },
) {
  const game = await loadGameRow(tx, gameId);
  const resolved = resolveTenirSettings(settings, game);
  if (!resolved.questions_de_case) return { applied: false, events: [] };
  const markers = await loadPathMarkers(tx, game.chapter_id);
  await tx.queryOne('SELECT id FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1 FOR UPDATE', [
    teamId,
    gameId,
  ]);
  const team = await tx.queryOne(
    'SELECT id, type, position_marker_id FROM gl_teams WHERE id = ? LIMIT 1',
    [teamId],
  );
  if (!team || !markers.length || isAtCamp(team, markers)) return { applied: false, events: [] };
  const target = targetMarkerAfterPathSteps(markers, team, 1, resolveBoardPathStartIndex(game));
  if (!target?.marker) return { applied: false, events: [] };
  const events = [];
  await applyTeamMoveTx(tx, { gameId, teamId, markerId: target.marker.id });
  // Réarmement du dé : l'équipe peut relancer dans ce tour.
  const reset = Math.max(0, (Number(roundNumber) || 1) - 1);
  await tx.execute(
    'UPDATE gl_teams SET last_dice_round_number = ?, last_move_round_number = ?, updated_at = NOW() WHERE id = ?',
    [reset, reset, teamId],
  );
  events.push(
    await insertGameEvent(tx, {
      gameId,
      teamId,
      actorType,
      actorId,
      eventType: 'relance_bonus',
      payload: { roundNumber, markerId: Number(target.marker.id) },
    }),
  );
  events.push(
    await insertGameEvent(tx, {
      gameId,
      teamId,
      actorType,
      actorId,
      eventType: 'move',
      payload: {
        markerId: Number(target.marker.id),
        xp: Number(target.marker.x_pct),
        yp: Number(target.marker.y_pct),
        bonus: true,
      },
    }),
  );
  const arrival = await applyArrivalTx(tx, {
    gameId,
    teamId,
    marker: target.marker,
    game,
    settings,
    resolved,
    actorType,
    actorId,
    markers,
  });
  events.push(...arrival.events);
  return {
    applied: true,
    target: { markerId: Number(target.marker.id), index: target.index },
    arrival: arrival.summary,
    events,
  };
}

// ---------------------------------------------------------------------
// Team Spirit et Lumière (spec § 11)
// ---------------------------------------------------------------------

async function enregistrerTeamSpiritTx(tx, { gameId, roundNumber, bilans, actorId, settings }) {
  const game = await loadGameRow(tx, gameId);
  const resolved = resolveTenirSettings(settings, game);
  const events = [];
  let somme = 0;
  const publicRows = [];
  for (const b of bilans) {
    const teamId = Number(b.teamId);
    const cartes = Number(b.cartesGardees);
    if (!Number.isInteger(cartes) || cartes < 0 || cartes > 6) throw fail('CARTES_INVALIDES', 400);
    const team = await tx.queryOne('SELECT id FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1', [
      teamId,
      gameId,
    ]);
    if (!team) throw fail('TEAM_NOT_FOUND', 404);
    const existing = await tx.queryOne(
      'SELECT cartes_gardees FROM gl_game_team_spirit WHERE game_id = ? AND round_number = ? AND team_id = ? LIMIT 1',
      [gameId, roundNumber, teamId],
    );
    const previous = existing ? Number(existing.cartes_gardees) || 0 : 0;
    await tx.execute(
      `INSERT INTO gl_game_team_spirit (game_id, round_number, team_id, cartes_gardees, cartes_json, note, saisi_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE cartes_gardees = VALUES(cartes_gardees), cartes_json = VALUES(cartes_json), note = VALUES(note), saisi_at = NOW()`,
      [
        gameId,
        roundNumber,
        teamId,
        cartes,
        Array.isArray(b.cartes) ? JSON.stringify(b.cartes) : null,
        b.note ? String(b.note).slice(0, 160) : null,
      ],
    );
    somme += cartes - previous;
    publicRows.push({ teamId, cartesGardees: cartes });
  }
  events.push(
    await insertGameEvent(tx, {
      gameId,
      actorType: 'mj',
      actorId: String(actorId),
      eventType: 'team_spirit',
      // La note est réservée au prof : payload privé, cartes publiques.
      payload: {
        roundNumber,
        bilans: publicRows,
        notes: bilans.map((b) => ({ teamId: Number(b.teamId), note: b.note || null })),
        private: true,
        publicKeys: ['roundNumber', 'bilans'],
      },
    }),
  );
  let lumiere = null;
  if (resolved.lumiere && somme !== 0) {
    const current = await tx.queryOne(
      'SELECT total, paliers_json FROM gl_game_lumiere WHERE game_id = ? LIMIT 1 FOR UPDATE',
      [gameId],
    );
    const before = current ? Number(current.total) || 0 : 0;
    const after = Math.max(0, before + somme);
    await tx.execute(
      'INSERT INTO gl_game_lumiere (game_id, total, paliers_json, updated_at) VALUES (?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE total = VALUES(total), updated_at = NOW()',
      [gameId, after, current?.paliers_json || '[]'],
    );
    const palier = Math.max(1, Number(resolved.lumiere_palier) || 25);
    lumiere = {
      total: after,
      palier,
      atteint: Math.floor(after / palier),
      precedent: Math.floor(before / palier),
    };
    if (lumiere.atteint > lumiere.precedent) {
      events.push(
        await insertGameEvent(tx, {
          gameId,
          actorType: 'system',
          eventType: 'lumiere_palier',
          payload: { roundNumber, total: after, palier: lumiere.atteint * palier },
        }),
      );
    }
  }
  return { bilans: publicRows, lumiere, events };
}

async function lumiereChoixTx(tx, { gameId, palier, choix, libelle = null, actorId, settings }) {
  const game = await loadGameRow(tx, gameId);
  const resolved = resolveTenirSettings(settings, game);
  if (!resolved.lumiere) throw fail('LUMIERE_DISABLED', 409);
  const row = await tx.queryOne(
    'SELECT total, paliers_json FROM gl_game_lumiere WHERE game_id = ? LIMIT 1 FOR UPDATE',
    [gameId],
  );
  const total = row ? Number(row.total) || 0 : 0;
  const p = Number(palier);
  if (!Number.isInteger(p) || p <= 0 || p > total) throw fail('PALIER_NON_ATTEINT', 409);
  const paliers = parseJsonColumn(row?.paliers_json, []) || [];
  if (paliers.some((x) => Number(x.palier) === p)) throw fail('PALIER_DEJA_CHOISI', 409);
  if (!['voile', 'sort'].includes(choix)) throw fail('CHOIX_INVALIDE', 400);
  paliers.push({ palier: p, choix, libelle: libelle || null, at: new Date().toISOString() });
  await tx.execute(
    'INSERT INTO gl_game_lumiere (game_id, total, paliers_json, updated_at) VALUES (?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE paliers_json = VALUES(paliers_json), updated_at = NOW()',
    [gameId, total, JSON.stringify(paliers)],
  );
  const events = [];
  if (choix === 'voile') {
    try {
      const { retreatVoileTx } = require('./glVoile');
      events.push(
        ...((await retreatVoileTx(tx, {
          gameId,
          cases: Number(resolved.recul_lumiere) || 5,
          reason: 'lumiere',
          actorId,
        })) || []),
      );
    } catch (err) {
      if (err?.code !== 'MODULE_NOT_FOUND') throw err;
      events.push(
        await insertGameEvent(tx, {
          gameId,
          actorType: 'mj',
          actorId: String(actorId),
          eventType: 'voile_recul',
          payload: { cases: Number(resolved.recul_lumiere) || 5, reason: 'lumiere' },
        }),
      );
    }
  } else {
    events.push(
      await insertGameEvent(tx, {
        gameId,
        actorType: 'mj',
        actorId: String(actorId),
        eventType: 'spell_file',
        payload: { source: 'lumiere', palier: p, libelle: libelle || 'Sort de classe libre' },
      }),
    );
  }
  events.push(
    await insertGameEvent(tx, {
      gameId,
      actorType: 'mj',
      actorId: String(actorId),
      eventType: 'lumiere_choix',
      payload: { palier: p, choix, libelle: libelle || null },
    }),
  );
  return { total, paliers, events };
}

async function loadLumiere(db, gameId) {
  const row = await db.queryOne(
    'SELECT total, paliers_json FROM gl_game_lumiere WHERE game_id = ? LIMIT 1',
    [gameId],
  );
  return {
    total: row ? Number(row.total) || 0 : 0,
    paliers: parseJsonColumn(row?.paliers_json, []) || [],
  };
}

// ---------------------------------------------------------------------
// Olu : correction de l'erreur du jour
// ---------------------------------------------------------------------

async function oluCorrigeTx(tx, { gameId, roundNumber, teamId, actorId, settings }) {
  const row = await tx.queryOne(
    'SELECT olu_erreur_json, olu_corrige_team_id FROM gl_game_rounds WHERE game_id = ? AND round_number = ? LIMIT 1 FOR UPDATE',
    [gameId, roundNumber],
  );
  if (!row || !row.olu_erreur_json) throw fail('PAS_D_ERREUR', 409);
  if (row.olu_corrige_team_id != null) throw fail('DEJA_CORRIGE', 409);
  const olu = parseJsonColumn(row.olu_erreur_json, {});
  await tx.execute(
    'UPDATE gl_game_rounds SET olu_corrige_team_id = ? WHERE game_id = ? AND round_number = ?',
    [teamId, gameId, roundNumber],
  );
  const events = [
    await insertGameEvent(tx, {
      gameId,
      teamId,
      actorType: 'mj',
      actorId: String(actorId),
      eventType: 'olu_corrige',
      payload: { roundNumber, id: olu.id, correction: olu.correction, teamId },
    }),
  ];
  const game = await loadGameRow(tx, gameId);
  const resolved = resolveTenirSettings(settings, game);
  if (resolved.lumiere) {
    const current = await tx.queryOne(
      'SELECT total FROM gl_game_lumiere WHERE game_id = ? LIMIT 1 FOR UPDATE',
      [gameId],
    );
    const total = (current ? Number(current.total) || 0 : 0) + 1;
    await tx.execute(
      'INSERT INTO gl_game_lumiere (game_id, total, paliers_json, updated_at) VALUES (?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE total = VALUES(total), updated_at = NOW()',
      [gameId, total, '[]'],
    );
  }
  return { events };
}

module.exports = {
  PHASES,
  loadRoundRow,
  loadRoundView,
  loadAbsences,
  listEffets,
  listDesEnAttente,
  isFouilleFenetreOuverte,
  loadPathMarkers,
  loadTeams,
  loadGameRow,
  isAtCamp,
  ordreInverseDuPlateau,
  equipeLaPlusEnRetard,
  ouvrirTourTx,
  changerPhaseTx,
  equipeSuivanteTx,
  setAbsencesTx,
  setOperateurTx,
  setFouilleFenetreTx,
  assertActionOuverte,
  applyArrivalTx,
  appliquerJetTx,
  creerSaisieTx,
  validerSaisieTx,
  bonneReponseDeCaseTx,
  enregistrerTeamSpiritTx,
  lumiereChoixTx,
  loadLumiere,
  oluCorrigeTx,
  pageDeRouteForRound,
  resolveDesMode,
};
