'use strict';

/**
 * Mesures d'un chapitre joué (le **prof virtuel** lit la base : pages, événements, grand livre
 * `gl_resource_ledger`, bourses) et des badges (`GET /api/gl/rewards/me`, route d'une autre
 * étape : 404 → « badges non disponibles »). Aucune donnée nominative : identifiants et
 * agrégats seulement.
 */

const { spearman, gini, pourcent, arrondi } = require('./stats');

const CAUSES_MARCHE = new Set(['don', 'echange', 'parure']);

function parseJson(raw, fallback = null) {
  if (raw == null) return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch (_) {
    return fallback;
  }
}

async function etatsPages(db, gameId) {
  const rows = await db.queryAll(
    `SELECT z.zone_key, z.rang_case, p.etat, p.trouvee_par_team_id, p.tenue_par_team_id, p.reparee_at, p.palissement_json
       FROM gl_game_chasse_pages p INNER JOIN gl_chasse_zones z ON z.id = p.zone_id WHERE p.game_id = ? ORDER BY z.ordre ASC`,
    [gameId],
  );
  return rows.map((r) => ({
    zoneKey: String(r.zone_key),
    rangCase: r.rang_case != null ? Number(r.rang_case) : null,
    etat: String(r.etat),
    trouveeParTeamId: r.trouvee_par_team_id != null ? Number(r.trouvee_par_team_id) : null,
    tenueParTeamId: r.tenue_par_team_id != null ? Number(r.tenue_par_team_id) : null,
    reparee: !!r.reparee_at,
    palissement: parseJson(r.palissement_json, {}) || {},
  }));
}

async function evenements(db, gameId, types) {
  const rows = await db.queryAll(
    `SELECT id, team_id, event_type, payload_json FROM gl_game_events WHERE game_id = ? AND event_type IN (${types.map(() => '?').join(', ')}) ORDER BY id ASC`,
    [gameId, ...types],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    teamId: r.team_id != null ? Number(r.team_id) : null,
    type: String(r.event_type),
    payload: parseJson(r.payload_json, {}) || {},
  }));
}

/** Badges d'un élève via l'API (route livrée par une autre étape) ; `null` si indisponible. */
async function lireBadges(ctx, joueur, equipe) {
  const res = await ctx.client.appel({
    token: joueur.token,
    method: 'get',
    path: '/api/gl/rewards/me',
    acteur: 'eleve',
    membres: equipe ? equipe.membres : [joueur.id],
    geste: 'badges',
  });
  if (res.status !== 200) return null;
  return res.body;
}

async function mesurerBadges(ctx) {
  const premier = [...ctx.joueurs.values()][0];
  if (!premier) return { disponibles: false, raison: 'aucun élève' };
  const essai = await lireBadges(ctx, premier, ctx.equipeParId(premier.teamId));
  if (!essai) {
    const nb = await ctx.db.queryOne(
      'SELECT COUNT(*) AS n, COUNT(DISTINCT player_id) AS joueurs FROM gl_player_badges WHERE game_id = ?',
      [ctx.partie.gameId],
    );
    return {
      disponibles: false,
      raison: 'badges non disponibles (GET /api/gl/rewards/me absent dans ce worktree)',
      approximation: { badgesApp: Number(nb?.n) || 0, joueursAvecBadge: Number(nb?.joueurs) || 0 },
    };
  }
  const parJoueur = [];
  const familles = {};
  for (const j of ctx.joueurs.values()) {
    const body = j === premier ? essai : await lireBadges(ctx, j, ctx.equipeParId(j.teamId));
    const rewards = Array.isArray(body?.rewards) ? body.rewards : [];
    const paliers = rewards.filter((r) => r.tier != null || r.family != null);
    for (const r of rewards)
      familles[r.family || 'autre'] = (familles[r.family || 'autre'] || 0) + 1;
    parJoueur.push({ justesse: j.persona.justesse, paliers: paliers.length });
  }
  return {
    disponibles: true,
    elevesAvecPalierPct: pourcent(parJoueur.filter((p) => p.paliers > 0).length, parJoueur.length),
    familles,
    spearmanJustessePaliers: spearman(
      parJoueur.map((p) => p.justesse),
      parJoueur.map((p) => p.paliers),
    ),
  };
}

