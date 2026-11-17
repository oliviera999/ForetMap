'use strict';

/**
 * « Tenir à deux » v2 — Olu commentateur (spec § 13) : table événement du journal → `moment`
 * des lignes d'Olu (`gl_tenir_olu_lignes`). Servie au client par `GET /tenir/olu` (`moments`),
 * qui tire une ligne par moment et substitue `{equipe}`, `{n}`, `{biome}`. Les lignes
 * `moment = oiseau` se disent après l'animation de l'oiseau ; Olu se fige pendant.
 */

const EVENT_MOMENTS = Object.freeze({
  tour_ouvert: 'ouverture',
  defi_trame_reussi: 'defi_trame_reussi',
  dice_roll: 'jet',
  avance_libre: 'jet',
  relance_bonus: 'question',
  qcm_answer: 'question',
  fouille: 'fouille',
  page_trouvee: 'fouille',
  page_reparee: 'fouille',
  page_revelee: 'fouille',
  page_lue: 'tenir',
  page_tenue: 'tenir',
  carnet_complet: 'tenir',
  voile_avance: 'voile',
  voile_dort: 'voile',
  voile_recul: 'voile',
  spell_cast: 'sort',
  spell_effect: 'sort',
  spell_file: 'sort',
  seuil_clos: 'seuil',
  honneur: 'seuil',
  peripetie: 'peripetie',
  chimere_validee: 'bestiaire',
  // Défi de case (lot 2) : reçu, relevé, pas encore.
  defi_case_recu: 'defi_case_recu',
  defi_case_releve: 'defi_case_releve',
  defi_case_pas_encore: 'defi_case_pas_encore',
  chapardeur: 'oiseau',
  nid_rendu: 'oiseau',
  // E5 : dit à l'écran de l'équipe concernée seulement (le client filtre sur `teamId`).
  olu_bourse_pleine: 'bourse_pleine',
});

/** Moment d'un type d'événement, ou `null` (Olu se tait). */
function momentForEvent(eventType) {
  return EVENT_MOMENTS[String(eventType || '')] || null;
}

/** Substitue `{equipe}`, `{n}`, `{biome}` (pur, partagé avec le client via `moments`). */
function renderOluLine(texte, vars = {}) {
  return String(texte || '').replace(/\{(equipe|n|biome)\}/g, (m, key) =>
    vars[key] != null && vars[key] !== '' ? String(vars[key]) : m,
  );
}

/**
 * E5 — « Vos bourses débordent » : quand au moins `seuil` membres d'une équipe sont au
 * plafond de leur ressource du peuple, Olu le dit **une fois par séance** à l'écran d'équipe
 * (événement `olu_bourse_pleine`, privé, filtré sur l'équipe côté client ; jamais en
 * projection). Idempotent par (partie, tour, équipe) grâce à `gl_game_tenir_effets`.
 * @returns {Promise<object|null>} l'événement inséré, ou `null`
 */
async function signalerBoursePleineSiBesoin(
  db,
  { gameId, teamId, teamType, roundNumber, resolved, actorId = null, seuil = 3 },
) {
  if (!gameId || !teamId || !roundNumber) return null;
  if (resolved?.olu_bourse_pleine === false) return null;
  const { resourceOfPeople } = require('./glTenir');
  const resource = resourceOfPeople(teamType);
  const cap = Number(
    resource === 'power' ? resolved?.max_power_points : resolved?.max_health_points,
  );
  if (!Number.isFinite(cap) || cap <= 0) return null;
  const rows = await db.queryAll(
    `SELECT p.health_points, p.power_points FROM gl_team_members tm
       INNER JOIN gl_players p ON p.id = tm.player_id
      WHERE tm.game_id = ? AND tm.team_id = ?`,
    [gameId, teamId],
  );
  const auPlafond = rows.filter(
    (r) => Number(resource === 'power' ? r.power_points : r.health_points) >= cap,
  ).length;
  if (auPlafond < seuil) return null;
  const deja = await db.queryOne(
    `SELECT id FROM gl_game_tenir_effets WHERE game_id = ? AND round_number = ? AND kind = 'olu_bourse_pleine' AND team_id = ? LIMIT 1`,
    [gameId, roundNumber, teamId],
  );
  if (deja) return null;
  await db.execute(
    `INSERT INTO gl_game_tenir_effets (game_id, round_number, kind, team_id, payload_json, created_at)
     VALUES (?, ?, 'olu_bourse_pleine', ?, ?, NOW())`,
    [gameId, roundNumber, teamId, JSON.stringify({ auPlafond })],
  );
  const { insertGameEvent } = require('./glGameEvents');
  return insertGameEvent(db, {
    gameId,
    teamId,
    actorType: 'system',
    actorId: actorId != null ? String(actorId) : null,
    eventType: 'olu_bourse_pleine',
    payload: {
      roundNumber: Number(roundNumber),
      teamId: Number(teamId),
      auPlafond,
      private: true,
      publicKeys: ['roundNumber', 'teamId'],
    },
  });
}

