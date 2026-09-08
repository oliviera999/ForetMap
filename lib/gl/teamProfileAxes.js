'use strict';

/**
 * Six axes de profil joueur pour la composition d'équipes GL (lot v2) —
 * docs/GL_EQUIPES_AUTO_CONCEPTION.md § 3.
 *
 * Deux parties strictement séparées :
 *   - `loadProfileSignals` : une requête agrégée par source existante (aucune table nouvelle,
 *     aucun recueil supplémentaire) ⇒ compteurs bruts par joueur ;
 *   - `normalizeAxes` : fonction PURE qui transforme ces compteurs en scores 0–1 relatifs à la
 *     classe, avec le garde-fou statistique obligatoire (shrinkage, § 3.1) :
 *         score_ajusté = (n · score_brut + k · moyenne_classe) / (n + k),  k = 10
 *     Un joueur sans donnée (n = 0) reçoit exactement la moyenne de classe.
 *
 * Rien n'est persisté ; les scores ne sortent jamais du serveur (§ 11) : l'orchestrateur ne
 * s'en sert que pour alimenter la fonction de coût du moteur.
 */

const SHRINKAGE_K = 10;

/** Axes, dans l'ordre d'affichage de la conception. */
const AXES = Object.freeze([
  'savoir',
  'exploration',
  'echange',
  'generosite',
  'initiative',
  'assiduite',
]);

/** Axes exprimés en taux (et non en volume d'actions rapporté à la classe). */
const RATE_AXES = new Set(['savoir', 'assiduite']);

/** Rôle dominant : les quatre axes « jouables » (§ 4, recette `roles`). */
const ROLE_AXES = Object.freeze({
  savant: 'savoir',
  eclaireur: 'exploration',
  negociant: 'echange',
  gardien: 'generosite',
});

function emptyRaw(playerId) {
  return {
    playerId: Number(playerId),
    qcmTotal: 0,
    qcmCorrect: 0,
    acknowledgements: 0,
    feuilletsDiscovered: 0,
    moves: 0,
    tradesCompleted: 0,
    tradeMessages: 0,
    forumPosts: 0,
    spellGems: 0,
    spellHearts: 0,
    spellContributions: 0,
    actionsEmitted: 0,
    actionsAccepted: 0,
    spellCoordinations: 0,
    lastSeenDays: null,
    eventsTotal: 0,
  };
}

function placeholders(ids) {
  return ids.map(() => '?').join(', ');
}

/**
 * Charge les compteurs bruts des joueurs donnés (une requête par source).
 *
 * @param {{ classId: number, playerIds: number[] }} params
 * @param {{ queryAll: Function }} deps
 * @returns {Promise<Map<number, object>>}  playerId → compteurs (cf. emptyRaw)
 */
