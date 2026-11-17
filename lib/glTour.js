'use strict';

/**
 * « Tenir à deux » v2 — moteur du tour (spec § 3-4, § 11).
 *
 * Un tour est un objet serveur à phases `ouverture → jeu → souffle → clos`, ouvert et fermé par
 * le prof. L'ordre des équipes est figé à l'ouverture : inverse du plateau (la plus en retard
 * d'abord, égalité → identifiant croissant). Verrou PAR ÉQUIPE pour les gestes (jamais par
 * partie) ; seules `ouvrirTourTx`, `changerPhaseTx` et le souffle verrouillent `gl_game_rounds`.
 */

const glRandom = require('./glRandom');
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
const { formatMarkerEffectSummary } = require('./glMarkerEffects');
const { resolveMarkerEventConfig } = require('./glMarkerEventConfig');
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
  surplusReserveActif,
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
    // Dernier jet (ou avance libre) du tour : `{ teamId, beneficiaryTeamId, eventId, mode }`,
    // fenêtre « après le jet » de Progression et Relance (C1, C2).
    dernierJet: dernierJetDuTour(lireDerniersJets(row.dernier_jet_json)),
    // Lot 2 : un jet par équipe ; `gesteSuivant` ferme la fenêtre « après le jet » de l'équipe
    // dès qu'elle fait autre chose (hybride et tablette).
    derniersJets: lireDerniersJets(row.dernier_jet_json),
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
    // Lot 2 : questions de case dues à une arrivée de ce tour et pas encore résolues — une
    // équipe déplacée entre-temps garde la sienne (« Répondre » sur l'écran d'équipe).
    questionsEnAttente: effets
      .filter((e) => e.kind === KIND_QUESTION_CASE && e.payload?.issue == null)
      .map((e) => ({ teamId: e.teamId, markerId: Number(e.payload?.markerId) || null })),
    // Relance : jets dont la case d'arrivée s'affiche sans s'être appliquée
    // (`lib/glArriveeSuspendue.js`) — l'écran d'équipe propose « Garder ce jet » ou Relance.
    arriveesEnSuspens: effets
      .filter((e) => e.kind === 'arrivee_suspendue' && e.payload?.issue == null)
      .map((e) => {
        const p = e.payload || {};
        return {
          teamId: e.teamId,
          markerId: p.markerId != null ? Number(p.markerId) : null,
          fromMarkerId: p.fromMarkerId != null ? Number(p.fromMarkerId) : null,
          index: p.index != null ? Number(p.index) : null,
          total: Number(p.total) || 0,
          faces: Array.isArray(p.faces) ? p.faces : [],
          ...(p.preview || {}),
        };
      }),
    startedAt: row.started_at || null,
    endedAt: row.ended_at || null,
    phaseChangedAt: row.phase_changed_at || null,
    // État brut du sablier de phase (`lib/glSablier.js › buildSablierView` en fait la vue).
    sablierEtat: parseJsonColumn(row.sablier_json, null),
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
    `SELECT id, game_id, name, type, mascot_id, position_marker_id, last_dice_round_number,
            last_move_round_number, un_de_prochain_tour, un_de_round
       FROM gl_teams WHERE game_id = ? ORDER BY id ASC`,
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

/**
 * Erreur volontaire d'Olu : tirée parmi les lignes du plateau de la partie (`plateaux_json`),
 * repli sur les lignes « tous », puis sur toutes — les élèves doivent pouvoir la corriger avec ce
 * qu'ils ont vu (au chapitre 1, Olu se trompait sur la toundra, le renne et le hérisson).
 */
