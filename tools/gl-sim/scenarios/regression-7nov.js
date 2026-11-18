'use strict';

/**
 * Scénario `regression-7nov` : rejoue les dix correctifs C1-C10 de `docs/GL_TENIR_A_DEUX.md`
 * sur un chapitre 1 en surface tablette (C7 dans sa forme actuelle : la décision L5 l'a remplacée). Chaque correctif est une **assertion** du rapport
 * (`assertions[]`, `ok` vrai / faux / `null` si non vérifiable dans l'exécution) ; les sondes
 * actives (C1, C2, C6, C10) sont jouées par le crochet `apresEquipes` de la séance 1 et 2.
 */

const { scenario } = require('./base');
const { api, lancerSort, SORTS, bourses } = require('../equipe');

const sondes = {};

function noter(code, ok, detail) {
  sondes[code] = { code, ok, detail };
}

async function sondeProgression(ctx, tour) {
  // Dernier jet du tour : seule son équipe peut lancer Progression (C1/C2) ; une autre reçoit
  // 409 SPELL_FENETRE. La case +1 n'est pas appliquée : aucune ressource de Trame créée.
  const dernier = tour.round?.dernierJet;
  if (!dernier?.teamId) return noter('C1', null, 'aucun jet mémorisé ce tour');
  const autre = ctx.partie.equipes.find(
    (e) => e.id !== Number(dernier.teamId) && e.presents.length,
  );
  const derniere = ctx.equipeParId(dernier.teamId);
  if (autre) {
    const r = await lancerSort(ctx, autre, autre.presents[0], SORTS.PROGRESSION, {
      effectParams: { delta: 1 },
    });
    noter(
      'C2',
      r.status === 409 && r.code === 'SPELL_FENETRE',
      `autre équipe : ${r.status} ${r.code || ''}`,
    );
  }
  if (derniere && derniere.presents.length) {
    const avant = await ctx.db.queryOne(
      'SELECT SUM(p.power_points) AS t FROM gl_players p INNER JOIN gl_team_members tm ON tm.player_id = p.id WHERE tm.game_id = ? AND tm.team_id = ?',
      [ctx.partie.gameId, derniere.id],
    );
    const r = await lancerSort(ctx, derniere, derniere.presents[0], SORTS.PROGRESSION, {
      effectParams: { delta: 1 },
    });
    if (r.ok) {
      const apres = await ctx.db.queryOne(
        'SELECT SUM(p.power_points) AS t FROM gl_players p INNER JOIN gl_team_members tm ON tm.player_id = p.id WHERE tm.game_id = ? AND tm.team_id = ?',
        [ctx.partie.gameId, derniere.id],
      );
      const delta = Number(apres.t) - Number(avant.t);
      noter(
        'C1',
        delta === -1 && r.body?.effectResult?.arrival === undefined,
        `Progression acceptée, Δ bourses = ${delta}, case appliquée = ${r.body?.effectResult?.arrival !== undefined}`,
      );
    } else {
      noter(
        'C1',
        r.code === 'SPELL_LIMITE' || r.code === 'SPELL_FENETRE' || r.status === 409 ? null : false,
        `Progression : ${r.status} ${r.code || ''}`,
      );
    }
  }
}

async function sondeRetrait(ctx) {
  // C6, remplacé par la décision M13 de l'ensemble unifié (absent spectateur) : depuis son
  // compte, un élève en retrait regarde le tour — ouvrir une page lui répond 403 `SPECTATEUR`
  // pendant un tour ouvert (200 en veillée) — et ne voit pas le Marché (403).
  const pages = await ctx.db.queryAll(
    `SELECT z.zone_key, p.trouvee_par_team_id FROM gl_game_chasse_pages p INNER JOIN gl_chasse_zones z ON z.id = p.zone_id
      WHERE p.game_id = ? AND p.etat IN ('trouvee', 'reparee', 'tenue') LIMIT 5`,
    [ctx.partie.gameId],
  );
  const eq = ctx.partie.equipes.find((e) => e.presents.length);
  if (!eq) return noter('C6', null, 'aucune équipe présente');
  const j = eq.presents[0];
  await ctx.client.appel({
    token: ctx.mjToken,
    method: 'post',
    path: api(ctx, '/tenir/retrait'),
    body: { playerId: j.id, entree: true, motif: 'sonde C6' },
    geste: 'retrait-sonde',
  });
  ctx.retraits.add(j.id);
  const marche = await ctx.client.appel({
    token: j.token,
    method: 'get',
    path: '/api/gl/market/annonces',
    acteur: 'eleve',
    membres: eq.membres,
    geste: 'marche-retrait',
  });
  let lecture = null;
  if (pages.length) {
    const r = await ctx.client.appel({
      token: j.token,
      method: 'post',
      path: api(ctx, `/chasse/pages/${pages[0].zone_key}/ouvrir`),
      body: {},
      acteur: 'eleve',
      membres: eq.membres,
      geste: 'ouvrir-retrait',
    });
    lecture = r.status === 403 ? `403 ${r.body?.code || ''}`.trim() : r.status;
  }
  await ctx.client.appel({
    token: ctx.mjToken,
    method: 'post',
    path: api(ctx, '/tenir/retrait'),
    body: { playerId: j.id, entree: false },
    geste: 'retrait-sonde-fin',
  });
  ctx.retraits.delete(j.id);
  const ok =
    marche.status === 403 &&
    marche.body?.code === 'MARCHE_RETRAIT' &&
    (lecture == null || lecture === 200 || lecture === '403 SPECTATEUR');
  noter(
    'C6',
    ok,
    `Marché ${marche.status} ${marche.body?.code || ''} ; ouvrir page ${lecture ?? 'non testé'}`,
  );
}

