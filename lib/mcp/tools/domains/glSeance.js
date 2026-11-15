'use strict';

/**
 * `gl_seance` — avant et après une séance « Tenir à deux » (domaine `gl`, **lecture seule**).
 *
 * - `avant` (`class_id`) : ce qu'il faut savoir en entrant en classe — catalogues à jour (écarts
 *   dépôt / base), partie « Tenir » en cours de la classe, tour et phase, lien de classe créé
 *   (jamais le code ni le jeton), défis de case à juger, et la liste courte « à faire » ;
 * - `apres` (`game_id`, `round_number?`) : ce que la séance a laissé — durées par phase du tour,
 *   demandes au prof restées en attente (par type), défis de case reçus, questions posées et
 *   réponses justes.
 *
 * Lecture SQL READ ONLY sous vérification du staff G&L (`glCommon.readGl`). Aucun nom d'élève :
 * les équipes sont nommées, les élèves ne sont jamais listés. Le critère d'un défi (réservé au
 * prof) n'est pas recopié ici : il se lit dans la console.
 */

const { z } = require('zod');
const { defineDomainTool, req } = require('./factory');
const { gameIdParam, gameplaySettings, loadGameOrThrow, readGl } = require('./glCommon');
const { formatGame, loadGamesList, toIso } = require('../../../glDiagnostic');

const TOOL = 'gl_seance';
const EN_COURS = ['live', 'paused'];

/** Requête tolérante : `[]` si la table n'existe pas encore (base en retard d'une migration). */
async function rowsOrEmpty(db, sql, params) {
  try {
    return await db.queryAll(sql, params);
  } catch (err) {
    if (err?.errno === 1146 || err?.code === 'ER_NO_SUCH_TABLE') return [];
    throw err;
  }
}

async function loadCatalogues(db) {
  const { describeTenirCatalogues } = require('../../../glTenirSync');
  const etat = await describeTenirCatalogues(db);
  return {
    aJour: etat.ecarts.length === 0,
    ecarts: etat.ecarts,
    fichiers: etat.fichiers.length,
    syncDesactivee: etat.syncDesactivee,
  };
}

async function loadRound(db, gameId, roundNumber) {
  if (!roundNumber) return null;
  const row = await db.queryOne(
    `SELECT round_number, phase, started_at, ended_at FROM gl_game_rounds
      WHERE game_id = ? AND round_number = ? LIMIT 1`,
    [gameId, roundNumber],
  );
  if (!row) return null;
  return {
    number: Number(row.round_number),
    phase: row.phase || null,
    startedAt: toIso(row.started_at),
    endedAt: toIso(row.ended_at),
  };
}

/** Défis de case d'une partie (titre du catalogue, nom de l'équipe), sans le critère. */
async function loadDefis(db, gameId, { statut = null, roundNumber = null } = {}) {
  const where = ['d.game_id = ?'];
  const params = [gameId];
  if (statut) {
    where.push('d.statut = ?');
    params.push(statut);
  }
  if (roundNumber != null) {
    where.push('d.round_number = ?');
    params.push(roundNumber);
  }
  const rows = await rowsOrEmpty(
    db,
    `SELECT d.id, d.team_id, t.name AS team_name, d.defi_code, d.round_number, d.statut,
            c.titre, c.notion
       FROM gl_game_defis_case d
       LEFT JOIN gl_teams t ON t.id = d.team_id
       LEFT JOIN gl_tenir_defis_cases c ON c.code = d.defi_code
      WHERE ${where.join(' AND ')}
      ORDER BY d.id ASC`,
    params,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    teamId: Number(r.team_id),
    teamName: r.team_name || null,
    code: String(r.defi_code),
    titre: r.titre || String(r.defi_code),
    notion: r.notion || null,
    roundNumber: Number(r.round_number) || 0,
    statut: String(r.statut),
  }));
}

/**
 * Défis de la Trame de la partie : par type, unités réussies (élèves distincts) et défis en
 * cours. Des comptes seulement — aucun nom d'élève, aucun rang.
 */