async function loadProfileSignals({ classId, playerIds }, { queryAll }) {
  const ids = [
    ...new Set((playerIds || []).map(Number).filter((n) => Number.isFinite(n) && n > 0)),
  ];
  const raw = new Map(ids.map((id) => [id, emptyRaw(id)]));
  if (ids.length === 0) return raw;
  const idStrings = ids.map(String);
  const ph = placeholders(ids);
  const set = (row, key, field) => {
    const target = raw.get(Number(row[key]));
    if (target) target[field] = Number(row.n) || 0;
  };

  // Savoir — QCM (bonnes réponses / tentatives) + « marqué comme appris ».
  const qcm = await queryAll(
    `SELECT reader_user_id AS pid, COUNT(*) AS total, SUM(is_correct = 1) AS correct
       FROM gl_qcm_attempts
      WHERE reader_user_type = 'gl_player' AND reader_user_id IN (${ph})
      GROUP BY reader_user_id`,
    idStrings,
  );
  for (const row of qcm) {
    const target = raw.get(Number(row.pid));
    if (!target) continue;
    target.qcmTotal = Number(row.total) || 0;
    target.qcmCorrect = Number(row.correct) || 0;
  }
  const acks = await queryAll(
    `SELECT reader_user_id AS pid, COUNT(*) AS n
       FROM gl_learning_acknowledgements
      WHERE reader_user_type = 'gl_player' AND reader_user_id IN (${ph})
      GROUP BY reader_user_id`,
    idStrings,
  );
  acks.forEach((row) => set(row, 'pid', 'acknowledgements'));

  // Exploration — feuillets trouvés soi-même + déplacements joués par l'équipe du joueur.
  const feuillets = await queryAll(
    `SELECT player_id AS pid, COUNT(*) AS n
       FROM gl_player_feuillet_states
      WHERE acquired_via = 'decouverte' AND player_id IN (${ph})
      GROUP BY player_id`,
    ids,
  );
  feuillets.forEach((row) => set(row, 'pid', 'feuilletsDiscovered'));
  // `actor_type='team'` + `actor_id` = joueur qui a agi (déplacement joueur, cf. routes/gl/games.js).
  const moves = await queryAll(
    `SELECT e.actor_id AS pid, COUNT(*) AS n
       FROM gl_game_events e
       INNER JOIN gl_games g ON g.id = e.game_id
      WHERE g.class_id = ? AND e.event_type = 'move' AND e.actor_type = 'team'
        AND e.actor_id IN (${ph})
      GROUP BY e.actor_id`,
    [classId, ...idStrings],
  );
  moves.forEach((row) => set(row, 'pid', 'moves'));

  // Échange — trocs aboutis, messages de négociation, messages de forum.
  const trades = await queryAll(
    `SELECT s.player_id AS pid, COUNT(*) AS n
       FROM gl_market_trade_sides s
       INNER JOIN gl_market_trades t ON t.id = s.trade_id
      WHERE t.status = 'completed' AND s.player_id IN (${ph})
      GROUP BY s.player_id`,
    ids,
  );
  trades.forEach((row) => set(row, 'pid', 'tradesCompleted'));
  const tradeMessages = await queryAll(
    `SELECT author_player_id AS pid, COUNT(*) AS n
       FROM gl_market_trade_messages
      WHERE author_player_id IN (${ph})
      GROUP BY author_player_id`,
    ids,
  );
  tradeMessages.forEach((row) => set(row, 'pid', 'tradeMessages'));
  const forum = await queryAll(
    `SELECT author_user_id AS pid, COUNT(*) AS n
       FROM gl_forum_posts
      WHERE author_user_type = 'gl_player' AND is_deleted = 0 AND author_user_id IN (${ph})
      GROUP BY author_user_id`,
    idStrings,
  );
  forum.forEach((row) => set(row, 'pid', 'forumPosts'));

  // Générosité / vitalité — cœurs et gemmes engagés dans des sortilèges.
  const spells = await queryAll(
    `SELECT player_id AS pid, COUNT(*) AS n, SUM(gems) AS gems, SUM(hearts) AS hearts
       FROM gl_spell_cast_contributions
      WHERE (gems > 0 OR hearts > 0) AND player_id IN (${ph})
      GROUP BY player_id`,
    ids,
  );
  for (const row of spells) {
    const target = raw.get(Number(row.pid));
    if (!target) continue;
    target.spellContributions = Number(row.n) || 0;
    target.spellGems = Number(row.gems) || 0;
    target.spellHearts = Number(row.hearts) || 0;
  }

  // Initiative — demandes d'action émises / acceptées, coordination de sorts pour autrui.
  const actions = await queryAll(
    `SELECT player_id AS pid, COUNT(*) AS n, SUM(status = 'accepted') AS accepted
       FROM gl_action_requests
      WHERE player_id IN (${ph})
      GROUP BY player_id`,
    ids,
  );
  for (const row of actions) {
    const target = raw.get(Number(row.pid));
    if (!target) continue;
    target.actionsEmitted = Number(row.n) || 0;
    target.actionsAccepted = Number(row.accepted) || 0;
  }
  const coordinations = await queryAll(
    `SELECT updated_by_player_id AS pid, COUNT(*) AS n
       FROM gl_spell_cast_contributions
      WHERE updated_by_player_id <> player_id AND updated_by_player_id IN (${ph})
      GROUP BY updated_by_player_id`,
    ids,
  );
  coordinations.forEach((row) => set(row, 'pid', 'spellCoordinations'));

  // Assiduité — dernière connexion et densité d'événements portés par le joueur.
  const seen = await queryAll(
    `SELECT id AS pid, TIMESTAMPDIFF(DAY, last_seen, NOW()) AS days
       FROM gl_players
      WHERE id IN (${ph})`,
    ids,
  );
  for (const row of seen) {
    const target = raw.get(Number(row.pid));
    if (!target) continue;
    target.lastSeenDays = row.days == null ? null : Math.max(0, Number(row.days));
  }
  const events = await queryAll(
    `SELECT e.actor_id AS pid, COUNT(*) AS n
       FROM gl_game_events e
       INNER JOIN gl_games g ON g.id = e.game_id
      WHERE g.class_id = ? AND e.actor_type = 'team' AND e.actor_id IN (${ph})
      GROUP BY e.actor_id`,
    [classId, ...idStrings],
  );
  events.forEach((row) => set(row, 'pid', 'eventsTotal'));

  return raw;
}

/**
 * Score brut et volume d'observation par axe. Le volume `n` est ce qui pilote le shrinkage :
 * plus il est faible, plus le score est ramené vers la moyenne de classe.
 * Les scores « relatifs » (comptes) sont rapportés au maximum observé dans la classe.
 */
