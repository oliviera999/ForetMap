'use strict';

/**
 * Un chapitre complet : partie `live`, séances jusqu'au Seuil (les quatre équipes au camp) ou à
 * la séance maximale (le prof clôt : « la caravane porte les retardataires »), semaine de
 * veillée entre deux séances, invariants rejoués après chaque geste, mesures.
 */

const { SimEchec } = require('./client');
const { creerPartie } = require('./partie');
const { jouerSeance } = require('./seance');
const { jouerVeillee } = require('./veillee');
const { mesurerChapitre } = require('./mesures');
const { checkTenirInvariantsFromDb } = require('../../lib/glTenirInvariants');

function compteursVides() {
  return {
    jets: 0,
    jetsRefuses: 0,
    questionsCase: 0,
    questionsCaseJustes: 0,
    peripeties: 0,
    fouilles: 0,
    verdicts: {},
    pagesTrouvees: 0,
    pagesReparees: 0,
    lectures: 0,
    tentativesTenue: 0,
    pagesTenues: 0,
    pagesTenuesVeillee: 0,
    sorts: { lances: 0, refuses: 0, parCode: {} },
    dons: 0,
    annonces: 0,
    parures: 0,
    etudes: 0,
    pistes: 0,
    actionsVeillee: 0,
    equipesAbsentes: 0,
    invariantsVerifies: 0,
  };
}

/**
 * @param {object} p
 * @param {object} p.base `{ client, db, oracle, rng, horloge, mjToken, classe, joueurs }`
 * @param {object} p.scenario
 * @param {number} p.plateau
 * @param {string} p.composition `explicite` | `auto`
 * @param {number} p.seancesMax
 * @param {number} [p.joursVeillee]
 * @param {object} [p.crochets] `{ apresEquipes(ctx, tour, seance), finChapitre(ctx) }`
 */
async function jouerChapitre({
  base,
  scenario,
  plateau,
  composition,
  seancesMax,
  joursVeillee = 7,
  crochets = {},
}) {
  const { client, db, oracle, rng, horloge, mjToken, classe, joueurs } = base;
  client.setContexte({ plateau, seance: 0, phase: 'creation', equipe: null });
  const partie = await creerPartie({
    client,
    db,
    mjToken,
    classe,
    joueurs,
    plateau,
    surface: scenario.surface,
    profil: scenario.profil || 'complet',
    composition,
    rng,
    nom: `Sim ${scenario.id}`,
  });
  const { getGameplaySettings } = require('../../lib/glSettings');
  const { resolveTenirSettings } = require('../../lib/glTenir');
  const settings = await getGameplaySettings({ forceRefresh: true });
  const gameRow = await db.queryOne('SELECT * FROM gl_games WHERE id = ?', [partie.gameId]);
  const resolved = resolveTenirSettings(settings, gameRow);
  const joueursMap = new Map(joueurs.map((j) => [j.id, j]));
  const compteurs = compteursVides();
  const curseurOperateur = new Map();

  const ctx = {
    client,
    db,
    oracle,
    rng,
    horloge,
    mjToken,
    scenario,
    partie,
    resolved,
    settings,
    joueurs: joueursMap,
    retraits: new Set(),
    compteurs,
    cache: {},
    equipeParId: (id) => partie.equipes.find((e) => e.id === Number(id)) || null,
    /** Opérateur du geste : les présents à tour de rôle (les rôles changent à chaque cours). */
    operateurDe(equipe) {
      const presents = equipe.presents || [];
      if (!presents.length) return null;
      const k = curseurOperateur.get(equipe.id) || 0;
      curseurOperateur.set(equipe.id, k + 1);
      return presents[k % presents.length];
    },
    async verifierInvariants(geste, equipe = null) {
      compteurs.invariantsVerifies += 1;
      const r = await checkTenirInvariantsFromDb(db, partie.gameId, settings);
      if (!r.ok) {
        throw new SimEchec(
          'INVARIANT',
          `Invariant violé après « ${geste} » : ${r.violations.map((v) => `${v.code} (${v.message})`).join(' ; ')}`,
          {
            ...client.getContexte(),
            geste,
            equipe: equipe ? equipe.name : client.getContexte().equipe,
            violations: r.violations.slice(0, 10),
          },
        );
      }
    },
  };
  for (const eq of partie.equipes) eq.presents = [];

  const seances = [];
  let finParCamp = false;
  for (let s = 1; s <= seancesMax; s += 1) {
    const prof = scenario.prof || {};
    const resume = await jouerSeance(ctx, s, {
      voileDort: typeof prof.voileDort === 'function' ? prof.voileDort(s) : prof.voileDort === true,
      parallele: scenario.parallele === true,
      absences: typeof prof.absences === 'function' ? prof.absences(s, joueurs, rng) : [],
      retraits:
        typeof prof.retraits === 'function' ? prof.retraits(joueurs, rng) : prof.retraits || [],
      apresEquipes: crochets.apresEquipes ? (c, tour) => crochets.apresEquipes(c, tour, s) : null,
    });
    seances.push(resume);
    if (resume.toutesAuCamp) {
      finParCamp = true;
      break;
    }
    if (s < seancesMax) await jouerVeillee(ctx, { jours: joursVeillee });
  }
  client.setContexte({ phase: 'seuil', equipe: null });
  const end = await client.appel({
    token: mjToken,
    method: 'post',
    path: `/api/gl/games/${partie.gameId}/end`,
    geste: 'cloture',
  });
  if (end.status !== 200)
    throw new SimEchec(
      'CLOTURE',
      `Clôture refusée : ${end.status} ${JSON.stringify(end.body).slice(0, 200)}`,
      client.getContexte(),
    );
  await ctx.verifierInvariants('clôture');
  if (crochets.finChapitre) await crochets.finChapitre(ctx);
  const mesures = await mesurerChapitre(ctx, { seances: seances.length, finParCamp });
  return { ctx, partie, seances, mesures };
}

module.exports = { compteursVides, jouerChapitre };