async function loadDefisTrame(db, gameId) {
  const reussites = await rowsOrEmpty(
    db,
    `SELECT type, COUNT(*) AS reussites, COUNT(DISTINCT player_id) AS eleves,
            SUM(page_feuillet_code IS NOT NULL) AS pages
       FROM gl_trame_reussites WHERE game_id = ? GROUP BY type`,
    [gameId],
  );
  const enCours = await rowsOrEmpty(
    db,
    `SELECT type, COUNT(*) AS n FROM gl_trame_defis
      WHERE game_id = ? AND statut = 'en_cours' GROUP BY type`,
    [gameId],
  );
  const parType = {};
  for (const type of ['retisser', 'reparer', 'alteree', 'fils']) {
    const r = reussites.find((x) => String(x.type) === type);
    const c = enCours.find((x) => String(x.type) === type);
    parType[type] = {
      reussites: Number(r?.reussites) || 0,
      eleves: Number(r?.eleves) || 0,
      pages: Number(r?.pages) || 0,
      enCours: Number(c?.n) || 0,
    };
  }
  return parType;
}

async function loadClassLink(db, classId) {
  const [row] = await rowsOrEmpty(
    db,
    'SELECT created_at, revoked_at FROM gl_class_links WHERE class_id = ? LIMIT 1',
    [classId],
  );
  const cree = !!row && row.revoked_at == null;
  // Le code et le jeton du lien ne sortent jamais d'ici : seule son existence est utile.
  return { cree, creeLe: cree ? toIso(row.created_at) : null };
}

async function loadSessionsOuvertes(db, gameId) {
  const [row] = await rowsOrEmpty(
    db,
    `SELECT COUNT(*) AS n FROM gl_guest_tokens
      WHERE game_id = ? AND kind = 'team_session' AND revoked_at IS NULL AND expires_at > NOW()`,
    [gameId],
  );
  return Number(row?.n) || 0;
}

/** Demandes au prof encore en attente, comptées par type (aucun payload recopié). */
async function loadDemandesEnAttente(db, gameId) {
  const rows = await rowsOrEmpty(
    db,
    `SELECT kind, COUNT(*) AS n, MIN(round_number) AS depuis FROM gl_game_demandes
      WHERE game_id = ? AND statut = 'en_attente' GROUP BY kind ORDER BY kind ASC`,
    [gameId],
  );
  const { DEMANDE_LIBELLES } = require('../../../glDemandes');
  const parType = rows.map((r) => ({
    kind: String(r.kind),
    titre: DEMANDE_LIBELLES?.[r.kind]?.titre || String(r.kind),
    nombre: Number(r.n) || 0,
    depuisLeTour: Number(r.depuis) || 0,
  }));
  return { total: parType.reduce((a, b) => a + b.nombre, 0), parType };
}

/** Questions de case posées et réponses données pendant un tour (fenêtre du tour). */
async function loadQuestions(db, gameId, round) {
  if (!round?.startedAt) return { posees: 0, reponses: 0, justes: 0 };
  const rows = await db.queryAll(
    `SELECT event_type, payload_json FROM gl_game_events
      WHERE game_id = ? AND event_type IN ('marker_question_presented', 'qcm_answer')
        AND created_at >= (SELECT started_at FROM gl_game_rounds WHERE game_id = ? AND round_number = ?)
        AND created_at <= COALESCE(
              (SELECT ended_at FROM gl_game_rounds WHERE game_id = ? AND round_number = ?), NOW())`,
    [gameId, gameId, round.number, gameId, round.number],
  );
  let posees = 0;
  let reponses = 0;
  let justes = 0;
  for (const r of rows) {
    if (r.event_type === 'marker_question_presented') {
      posees += 1;
      continue;
    }
    reponses += 1;
    try {
      if (JSON.parse(String(r.payload_json || '{}')).correct === true) justes += 1;
    } catch (_) {
      /* payload illisible : la réponse est comptée, pas sa justesse */
    }
  }
  return { posees, reponses, justes };
}

async function loadDurees(db, gameId, roundNumber) {
  const { dureesParTour, formatDureesTour } = require('../../../glRoundPhases');
  const rows = await rowsOrEmpty(
    db,
    `SELECT round_number, phase, started_at, ended_at FROM gl_game_round_phases
      WHERE game_id = ? AND round_number = ? ORDER BY started_at ASC`,
    [gameId, roundNumber],
  );
  const [mesure] = dureesParTour(rows);
  if (!mesure) return null;
  return {
    phases: mesure.phases,
    totalSecondes: mesure.totalSecondes,
    complet: mesure.complet,
    libelle: formatDureesTour(mesure.phases),
  };
}

