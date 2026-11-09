'use strict';

/**
 * Gestes d'une équipe virtuelle pendant la phase `jeu` d'une séance, et actions de veillée.
 *
 * Qui agit dépend de la **surface** (règles § 3) : en `tableau`, le prof porte tous les gestes
 * pour l'équipe active ; en `hybride`, le prof lance et répond, les élèves fouillent (fenêtre
 * ouverte par le prof), lisent et tiennent ; en `tablette`, les élèves font tout (dés serveur).
 * Un geste d'élève passe par le crible du client (mots interdits, bourses d'une autre équipe).
 * Les invariants (`lib/glTenirInvariants.js`) sont rejoués après chaque geste d'équipe.
 *
 * Toute réponse 4xx attendue (fouilles épuisées, fenêtre de sort, limite, pas encore…) est
 * comptée et tolérée ; seules les 5xx, les invariants et les mots interdits font échouer.
 */

const { choisirPointFouille } = require('./strategie');

const SORTS = Object.freeze({
  PROGRESSION: 'SL002',
  RELANCE: 'SL005',
  FARCE: 'SL036',
  LANTERNE: 'SL037',
  BOUSSOLE: 'SL038',
  BOURRASQUE: 'SL039',
  GRAND_REGARD: 'SL040',
  NOMMER: 'SL041',
  SENTIER: 'SL042',
  ABRI: 'SL043',
  RELAIS: 'SL044',
  CORDEE: 'SL045',
});

const MAX_RELANCES_BOUCLE = 4;
const MAX_FOUILLES_PAR_EQUIPE = 5;
const MAX_PAGES_TENUES_PAR_SEANCE = 2;
const MAX_TENTATIVES_LECTURE = 2;

function api(ctx, path) {
  return `/api/gl/games/${ctx.partie.gameId}${path}`;
}

/** Acteur d'un geste selon la surface : `{ token, acteur, teamIdBody, membres }`. */
function acteurPour(ctx, equipe, geste, operateur) {
  const surface = ctx.partie.surface;
  const parProf =
    surface === 'tableau' ||
    (surface === 'hybride' && ['lancer', 'repondre'].includes(geste)) ||
    !operateur;
  if (parProf) {
    return { token: ctx.mjToken, acteur: 'prof', teamIdBody: equipe.id, membres: equipe.membres };
  }
  return {
    token: operateur.token,
    acteur: 'eleve',
    teamIdBody: undefined,
    membres: equipe.membres,
  };
}

function corps(acteur, body) {
  if (acteur.teamIdBody == null) return body;
  return { ...body, teamId: acteur.teamIdBody };
}

async function appel(ctx, equipe, geste, operateur, { method, path, body }) {
  const a = acteurPour(ctx, equipe, geste, operateur);
  const res = await ctx.client.appel({
    token: a.token,
    method,
    path,
    body: body === undefined ? undefined : corps(a, body),
    acteur: a.acteur,
    membres: a.membres,
    geste,
  });
  return res;
}

/** Persona de l'opérateur, ou moyenne de l'équipe pour un geste porté par le prof. */
function justesseDe(ctx, equipe, operateur) {
  if (operateur) return operateur.persona.justesse;
  const ps = equipe.presents.map((j) => j.persona.justesse);
  return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : 0.6;
}

function penchant(equipe, cle) {
  const ps = equipe.presents.map((j) => j.persona.penchants[cle]);
  return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : 0;
}

// ---------------------------------------------------------------------
// Sorts
// ---------------------------------------------------------------------

