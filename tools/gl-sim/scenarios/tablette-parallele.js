'use strict';

/**
 * Scénario `tablette-parallele-absences` (lot 2, § 6.11) : un chapitre 3 joué par **quatre
 * tablettes d'équipe** ouvertes par le lien de classe, équipes en parallèle (`Promise.all`).
 * Les équipes confirment elles-mêmes leurs présences (absences posées aux séances 2 et 4), le
 * prof pose des retraits, et des sondes rejouent les cas délicats du jeu en parallèle :
 *
 * - `CORDEE` : une équipe offre la Cordée à une équipe de l'autre peuple, avant leurs jets ;
 * - `RELANCE` : deux Relances lancées au même instant par la même équipe (une seule passe) ;
 * - `REFUS` : un sort exécuté par le prof, refusé et rendu (bourses de l'équipe inchangées) ;
 * - `QUESTION` : une équipe déplacée par le prof garde la question de case qui l'attendait.
 *
 * Attendus : 0 réponse 5xx, livre équilibré, **aucune demande du tour en attente après sa
 * clôture** (seuls restent un défi de case à préparer, les propositions d'élèves à relire et un
 * sort d'activité que le prof appliquera après le tour) et plus rien après le Seuil. Chaque point est une assertion du rapport (`ok` vrai / faux / `null`
 * quand l'exécution n'a pas permis de le vérifier).
 */

const { scenario, absencesPosees, retraitsPoses } = require('./base');
const { api, lancerSort, lancerDes, traiterArrivee, SORTS } = require('../equipe');
const { checkTenirInvariantsFromDb } = require('../../../lib/glTenirInvariants');

/**
 * Demandes qui passent à bon droit la clôture d'un tour : un défi de case à préparer pour la
 * séance suivante, une proposition d'élève à relire, un sort d'activité (il s'applique après le
 * tour, pendant l'activité de classe, et se rend seul à l'ouverture du tour suivant).
 */
const REPORTABLES = Object.freeze(['defi_case', 'plume', 'chimere', 'sort_a_appliquer']);
const SORTS_DU_PROF = Object.freeze(['SL004', 'SL046', 'SL047', 'SL021', SORTS.NOMMER]);

function noter(ctx, code, ok, detail) {
  if (!ctx.cache.sondes) ctx.cache.sondes = {};
  // Une sonde déjà concluante n'est pas écrasée par une tentative ultérieure sans objet.
  if (ctx.cache.sondes[code]?.ok === true) return;
  ctx.cache.sondes[code] = { ok, detail };
}

function ressourceDe(equipe) {
  return equipe.type === 'unicorn' ? 'gemmes' : 'coeurs';
}

async function sommeBourses(ctx, equipe) {
  const row = await ctx.db.queryOne(
    `SELECT SUM(p.health_points) + SUM(p.power_points) AS t
       FROM gl_players p INNER JOIN gl_team_members tm ON tm.player_id = p.id
      WHERE tm.game_id = ? AND tm.team_id = ?`,
    [ctx.partie.gameId, equipe.id],
  );
  const reserve = await ctx.db.queryOne(
    'SELECT COALESCE(SUM(reserve_health), 0) + COALESCE(SUM(reserve_power), 0) AS t FROM gl_game_team_reserves WHERE game_id = ? AND team_id = ?',
    [ctx.partie.gameId, equipe.id],
  );
  return (Number(row?.t) || 0) + (Number(reserve?.t) || 0);
}

function jouables(ctx, tour) {
  return ctx.partie.equipes.filter(
    (e) => e.presents.length && !tour.teams.find((t) => Number(t.id) === e.id)?.auCamp,
  );
}

async function sondeCordee(ctx, tour) {
  const dispo = jouables(ctx, tour);
  const lanceuse = dispo[0];
  const partenaire = dispo.find((e) => lanceuse && e.type !== lanceuse.type);
  if (!lanceuse || !partenaire) return noter(ctx, 'CORDEE', null, 'pas deux peuples en jeu');
  const r = await lancerSort(ctx, lanceuse, ctx.operateurDe(lanceuse), SORTS.CORDEE, {
    partnerTeamId: partenaire.id,
  });
  ctx.cache.cordee = r.ok ? [lanceuse.id, partenaire.id] : [];
  return noter(
    ctx,
    'CORDEE',
    r.ok ? true : r.status >= 400 && r.status < 500 ? null : false,
    r.ok
      ? `${lanceuse.name} encorde ${partenaire.name}`
      : `Cordée non lancée : ${r.status} ${r.code || ''}`,
  );
}