// ---------------------------------------------------------------------
// Olu « première fois » (ensemble unifié, M8)
// ---------------------------------------------------------------------

/**
 * Clés des lignes `premiere_fois` (`data/gl/tenir/olu-lignes.json`) : Olu dit le geste au moment
 * où la classe le rencontre, une seule fois par partie (ou par équipe quand la ligne porte
 * `{equipe}`). La mémoire vit dans `gl_game_olu_premieres`.
 */
const PREMIERE_FOIS_CLES = Object.freeze([
  'avancer',
  'question_pas_encore',
  'chercher',
  'chaud_froid',
  'peripetie',
  'defi_case',
  'trame',
  'role',
  'tenir',
  'erreur_du_jour',
  'voile',
  'sous_le_voile',
  'page_temoin',
  'palissement',
  'sorts',
  'lumiere',
  'marche',
  'un_de_pose',
  'un_de_joue',
  // La main (un seul écran joue à la fois) : la ligne attend le lot « plusieurs appareils ».
  'main',
  'camp',
  'cordee_offerte',
  'lettre',
]);

/**
 * Ce qu'une marche de l'escalier du chapitre 1 fait dire quand elle s'ouvre. Le voile se dit au
 * premier dé gris, la page témoin et l'erreur du jour à leur propre évènement.
 */
const CLES_DES_MODULES = Object.freeze({
  tenir: 'tenir',
  sorts: 'sorts',
  lumiere: 'lumiere',
  marche: 'marche',
});

/** Types d'évènement qui peuvent porter une ligne « première fois ». */
const PREMIERE_FOIS_EVENT_TYPES = Object.freeze([
  'tour_ouvert',
  'tour_phase',
  'tour_clos',
  'escalier_pas',
  'pas_encore',
  'fouille',
  'peripetie',
  'defi_case_recu',
  'page_trouvee',
  'olu_erreur',
  'voile_avance',
  'page_temoin',
  'team_spirit',
  'un_de_pose',
  'un_de_joue',
  'seuil_clos',
  'spell_effect',
]);

const VERDICTS_CHAUD_FROID = Object.freeze(['chaud', 'tiede', 'froid']);

/**
 * Clés candidates d'un évènement, dans l'ordre où Olu les dirait (pur). `teamId` non nul = la
 * ligne se dit pour cette équipe (elle porte `{equipe}`).
 * @param {{ eventType: string, payload?: object, teamId?: number|null,
 *   escalier?: { pas: number, modules: string[] }|null, plateau?: number|null,
 *   surface?: string|null, reglages?: object|null }} p
 *   `escalier` = `etatEscalier` de la partie (`null` hors escalier) ; `reglages` = réglages
 *   résolus de la partie : une ligne ne se dit pas pour ce que le prof a coupé (défis, Lumière,
 *   Marché) ; `surface` : au tableau, aucun écran d'équipe n'appelle de rôle.
 * @returns {Array<{ cle: string, teamId: number|null }>}
 */
