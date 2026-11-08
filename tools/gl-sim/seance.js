'use strict';

/**
 * Une séance = un tour à phases joué par le prof virtuel : présences (assiduité des personas,
 * absences et retraits posés par le scénario), ouverture, phase `jeu` (équipes dans l'ordre du
 * tour, en séquence ou en parallèle), lectures de contrôle des écrans élèves, bilan Team Spirit,
 * phase `souffle` (dé gris, ou « le voile dort »), clôture du tour.
 */

const { jouerEquipe, api } = require('./equipe');

function attendu(res, statuts, libelle) {
  const ok = Array.isArray(statuts) ? statuts.includes(res.status) : res.status === statuts;
  if (!ok) throw new Error(`${libelle} : ${res.status} ${JSON.stringify(res.body).slice(0, 300)}`);
  return res.body;
}

async function lireTour(ctx) {
  const tour = attendu(
    await ctx.client.appel({
      token: ctx.mjToken,
      method: 'get',
      path: api(ctx, '/tenir/tour'),
      geste: 'lire-tour',
    }),
    200,
    'lecture du tour',
  );
  const tenir = attendu(
    await ctx.client.appel({
      token: ctx.mjToken,
      method: 'get',
      path: api(ctx, '/tenir'),
      geste: 'lire-tenir',
    }),
    200,
    'lecture tenir',
  );
  return { ...tour, voilePosition: Number(tenir.state?.voilePosition ?? -1), tenir };
}

/** Présences de la séance : assiduité des personas, absences forcées par le scénario. */
function tirerPresences(ctx, numero, absencesForcees = []) {
  const forces = new Set((absencesForcees || []).map(Number));
  const absents = [];
  for (const eq of ctx.partie.equipes) {
    eq.presents = [];
    for (const id of eq.membres) {
      const j = ctx.joueurs.get(id);
      if (!j) continue;
      const present = !forces.has(id) && ctx.rng.chance(j.persona.assiduite);
      if (present) eq.presents.push(j);
      else absents.push(id);
    }
  }
  return absents;
}

/** Retraits posés par le prof : entrées pour cette séance, sorties des précédents. */
async function appliquerRetraits(ctx, numero, retraitsScenario) {
  const voulus = new Set(
    (retraitsScenario || []).filter((r) => r.seance === numero).map((r) => Number(r.playerId)),
  );
  for (const id of [...ctx.retraits]) {
    if (!voulus.has(id)) {
      await ctx.client.appel({
        token: ctx.mjToken,
        method: 'post',
        path: api(ctx, '/tenir/retrait'),
        body: { playerId: id, entree: false },
        geste: 'retrait-sortie',
      });
      ctx.retraits.delete(id);
    }
  }
  for (const id of voulus) {
    if (ctx.retraits.has(id)) continue;
    const res = await ctx.client.appel({
      token: ctx.mjToken,
      method: 'post',
      path: api(ctx, '/tenir/retrait'),
      body: { playerId: id, entree: true, motif: 'retrait posé par le banc' },
      geste: 'retrait-entree',
    });
    if (res.status === 200) ctx.retraits.add(id);
  }
}

/** Un élève présent par équipe relit ses écrans : état de partie, tenir, carnet, journal. */
async function controlerEcransEleves(ctx) {
  for (const eq of ctx.partie.equipes) {
    const j = ctx.rng.pick(eq.presents);
    if (!j) continue;
    for (const path of [
      `/api/gl/games/${ctx.partie.gameId}`,
      api(ctx, '/tenir'),
      api(ctx, '/tenir/tour'),
      api(ctx, '/chasse'),
      `/api/gl/journal/games/${ctx.partie.gameId}?limit=100`,
    ]) {
      await ctx.client.appel({
        token: j.token,
        method: 'get',
        path,
        acteur: 'eleve',
        membres: eq.membres,
        geste: 'ecran-eleve',
      });
    }
  }
}

async function bilanTeamSpirit(ctx, roundNumber) {
  const bilans = ctx.partie.equipes.map((eq) => ({
    teamId: eq.id,
    cartesGardees: ctx.rng.int(3, 6),
  }));
  await ctx.client.appel({
    token: ctx.mjToken,
    method: 'put',
    path: api(ctx, '/tenir/tour/team-spirit'),
    body: { roundNumber, bilans },
    geste: 'team-spirit',
  });
}

/**
 * @param {object} ctx contexte de chapitre
 * @param {number} numero numéro de séance (1-based)
 * @param {object} [opts]
 * @param {boolean} [opts.voileDort] le prof ne lance pas le dé gris
 * @param {boolean} [opts.parallele] équipes en parallèle (`Promise.all`)
 * @param {number[]} [opts.absences] joueurs absents imposés
 * @param {Array<{ seance, playerId }>} [opts.retraits]
 * @param {Function} [opts.apresEquipes] crochet `(ctx, tour) => Promise` après la phase jeu
 * @returns {Promise<{ roundNumber, ordre, ventTeamId, auCamp, toutesAuCamp, voilePosition, souffle }>}
 */