const tool = defineDomainTool({
  name: TOOL,
  domain: 'gl',
  title: 'G&L : avant et après une séance « Tenir à deux »',
  intro:
    'Séance « Tenir à deux » de Gnomes & Licornes, en lecture seule. avant (class_id) : catalogues à jour, partie en cours de la classe, tour et phase, lien de classe créé, sessions d’équipe ouvertes, défis de case à juger, liste « à faire ». apres (game_id, round_number optionnel) : durées par phase du tour, demandes au prof restées en attente, défis de case reçus, questions posées et réponses justes, défis de la Trame de la partie (comptes par type). Aucun nom d’élève, jamais de classement. Réservé au staff G&L.',
  actions: {
    avant: {
      summary:
        'avant la séance : catalogues, partie en cours de la classe, phase, lien de classe, défis à juger',
      params: { class_id: req(z.number().int().min(1).describe('Classe G&L (gl_classes.id)')) },
      run: async (args, ctx) => {
        const settings = await gameplaySettings();
        return readGl(ctx, async (db) => {
          const { isTenirGame } = require('../../../glTenir');
          const catalogues = await loadCatalogues(db);
          const lien = await loadClassLink(db, args.class_id);
          const parties = (await loadGamesList(db, { classId: args.class_id, tenir: true })).filter(
            (g) => EN_COURS.includes(String(g.status)),
          );
          const row = parties[0] || null;
          const aFaire = [];
          if (!catalogues.aJour) {
            aFaire.push(
              `Catalogues en écart (${catalogues.ecarts.join(', ')}) : gl_tenir_catalogues sync.`,
            );
          }
          if (!lien.cree) {
            aFaire.push('Aucun lien de classe : le créer depuis la console (« QR de la classe »).');
          }
          if (!row) {
            aFaire.push('Aucune partie « Tenir à deux » en cours pour cette classe.');
            return { classId: args.class_id, catalogues, lienDeClasse: lien, partie: null, aFaire };
          }
          const gameId = Number(row.id);
          const game = await loadGameOrThrow(db, gameId);
          const tour = await loadRound(db, gameId, Number(game.current_round_number) || 0);
          const defisAJuger = await loadDefis(db, gameId, { statut: 'a_preparer' });
          if (defisAJuger.length) {
            aFaire.push(`${defisAJuger.length} défi(s) de case à juger en ouvrant la séance.`);
          }
          const demandes = await loadDemandesEnAttente(db, gameId);
          return {
            classId: args.class_id,
            catalogues,
            lienDeClasse: lien,
            partie: formatGame(game, { tenir: isTenirGame(settings, game) }),
            autresPartiesEnCours: parties.slice(1).map((g) => Number(g.id)),
            tour,
            sessionsEquipeOuvertes: await loadSessionsOuvertes(db, gameId),
            defisAJuger,
            demandesEnAttente: demandes.total,
            aFaire,
          };
        });
      },
    },
    apres: {
      summary:
        'après la séance : durées par phase, demandes restées en attente, défis reçus, questions posées, défis de la Trame',
      params: {
        game_id: req(gameIdParam),
        round_number: z.number().int().min(1).describe('Tour à relire (défaut : le tour courant)'),
      },
      run: (args, ctx) =>
        readGl(ctx, async (db) => {
          const game = await loadGameOrThrow(db, args.game_id);
          const roundNumber = args.round_number ?? (Number(game.current_round_number) || 0);
          const tour = await loadRound(db, args.game_id, roundNumber);
          return {
            partie: formatGame(game),
            tour,
            durees: roundNumber ? await loadDurees(db, args.game_id, roundNumber) : null,
            demandesEnAttente: await loadDemandesEnAttente(db, args.game_id),
            defisRecus: roundNumber ? await loadDefis(db, args.game_id, { roundNumber }) : [],
            questions: await loadQuestions(db, args.game_id, tour),
            defisTrame: await loadDefisTrame(db, args.game_id),
            note: 'Un tour clos ne laisse aucune demande de dés, de jet ou de présence ; un défi de case attend la séance suivante, les propositions d’élèves se relisent jusqu’au Seuil.',
          };
        }),
    },
  },
});

module.exports = { buildGlSeanceTool: () => tool };
