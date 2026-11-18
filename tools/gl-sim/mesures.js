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

/** Causes du grand livre qui CRÉENT une ressource (tout le reste la déplace ou la détruit). */
const CAUSES_CREATION = new Set([
  'page_tenue',
  'trame',
  'case_positive',
  'case_souffle',
  'case_plateau',
  'carnet_complet',
  'reparation',
  'feuillet',
  'heritage',
]);

/**
 * Mesures de l'ensemble unifié (PR 1a, § 6.12 du prompt) : elles se lisent aussi sur les règles
 * d'avant (même banc, même graine), pour comparer.
 */
function mesurerEnsembleUnifie({
  evts,
  pages,
  typeDe,
  equipes,
  ledger,
  joueurs,
  compteurs,
  rangs,
  rangsParSeance = [],
}) {
  // Gestes de chasse utiles : pages trouvées ou réparées, révélations « converties » (zone
  // révélée par une fouille ou la Lanterne puis trouvée), au crédit de l'équipe qui les a faits.
  const finale = new Map(pages.map((p) => [p.zoneKey, p.etat]));
  const revelePar = new Map();
  for (const e of evts.filter((x) => x.type === 'page_revelee')) {
    const via = String(e.payload.via || '');
    if ((via === 'fouille' || via === 'lanterne') && e.teamId != null) {
      const z = String(e.payload.zoneKey || '');
      if (z && !revelePar.has(z)) revelePar.set(z, e.teamId);
    }
  }
  const utiles = [];
  for (const e of evts.filter((x) => x.type === 'page_trouvee' || x.type === 'page_reparee')) {
    utiles.push(e.teamId);
  }
  for (const [z, teamId] of revelePar) {
    if (['trouvee', 'reparee', 'tenue'].includes(finale.get(z))) utiles.push(teamId);
  }
  const licornes = utiles.filter((t) => typeDe.get(t) === 'unicorn').length;
  let creees = 0;
  for (const r of ledger) {
    const cause = String(r.cause);
    if (!CAUSES_CREATION.has(cause) && cause !== 'reserve_entree') continue;
    // Une entrée en réserve (`kind = 'reserve'`) est le surplus d'un gain au plafond : créée aussi.
    creees += Math.max(0, Number(r.delta_health) || 0) + Math.max(0, Number(r.delta_power) || 0);
  }
  const moy = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const ecartDe = (liste) => {
    const l = moy(liste.filter((r) => r.type === 'unicorn').map((r) => r.rang));
    const g = moy(liste.filter((r) => r.type === 'gnome').map((r) => r.rang));
    return l != null && g != null ? l - g : null;
  };
  const ecarts = rangsParSeance.map(ecartDe).filter((x) => x != null);
  const ecartAvantSeuil = ecartDe(rangs);
  return {
    sansFouillePct: compteurs.couplesFouille
      ? pourcent(compteurs.couplesSansFouille, compteurs.couplesFouille)
      : null,
    couplesFouille: compteurs.couplesFouille,
    gestesChasseUtiles: utiles.length,
    partLicornesChasseUtilePct: utiles.length ? pourcent(licornes, utiles.length) : null,
    ressourcesCreeesParEleve: joueurs.length ? arrondi(creees / joueurs.length, 2) : null,
    toursUnDeParEquipe: equipes.length
      ? arrondi(evts.filter((e) => e.type === 'un_de_joue').length / equipes.length, 2)
      : null,
    defisCaseRecus: evts.filter((e) => e.type === 'defi_case_recu').length,
    reculsLumiere: evts.filter((e) => e.type === 'lumiere_palier').length,
    // Moyenne, sur les séances, de (rang moyen des Licornes − rang moyen des Gnomes) en fin de
    // séance ; et la valeur juste avant la clôture.
    ecartLicornesGnomes: ecarts.length ? arrondi(moy(ecarts), 2) : null,
    ecartLicornesGnomesAvantSeuil: ecartAvantSeuil != null ? arrondi(ecartAvantSeuil, 2) : null,
  };
}