function clesPremiereFois({
  eventType,
  payload = {},
  teamId = null,
  escalier = null,
  plateau,
  surface = null,
  reglages = null,
}) {
  const coupe = {
    trame: reglages?.defis === false,
    lumiere: reglages?.lumiere === false,
    marche: reglages?.marche === false,
    // L'écran d'équipe appelle les rôles : au tableau, il n'y en a pas (la ligne attendra).
    role: surface === 'tableau',
    // Au dernier plateau, il n'y a pas de chapitre suivant à regarder.
    camp: Number(plateau) === 4,
  };
  const p = payload && typeof payload === 'object' ? payload : {};
  const out = [];
  const dire = (cle, pour = null) => {
    if (!coupe[cle]) out.push({ cle, teamId: pour != null ? Number(pour) : null });
  };
  // Ce que la séance de l'escalier ouvre se dit quand elle commence.
  const marche = (seance, modules) => {
    for (const m of modules || []) if (CLES_DES_MODULES[m]) dire(CLES_DES_MODULES[m]);
    return seance;
  };
  switch (String(eventType || '')) {
    case 'tour_ouvert': {
      dire('avancer');
      if (Number(plateau) === 4) dire('cordee_offerte');
      if (escalier) {
        const { ESCALIER_MARCHES } = require('./shared/glTenirEscalierCore');
        for (const m of ESCALIER_MARCHES) {
          if (m.seance > 1 && m.seance <= escalier.pas) marche(m.seance, m.modules);
        }
      }
      break;
    }
    case 'escalier_pas':
      // « Ouvrir la suite » en cours de séance : ce qui s'ouvre se dit tout de suite. À la
      // clôture d'un tour, on range : ce sera dit à l'ouverture du suivant.
      if (p.motif === 'prof') marche(p.pas, p.modules);
      break;
    case 'tour_phase':
      if (p.phase === 'jeu') {
        dire('chercher');
        dire('role');
      }
      break;
    case 'tour_clos':
      dire('trame');
      break;
    case 'pas_encore':
      if (p.kind === 'case') dire('question_pas_encore');
      break;
    case 'fouille':
      if (VERDICTS_CHAUD_FROID.includes(String(p.verdict || ''))) dire('chaud_froid');
      break;
    case 'peripetie':
      dire('peripetie');
      break;
    case 'defi_case_recu':
      dire('defi_case');
      break;
    case 'page_trouvee':
      dire('tenir');
      break;
    case 'olu_erreur':
      dire('erreur_du_jour');
      break;
    case 'voile_avance':
      dire('voile');
      for (const t of Array.isArray(p.teamsUnderVoile) ? p.teamsUnderVoile : []) {
        dire('sous_le_voile', t);
      }
      if (Array.isArray(p.pagesPalies) && p.pagesPalies.length) dire('palissement');
      break;
    case 'page_temoin':
      dire('page_temoin');
      break;
    case 'team_spirit':
      dire('lumiere');
      break;
    case 'un_de_pose':
      dire('un_de_pose');
      break;
    case 'un_de_joue':
      if (teamId != null) dire('un_de_joue', teamId);
      break;
    case 'seuil_clos':
      dire('camp');
      break;
    case 'spell_effect':
      if (p.type === 'lettre') dire('lettre');
      break;
    default:
      break;
  }
  return out;
}

let premiereFoisCache = { at: 0, lignes: null };
const PREMIERE_FOIS_CACHE_MS = 60 * 1000;

function invalidatePremiereFoisCache() {
  premiereFoisCache = { at: 0, lignes: null };
}

/** Lignes `premiere_fois` actives, par clé : `Map(cle → { id, seance, parEquipe })`. */
async function loadPremiereFoisLignes(db) {
  if (premiereFoisCache.lignes && Date.now() - premiereFoisCache.at < PREMIERE_FOIS_CACHE_MS) {
    return premiereFoisCache.lignes;
  }
  const rows = await db.queryAll(
    `SELECT id, cle, seance_escalier, texte FROM gl_tenir_olu_lignes
      WHERE moment = 'premiere_fois' AND actif = 1 AND cle IS NOT NULL`,
  );
  const lignes = new Map(
    rows.map((r) => [
      String(r.cle),
      {
        id: String(r.id),
        seance: Number(r.seance_escalier) || 0,
        parEquipe: /\{equipe\}/.test(String(r.texte || '')),
      },
    ]),
  );
  premiereFoisCache = { at: Date.now(), lignes };
  return lignes;
}

/**
 * Lignes « première fois » à dire avec cet évènement : `[{ id, teamId? }]`, dans l'ordre. Chaque
 * clé n'est dite qu'une fois par partie (par équipe quand la ligne porte `{equipe}`) ; dans
 * l'escalier du chapitre 1, jamais avant la séance qui ouvre la nouveauté.
 *
 * La mémoire s'écrit **dans la transaction** de l'évènement : un geste annulé n'a rien « dit ».
 * Une lecture sans verrou passe d'abord — une fois la ligne dite, plus rien n'est verrouillé ;
 * seule la toute première occurrence d'une clé peut faire attendre un geste simultané, le temps
 * que l'autre se valide.
 * @param {object} db exécuteur de l'évènement (transaction ou module database)
 * @returns {Promise<Array<{ id: string, teamId?: number }>>}
 */