/** Brouillon + lancement d'un sort ; 4xx toléré. Renvoie `{ ok, status, code, body }`. */
async function lancerSort(
  ctx,
  equipe,
  operateur,
  code,
  { effectParams, ressource, partnerTeamId, playerId } = {},
) {
  if (!ctx.partie.sorts.has(code)) return { ok: false, status: 0, code: 'SORT_HORS_CHAPITRE' };
  const a = acteurPour(ctx, equipe, 'sort', operateur);
  const body = { spellCode: code, teamId: equipe.id };
  if (effectParams) body.effectParams = effectParams;
  if (ressource) body.ressource = ressource;
  if (partnerTeamId) body.partnerTeamId = partnerTeamId;
  if (playerId) body.playerId = playerId;
  const d = await ctx.client.appel({
    token: a.token,
    method: 'post',
    path: api(ctx, '/spell-casts/drafts'),
    body,
    acteur: a.acteur,
    membres: a.membres,
    geste: `sort-brouillon-${code}`,
  });
  if (d.status !== 201)
    return { ok: false, status: d.status, code: d.body?.code || null, body: d.body };
  const l = await ctx.client.appel({
    token: a.token,
    method: 'post',
    path: api(ctx, `/spell-casts/drafts/${d.body.draft.id}/launch`),
    acteur: a.acteur,
    membres: a.membres,
    geste: `sort-lancer-${code}`,
  });
  ctx.compteurs.sorts[l.status === 200 ? 'lances' : 'refuses'] += 1;
  if (l.status === 200)
    ctx.compteurs.sorts.parCode[code] = (ctx.compteurs.sorts.parCode[code] || 0) + 1;
  await ctx.verifierInvariants(`sort ${code}`, equipe);
  return {
    ok: l.status === 200,
    status: l.status,
    code: l.body?.code || null,
    body: l.body,
    draftId: d.body.draft.id,
  };
}

function ressourceDuPeuple(equipe) {
  return equipe.type === 'unicorn' ? 'gemmes' : 'coeurs';
}

async function sortsAvantJet(ctx, equipe, operateur) {
  if (!ctx.rng.chance(penchant(equipe, 'sorts') * 0.35)) return;
  if (equipe.type === 'unicorn') {
    await lancerSort(ctx, equipe, operateur, SORTS.BOUSSOLE);
  } else {
    await lancerSort(ctx, equipe, operateur, SORTS.SENTIER);
  }
}

async function sortsApresJet(ctx, equipe, operateur) {
  if (!ctx.rng.chance(penchant(equipe, 'sorts') * 0.3)) return;
  await lancerSort(ctx, equipe, operateur, SORTS.PROGRESSION, {
    effectParams: { delta: 1 },
    ressource: ressourceDuPeuple(equipe),
  });
}

/** Sorts d'entraide pendant `jeu` : Abri / Bourrasque vers l'équipe la plus en retard, Farce. */
async function sortsEntraide(ctx, equipe, operateur, tour) {
  const p = penchant(equipe, 'sorts');
  const autres = tour.teams.filter((t) => Number(t.id) !== equipe.id && !t.auCamp);
  if (!autres.length) return;
  const derniere = [...autres].sort((a, b) => a.pathIndex - b.pathIndex)[0];
  if (equipe.type === 'gnome' && ctx.rng.chance(p * 0.4)) {
    const sousVoile = autres.find((t) => t.pathIndex <= tour.voilePosition);
    if (sousVoile)
      await lancerSort(ctx, equipe, operateur, SORTS.ABRI, {
        effectParams: { targetTeamId: Number(sousVoile.id) },
      });
    else if (ctx.rng.chance(0.3)) await lancerSort(ctx, equipe, operateur, SORTS.RELAIS);
  }
  if (equipe.type === 'unicorn' && ctx.rng.chance(p * 0.4)) {
    await lancerSort(ctx, equipe, operateur, SORTS.BOURRASQUE, {
      effectParams: { targetTeamId: Number(derniere.id) },
    });
  }
  if (equipe.type === 'unicorn' && ctx.rng.chance(p * 0.15)) {
    await lancerSort(ctx, equipe, operateur, SORTS.GRAND_REGARD);
  }
  if (ctx.rng.chance(p * 0.1)) {
    await lancerSort(ctx, equipe, operateur, SORTS.FARCE, {
      effectParams: { targetTeamId: Number(ctx.rng.pick(autres).id) },
      ressource: ressourceDuPeuple(equipe),
    });
  }
}

// ---------------------------------------------------------------------
// Jeter / lancer / arrivée
// ---------------------------------------------------------------------