async function tirerErreurDuJour(db, plateau = null, gameId = null) {
  const rows = await db.queryAll(
    "SELECT id, texte, correction, plateaux_json FROM gl_tenir_olu_lignes WHERE moment = 'erreur' AND actif = 1",
  );
  if (!rows.length) return null;
  const plateauNum = Number(plateau) || null;
  const plateauxOf = (row) => parseJsonColumn(row.plateaux_json, null);
  const duPlateau = plateauNum
    ? rows.filter((r) => {
        const list = plateauxOf(r);
        return Array.isArray(list) && list.map(Number).includes(plateauNum);
      })
    : [];
  const tous = rows.filter((r) => !Array.isArray(plateauxOf(r)));
  const pool = duPlateau.length ? duPlateau : tous.length ? tous : rows;
  const pick = glRandom.pick(pool, { gameId });
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
  // Verrou de la ligne de partie pour sérialiser deux ouvertures concurrentes (double clic).
  // Il est pris AVANT toute lecture : en REPEATABLE READ, l'instantané de la transaction naît à
  // la première lecture simple ; posé après, le verrou attendait bien la première ouverture,
  // mais la seconde repartait de l'ancien numéro de tour et réinitialisait le tour suivant
  // (journal en double, erreur d'Olu retirée). Doit rester la première requête de la transaction.
  await tx.queryOne('SELECT id FROM gl_games WHERE id = ? LIMIT 1 FOR UPDATE', [gameId]);
  const game = await loadGameRow(tx, gameId);
  if (!game) throw fail('GAME_NOT_FOUND', 404);
  if (String(game.status) !== 'live') throw fail('GAME_NOT_LIVE', 409);
  const resolved = resolveTenirSettings(settings, game);
  const previous = Number(game.current_round_number) || 0;
  if (previous > 0) {
    const prevRow = await loadRoundRow(tx, gameId, previous);
    if (prevRow && prevRow.phase !== 'clos') throw fail('TOUR_PRECEDENT_OUVERT', 409);
  }
  const next = previous + 1;
  const markers = await loadPathMarkers(tx, game.chapter_id);
  let teams = await loadTeams(tx, gameId);
  if (!teams.length) throw fail('NO_TEAMS', 400);
  // Filet : une arrivée restée en suspens (Relance non lancée) s'applique avant le nouveau tour.
  const confirmees = await require('./glArriveeSuspendue').confirmerArriveesTx(tx, {
    gameId,
    settings,
  });
  const events = [...confirmees.events];
  if (confirmees.events.length) teams = await loadTeams(tx, gameId);
  // Garde-fou 11 (lot 2) : rien n'attend d'une séance à l'autre. Les demandes du tour précédent
  // se ferment, et un sort du prof resté sans effet est rendu à son équipe.
  events.push(
    ...(await solderAttentesDeSeanceTx(tx, { gameId, motif: 'seance_suivante', seance: next })),
  );

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
  const oluErreur = resolved.olu_erreur_du_jour
    ? await tirerErreurDuJour(tx, Number(game.plateau_number) || null, gameId)
    : null;

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
  // Chronométrage des phases (migration 346) : le tour démarre en `ouverture`.
  await require('./glRoundPhases').demarrerTourTx(tx, { gameId, roundNumber: next });
  // Présences (M14) : tout le monde est là par défaut — rien à confirmer, aucune demande.
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

/**
 * Sortie automatique des attentes d'une séance (ouverture du tour suivant, Seuil) : les demandes
 * liées au jeu se ferment, les sorts du prof non appliqués sont rendus. Les propositions à
 * relire (plumes, chimères) et les défis à juger gardent leur ligne jusqu'au Seuil (`tout`).
 * @returns {Promise<Array>} évènements `spell_rembourse` à émettre
 */
async function solderAttentesDeSeanceTx(tx, { gameId, motif, tout = false, seance = null }) {
  const demandes = require('./glDemandes');
  let events = [];
  try {
    events = await require('./glSpellCast').rendreSortsEnAttenteTx(tx, { gameId, motif });
    // M23 : un Mentorat que le prof n'a pas écouté repasse en « pas encore » (à retenter sans
    // repayer) — ceux des séances passées à l'ouverture d'un tour, tous au camp.
    await require('./glLettreMentorat').reporterMentoratsTx(tx, {
      gameId,
      avantSeance: tout ? null : seance,
    });
    await demandes.annulerDemandesTx(tx, {
      gameId,
      kinds: tout ? null : [...demandes.KINDS_DE_LA_PHASE_JEU, 'sort_a_appliquer', 'nommer'],
    });
    // Une Lettre en relecture dont la partie est close rejoint la file de la séance qui s'ouvre.
    if (!tout) await require('./glLettreMentorat').rattacherLettresTx(tx, { gameId });
  } catch (err) {
    if (err?.errno !== 1146 && err?.code !== 'ER_NO_SUCH_TABLE') throw err;
  }
  return events;
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
  // Fin de la phase « jeu » : les arrivées restées en suspens (Relance non lancée) s'appliquent.
  const confirmees = await require('./glArriveeSuspendue').confirmerArriveesTx(tx, {
    gameId,
    settings,
  });
  const events = [];
  const updates = { phase };
  let souffle = null;
  let passeur = null;
  // Sablier de phase : il démarre à l'entrée en phase `jeu` (état servi à tous les écrans).
  if (phase === 'jeu') updates.sablier_json = require('./glSablier').etatAuDebutDuJeu();

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
        face = rollServerDice(1, glRandom.forGame(gameId).randomInt).total;
      }
      souffle = { faces: [face], bonus, total: face + bonus, dort: false };
    } else {
      souffle = { faces: [], bonus: 0, total: 0, dort: true };
    }
    updates.souffle_json = JSON.stringify(souffle);
    const dejaLues = await pagesDeRouteDejaLues(tx, gameId);
    passeur = await pageDeRouteForRound(tx, plateau, roundNumber, dejaLues);
    updates.passeur_json = passeur ? JSON.stringify(passeur) : null;
    // Cordée offerte (lot 2) : si l'une des deux équipes encordées n'a pas jeté, le sort est
    // rendu et la protection contre le voile tombe — AVANT l'avance du voile.
    events.push(
      ...(await require('./glSpellCast').rembourserCordeesIncompletesTx(tx, {
        gameId,
        roundNumber,
      })),
    );
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
    // M14 : un Retrait ne dure pas d'une séance à l'autre — il se lève à la clôture du tour.
    // Conduite, hors économie : aucune bourse touchée, aucune identité dans l'évènement.
    try {
      const leves = await tx.execute(
        'UPDATE gl_game_retraits SET sortie_at = NOW() WHERE game_id = ? AND sortie_at IS NULL',
        [gameId],
      );
      const count = Number(leves?.affectedRows) || 0;
      if (count > 0) {
        events.push(
          await insertGameEvent(tx, {
            gameId,
            actorType: 'system',
            eventType: 'retrait',
            payload: { entree: false, tous: true, count, roundNumber },
          }),
        );
      }
    } catch (err) {
      if (err?.errno !== 1146 && err?.code !== 'ER_NO_SUCH_TABLE') throw err;
    }
    // Garde-fou 11 : un sort du tour que le prof n'a pas appliqué (Nommer…) est rendu à son
    // équipe à la clôture. Un sort d'activité garde sa ligne : il s'applique après le tour.
    try {
      const spellCast = require('./glSpellCast');
      events.push(
        ...(await spellCast.rendreSortsEnAttenteTx(tx, {
          gameId,
          motif: 'cloture_tour',
          fenetres: spellCast.FENETRES_DU_TOUR,
        })),
      );
    } catch (err) {
      if (err?.errno !== 1146 && err?.code !== 'ER_NO_SUCH_TABLE') throw err;
    }
  }

  const sets = Object.keys(updates).map((k) => `${k} = ?`);
  await tx.execute(
    `UPDATE gl_game_rounds SET ${sets.join(', ')}, phase_changed_at = NOW() WHERE game_id = ? AND round_number = ?`,
    [...Object.values(updates), gameId, roundNumber],
  );
  // Chronométrage : la phase quittée se ferme, la suivante s'ouvre (`clos` ne fait que fermer).
  await require('./glRoundPhases').changerPhaseTx(tx, { gameId, roundNumber, phase });
  // Garde-fou 11 : les demandes au prof qui n'ont de sens que pendant le jeu (dés à valider,
  // jets en suspens) se ferment seules à la sortie de la phase.
  if (phase === 'souffle' || phase === 'clos') {
    const demandes = require('./glDemandes');
    await demandes.annulerDemandesTx(tx, { gameId, kinds: demandes.KINDS_DE_LA_PHASE_JEU });
    // … et la saisie de dés que le prof n'a pas validée ne reste pas « en attente » : hors de
    // la phase jeu, elle ne peut plus s'appliquer.
    await tx.execute(
      `UPDATE gl_game_des_saisies SET statut = 'refusee'
        WHERE game_id = ? AND round_number = ? AND statut = 'en_attente'`,
      [gameId, roundNumber],
    );
  }
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
  return {
    roundNumber,
    phase,
    souffle,
    passeur,
    events: [...confirmees.events, phaseEvent, ...events],
  };
}