async function jouerSeance(ctx, numero, opts = {}) {
  ctx.client.setContexte({ seance: numero, phase: 'ouverture', equipe: null });
  const absents = tirerPresences(ctx, numero, opts.absences);
  const ouvert = attendu(
    await ctx.client.appel({
      token: ctx.mjToken,
      method: 'post',
      path: api(ctx, '/tenir/tour/ouvrir'),
      geste: 'ouvrir-tour',
    }),
    200,
    `ouverture du tour ${numero}`,
  );
  const roundNumber = Number(ouvert.roundNumber);
  if (absents.length) {
    await ctx.client.appel({
      token: ctx.mjToken,
      method: 'post',
      path: api(ctx, '/tenir/tour/absences'),
      body: { playerIds: absents },
      geste: 'absences',
    });
  }
  await appliquerRetraits(ctx, numero, opts.retraits);
  await ctx.verifierInvariants('ouverture du tour');

  ctx.client.setContexte({ phase: 'jeu' });
  attendu(
    await ctx.client.appel({
      token: ctx.mjToken,
      method: 'post',
      path: api(ctx, '/tenir/tour/phase'),
      body: { phase: 'jeu' },
      geste: 'phase-jeu',
    }),
    200,
    'phase jeu',
  );
  if (ctx.partie.surface === 'hybride') {
    await ctx.client.appel({
      token: ctx.mjToken,
      method: 'post',
      path: api(ctx, '/tenir/tour/fouille-fenetre'),
      body: { ouverte: true },
      geste: 'fenetre-fouille',
    });
  }
  let tour = await lireTour(ctx);
  const ordre = (Array.isArray(ouvert.ordre) ? ouvert.ordre : []).map(Number);
  const equipesOrdonnees = ordre.length
    ? ordre.map((id) => ctx.equipeParId(id)).filter(Boolean)
    : [...ctx.partie.equipes];

  if (ctx.partie.surface === 'tableau') {
    for (const eq of equipesOrdonnees) {
      await jouerEquipe(ctx, eq, tour);
      await ctx.client.appel({
        token: ctx.mjToken,
        method: 'post',
        path: api(ctx, '/tenir/tour/equipe-suivante'),
        geste: 'equipe-suivante',
      });
      tour = await lireTour(ctx);
    }
  } else if (opts.parallele) {
    await Promise.all(equipesOrdonnees.map((eq) => jouerEquipe(ctx, eq, tour)));
  } else {
    for (const eq of equipesOrdonnees) {
      await jouerEquipe(ctx, eq, tour);
      tour = await lireTour(ctx);
    }
  }
  ctx.client.setContexte({ equipe: null });
  if (typeof opts.apresEquipes === 'function') await opts.apresEquipes(ctx, tour);
  await controlerEcransEleves(ctx);
  await bilanTeamSpirit(ctx, roundNumber);

  ctx.client.setContexte({ phase: 'souffle' });
  const souffleRes = attendu(
    await ctx.client.appel({
      token: ctx.mjToken,
      method: 'post',
      path: api(ctx, '/tenir/tour/phase'),
      body: { phase: 'souffle', dort: opts.voileDort === true },
      geste: 'phase-souffle',
    }),
    200,
    'phase souffle',
  );
  await ctx.verifierInvariants('souffle');
  ctx.client.setContexte({ phase: 'clos' });
  attendu(
    await ctx.client.appel({
      token: ctx.mjToken,
      method: 'post',
      path: api(ctx, '/tenir/tour/phase'),
      body: { phase: 'clos' },
      geste: 'phase-clos',
    }),
    200,
    'phase clos',
  );
  const fin = await lireTour(ctx);
  const auCamp = fin.teams.filter((t) => t.auCamp).length;
  return {
    roundNumber,
    ordre,
    ventTeamId: ouvert.ventTeamId ?? null,
    absents: absents.length,
    auCamp,
    toutesAuCamp: fin.teams.length > 0 && auCamp === fin.teams.length,
    voilePosition: fin.voilePosition,
    souffle: souffleRes.souffle || null,
    positions: fin.teams.map((t) => ({
      id: Number(t.id),
      type: t.type,
      pathIndex: t.pathIndex,
      auCamp: t.auCamp,
    })),
  };
}

module.exports = {
  lireTour,
  tirerPresences,
  appliquerRetraits,
  controlerEcransEleves,
  jouerSeance,
};