async function lancerDes(ctx, equipe, operateur) {
  const surface = ctx.partie.surface;
  let body;
  if (surface === 'tablette') body = {};
  else body = { mode: 'physique', faces: ctx.rng.des(Number(ctx.resolved.des_count) || 2) };
  const res = await appel(ctx, equipe, 'lancer', operateur, {
    method: 'post',
    path: api(ctx, '/tenir/lancer'),
    body,
  });
  if (res.status === 202 && res.body?.saisieId) {
    // Saisie physique d'un élève (tablette) : le prof valide.
    const v = await ctx.client.appel({
      token: ctx.mjToken,
      method: 'post',
      path: api(ctx, `/tenir/des/${res.body.saisieId}/valider`),
      geste: 'valider-des',
    });
    await ctx.verifierInvariants('jet validé', equipe);
    return v.status === 200 ? { ...v.body, total: res.body.total } : null;
  }
  await ctx.verifierInvariants('jet', equipe);
  if (res.status !== 201) {
    ctx.compteurs.jetsRefuses += 1;
    return null;
  }
  ctx.compteurs.jets += 1;
  return res.body;
}

/** Question de case : présentation puis réponse ; renvoie le bloc `tenir` (bonus) ou null. */
async function repondreCase(ctx, equipe, operateur, markerId) {
  const pres = await appel(ctx, equipe, 'repondre', operateur, {
    method: 'post',
    path: api(ctx, `/markers/${markerId}/present-question`),
    body: {},
  });
  if (pres.status !== 200 || !pres.body?.presentation) return null;
  const presentation = pres.body.presentation;
  const { choiceId } = await ctx.oracle.choisir(
    presentation,
    justesseDe(ctx, equipe, operateur),
    ctx.rng,
  );
  const rep = await appel(ctx, equipe, 'repondre', operateur, {
    method: 'post',
    path: api(ctx, '/qcm/answer'),
    body: {
      questionCode: pres.body.questionCode,
      presentationToken: presentation.presentationToken,
      choiceId,
    },
  });
  await ctx.verifierInvariants('réponse de case', equipe);
  if (rep.status !== 200) return null;
  ctx.compteurs.questionsCase += 1;
  if (rep.body.correct) ctx.compteurs.questionsCaseJustes += 1;
  return rep.body.correct ? rep.body.tenir || null : null;
}

/** Traite une arrivée (question, péripétie) pour l'équipe bénéficiaire ; renvoie `relance`. */
async function traiterArrivee(ctx, equipe, operateur, arrivee) {
  if (!arrivee) return false;
  if (arrivee.peripetie?.id) {
    await appel(ctx, equipe, 'peripetie', operateur, {
      method: 'post',
      path: api(ctx, '/tenir/peripetie/passer'),
      body: { id: arrivee.peripetie.id },
    });
    ctx.compteurs.peripeties += 1;
  }
  if (arrivee.question && arrivee.markerId) {
    const bonus = await repondreCase(ctx, equipe, operateur, arrivee.markerId);
    if (bonus?.arrival) {
      // La case bonus (+1) peut porter une péripétie ; une question y est traitée au tour suivant.
      await traiterArrivee(ctx, equipe, operateur, { ...bonus.arrival, question: false });
    }
    return !!bonus?.bonus?.relance;
  }
  return false;
}

async function jeterEtAvancer(ctx, equipe, operateur) {
  for (let i = 0; i < MAX_RELANCES_BOUCLE; i += 1) {
    const jet = await lancerDes(ctx, equipe, operateur);
    if (!jet) return;
    const beneficiaire =
      Number(jet.beneficiaryTeamId) === equipe.id
        ? equipe
        : ctx.equipeParId(jet.beneficiaryTeamId) || equipe;
    const benefOperateur = beneficiaire === equipe ? operateur : ctx.operateurDe(beneficiaire);
    const relance = await traiterArrivee(ctx, beneficiaire, benefOperateur, jet.arrival);
    if (!relance || beneficiaire !== equipe) return;
  }
}

// ---------------------------------------------------------------------
// Fouiller
// ---------------------------------------------------------------------

async function lireCarnet(ctx, equipe, operateur) {
  const res = await appel(ctx, equipe, 'carnet', operateur, {
    method: 'get',
    path: api(ctx, '/chasse'),
  });
  return res.status === 200 ? res.body : null;
}