async function sondeParures(ctx) {
  // C10 : une parure sans image est achetable (pastille texte).
  const eq = ctx.partie.equipes.find((e) => e.presents.length);
  if (!eq) return noter('C10', null, 'aucune équipe présente');
  const j = eq.presents[0];
  const cat = await ctx.client.appel({
    token: j.token,
    method: 'get',
    path: '/api/gl/market/parures',
    acteur: 'eleve',
    membres: eq.membres,
    geste: 'parures-sonde',
  });
  if (cat.status !== 200) return noter('C10', false, `catalogue ${cat.status}`);
  const sansImage = (cat.body.catalogue || []).filter(
    (p) => !p.asset && p.achetable !== false && p.disponible !== false,
  );
  if (!sansImage.length) return noter('C10', null, 'aucune parure sans image au catalogue');
  const b = await bourses(ctx, j);
  // Une seule monnaie (M1) : une parure se paie en gemmes ; une parure acquise ne se rachète pas.
  const abordable = sansImage.find((p) => Number(p.prix) <= b.gemmes && p.acquise !== true);
  if (!abordable)
    return noter(
      'C10',
      null,
      `${sansImage.length} parures sans image achetables au catalogue (pastille) ; aucune abordable pour la sonde`,
    );
  const achat = await ctx.client.appel({
    token: j.token,
    method: 'post',
    path: `/api/gl/market/parures/${abordable.code}/acheter`,
    body: {},
    acteur: 'eleve',
    membres: eq.membres,
    geste: 'parure-sonde',
  });
  noter(
    'C10',
    achat.status === 201 || achat.status === 200,
    `achat ${abordable.code} : ${achat.status} ${achat.body?.code || achat.body?.error || ''}`,
  );
}

async function apresEquipes(ctx, tour, seance) {
  if (seance === 1) await sondeProgression(ctx, tour);
  if (seance === 2) {
    await sondeRetrait(ctx);
    await sondeParures(ctx);
  }
}