async function sondeRelanceConcurrente(ctx, tour) {
  const encordees = new Set(ctx.cache.cordee || []);
  const equipe = jouables(ctx, tour).find((e) => !encordees.has(e.id));
  if (!equipe) return noter(ctx, 'RELANCE', null, 'aucune équipe libre');
  const operateur = ctx.operateurDe(equipe);
  const jet = await lancerDes(ctx, equipe, operateur);
  if (!jet) return noter(ctx, 'RELANCE', null, 'jet refusé');
  if (!jet.arrival?.enSuspens) {
    await traiterArrivee(ctx, equipe, operateur, jet.arrival);
    return noter(ctx, 'RELANCE', null, 'jet appliqué sans attendre : Relance hors de portée');
  }
  const lancer = () =>
    lancerSort(ctx, equipe, operateur, SORTS.RELANCE, { ressource: ressourceDe(equipe) });
  const resultats = await Promise.all([lancer(), lancer()]);
  const reussies = resultats.filter((r) => r.ok).length;
  if (reussies === 0) {
    // Aucune Relance : la tablette garde son jet, la case s'applique.
    const garde = await ctx.client.appel({
      token: equipe.sessionToken,
      method: 'post',
      path: api(ctx, '/tenir/arrivee/garder'),
      body: {},
      acteur: 'eleve',
      membres: equipe.membres,
      geste: 'garder',
    });
    if (garde.status === 200) await traiterArrivee(ctx, equipe, operateur, garde.body?.arrival);
  }
  return noter(
    ctx,
    'RELANCE',
    reussies <= 1,
    `deux Relances au même instant : ${resultats.map((r) => `${r.status} ${r.code || 'ok'}`).join(' | ')}`,
  );
}

async function sondeSortRefuse(ctx, tour) {
  for (const equipe of jouables(ctx, tour)) {
    const avant = await sommeBourses(ctx, equipe);
    for (const code of SORTS_DU_PROF) {
      const r = await lancerSort(ctx, equipe, ctx.operateurDe(equipe), code, {
        ressource: ressourceDe(equipe),
      });
      if (!r.ok) continue;
      const refus = await ctx.client.appel({
        token: ctx.mjToken,
        method: 'post',
        path: api(ctx, `/spell-casts/drafts/${r.draftId}/refuser`),
        body: {},
        geste: 'sort-refuser',
      });
      await ctx.verifierInvariants('sort refusé', equipe);
      const apres = await sommeBourses(ctx, equipe);
      const file = await ctx.db.queryOne(
        "SELECT COUNT(*) AS n FROM gl_game_demandes WHERE game_id = ? AND ref_id = ? AND statut = 'en_attente'",
        [ctx.partie.gameId, String(r.draftId)],
      );
      return noter(
        ctx,
        'REFUS',
        refus.status === 200 && apres === avant && Number(file?.n) === 0,
        `${code} refusé : ${refus.status}, bourses et réserve ${avant} → ${apres}, ligne de file restante : ${Number(file?.n) || 0}`,
      );
    }
  }
  return noter(ctx, 'REFUS', null, 'aucun sort du prof lançable à ce tour');
}

async function avanceLibre(ctx, equipe, cases) {
  return ctx.client.appel({
    token: ctx.mjToken,
    method: 'post',
    path: api(ctx, '/tenir/lancer'),
    body: { mode: 'libre', teamId: equipe.id, cases, motif: 'sonde : équipe déplacée' },
    geste: 'avance-libre',
  });
}