/**
 * Mesures d'un chapitre (à appeler après la clôture).
 * @param {object} ctx contexte de chapitre
 * @param {{ seances: number, finParCamp: boolean }} deroule
 */
async function mesurerChapitre(ctx, deroule) {
  const { db } = ctx;
  const gameId = ctx.partie.gameId;
  const equipes = ctx.partie.equipes;
  const typeDe = new Map(equipes.map((e) => [e.id, e.type]));
  const pages = await etatsPages(db, gameId);
  const n = pages.length || 1;
  const evts = await evenements(db, gameId, [
    'voile_avance',
    'page_trouvee',
    'page_reparee',
    'page_tenue',
    'carnet_complet',
    'seuil_clos',
    'peripetie',
    'chapardeur',
    'spell_cast',
    'relance_bonus',
  ]);
  const sousVoile = new Set();
  const paliesUneFois = new Set();
  for (const e of evts.filter((e) => e.type === 'voile_avance')) {
    for (const t of e.payload.teamsUnderVoile || []) sousVoile.add(Number(t));
    for (const z of e.payload.zonesPalies || []) paliesUneFois.add(String(z));
  }
  const trouvees = evts.filter((e) => e.type === 'page_trouvee' || e.type === 'page_reparee');
  const parGnomes = trouvees.filter((e) => typeDe.get(e.teamId) === 'gnome').length;
  const state = await db.queryOne(
    'SELECT voile_position, carnet_complet_at, chapardeur_round FROM gl_game_tenir_state WHERE game_id = ?',
    [gameId],
  );

  // Bourses et grand livre.
  const joueurs = [...ctx.joueurs.values()];
  const soldes = await db.queryAll(
    `SELECT p.id, p.health_points, p.power_points FROM gl_players p WHERE p.id IN (${joueurs.map(() => '?').join(', ')})`,
    joueurs.map((j) => j.id),
  );
  const soldeDe = new Map(
    soldes.map((r) => [
      Number(r.id),
      { coeurs: Number(r.health_points) || 0, gemmes: Number(r.power_points) || 0 },
    ]),
  );
  const ledger = await db.queryAll(
    'SELECT player_id, delta_health, delta_power, cause FROM gl_resource_ledger WHERE game_id = ?',
    [gameId],
  );
  const gainsHorsMarche = new Map(joueurs.map((j) => [j.id, 0]));
  const parCause = {};
  for (const r of ledger) {
    const dh = Number(r.delta_health) || 0;
    const dg = Number(r.delta_power) || 0;
    const cause = String(r.cause);
    if (!parCause[cause]) parCause[cause] = { gains: 0, depenses: 0, mouvements: 0 };
    parCause[cause].mouvements += 1;
    for (const d of [dh, dg]) {
      if (d > 0) parCause[cause].gains += d;
      else if (d < 0) parCause[cause].depenses += -d;
    }
    if (!CAUSES_MARCHE.has(cause)) {
      const pid = Number(r.player_id);
      if (gainsHorsMarche.has(pid))
        gainsHorsMarche.set(pid, gainsHorsMarche.get(pid) + Math.max(0, dh) + Math.max(0, dg));
    }
  }
  const totaux = joueurs.map((j) => {
    const s = soldeDe.get(j.id) || { coeurs: 0, gemmes: 0 };
    return s.coeurs + s.gemmes;
  });
  const zero = joueurs.filter((j) => {
    const s = soldeDe.get(j.id);
    return s && s.coeurs === 0 && s.gemmes === 0;
  }).length;
  const plafond = Number(ctx.resolved.max_health_points) || 8;
  const double = joueurs.filter((j) => {
    const s = soldeDe.get(j.id);
    return s && s.coeurs >= plafond && s.gemmes >= plafond;
  }).length;
  const seuil = evts.find((e) => e.type === 'seuil_clos');
  // Honneurs : lus dans la table (le payload `seuil_clos.honneurs` reste nul, cf. rapport).
  let honneurs = seuil?.payload?.honneurs || null;
  try {
    const rows = await db.queryAll('SELECT * FROM gl_game_honneurs WHERE game_id = ?', [gameId]);
    if (rows.length) {
      honneurs = rows.map((r) => ({
        honneur: String(r.honneur ?? r.code ?? r.type ?? r.kind ?? ''),
        teamId: r.team_id != null ? Number(r.team_id) : null,
        teamType: typeDe.get(Number(r.team_id)) || null,
      }));
    }
  } catch (_) {
    /* table absente : on garde le payload */
  }
  const badges = await mesurerBadges(ctx);

  return {
    gameId,
    plateau: ctx.partie.plateau,
    surface: ctx.partie.surface,
    seances: deroule.seances,
    finParCamp: !!deroule.finParCamp,
    entre4et6: deroule.seances >= 4 && deroule.seances <= 6,
    zonesActives: pages.length,
    pages: {
      tenues: pages.filter((p) => p.etat === 'tenue').length,
      trouvees: pages.filter((p) => ['trouvee', 'reparee', 'tenue'].includes(p.etat)).length,
      palies: pages.filter((p) => p.etat === 'palie').length,
      reparees: pages.filter((p) => p.reparee).length,
      endormies: pages.filter((p) => p.etat === 'endormie').length,
      revelees: pages.filter((p) => p.etat === 'revelee').length,
      paliesAuMoinsUneFois: paliesUneFois.size,
    },
    pagesTenuesPct: pourcent(pages.filter((p) => p.etat === 'tenue').length, n),
    pagesPaliesPct: pourcent(pages.filter((p) => p.etat === 'palie').length, n),
    pagesPaliesUneFoisPct: pourcent(paliesUneFois.size, n),
    equipesSousVoilePct: pourcent(sousVoile.size, equipes.length || 1),
    voilePosition: state ? Number(state.voile_position ?? -1) : null,
    carnetComplet: !!state?.carnet_complet_at,
    partGnomesPct: trouvees.length ? pourcent(parGnomes, trouvees.length) : null,
    pagesTrouveesEvts: trouvees.length,
    elevesZeroPct: pourcent(zero, joueurs.length || 1),
    doublePlafondPct: pourcent(double, joueurs.length || 1),
    gini: gini(totaux),
    matthieu: spearman(
      joueurs.map((j) => j.persona.justesse),
      joueurs.map((j) => gainsHorsMarche.get(j.id) || 0),
    ),
    boursesMoyenne: {
      coeurs: arrondi(
        joueurs.reduce((a, j) => a + (soldeDe.get(j.id)?.coeurs || 0), 0) / (joueurs.length || 1),
        2,
      ),
      gemmes: arrondi(
        joueurs.reduce((a, j) => a + (soldeDe.get(j.id)?.gemmes || 0), 0) / (joueurs.length || 1),
        2,
      ),
    },
    ledgerParCause: parCause,
    peripeties: evts.filter((e) => e.type === 'peripetie').length,
    chapardeur: evts.some((e) => e.type === 'chapardeur'),
    sortsLances: evts.filter((e) => e.type === 'spell_cast').length,
    relancesCase: evts.filter((e) => e.type === 'relance_bonus' && e.payload.relance === true)
      .length,
    honneurs,
    honneursDansEvenement: seuil ? seuil.payload?.honneurs != null : null,
    badges,
    compteurs: {
      ...ctx.compteurs,
      sorts: { ...ctx.compteurs.sorts, parCode: { ...ctx.compteurs.sorts.parCode } },
      verdicts: { ...ctx.compteurs.verdicts },
    },
  };
}

/** Mesures de fin d'année (après le dernier chapitre) : double plafond et bourses finales. */
async function mesurerAnnee(ctx) {
  const joueurs = [...ctx.joueurs.values()];
  if (!joueurs.length) return null;
  const soldes = await ctx.db.queryAll(
    `SELECT id, health_points, power_points FROM gl_players WHERE id IN (${joueurs.map(() => '?').join(', ')})`,
    joueurs.map((j) => j.id),
  );
  const plafond = Number(ctx.resolved?.max_health_points) || 8;
  const double = soldes.filter(
    (r) => Number(r.health_points) >= plafond && Number(r.power_points) >= plafond,
  ).length;
  const zero = soldes.filter(
    (r) => Number(r.health_points) === 0 && Number(r.power_points) === 0,
  ).length;
  return {
    doublePlafondPct: pourcent(double, soldes.length),
    elevesZeroPct: pourcent(zero, soldes.length),
    gini: gini(soldes.map((r) => Number(r.health_points) + Number(r.power_points))),
  };
}

module.exports = {
  CAUSES_MARCHE,
  etatsPages,
  evenements,
  mesurerBadges,
  mesurerChapitre,
  mesurerAnnee,
};