/** Assertions passives (lecture de la base après le chapitre). */
async function assertions(ctx, mesures) {
  const { db } = ctx;
  const gameId = ctx.partie.gameId;
  const out = [];
  const push = (code, ok, detail) => out.push({ code, ok, detail });
  push(
    'C1',
    sondes.C1?.ok ?? null,
    `Progression sans appliquer la case : ${sondes.C1?.detail || 'non sondé'}`,
  );
  push(
    'C2',
    sondes.C2?.ok ?? null,
    `Relance / Progression refusées après le jet d'une autre équipe : ${sondes.C2?.detail || 'non sondé'}`,
  );
  // C3 : au plus une relance de case par équipe et par tour.
  const relances = await db.queryAll(
    "SELECT round_number, team_id, COUNT(*) AS n FROM gl_game_tenir_effets WHERE game_id = ? AND kind = 'relance_case' GROUP BY round_number, team_id",
    [gameId],
  );
  const max = relances.reduce((m, r) => Math.max(m, Number(r.n)), 0);
  const sansRelance = await db.queryOne(
    "SELECT COUNT(*) AS n FROM gl_game_events WHERE game_id = ? AND event_type = 'relance_bonus' AND JSON_EXTRACT(payload_json, '$.relance') = false",
    [gameId],
  );
  push(
    'C3',
    max <= 1,
    `relances de case par équipe et par tour : max ${max} ; bonnes réponses au-delà (+1 case sans relance) : ${Number(sansRelance?.n) || 0}`,
  );
  // C4 : cases positives → au plus +1 gemme (plus rien depuis M3), jamais +2 ni une perte, et
  // jamais un cœur (M1, une seule monnaie).
  const positives = await db.queryAll(
    "SELECT delta_health, delta_power FROM gl_resource_ledger WHERE game_id = ? AND cause = 'case_positive'",
    [gameId],
  );
  const okC4 = positives.every(
    (r) => Number(r.delta_health) === 0 && [0, 1].includes(Number(r.delta_power)),
  );
  const plafonnes = positives.filter(
    (r) => Number(r.delta_health) + Number(r.delta_power) === 0,
  ).length;
  push(
    'C4',
    positives.length ? okC4 : null,
    `${positives.length} mouvements « case positive » : +1 gemme au plus (${plafonnes} rognés par le plafond), aucun +2, aucune perte, aucun cœur : ${okC4}`,
  );
  // C5 : péripéties sur des cases `behavior` sans effet (tonalité négative / neutre), jamais sur un Défi.
  const peripeties = await db.queryAll(
    "SELECT payload_json FROM gl_game_events WHERE game_id = ? AND event_type = 'peripetie'",
    [gameId],
  );
  const labels = peripeties.map((r) => String(JSON.parse(r.payload_json)?.markerLabel || ''));
  const defi = labels.filter((l) => /d[ée]fi/i.test(l)).length;
  push(
    'C5',
    peripeties.length ? defi === 0 : null,
    `${peripeties.length} péripéties tirées (cases : ${[...new Set(labels)].slice(0, 6).join(', ')}) ; sur un Défi : ${defi}`,
  );
  push('C6', sondes.C6?.ok ?? null, `retrait : ${sondes.C6?.detail || 'non sondé'}`);
  // C7, remplacée par la décision L5 de l'ensemble unifié (migration 365) : la zone cz-p2-08,
  // écrite inactive le 7 novembre, est active avec le feuillet ep-I-06, et sa question de
  // lecture est active. L'assertion garde son code et vérifie la règle en vigueur.
  const z = await db.queryOne(
    'SELECT actif, feuillet_code FROM gl_chasse_zones WHERE zone_key = ?',
    ['cz-p2-08'],
  );
  const q = await db.queryOne('SELECT actif FROM gl_tenir_questions_lecture WHERE zone_key = ?', [
    'cz-p2-08',
  ]);
  push(
    'C7',
    z
      ? Number(z.actif) === 1 &&
          z.feuillet_code === 'ep-I-06' &&
          Boolean(q) &&
          Number(q.actif) === 1
      : null,
    `remplacée par L5 (zone active avec ep-I-06, question de lecture active) — cz-p2-08 : actif=${z?.actif ?? 'absente'}, feuillet=${z?.feuillet_code ?? 'absent'}, question lecture actif=${q?.actif ?? 'absente'}`,
  );
  // C8 : les 7 pages de route du plateau 4, dont l'ordre 4 (feuillet d'un plateau antérieur).
  const passeur = await db.queryAll(
    'SELECT ordre FROM gl_tenir_passeur_pages WHERE plateau = 4 AND actif = 1 ORDER BY ordre',
    [],
  );
  const ordres = passeur.map((r) => Number(r.ordre));
  push(
    'C8',
    ordres.length >= 7 && ordres.includes(4),
    `pages de route du plateau 4 : ${ordres.join(', ')}`,
  );
  // C9 : limiteur d'authentification 300 / 15 min par défaut.
  let c9 = null;
  let c9detail = 'non vérifiable';
  try {
    const rl = require('../../../lib/rateLimit');
    c9 =
      Number(rl.AUTH_RATE_LIMIT_DEFAULT) >= 300 &&
      Number(rl.parseAuthRateLimitMax(undefined)) >= 300;
    c9detail = `AUTH_RATE_LIMIT_DEFAULT = ${rl.AUTH_RATE_LIMIT_DEFAULT}, fenêtre ${rl.AUTH_RATE_LIMIT_WINDOW_MS / 60000} min`;
  } catch (err) {
    c9detail = `lib/rateLimit indisponible : ${err.message}`;
  }
  push('C9', c9, c9detail);
  push('C10', sondes.C10?.ok ?? null, `parures sans image : ${sondes.C10?.detail || 'non sondé'}`);
  // Garde-fous transverses relus sur l'exécution.
  push(
    'G-5xx',
    mesures.compteurs && ctx.client.stats.erreurs5xx === 0,
    `${ctx.client.stats.erreurs5xx} réponse(s) 5xx`,
  );
  return out;
}

module.exports = Object.freeze({
  ...scenario({
    id: 'regression-7nov',
    description:
      'Rejoue les dix correctifs C1-C10 de la simulation du 7 novembre ; chaque correctif est une assertion.',
    surface: 'tablette',
  }),
  crochets: { apresEquipes },
  assertions,
});