function rawAxis(r, axis, maxima) {
  const rel = (value, max) => (max > 0 ? Math.min(1, value / max) : 0);
  switch (axis) {
    case 'savoir': {
      const n = r.qcmTotal + r.acknowledgements;
      return { score: n > 0 ? (r.qcmCorrect + r.acknowledgements) / n : 0, n };
    }
    case 'exploration': {
      const n = r.feuilletsDiscovered + r.moves;
      return { score: rel(n, maxima.exploration), n };
    }
    case 'echange': {
      const n = r.tradesCompleted + r.tradeMessages + r.forumPosts;
      return { score: rel(n, maxima.echange), n };
    }
    case 'generosite': {
      const n = r.spellContributions;
      return { score: rel(r.spellGems + r.spellHearts, maxima.generosite), n };
    }
    case 'initiative': {
      const n = r.actionsEmitted + r.spellCoordinations;
      return { score: rel(r.actionsAccepted + r.spellCoordinations, maxima.initiative), n };
    }
    case 'assiduite': {
      // Présence récente (30 jours ⇒ 0) pondérée par l'activité observée.
      const recency =
        r.lastSeenDays == null ? 0 : Math.max(0, 1 - Math.min(30, r.lastSeenDays) / 30);
      const density = rel(r.eventsTotal, maxima.assiduite);
      const n = r.eventsTotal + (r.lastSeenDays == null ? 0 : 1);
      return { score: n > 0 ? (recency + density) / 2 : 0, n };
    }
    default:
      return { score: 0, n: 0 };
  }
}

function computeMaxima(rows) {
  const maxima = { exploration: 0, echange: 0, generosite: 0, initiative: 0, assiduite: 0 };
  for (const r of rows) {
    maxima.exploration = Math.max(maxima.exploration, r.feuilletsDiscovered + r.moves);
    maxima.echange = Math.max(maxima.echange, r.tradesCompleted + r.tradeMessages + r.forumPosts);
    maxima.generosite = Math.max(maxima.generosite, r.spellGems + r.spellHearts);
    maxima.initiative = Math.max(maxima.initiative, r.actionsAccepted + r.spellCoordinations);
    maxima.assiduite = Math.max(maxima.assiduite, r.eventsTotal);
  }
  return maxima;
}

/**
 * Normalise les compteurs bruts en profils (PUR).
 *
 * @param {{ raw: Map<number, object>|object[], k?: number }} params
 * @returns {{ profiles: Map<number, {axes: object, composite: number, role: string, volume: number}>, classMeans: object, k: number }}
 */
function normalizeAxes({ raw, k = SHRINKAGE_K }) {
  const rows = raw instanceof Map ? [...raw.values()] : Array.isArray(raw) ? raw : [];
  const shrink = Number.isFinite(Number(k)) && Number(k) >= 0 ? Number(k) : SHRINKAGE_K;
  const profiles = new Map();
  const classMeans = {};
  if (rows.length === 0) return { profiles, classMeans, k: shrink };

  const maxima = computeMaxima(rows);
  const perAxis = {};
  for (const axis of AXES) {
    const observed = rows.map((r) => rawAxis(r, axis, maxima));
    // Moyenne de classe : pour un taux (savoir, assiduité) seuls les joueurs observés comptent
    // — un élève sans QCM n'a pas « 0 % de réussite ». Pour un compte d'actions, zéro action
    // est une vraie observation : tous les joueurs entrent dans la moyenne.
    const scope = RATE_AXES.has(axis) ? observed.filter((o) => o.n > 0) : observed;
    const mean = scope.length > 0 ? scope.reduce((acc, o) => acc + o.score, 0) / scope.length : 0.5;
    classMeans[axis] = mean;
    perAxis[axis] = observed.map((o) => ({
      n: o.n,
      adjusted: (o.n * o.score + shrink * mean) / (o.n + shrink),
    }));
  }

  rows.forEach((r, idx) => {
    const axes = {};
    let volume = 0;
    for (const axis of AXES) {
      axes[axis] = perAxis[axis][idx].adjusted;
      volume += perAxis[axis][idx].n;
    }
    const composite = AXES.reduce((acc, axis) => acc + axes[axis], 0) / AXES.length;
    // Rôle dominant : écart le plus fort à la moyenne de classe parmi les quatre axes jouables ;
    // à égalité (aucune donnée), l'ordre de déclaration tranche de façon déterministe.
    let role = 'savant';
    let best = -Infinity;
    for (const [candidate, axis] of Object.entries(ROLE_AXES)) {
      const gap = axes[axis] - classMeans[axis];
      if (gap > best + 1e-12) {
        best = gap;
        role = candidate;
      }
    }
    profiles.set(Number(r.playerId), { axes, composite, role, volume });
  });

  return { profiles, classMeans, k: shrink };
}

/**
 * Raccourci : charge puis normalise. Renvoie la Map attendue par le moteur
 * (`profiles` : playerId → { composite, role, … }).
 */
async function loadPlayerProfiles({ classId, playerIds, k = SHRINKAGE_K }, deps) {
  const raw = await loadProfileSignals({ classId, playerIds }, deps);
  return normalizeAxes({ raw, k });
}

module.exports = {
  AXES,
  ROLE_AXES,
  SHRINKAGE_K,
  emptyRaw,
  loadProfileSignals,
  normalizeAxes,
  loadPlayerProfiles,
};