async function repondreChasse(ctx, equipe, operateur, question) {
  const { choiceId } = await ctx.oracle.choisir(
    question,
    justesseDe(ctx, equipe, operateur),
    ctx.rng,
  );
  const rep = await appel(ctx, equipe, 'fouiller', operateur, {
    method: 'post',
    path: api(ctx, '/chasse/repondre'),
    body: {
      presentationToken: question.presentationToken,
      questionCode: question.questionCode,
      choiceId,
    },
  });
  await ctx.verifierInvariants('réponse de chasse', equipe);
  if (rep.status !== 200) return null;
  if (rep.body.correct) {
    ctx.compteurs.pagesTrouvees += 1;
    if (rep.body.etat === 'reparee') ctx.compteurs.pagesReparees += 1;
  }
  return rep.body;
}

async function fouiller(ctx, equipe, operateur) {
  let carnet = await lireCarnet(ctx, equipe, operateur);
  if (!carnet) return;
  const quota = carnet.fouilles ? carnet.fouilles.restantes : MAX_FOUILLES_PAR_EQUIPE;
  if (quota <= 0) return;
  // Lanterne (licorne) avant la première fouille.
  if (equipe.type === 'unicorn' && ctx.rng.chance(penchant(equipe, 'sorts') * 0.5)) {
    const r = await lancerSort(ctx, equipe, operateur, SORTS.LANTERNE);
    if (r.ok) carnet = (await lireCarnet(ctx, equipe, operateur)) || carnet;
  }
  for (let n = 0; n < Math.min(quota, MAX_FOUILLES_PAR_EQUIPE); n += 1) {
    const acteur = operateur || null;
    const strategie = acteur
      ? acteur.persona.strategieFouille
      : ctx.rng.pick(equipe.presents)?.persona.strategieFouille || 'mixte';
    const point = choisirPointFouille({
      strategie,
      rng: ctx.rng,
      pages: carnet.pages,
      empreintes: carnet.empreintes,
      gnome: equipe.type === 'gnome',
    });
    const f = await appel(ctx, equipe, 'fouiller', operateur, {
      method: 'post',
      path: api(ctx, '/chasse/fouiller'),
      body: { x: point.x, y: point.y },
    });
    await ctx.verifierInvariants('fouille', equipe);
    if (f.status === 409) break; // FOUILLES_EPUISEES (ou sous le voile)
    if (f.status !== 201) continue;
    ctx.compteurs.fouilles += 1;
    ctx.compteurs.verdicts[f.body.verdict] = (ctx.compteurs.verdicts[f.body.verdict] || 0) + 1;
    if (f.body.verdict === 'zone' && f.body.question) {
      await repondreChasse(ctx, equipe, operateur, f.body.question);
    }
    if (f.body.verdict === 'deja_trouvee' || f.body.verdict === 'palie') {
      // Aucune fouille consommée : on recharge le carnet pour ne pas recliquer au même endroit.
      n -= 1;
      if (ctx.rng.chance(0.5)) break;
    }
    carnet = (await lireCarnet(ctx, equipe, operateur)) || carnet;
    if (carnet.fouilles && carnet.fouilles.restantes <= 0) break;
  }
  // Nommer (gnomes, exécution prof) : une page pâlie au choix.
  if (equipe.type === 'gnome' && ctx.rng.chance(penchant(equipe, 'sorts') * 0.5)) {
    const palie = (carnet.pages || []).find((p) => p.etat === 'palie');
    if (palie) {
      const r = await lancerSort(ctx, equipe, operateur, SORTS.NOMMER, {
        effectParams: { zoneKey: palie.zoneKey },
      });
      if (r.ok && r.draftId) {
        const eff = await ctx.client.appel({
          token: ctx.mjToken,
          method: 'post',
          path: api(ctx, `/spell-casts/drafts/${r.draftId}/effect-applied`),
          body: { zoneKey: palie.zoneKey },
          geste: 'nommer-applique',
        });
        if (eff.status === 200) ctx.compteurs.pagesReparees += 1;
        await ctx.verifierInvariants('Nommer appliqué', equipe);
      }
    }
  }
}

// ---------------------------------------------------------------------
// Lire / tenir
// ---------------------------------------------------------------------

/**
 * Ouvre une page et, si l'équipe est de l'autre peuple que la découvreuse, tente de la tenir.
 * @returns {Promise<'tenue'|'lue'|'pas_encore'|'refus'>}
 */