/** Surface tableau : équipe suivante dans l'ordre figé (boucle). */
async function equipeSuivanteTx(tx, { gameId, actorId, settings = null }) {
  const game = await loadGameRow(tx, gameId);
  const roundNumber = Number(game?.current_round_number) || 0;
  const row = await tx.queryOne(
    'SELECT * FROM gl_game_rounds WHERE game_id = ? AND round_number = ? LIMIT 1 FOR UPDATE',
    [gameId, roundNumber],
  );
  if (!row) throw fail('AUCUN_TOUR', 409);
  const ordre = parseJsonColumn(row.ordre_json, []);
  if (!ordre.length) throw fail('NO_TEAMS', 400);
  // L'équipe qui cède la main garde son jet : son arrivée en suspens s'applique.
  const confirmees = settings
    ? await require('./glArriveeSuspendue').confirmerArriveesTx(tx, { gameId, settings })
    : { events: [] };
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
  return { equipeActiveId: next, event: evt, events: [...confirmees.events, evt] };
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
  // Le prof a fait l'appel : la présence de toutes les équipes est confirmée (lot 2).
  await require('./glPresences').confirmerToutesParLeProfTx(tx, { gameId, roundNumber, actorId });
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
  const pick = glRandom.pick(pool, { gameId });
  return {
    id: String(pick.id),
    texte: String(pick.texte),
    biomeSlug: pick.biome_slug,
    passable: Number(pick.passable) === 1,
  };
}

/**
 * Une case tire-t-elle une péripétie ? Les cases `event` sans texte (règle d'origine) et, depuis
 * le 7 novembre 2026 (C5, réglage `tenir_peripeties_cases_neutres`), les cases `behavior` sans
 * bloc `effects` dont la tonalité est `negatif` ou `neutre` (Averse tropicale, Troupe de
 * chimpanzés, Lion à l'affût, Chant des cigales, Brame du cerf, Brouillard atlantique, Lemming
 * en pleine explosion). « Défi d'équipe » n'en reçoit pas. Aucun des quatre plateaux réels n'a de
 * case `event` sans texte : sans C5, les 32 péripéties ne sortaient jamais.
 */
function caseTirePeripetie(marker, resolved) {
  const type = String(marker?.event_type || '');
  if (type === 'event' && !String(marker?.description || '').trim()) return true;
  if (type !== 'behavior' || resolved?.peripeties_cases_neutres === false) return false;
  if (/d[ée]fi/i.test(String(marker?.label || ''))) return false;
  const cfg = resolveMarkerEventConfig(marker);
  if (cfg?.effects && Object.keys(cfg.effects).length) return false;
  const tonalite = String(cfg?.eventMeta?.tonalite || '')
    .trim()
    .toLowerCase();
  return tonalite === 'negatif' || tonalite === 'neutre';
}

/**
 * Applique l'arrivée d'une équipe sur `marker` : effets de vitalité (Trame = +1 ressource du
 * peuple, Souffle = plateau), déplacement automatique, péripétie (case événement sans texte),
 * première arrivée au camp (honneur de l'Avant-garde réservé).
 */