async function premieresFoisPourEvenement(db, { gameId, teamId = null, eventType, payload }) {
  if (!PREMIERE_FOIS_EVENT_TYPES.includes(String(eventType || ''))) return [];
  const game = await db.queryOne(
    `SELECT g.tenir_profil, g.tenir_overrides_json, g.tenir_surface, ch.plateau_number
       FROM gl_games g LEFT JOIN gl_chapters ch ON ch.id = g.chapter_id WHERE g.id = ? LIMIT 1`,
    [gameId],
  );
  // Une partie sans profil joue les règles classiques : Olu commentateur n'y est pas.
  if (!game?.tenir_profil) return [];
  const { resolveTenirSettings, resolveSurface } = require('./glTenir');
  const { etatEscalier } = require('./shared/glTenirEscalierCore');
  const settings = await require('./glSettings').getGameplaySettings();
  const reglages = resolveTenirSettings(settings, game);
  const escalier = etatEscalier(reglages);
  const candidates = clesPremiereFois({
    eventType,
    payload,
    teamId,
    escalier,
    plateau: game.plateau_number,
    surface: resolveSurface(game, settings),
    reglages,
  });
  if (!candidates.length) return [];
  const lignes = await loadPremiereFoisLignes(db);
  const out = [];
  for (const c of candidates) {
    const ligne = lignes.get(c.cle);
    if (!ligne) continue;
    // Escalier : la nouveauté ne se dit pas avant sa séance (elle n'est pas encore ouverte).
    if (escalier && ligne.seance > escalier.pas) continue;
    const pour = ligne.parEquipe ? Number(c.teamId ?? teamId) || 0 : 0;
    if (ligne.parEquipe && !pour) continue;
    const deja = await db.queryOne(
      'SELECT 1 AS ok FROM gl_game_olu_premieres WHERE game_id = ? AND cle = ? AND team_id = ? LIMIT 1',
      [gameId, c.cle, pour],
    );
    if (deja) continue;
    const ecrit = await db.execute(
      'INSERT IGNORE INTO gl_game_olu_premieres (game_id, cle, team_id, created_at) VALUES (?, ?, ?, NOW())',
      [gameId, c.cle, pour],
    );
    if (!Number(ecrit?.affectedRows)) continue;
    out.push(pour ? { id: ligne.id, teamId: pour } : { id: ligne.id });
  }
  return out;
}

/**
 * Payload d'un évènement, complété de ses lignes « première fois » (`olu: [{ id, teamId? }]`).
 * Un payload privé garde la clé `olu` publique : la ligne se dit à toute la classe. Ne lève
 * jamais : une ligne d'Olu ne doit pas empêcher un geste de jeu.
 */
async function avecPremieresFois(db, { gameId, teamId = null, eventType, payload }) {
  if (!PREMIERE_FOIS_EVENT_TYPES.includes(String(eventType || ''))) return payload;
  try {
    const olu = await premieresFoisPourEvenement(db, { gameId, teamId, eventType, payload });
    if (!olu.length) return payload;
    const base = payload && typeof payload === 'object' ? payload : {};
    return {
      ...base,
      olu,
      ...(base.private === true && Array.isArray(base.publicKeys)
        ? { publicKeys: [...new Set([...base.publicKeys, 'olu'])] }
        : {}),
    };
  } catch (err) {
    // Base en retard d'une migration (table ou colonne absente) : Olu se tait, le jeu continue.
    const silencieux = [1146, 1054].includes(err?.errno);
    if (!silencieux) {
      require('./logger').warn({ err: err?.message, gameId, eventType }, '[gl-olu] première fois');
    }
    return payload;
  }
}

module.exports = {
  EVENT_MOMENTS,
  PREMIERE_FOIS_CLES,
  PREMIERE_FOIS_EVENT_TYPES,
  momentForEvent,
  renderOluLine,
  signalerBoursePleineSiBesoin,
  clesPremiereFois,
  premieresFoisPourEvenement,
  avecPremieresFois,
  invalidatePremiereFoisCache,
};