async function ouvrirEtTenir(
  ctx,
  equipe,
  operateur,
  zoneKey,
  { tentatives = MAX_TENTATIVES_LECTURE } = {},
) {
  const ouvert = await appel(ctx, equipe, 'lire', operateur, {
    method: 'post',
    path: api(ctx, `/chasse/pages/${encodeURIComponent(zoneKey)}/ouvrir`),
    body: {},
  });
  await ctx.verifierInvariants('ouvrir page', equipe);
  if (ouvert.status !== 200) return 'refus';
  ctx.compteurs.lectures += 1;
  if (!ouvert.body.peutTenir || !ouvert.body.question) return 'lue';
  let question = ouvert.body.question;
  for (let k = 0; k < tentatives && question; k += 1) {
    const { choiceId } = await ctx.oracle.choisir(
      question,
      justesseDe(ctx, equipe, operateur),
      ctx.rng,
    );
    const rep = await appel(ctx, equipe, 'lire', operateur, {
      method: 'post',
      path: api(ctx, `/chasse/pages/${encodeURIComponent(zoneKey)}/tenir`),
      body: {
        presentationToken: question.presentationToken,
        questionCode: question.questionCode,
        choiceId,
      },
    });
    await ctx.verifierInvariants('tenir page', equipe);
    if (rep.status !== 200) return 'refus';
    ctx.compteurs.tentativesTenue += 1;
    if (rep.body.correct) {
      ctx.compteurs.pagesTenues += 1;
      return 'tenue';
    }
    question = rep.body.question || null;
  }
  return 'pas_encore';
}

async function lireEtTenir(ctx, equipe, operateur) {
  const carnet = await lireCarnet(ctx, equipe, operateur);
  if (!carnet) return;
  const autrePeuple = (p) =>
    p.trouveePar && String(p.trouveePar.type).toLowerCase() !== equipe.type;
  const aTenir = (carnet.pages || []).filter(
    (p) => ['trouvee', 'reparee'].includes(p.etat) && autrePeuple(p),
  );
  let tenues = 0;
  for (const page of ctx.rng.shuffle(aTenir)) {
    if (tenues >= MAX_PAGES_TENUES_PAR_SEANCE) break;
    const r = await ouvrirEtTenir(ctx, equipe, operateur, page.zoneKey);
    if (r === 'tenue') tenues += 1;
    if (r === 'refus') break;
  }
  // Une page trouvée par l'équipe et pas encore lue par elle : la lire évite le pâlissement.
  const miennes = (carnet.pages || []).filter(
    (p) =>
      ['trouvee', 'reparee'].includes(p.etat) &&
      p.trouveePar &&
      Number(p.trouveePar.id) === equipe.id,
  );
  const aLire = miennes.find((p) => Number(p.palissementPct) > 0) || ctx.rng.pick(miennes);
  if (aLire && ctx.rng.chance(0.7))
    await ouvrirEtTenir(ctx, equipe, operateur, aLire.zoneKey, { tentatives: 0 });
}

// ---------------------------------------------------------------------
// Marché (élèves seulement : jamais le prof)
// ---------------------------------------------------------------------

async function bourses(ctx, joueur) {
  const row = await ctx.db.queryOne(
    'SELECT health_points, power_points FROM gl_players WHERE id = ?',
    [joueur.id],
  );
  return { coeurs: Number(row?.health_points) || 0, gemmes: Number(row?.power_points) || 0 };
}