async function sondeQuestionDeplacee(ctx, tour) {
  const equipe = jouables(ctx, tour).slice(-1)[0];
  if (!equipe) return noter(ctx, 'QUESTION', null, 'aucune équipe en jeu');
  let markerId = null;
  for (let i = 0; i < 8 && markerId == null; i += 1) {
    const r = await avanceLibre(ctx, equipe, 1);
    if (r.status >= 400) break;
    const arrivee = r.body?.arrival;
    if (arrivee?.question && arrivee.markerId) markerId = Number(arrivee.markerId);
    else await traiterArrivee(ctx, equipe, null, arrivee);
  }
  await ctx.verifierInvariants('avance libre', equipe);
  if (markerId == null) return noter(ctx, 'QUESTION', null, 'aucune case à question à portée');
  // L'équipe est déplacée avant d'avoir répondu : sa question l'attend toujours.
  const deplace = await avanceLibre(ctx, equipe, 1);
  if (deplace.status < 400 && !deplace.body?.arrival?.question) {
    await traiterArrivee(ctx, equipe, null, deplace.body?.arrival);
  }
  const vue = await ctx.client.appel({
    token: ctx.mjToken,
    method: 'get',
    path: api(ctx, '/tenir/tour'),
    geste: 'lire-tour',
  });
  const due = (vue.body?.round?.questionsEnAttente || []).some(
    (q) => Number(q.teamId) === equipe.id && Number(q.markerId) === markerId,
  );
  const pres = await ctx.client.appel({
    token: equipe.sessionToken,
    method: 'post',
    path: api(ctx, `/markers/${markerId}/present-question`),
    body: {},
    acteur: 'eleve',
    membres: equipe.membres,
    geste: 'repondre',
  });
  let repondu = null;
  if (pres.status === 200 && pres.body?.presentation) {
    const { choiceId } = await ctx.oracle.choisir(pres.body.presentation, 1, ctx.rng);
    const rep = await ctx.client.appel({
      token: equipe.sessionToken,
      method: 'post',
      path: api(ctx, '/qcm/answer'),
      body: {
        questionCode: pres.body.questionCode,
        presentationToken: pres.body.presentation.presentationToken,
        choiceId,
      },
      acteur: 'eleve',
      membres: equipe.membres,
      geste: 'repondre',
    });
    repondu = rep.status;
    await ctx.verifierInvariants('réponse après déplacement', equipe);
  }
  return noter(
    ctx,
    'QUESTION',
    deplace.status < 400 && due && pres.status === 200 && repondu === 200,
    `déplacée ${deplace.status}, question en attente : ${due}, présentation ${pres.status}, réponse ${repondu ?? 'non donnée'}`,
  );
}

async function avantEquipes(ctx, tour, seance) {
  if (seance === 1) {
    await sondeCordee(ctx, tour);
    await sondeRelanceConcurrente(ctx, tour);
  }
  if (seance >= 2 && ctx.cache.sondes?.REFUS?.ok !== true) await sondeSortRefuse(ctx, tour);
  if (seance >= 2 && ctx.cache.sondes?.QUESTION?.ok !== true) {
    await sondeQuestionDeplacee(ctx, tour);
  }
}

/** Après la clôture du tour : ce qui attend encore un geste du prof, par type. */
async function apresSeance(ctx, _resume, seance) {
  const rows = await ctx.db.queryAll(
    "SELECT kind, COUNT(*) AS n FROM gl_game_demandes WHERE game_id = ? AND statut = 'en_attente' GROUP BY kind",
    [ctx.partie.gameId],
  );
  if (!ctx.cache.demandes) ctx.cache.demandes = [];
  ctx.cache.demandes.push({
    seance,
    parType: Object.fromEntries(rows.map((r) => [String(r.kind), Number(r.n)])),
  });
}