async function applyArrivalTx(
  tx,
  {
    gameId,
    teamId,
    marker,
    game,
    settings,
    resolved,
    actorType,
    actorId,
    markers,
    fromMarkerId = null,
  },
) {
  const events = [];
  // Défi de case (lot 2, § 7) : l'équipe reçoit un défi à préparer ; le tour continue sans
  // attendre. En mode `passage`, les cases Défi franchies depuis `fromMarkerId` comptent aussi.
  events.push(
    ...(await require('./glDefisCase').recevoirDefisTx(tx, {
      gameId,
      teamId,
      game,
      resolved,
      markers,
      marker,
      fromMarkerId,
      roundNumber: Number(game?.current_round_number) || 0,
    })),
  );
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
  // Lot 2 : la question d'une case est due à l'ARRIVÉE du tour, pas à la position — une équipe
  // qu'une Bourrasque ou un Relais déplace avant sa réponse garde sa question.
  if (isQuestionMarker(marker)) {
    await noterQuestionDeCaseTx(tx, {
      gameId,
      roundNumber: Number(game?.current_round_number) || 0,
      teamId,
      markerId: Number(marker.id),
    });
  }
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
      casesPositives: resolved?.cases_positives,
      reserveTeamId: surplusReserveActif(resolved) ? Number(teamId) : null,
    });
    if (vitality?.sentier) await consumeSentier(tx, gameId, teamId);
    // Ensemble unifié (M3) : case Souffle (Sentier exclu) → au tour suivant, l'équipe ne lance
    // qu'un dé. Un oui / non par équipe : deux cases Souffle avant le tour suivant ne se cumulent
    // pas. Ni recul, ni tour passé, ni ressource retirée.
    if (vitality?.unDe && !vitality?.sentier) {
      events.push(
        ...(await poserUnDeTx(tx, {
          gameId,
          teamId,
          roundNumber: Number(game?.current_round_number) || 0,
          marker,
        })),
      );
      summary.unDe = true;
    }
    // Vérité des cases : le texte servi aux écrans est celui de l'effet appliqué.
    summary.effectSummary = formatMarkerEffectSummary(marker, team.type, {
      tenir: true,
      sentierActif: ctx.sentierActif,
      casesPositives: resolved?.cases_positives,
      peripetie: Boolean(resolved?.peripeties && caseTirePeripetie(marker, resolved)),
    });
    if (vitality?.applied || vitality?.resolvedEffect || vitality?.unDe) {
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
              unDe: vitality.unDe === true,
              reason: marker.label,
              vitalityTarget: vitality.vitalityTarget,
              vitalityPlayerIds: vitality.vitalityPlayerIds,
              autoMoveApplied:
                Boolean(vitality.moveDelta) && settings?.markerEffectAutoMoveEnabled === true,
            }),
            tonalite: vitality.tonalite || null,
            sentier: vitality.sentier === true,
            effectSummary: summary.effectSummary || null,
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
        unDe: vitality.unDe === true && vitality.sentier !== true,
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
    if (resolved?.peripeties && caseTirePeripetie(marker, resolved)) {
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
            payload: {
              ...peripetie,
              markerId: Number(marker.id),
              // La description de la case reste affichée au-dessus de la péripétie (C5).
              markerLabel: marker.label || null,
              markerDescription: String(marker.description || '').trim() || null,
            },
          }),
        );
        summary.peripetie = peripetie;
      }
    }
  }
  const finalIdx = markers.length - 1;
  const markerIdx = markers.findIndex((m) => Number(m.id) === Number(marker.id));
  if (markers.length && markerIdx === finalIdx) {
    // M3 : l'état « un seul dé » s'efface au camp.
    await effacerUnDeTx(tx, { gameId, teamId });
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

// ---------------------------------------------------------------------
// Question de case due à l'arrivée du tour (lot 2)
// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// Case Souffle : un seul dé au tour suivant (ensemble unifié, M3)
// ---------------------------------------------------------------------

/**
 * Pose l'état « un seul dé au prochain tour » sur l'équipe (oui / non : ne se cumule pas). Le
 * tour de pose est gardé : le premier lancer d'un tour **suivant** le consomme ; la relance
 * gagnée par une question juste, dans le même tour, se joue encore à deux dés.
 * @returns {Promise<Array>} évènements à émettre
 */
async function poserUnDeTx(tx, { gameId, teamId, roundNumber, marker }) {
  const deja = await tx.queryOne(
    'SELECT un_de_prochain_tour FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1',
    [teamId, gameId],
  );
  await tx.execute(
    `UPDATE gl_teams SET un_de_prochain_tour = 1, un_de_round = ?, updated_at = NOW()
      WHERE id = ? AND game_id = ?`,
    [Number(roundNumber) || 0, teamId, gameId],
  );
  if (Number(deja?.un_de_prochain_tour) === 1) return [];
  return [
    await insertGameEvent(tx, {
      gameId,
      teamId,
      actorType: 'system',
      eventType: 'un_de_pose',
      payload: {
        markerId: Number(marker?.id) || null,
        markerLabel: marker?.label || null,
        roundNumber: Number(roundNumber) || 0,
      },
    }),
  ];
}

/** Efface l'état « un seul dé » (arrivée au camp, clôture de la partie). */
async function effacerUnDeTx(tx, { gameId, teamId = null }) {
  if (teamId != null) {
    await tx.execute(
      'UPDATE gl_teams SET un_de_prochain_tour = 0, un_de_round = NULL WHERE id = ? AND game_id = ?',
      [teamId, gameId],
    );
    return;
  }
  await tx.execute(
    'UPDATE gl_teams SET un_de_prochain_tour = 0, un_de_round = NULL WHERE game_id = ?',
    [gameId],
  );
}

/** L'équipe joue-t-elle à un dé au prochain lancer de `roundNumber` ? (posé à un tour antérieur) */
function unDeEnAttente(team, roundNumber) {
  return (
    Number(team?.un_de_prochain_tour) === 1 &&
    Number(team?.un_de_round ?? 0) < (Number(roundNumber) || 0)
  );
}

/**
 * Nombre de dés du prochain lancer de l'équipe : 1 si l'état « un seul dé » attend ce tour, ou
 * si une Relance (sort) relance le seul dé déjà joué ce tour ; sinon `desCount`.
 */
async function desPourJet(db, { gameId, teamId, roundNumber, desCount }) {
  const n = Math.max(1, Number(desCount) || 2);
  const team = await db.queryOne(
    'SELECT un_de_prochain_tour, un_de_round, un_de_joue_round FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1',
    [teamId, gameId],
  );
  if (!team) return n;
  if (unDeEnAttente(team, roundNumber)) return 1;
  if (Number(team.un_de_joue_round) === Number(roundNumber) && Number(roundNumber) > 0) {
    const relance = await db.queryOne(
      `SELECT id FROM gl_game_tenir_effets WHERE game_id = ? AND round_number = ? AND team_id = ? AND kind = 'relance'
          AND JSON_EXTRACT(COALESCE(payload_json, '{}'), '$.consomme') IS NULL LIMIT 1`,
      [gameId, roundNumber, teamId],
    );
    if (relance) return 1;
  }
  return n;
}

const KIND_QUESTION_CASE = 'question_case';

/** Note qu'une question de case attend l'équipe (une par équipe, repère et tour). */
async function noterQuestionDeCaseTx(tx, { gameId, roundNumber, teamId, markerId }) {
  if (!Number(roundNumber)) return;
  const deja = await tx.queryOne(
    `SELECT id FROM gl_game_tenir_effets
      WHERE game_id = ? AND round_number = ? AND kind = ? AND team_id = ?
        AND JSON_EXTRACT(COALESCE(payload_json, '{}'), '$.markerId') = ?
        AND JSON_EXTRACT(COALESCE(payload_json, '{}'), '$.issue') IS NULL
      LIMIT 1`,
    [gameId, roundNumber, KIND_QUESTION_CASE, teamId, Number(markerId)],
  );
  if (deja) return;
  await tx.execute(
    `INSERT INTO gl_game_tenir_effets (game_id, round_number, kind, team_id, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, NOW())`,
    [
      gameId,
      roundNumber,
      KIND_QUESTION_CASE,
      teamId,
      JSON.stringify({ markerId: Number(markerId) }),
    ],
  );
}

/** Une question de ce repère attend-elle encore l'équipe ce tour ? */
async function questionDeCaseDue(db, { gameId, roundNumber, teamId, markerId }) {
  if (!Number(roundNumber)) return false;
  const row = await db.queryOne(
    `SELECT id FROM gl_game_tenir_effets
      WHERE game_id = ? AND round_number = ? AND kind = ? AND team_id = ?
        AND JSON_EXTRACT(COALESCE(payload_json, '{}'), '$.markerId') = ?
        AND JSON_EXTRACT(COALESCE(payload_json, '{}'), '$.issue') IS NULL
      LIMIT 1`,
    [gameId, roundNumber, KIND_QUESTION_CASE, teamId, Number(markerId)],
  );
  return !!row;
}

/** Bonne réponse : la question de ce repère n'attend plus l'équipe. */
async function solderQuestionDeCaseTx(tx, { gameId, roundNumber, teamId, markerId }) {
  if (!Number(roundNumber)) return;
  await tx.execute(
    `UPDATE gl_game_tenir_effets
        SET payload_json = JSON_SET(COALESCE(payload_json, '{}'), '$.issue', 'repondue')
      WHERE game_id = ? AND round_number = ? AND kind = ? AND team_id = ?
        AND JSON_EXTRACT(COALESCE(payload_json, '{}'), '$.markerId') = ?
        AND JSON_EXTRACT(COALESCE(payload_json, '{}'), '$.issue') IS NULL`,
    [gameId, roundNumber, KIND_QUESTION_CASE, teamId, Number(markerId)],
  );
}

/**
 * Mémorise le dernier jet (ou avance libre) du tour dans `gl_game_rounds.dernier_jet_json`
 * (C1, C2 : Progression et Relance ne se lancent que si le dernier jet du tour est celui de
 * l'équipe). Tolère l'absence de tour (avance libre hors tour) et de colonne (base en retard).
 */
async function enregistrerDernierJetTx(
  tx,
  { gameId, roundNumber, teamId, beneficiaryTeamId, eventId, mode },
) {
  if (!Number(roundNumber)) return;
  // Lot 2 : un jet par équipe (`{ [teamId]: { … , gesteSuivant } }`). Fusion atomique : deux
  // équipes qui jettent en même temps ne s'écrasent pas. Une valeur à l'ancien format
  // (`{ teamId, … }`, un seul jet pour toute la partie) est remplacée.
  const entree = {
    [String(Number(teamId))]: {
      beneficiaryTeamId: Number(beneficiaryTeamId),
      eventId: eventId != null ? Number(eventId) : null,
      mode: String(mode || 'serveur'),
      at: new Date().toISOString(),
      gesteSuivant: false,
    },
  };
  try {
    await tx.execute(
      `UPDATE gl_game_rounds
          SET dernier_jet_json = JSON_MERGE_PATCH(
                CASE WHEN dernier_jet_json IS NULL
                       OR JSON_EXTRACT(dernier_jet_json, '$.teamId') IS NOT NULL
                     THEN '{}' ELSE dernier_jet_json END,
                ?)
        WHERE game_id = ? AND round_number = ?`,
      [JSON.stringify(entree), gameId, roundNumber],
    );
  } catch (err) {
    if (err?.errno !== 1054 && err?.code !== 'ER_BAD_FIELD_ERROR') throw err;
  }
}

/**
 * Jets du tour par équipe, lus de `dernier_jet_json` (ancien format `{ teamId, … }` compris).
 * @returns {Record<string, { beneficiaryTeamId, eventId, mode, at, gesteSuivant }>}
 */
function lireDerniersJets(raw) {
  const v = parseJsonColumn(raw, null);
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  if (v.teamId != null) {
    return {
      [String(Number(v.teamId))]: {
        beneficiaryTeamId: v.beneficiaryTeamId != null ? Number(v.beneficiaryTeamId) : null,
        eventId: v.eventId != null ? Number(v.eventId) : null,
        mode: String(v.mode || 'serveur'),
        at: v.at || null,
        gesteSuivant: false,
      },
    };
  }
  const out = {};
  for (const [teamId, jet] of Object.entries(v)) {
    if (!jet || typeof jet !== 'object' || !(Number(teamId) > 0)) continue;
    out[String(Number(teamId))] = { ...jet, gesteSuivant: !!jet.gesteSuivant };
  }
  return out;
}

/** Jet le plus récent du tour, à l'ancienne forme `{ teamId, beneficiaryTeamId, eventId, mode, at }`. */
function dernierJetDuTour(jets) {
  let dernier = null;
  for (const [teamId, jet] of Object.entries(jets || {})) {
    const cle = [String(jet.at || ''), Number(jet.eventId) || 0];
    if (
      !dernier ||
      cle[0] > dernier.cle[0] ||
      (cle[0] === dernier.cle[0] && cle[1] > dernier.cle[1])
    ) {
      dernier = { cle, teamId: Number(teamId), jet };
    }
  }
  if (!dernier) return null;
  const { gesteSuivant, ...rest } = dernier.jet; // eslint-disable-line no-unused-vars
  return { teamId: dernier.teamId, ...rest };
}

/**
 * L'équipe vient de faire un autre geste que son jet (fouille, réponse, lecture, sort) : sa
 * fenêtre « après le jet » se ferme (lot 2, hybride et tablette). Sans jet ce tour : rien.
 */
async function marquerGesteSuivantTx(tx, { gameId, roundNumber, teamId }) {
  const id = Number(teamId);
  if (!Number(roundNumber) || !(id > 0)) return;
  try {
    await tx.execute(
      `UPDATE gl_game_rounds
          SET dernier_jet_json = JSON_SET(dernier_jet_json, '$."${id}".gesteSuivant', 1)
        WHERE game_id = ? AND round_number = ?
          AND JSON_EXTRACT(dernier_jet_json, '$."${id}"') IS NOT NULL`,
      [gameId, roundNumber],
    );
  } catch (err) {
    if (err?.errno !== 1054 && err?.code !== 'ER_BAD_FIELD_ERROR') throw err;
  }
}

/** Vrai si une Relance (sort) a réarmé le dé de l'équipe ce tour. */
async function consumeRelanceTx(tx, gameId, roundNumber, teamId) {
  const row = await tx.queryOne(
    `SELECT id FROM gl_game_tenir_effets WHERE game_id = ? AND round_number = ? AND team_id = ? AND kind = 'relance'
        AND JSON_EXTRACT(COALESCE(payload_json, '{}'), '$.consomme') IS NULL ORDER BY id DESC LIMIT 1`,
    [gameId, roundNumber, teamId],
  );
  if (!row) return false;
  // Garde atomique : la lecture ci-dessus est un instantané (REPEATABLE READ) ; un jet
  // concurrent a pu consommer la même Relance et commiter entre-temps. L'UPDATE, lui, lit la
  // version courante : seule la transaction qui la consomme vraiment obtient `true`.
  const res = await tx.execute(
    `UPDATE gl_game_tenir_effets SET payload_json = JSON_SET(COALESCE(payload_json, '{}'), '$.consomme', 1)
      WHERE id = ? AND JSON_EXTRACT(COALESCE(payload_json, '{}'), '$.consomme') IS NULL`,
    [row.id],
  );
  return Number(res?.affectedRows) > 0;
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

/** Équipes qu'un jet de `teamId` peut déplacer : elle-même, sa bénéficiaire, sa cordée. */
async function equipesConcerneesParLeJet(tx, { gameId, roundNumber, teamId, markers }) {
  const ids = new Set([Number(teamId)]);
  const teams = await loadTeams(tx, gameId);
  const team = teams.find((t) => Number(t.id) === Number(teamId));
  if (team && isAtCamp(team, markers)) {
    const late = equipeLaPlusEnRetard(teams, markers, teamId);
    if (late) ids.add(Number(late.id));
  }
  const cordee = await tx.queryOne(
    `SELECT team_id, source_team_id FROM gl_game_tenir_effets
      WHERE game_id = ? AND round_number = ? AND kind = 'cordee' AND (team_id = ? OR source_team_id = ?)
      ORDER BY id DESC LIMIT 1`,
    [gameId, Number(roundNumber) || 0, teamId, teamId],
  );
  if (cordee) {
    ids.add(Number(cordee.team_id));
    ids.add(Number(cordee.source_team_id));
  }
  return [...ids].filter((n) => n > 0);
}

/**
 * Lot 2 (hybride, tablette) : l'équipe fait un autre geste que son jet — fouille, réponse,
 * lecture, sort. Sa case en suspens s'applique (elle garde son jet) et sa fenêtre « après le
 * jet » se ferme. Au tableau, rien ne change.
 * @returns {Promise<Array>} évènements à émettre
 */
async function gesteDEquipeTx(
  tx,
  { gameId, roundNumber, teamId, settings, actorType = 'team', actorId = null },
) {
  if (!Number(roundNumber) || !(Number(teamId) > 0)) return [];
  const game = await loadGameRow(tx, gameId);
  if (!game || resolveSurface(game, settings) === 'tableau') return [];
  const confirmees = await require('./glArriveeSuspendue').confirmerArriveesTx(tx, {
    gameId,
    settings,
    teamId: Number(teamId),
    actorType,
    actorId,
    motif: 'geste',
  });
  await marquerGesteSuivantTx(tx, { gameId, roundNumber, teamId });
  return confirmees.events;
}

/**
 * Applique un jet (ou une avance libre) à son bénéficiaire : l'équipe elle-même, ou — si elle est
 * au camp — l'équipe la plus en retard. Déplacement + effets d'arrivée, événements
 * `dice_roll` (ou `avance_libre`) et `move`. Verrou PAR ÉQUIPE (`FOR UPDATE` sur gl_teams).
 *
 * Relance (9 novembre 2026) : si l'équipe peut encore lancer Relance, la case d'arrivée est
 * **mise en suspens** (affichée, pas appliquée) — cf. `lib/glArriveeSuspendue.js`. Un jet
 * applique d'abord les arrivées restées en suspens dans la partie (« avant qu'une autre équipe
 * ne joue »).
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
  const suspension = require('./glArriveeSuspendue');
  const events = [];
  // Une arrivée laissée en suspens (Relance non lancée) s'applique avant tout nouveau jet. Au
  // tableau : celles de toute la partie (« avant qu'une autre équipe ne joue »). En hybride et
  // sur tablette (lot 2), les équipes jouent en parallèle : seulement celles des équipes que ce
  // jet concerne — l'équipe qui jette, celle qu'il fait avancer, sa partenaire de Cordée.
  const confirmees = await suspension.confirmerArriveesTx(tx, {
    gameId,
    settings,
    teamIds:
      resolveSurface(game, settings) === 'tableau'
        ? null
        : await equipesConcerneesParLeJet(tx, { gameId, roundNumber, teamId, markers }),
  });
  events.push(...confirmees.events);
  // La lecture verrouillée (FOR UPDATE) renvoie la version COURANTE de la ligne, alors que
  // `loadTeams` lit l'instantané de la transaction (REPEATABLE READ), pris avant que le verrou
  // n'attende un éventuel jet concurrent : la position et l'état du dé viennent donc de la
  // ligne verrouillée, sinon un déplacement commité entre-temps serait écrasé.
  const lockedTeam = await tx.queryOne(
    `SELECT id, position_marker_id, last_dice_round_number, last_move_round_number
       FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1 FOR UPDATE`,
    [teamId, gameId],
  );
  const teams = (await loadTeams(tx, gameId)).map((t) =>
    lockedTeam && Number(t.id) === Number(teamId) ? { ...t, ...lockedTeam } : t,
  );
  const team = teams.find((t) => Number(t.id) === Number(teamId));
  if (!team) throw fail('TEAM_NOT_FOUND', 404);

  let beneficiary = team;
  if (isAtCamp(team, markers)) {
    const late = equipeLaPlusEnRetard(teams, markers, teamId);
    if (!late) throw fail('TOUTES_AU_CAMP', 409);
    const lockedLate = await tx.queryOne(
      `SELECT id, position_marker_id, last_dice_round_number, last_move_round_number
         FROM gl_teams WHERE id = ? LIMIT 1 FOR UPDATE`,
      [late.id],
    );
    beneficiary = lockedLate ? { ...late, ...lockedLate } : late;
  }
  let unDeJoue = false;
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
    // M3 : premier lancer d'un tour qui suit une case Souffle → un seul dé (l'état se consomme) ;
    // une Relance (sort) relance ce seul dé ; une relance de case se joue à deux dés.
    const etat = await tx.queryOne(
      'SELECT un_de_prochain_tour, un_de_round, un_de_joue_round FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1 FOR UPDATE',
      [teamId, gameId],
    );
    const round = Number(roundNumber) || 0;
    if (unDeEnAttente(etat, round)) {
      unDeJoue = true;
      await tx.execute(
        `UPDATE gl_teams SET un_de_prochain_tour = 0, un_de_round = NULL, un_de_joue_round = ?,
                updated_at = NOW() WHERE id = ?`,
        [round, teamId],
      );
    } else if (relance && Number(etat?.un_de_joue_round) === round) {
      unDeJoue = true;
    } else if (Number(etat?.un_de_joue_round) === round) {
      await tx.execute('UPDATE gl_teams SET un_de_joue_round = NULL WHERE id = ?', [teamId]);
    }
    if (unDeJoue && Array.isArray(faces) && faces.length > 1) {
      // Saisie à deux faces reçue alors qu'un seul dé est dû : seule la première compte.
      faces = [Number(faces[0])];
      total = Number(faces[0]);
    }
  }
  let steps = Math.max(1, Number(total) || 1);
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
  const depart = await tx.queryOne(
    'SELECT position_marker_id, position_x_pct, position_y_pct FROM gl_teams WHERE id = ? LIMIT 1',
    [beneficiaryTeamId],
  );
  const jetEvent = await insertGameEvent(tx, {
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
            ...(unDeJoue ? { unDe: true } : {}),
          },
  });
  events.push(jetEvent);
  if (unDeJoue) {
    events.push(
      await insertGameEvent(tx, {
        gameId,
        teamId,
        actorType: 'system',
        eventType: 'un_de_joue',
        payload: { roundNumber, total: steps },
      }),
    );
  }
  await applyTeamMoveTx(tx, {
    gameId,
    teamId: beneficiaryTeamId,
    markerId: target.marker.id,
    roundNumber: mode === 'libre' ? null : roundNumber,
  });
  await enregistrerDernierJetTx(tx, {
    gameId,
    roundNumber,
    teamId: Number(teamId),
    beneficiaryTeamId,
    eventId: Number(jetEvent?.id) || null,
    mode,
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
        markerLabel: target.marker.label || null,
        index: target.index,
        xp: Number(target.marker.x_pct),
        yp: Number(target.marker.y_pct),
        fromDice: true,
      },
    }),
  );
  // Relance encore possible : la case s'affiche sans s'appliquer (jet de l'équipe pour elle-même,
  // hors avance libre et hors Cordée, dont le meilleur des deux jets est déjà un choix). Un jet
  // qui atteint le camp n'est jamais « nul » : il s'applique aussitôt (première arrivée sans
  // ambiguïté entre deux équipes en attente).
  const versLeCamp = Number(target.marker.id) === Number(markers[markers.length - 1]?.id);
  const relance =
    mode !== 'libre' && !cordee && !versLeCamp && beneficiaryTeamId === Number(teamId)
      ? await suspension.relanceDisponibleTx(tx, {
          gameId,
          game,
          teamId: beneficiaryTeamId,
          roundNumber,
          settings,
        })
      : null;
  let arrival;
  if (relance) {
    arrival = await suspension.suspendreArriveeTx(tx, {
      gameId,
      roundNumber,
      teamId: beneficiaryTeamId,
      marker: target.marker,
      index: target.index,
      from: {
        markerId: depart?.position_marker_id ?? null,
        x: depart?.position_x_pct ?? null,
        y: depart?.position_y_pct ?? null,
      },
      total: steps,
      faces,
      mode,
      saisieId,
      resolved,
      markers,
      relance,
      caseTirePeripetie,
      actorType,
      actorId,
    });
  } else {
    arrival = await applyArrivalTx(tx, {
      gameId,
      teamId: beneficiaryTeamId,
      marker: target.marker,
      game,
      settings,
      resolved,
      actorType,
      actorId,
      markers,
      fromMarkerId: depart?.position_marker_id ?? null,
    });
  }
  events.push(...arrival.events);
  // Cordée : le partenaire déjà passé rattrape la différence (sans jet supplémentaire).
  if (cordee && cordee.partnerCatchUp > 0) {
    // Position courante (lecture verrouillée) : le partenaire a pu jeter et commiter depuis
    // l'instantané de `loadTeams`.
    const partner = await tx.queryOne(
      `SELECT id, position_marker_id, last_dice_round_number, last_move_round_number
         FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1 FOR UPDATE`,
      [cordee.partnerTeamId, gameId],
    );
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
              markerLabel: dest.marker.label || null,
              index: dest.index,
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
  // File unique du prof (lot 2) : une ligne « dés à valider ».
  await require('./glDemandes').creerDemandeTx(tx, {
    gameId,
    roundNumber,
    teamId,
    kind: 'des_a_valider',
    refId: Number(insert.insertId),
    payload: { faces, total },
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
  await require('./glDemandes').resoudreDemandeTx(tx, {
    gameId,
    kind: 'des_a_valider',
    refId: Number(saisieId),
  });
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
  // C3 (simulation du 7 novembre 2026) : une seule relance par équipe et par tour (réglage
  // `tenir_relances_max_par_tour`, 0 = illimité). Au-delà, +1 case et application de la case,
  // sans réarmer le dé : la seule voie par laquelle le niveau scolaire accélérait une équipe
  // (31 cases sur 42 après la séance 1) est bornée.
  const max = Number(resolved.relances_max_par_tour);
  const round = Number(roundNumber) || 0;
  const deja = round
    ? Number(
        (
          await tx.queryOne(
            "SELECT COUNT(*) AS c FROM gl_game_tenir_effets WHERE game_id = ? AND round_number = ? AND team_id = ? AND kind = 'relance_case'",
            [gameId, round, teamId],
          )
        )?.c,
      ) || 0
    : 0;
  const relance = !(Number.isInteger(max) && max > 0 && deja >= max);
  if (relance) {
    // Réarmement du dé : l'équipe peut relancer dans ce tour.
    const reset = Math.max(0, (Number(roundNumber) || 1) - 1);
    await tx.execute(
      'UPDATE gl_teams SET last_dice_round_number = ?, last_move_round_number = ?, updated_at = NOW() WHERE id = ?',
      [reset, reset, teamId],
    );
    if (round) {
      await tx.execute(
        'INSERT INTO gl_game_tenir_effets (game_id, round_number, kind, team_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
        [
          gameId,
          round,
          'relance_case',
          teamId,
          JSON.stringify({ markerId: Number(target.marker.id) }),
        ],
      );
    }
  }
  const bonus = { cases: 1, relance };
  events.push(
    await insertGameEvent(tx, {
      gameId,
      teamId,
      actorType,
      actorId,
      eventType: 'relance_bonus',
      payload: { roundNumber, markerId: Number(target.marker.id), ...bonus },
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
        markerLabel: target.marker.label || null,
        index: target.index,
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
    bonus,
    target: { markerId: Number(target.marker.id), index: target.index },
    arrival: arrival.summary,
    events,
  };
}

// ---------------------------------------------------------------------
// Team Spirit et Lumière (spec § 11)
// ---------------------------------------------------------------------

async function enregistrerTeamSpiritTx(tx, { gameId, roundNumber, bilans, actorId, settings }) {
  // Deux enregistrements simultanés du même bilan : sans verrou pris avant la première lecture,
  // le second relisait l'ancien nombre de cartes (instantané REPEATABLE READ) et comptait deux
  // fois la Lumière (palier franchi à tort). Doit rester la première requête de la transaction.
  await tx.queryOne('SELECT id FROM gl_games WHERE id = ? LIMIT 1 FOR UPDATE', [gameId]);
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
      'SELECT cartes_gardees, lumiere_comptee FROM gl_game_team_spirit WHERE game_id = ? AND round_number = ? AND team_id = ? LIMIT 1',
      [gameId, roundNumber, teamId],
    );
    // M17 : la Lumière compte chaque carte une seule fois par séance et par équipe — un bilan
    // baissé puis remonté n'ajoute rien de plus que ce qui a déjà été compté.
    const dejaComptee = existing
      ? Math.max(Number(existing.lumiere_comptee) || 0, Number(existing.cartes_gardees) || 0)
      : 0;
    await tx.execute(
      `INSERT INTO gl_game_team_spirit (game_id, round_number, team_id, cartes_gardees, lumiere_comptee, cartes_json, note, saisi_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE cartes_gardees = VALUES(cartes_gardees), lumiere_comptee = VALUES(lumiere_comptee),
         cartes_json = VALUES(cartes_json), note = VALUES(note), saisi_at = NOW()`,
      [
        gameId,
        roundNumber,
        teamId,
        cartes,
        Math.max(dejaComptee, cartes),
        Array.isArray(b.cartes) ? JSON.stringify(b.cartes) : null,
        b.note ? String(b.note).slice(0, 160) : null,
      ],
    );
    somme += Math.max(0, cartes - dejaComptee);
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
  // Ensemble unifié (M17) : la jauge ne descend jamais — un bilan revu à la baisse ne retire rien.
  const lumiere =
    somme > 0
      ? await ajouterLumiereTx(tx, {
          gameId,
          n: somme,
          resolved,
          roundNumber,
          source: 'team_spirit',
        })
      : null;
  if (lumiere) events.push(...lumiere.events);
  return { bilans: publicRows, lumiere: lumiere ? lumiere.etat : null, events };
}

/**
 * Ensemble unifié (M17) — la Lumière, version simple : une jauge par partie qui ne descend
 * jamais. Chaque carte Team Spirit gardée ajoute 1, l'erreur d'Olu corrigée ajoute 1, une
 * réussite de défi de la Trame en mode équipe ajoute 10. À chaque palier
 * (`tenir_lumiere_palier`, 100), le voile recule d'office de `tenir_recul_lumiere` (5) cases et
 * la jauge repart de zéro (le reste est gardé). Aucun choix à enregistrer.
 * @returns {Promise<null|{ etat: object, paliers: number, events: Array }>}
 */
async function ajouterLumiereTx(
  tx,
  { gameId, n, resolved, roundNumber = null, source = null, actorId = null },
) {
  const delta = Math.trunc(Number(n) || 0);
  if (!resolved?.lumiere || delta <= 0) return null;
  const row = await tx.queryOne(
    'SELECT total, paliers_json FROM gl_game_lumiere WHERE game_id = ? LIMIT 1 FOR UPDATE',
    [gameId],
  );
  const palier = Math.max(1, Number(resolved.lumiere_palier) || 100);
  const recul = Math.max(0, Number(resolved.recul_lumiere) || 5);
  let total = (row ? Number(row.total) || 0 : 0) + delta;
  const historique = parseJsonColumn(row?.paliers_json, []) || [];
  const events = [];
  let atteints = 0;
  while (total >= palier) {
    total -= palier;
    atteints += 1;
    historique.push({ palier, recul, source, at: new Date().toISOString() });
    events.push(
      await insertGameEvent(tx, {
        gameId,
        actorType: 'system',
        eventType: 'lumiere_palier',
        payload: { roundNumber, palier, recul, source },
      }),
    );
    events.push(
      ...((await require('./glVoile').retreatVoileTx(tx, {
        gameId,
        cases: recul,
        reason: 'lumiere',
        actorId,
        oluId: 'olu-38',
      })) || []),
    );
  }
  await tx.execute(
    `INSERT INTO gl_game_lumiere (game_id, total, paliers_json, updated_at) VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE total = VALUES(total), paliers_json = VALUES(paliers_json), updated_at = NOW()`,
    [gameId, total, JSON.stringify(historique)],
  );
  return { etat: { total, palier, ajout: delta, paliers: atteints }, paliers: atteints, events };
}

async function loadLumiere(db, gameId, resolved = null) {
  const row = await db.queryOne(
    'SELECT total, paliers_json FROM gl_game_lumiere WHERE game_id = ? LIMIT 1',
    [gameId],
  );
  return {
    total: row ? Number(row.total) || 0 : 0,
    paliers: parseJsonColumn(row?.paliers_json, []) || [],
    ...(resolved
      ? {
          active: resolved.lumiere === true,
          palier: Math.max(1, Number(resolved.lumiere_palier) || 100),
        }
      : {}),
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
  const lumiere = await ajouterLumiereTx(tx, {
    gameId,
    n: 1,
    resolved,
    roundNumber,
    source: 'olu_corrige',
    actorId,
  });
  if (lumiere) events.push(...lumiere.events);
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
  caseTirePeripetie,
  tirerErreurDuJour,
  enregistrerDernierJetTx,
  lireDerniersJets,
  dernierJetDuTour,
  marquerGesteSuivantTx,
  gesteDEquipeTx,
  solderAttentesDeSeanceTx,
  questionDeCaseDue,
  solderQuestionDeCaseTx,
  enregistrerTeamSpiritTx,
  ajouterLumiereTx,
  loadLumiere,
  oluCorrigeTx,
  pageDeRouteForRound,
  resolveDesMode,
  poserUnDeTx,
  effacerUnDeTx,
  unDeEnAttente,
  desPourJet,
};