async function marche(ctx, equipe, { veillee = false } = {}) {
  if (ctx.resolved.marche === false) return;
  if (!veillee && ctx.partie.surface === 'tableau') return;
  const presents = equipe.presents.filter((j) => !ctx.retraits.has(j.id));
  if (presents.length < 2) return;
  const pMarche = penchant(equipe, 'marche');
  const pDons = penchant(equipe, 'dons');
  // Don : le plus riche (dans la ressource du peuple) donne une unité au moins riche.
  if (ctx.rng.chance(pDons * (veillee ? 0.5 : 0.25))) {
    const soldes = [];
    for (const j of presents) soldes.push({ j, ...(await bourses(ctx, j)) });
    const cle = equipe.type === 'unicorn' ? 'gemmes' : 'coeurs';
    soldes.sort((a, b) => b[cle] - a[cle]);
    const riche = soldes[0];
    const pauvre = soldes[soldes.length - 1];
    if (riche[cle] >= 2 && riche[cle] - pauvre[cle] >= 1) {
      const res = await ctx.client.appel({
        token: riche.j.token,
        method: 'post',
        path: '/api/gl/market/dons',
        body: { receveurId: pauvre.j.id, [cle]: 1 },
        acteur: 'eleve',
        membres: equipe.membres,
        geste: 'don',
      });
      if (res.status === 201) ctx.compteurs.dons += 1;
      await ctx.verifierInvariants('don', equipe);
    }
  }
  // Annonce « cherche » d'un élève à sec.
  if (ctx.rng.chance(pMarche * 0.2)) {
    const j = ctx.rng.pick(presents);
    const b = await bourses(ctx, j);
    const cherche = b.gemmes === 0 ? { gemmes: 1 } : b.coeurs === 0 ? { coeurs: 1 } : null;
    if (cherche) {
      const res = await ctx.client.appel({
        token: j.token,
        method: 'post',
        path: '/api/gl/market/annonces',
        body: { type: 'cherche', cherche },
        acteur: 'eleve',
        membres: equipe.membres,
        geste: 'annonce',
      });
      if (res.status === 201) ctx.compteurs.annonces += 1;
    }
  }
  // Parure : un membre riche achète (dépense sans effet de jeu).
  if (ctx.resolved.parures !== false && ctx.rng.chance(pMarche * 0.12)) {
    const j = ctx.rng.pick(presents);
    const b = await bourses(ctx, j);
    const cle = equipe.type === 'unicorn' ? 'gemmes' : 'coeurs';
    if (b[cle] >= 5) {
      const cat = await ctx.client.appel({
        token: j.token,
        method: 'get',
        path: '/api/gl/market/parures',
        acteur: 'eleve',
        membres: equipe.membres,
        geste: 'parures',
      });
      const dispo = (cat.body?.catalogue || []).filter(
        (p) =>
          p.disponible !== false &&
          Number(p.prix) <= b[cle] - 2 &&
          ['choix', cle].includes(String(p.ressource || 'choix')),
      );
      const parure = ctx.rng.pick(dispo);
      if (parure) {
        const res = await ctx.client.appel({
          token: j.token,
          method: 'post',
          path: `/api/gl/market/parures/${encodeURIComponent(parure.code)}/acheter`,
          body: { ressource: cle },
          acteur: 'eleve',
          membres: equipe.membres,
          geste: 'parure-achat',
        });
        if (res.status === 201 || res.status === 200) ctx.compteurs.parures += 1;
        await ctx.verifierInvariants('parure', equipe);
      }
    }
  }
}

// ---------------------------------------------------------------------
// Tour complet d'une équipe en phase `jeu`
// ---------------------------------------------------------------------

/**
 * @param {object} ctx contexte de séance (client, oracle, rng, partie, resolved, mjToken, db,
 *   retraits, compteurs, verifierInvariants, equipeParId, operateurDe)
 * @param {object} equipe `{ id, type, name, membres, presents }`
 * @param {object} tour vue `GET /tenir/tour` (teams, voilePosition)
 */
async function jouerEquipe(ctx, equipe, tour) {
  const operateur = ctx.operateurDe(equipe);
  ctx.client.setContexte({ equipe: equipe.name, equipeId: equipe.id });
  if (!equipe.presents.length) {
    ctx.compteurs.equipesAbsentes += 1;
    return;
  }
  const moi = tour.teams.find((t) => Number(t.id) === equipe.id);
  if (!moi?.auCamp) await sortsAvantJet(ctx, equipe, operateur);
  await jeterEtAvancer(ctx, equipe, operateur);
  if (!moi?.auCamp) await sortsApresJet(ctx, equipe, operateur);
  await sortsEntraide(ctx, equipe, operateur, tour);
  await fouiller(ctx, equipe, operateur);
  await lireEtTenir(ctx, equipe, operateur);
  await marche(ctx, equipe);
}

module.exports = {
  SORTS,
  api,
  acteurPour,
  lancerSort,
  lancerDes,
  repondreCase,
  traiterArrivee,
  jeterEtAvancer,
  lireCarnet,
  fouiller,
  ouvrirEtTenir,
  lireEtTenir,
  marche,
  jouerEquipe,
  bourses,
};