async function assertions(ctx) {
  const { db } = ctx;
  const gameId = ctx.partie.gameId;
  const sondes = ctx.cache.sondes || {};
  const out = [];
  const push = (code, ok, detail) => out.push({ code, ok, detail });

  push('G-5xx', ctx.client.stats.erreurs5xx === 0, `${ctx.client.stats.erreurs5xx} réponse(s) 5xx`);
  const livre = await db.withTransaction((tx) =>
    checkTenirInvariantsFromDb(tx, gameId, ctx.settings),
  );
  push(
    'LIVRE',
    livre.ok,
    livre.ok
      ? `livre équilibré (${ctx.compteurs.invariantsVerifies} contrôles pendant le chapitre)`
      : livre.violations.map((v) => v.code).join(', '),
  );

  const parSeance = ctx.cache.demandes || [];
  const bloquees = parSeance.flatMap((d) =>
    Object.entries(d.parType)
      .filter(([kind]) => !REPORTABLES.includes(kind))
      .map(([kind, n]) => `séance ${d.seance} : ${n} × ${kind}`),
  );
  const reportees = parSeance.reduce(
    (acc, d) => acc + REPORTABLES.reduce((a, k) => a + (d.parType[k] || 0), 0),
    0,
  );
  push(
    'D-TOUR',
    parSeance.length ? bloquees.length === 0 : null,
    bloquees.length
      ? bloquees.join(' ; ')
      : `aucune demande du tour en attente après ${parSeance.length} clôture(s) ; reportées à bon droit (défi à préparer, proposition à relire, sort d’activité) : ${reportees}`,
  );
  const fin = await db.queryOne(
    "SELECT COUNT(*) AS n FROM gl_game_demandes WHERE game_id = ? AND statut = 'en_attente'",
    [gameId],
  );
  push(
    'D-SEUIL',
    Number(fin?.n) === 0,
    `${Number(fin?.n) || 0} demande(s) en attente après le Seuil`,
  );

  const sessions = await db.queryOne(
    "SELECT COUNT(*) AS n, COUNT(DISTINCT team_id) AS equipes FROM gl_guest_tokens WHERE game_id = ? AND kind = 'team_session'",
    [gameId],
  );
  const gestes = await db.queryOne(
    "SELECT COUNT(*) AS n FROM gl_game_events WHERE game_id = ? AND actor_id LIKE 'equipe-%'",
    [gameId],
  );
  push(
    'SESSIONS',
    Number(sessions?.equipes) === ctx.partie.equipes.length && Number(gestes?.n) > 0,
    `${Number(sessions?.n) || 0} session(s) d'équipe pour ${Number(sessions?.equipes) || 0} équipe(s), ${Number(gestes?.n) || 0} geste(s) portés par une tablette`,
  );
  const presences = await db.queryOne(
    'SELECT COUNT(*) AS n, COUNT(DISTINCT round_number) AS tours FROM gl_game_round_presences WHERE game_id = ?',
    [gameId],
  );
  push(
    'PRESENCES',
    Number(presences?.n) === Number(presences?.tours) * ctx.partie.equipes.length &&
      Number(presences?.tours) > 0,
    `${Number(presences?.n) || 0} présence(s) confirmée(s) par les équipes sur ${Number(presences?.tours) || 0} tour(s)`,
  );
  const retraits = await db.queryOne(
    'SELECT COUNT(*) AS n FROM gl_game_retraits WHERE game_id = ?',
    [gameId],
  );
  push(
    'RETRAIT',
    Number(retraits?.n) > 0 ? true : null,
    `${Number(retraits?.n) || 0} retrait(s) posé(s)`,
  );

  for (const [code, libelle] of [
    ['CORDEE', 'Cordée offerte'],
    ['RELANCE', 'Relance concurrente'],
    ['REFUS', 'sort du prof refusé et rendu'],
    ['QUESTION', 'équipe déplacée avec une question en attente'],
  ]) {
    push(code, sondes[code]?.ok ?? null, `${libelle} : ${sondes[code]?.detail || 'non sondé'}`);
  }
  return out;
}

module.exports = Object.freeze({
  ...scenario({
    id: 'tablette-parallele-absences',
    description:
      'Quatre tablettes d’équipe (lien de classe) en parallèle au chapitre 3 : présences confirmées par les équipes, absences, retraits, Cordée, Relance concurrente, sort du prof refusé, équipe déplacée avec une question en attente.',
    surface: 'tablette',
    parallele: true,
    plateaux: [3],
    prof: { absences: absencesPosees, retraits: retraitsPoses },
  }),
  sessionsEquipe: true,
  crochets: { avantEquipes, apresSeance },
  assertions,
});