/**
 * Mesures de la monnaie unique (ensemble unifié, PR 4, § 9.6 du prompt) : bourses de gemmes en
 * fin de chapitre, sorts payés, et ce que les équipes avaient en poche à l'ouverture de chaque
 * séance — pour dire si les bourses sont trop maigres pour lancer un sort. Le banc mesure : il
 * ne règle rien (le levier, le prix des sorts, est une donnée).
 *
 * @param {object} p
 * @param {Array<number>} p.gemmes bourse de gemmes de chaque élève en fin de chapitre
 * @param {number} p.plafond plafond de la bourse (réglage `max_power_points`)
 * @param {Array<object>} p.ledger lignes du grand livre de la partie
 * @param {Array<Array<{ teamId, type, pot }>>} p.potsParSeance pot de chaque équipe (bourses
 *   des membres + réserve) à l'ouverture de chaque séance
 * @param {object} p.compteurs compteurs du chapitre (`sorts.lances`, `sorts.refuses`)
 */
function mesurerUneMonnaie({ gemmes, plafond, ledger, potsParSeance = [], compteurs }) {
  const n = gemmes.length || 1;
  const tri = [...gemmes].sort((a, b) => a - b);
  const mediane = tri.length
    ? tri.length % 2
      ? tri[(tri.length - 1) / 2]
      : (tri[tri.length / 2 - 1] + tri[tri.length / 2]) / 2
    : null;
  let coeursBouges = 0;
  let payeEnSorts = 0;
  let payeEnParures = 0;
  for (const r of ledger) {
    if (Number(r.delta_health) !== 0) coeursBouges += 1;
    const dg = Number(r.delta_power) || 0;
    if (String(r.cause) === 'sort_pot' && dg < 0) payeEnSorts += -dg;
    if (String(r.cause) === 'parure' && dg < 0) payeEnParures += -dg;
  }
  const pots = potsParSeance.flat();
  const part = (seuil) =>
    pots.length ? pourcent(pots.filter((x) => x.pot < seuil).length, pots.length) : null;
  const premiere = potsParSeance[0] || [];
  return {
    gemmesMoyenne: arrondi(gemmes.reduce((a, b) => a + b, 0) / n, 2),
    gemmesMediane: mediane,
    auPlafondPct: pourcent(gemmes.filter((g) => g >= plafond).length, n),
    aZeroPct: pourcent(gemmes.filter((g) => g === 0).length, n),
    // Aucun cœur ne doit bouger : 0 attendu (l'invariant COEURS_HORS_JEU le garde aussi).
    mouvementsDeCoeurs: coeursBouges,
    gemmesPayeesEnSortsParEleve: arrondi(payeEnSorts / n, 2),
    gemmesPayeesEnParuresParEleve: arrondi(payeEnParures / n, 2),
    sortsLances: compteurs?.sorts?.lances ?? null,
    sortsRefuses: compteurs?.sorts?.refuses ?? null,
    // Pot d'une équipe à l'ouverture d'une séance : moyenne, et part des couples équipe ×
    // séance qui ne peuvent pas payer un sort à 2 gemmes (Lanterne, Sentier, Relance…) ni
    // même à 1 (Progression, Farce).
    potMoyenParEquipe: pots.length
      ? arrondi(pots.reduce((a, x) => a + x.pot, 0) / pots.length, 2)
      : null,
    potPremiereSeance: premiere.length
      ? arrondi(premiere.reduce((a, x) => a + x.pot, 0) / premiere.length, 2)
      : null,
    equipesSeancesSousDeuxPct: part(2),
    equipesSeancesAZeroPct: part(1),
  };
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
    'defi_case_recu',
    'defi_case_releve',
    'defi_case_pas_encore',
    'page_revelee',
    'un_de_joue',
    'lumiere_palier',
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

  // Bourses et grand livre. Ensemble unifié (M1) : une seule monnaie, les gemmes.
  const joueurs = [...ctx.joueurs.values()];
  const soldes = await db.queryAll(
    `SELECT p.id, p.power_points FROM gl_players p WHERE p.id IN (${joueurs.map(() => '?').join(', ')})`,
    joueurs.map((j) => j.id),
  );
  const soldeDe = new Map(soldes.map((r) => [Number(r.id), Number(r.power_points) || 0]));
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
  const totaux = joueurs.map((j) => soldeDe.get(j.id) || 0);
  const zero = totaux.filter((g) => g === 0).length;
  const plafond = Number(ctx.resolved.max_power_points) || 8;
  const auPlafond = totaux.filter((g) => g >= plafond).length;
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
  const ensembleUnifie = mesurerEnsembleUnifie({
    evts,
    pages,
    typeDe,
    equipes,
    ledger,
    joueurs,
    compteurs: ctx.compteurs,
    rangs: deroule.rangs || [],
    rangsParSeance: deroule.rangsParSeance || [],
  });
  const uneMonnaie = mesurerUneMonnaie({
    gemmes: totaux,
    plafond,
    ledger,
    potsParSeance: deroule.potsParSeance || [],
    compteurs: ctx.compteurs,
  });

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
    defisCase: {
      recus: evts.filter((e) => e.type === 'defi_case_recu').length,
      releves: evts.filter((e) => e.type === 'defi_case_releve').length,
      pasEncore: evts.filter((e) => e.type === 'defi_case_pas_encore').length,
    },
    voilePosition: state ? Number(state.voile_position ?? -1) : null,
    carnetComplet: !!state?.carnet_complet_at,
    partGnomesPct: trouvees.length ? pourcent(parGnomes, trouvees.length) : null,
    pagesTrouveesEvts: trouvees.length,
    elevesZeroPct: pourcent(zero, joueurs.length || 1),
    // « Au plafond » : la bourse de gemmes pleine. La clé `doublePlafondPct` (deux bourses
    // pleines, du temps des deux monnaies) garde son nom pour les rapports déjà produits.
    auPlafondPct: pourcent(auPlafond, joueurs.length || 1),
    doublePlafondPct: pourcent(auPlafond, joueurs.length || 1),
    gini: gini(totaux),
    matthieu: spearman(
      joueurs.map((j) => j.persona.justesse),
      joueurs.map((j) => gainsHorsMarche.get(j.id) || 0),
    ),
    boursesMoyenne: {
      gemmes: arrondi(totaux.reduce((a, g) => a + g, 0) / (joueurs.length || 1), 2),
    },
    ledgerParCause: parCause,
    ensembleUnifie,
    uneMonnaie,
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

/**
 * Mesures de fin d'année (après le dernier chapitre) : élèves au plafond de gemmes, à zéro,
 * bourse moyenne. Une seule monnaie (M1) : `doublePlafondPct` vaut `auPlafondPct` (clé gardée).
 */
async function mesurerAnnee(ctx) {
  const joueurs = [...ctx.joueurs.values()];
  if (!joueurs.length) return null;
  const soldes = await ctx.db.queryAll(
    `SELECT id, power_points FROM gl_players WHERE id IN (${joueurs.map(() => '?').join(', ')})`,
    joueurs.map((j) => j.id),
  );
  const plafond = Number(ctx.resolved?.max_power_points) || 8;
  const gemmes = soldes.map((r) => Number(r.power_points) || 0);
  const auPlafond = gemmes.filter((g) => g >= plafond).length;
  const zero = gemmes.filter((g) => g === 0).length;
  return {
    auPlafondPct: pourcent(auPlafond, soldes.length),
    doublePlafondPct: pourcent(auPlafond, soldes.length),
    elevesZeroPct: pourcent(zero, soldes.length),
    gemmesMoyenne: arrondi(gemmes.reduce((a, g) => a + g, 0) / (gemmes.length || 1), 2),
    gini: gini(gemmes),
  };
}

module.exports = {
  CAUSES_MARCHE,
  etatsPages,
  evenements,
  mesurerBadges,
  mesurerChapitre,
  mesurerAnnee,
  mesurerUneMonnaie,
};
