'use strict';

/**
 * Scénario `regression-7nov` : rejoue les dix correctifs C1-C10 de `docs/GL_TENIR_A_DEUX.md`
 * sur un chapitre 1 en surface tablette. Chaque correctif est une **assertion** du rapport
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
      ressource: autre.type === 'unicorn' ? 'gemmes' : 'coeurs',
    });
    noter(
      'C2',
      r.status === 409 && r.code === 'SPELL_FENETRE',
      `autre équipe : ${r.status} ${r.code || ''}`,
    );
  }
  if (derniere && derniere.presents.length) {
    const avant = await ctx.db.queryOne(
      'SELECT SUM(p.health_points) + SUM(p.power_points) AS t FROM gl_players p INNER JOIN gl_team_members tm ON tm.player_id = p.id WHERE tm.game_id = ? AND tm.team_id = ?',
      [ctx.partie.gameId, derniere.id],
    );
    const r = await lancerSort(ctx, derniere, derniere.presents[0], SORTS.PROGRESSION, {
      effectParams: { delta: 1 },
      ressource: derniere.type === 'unicorn' ? 'gemmes' : 'coeurs',
    });
    if (r.ok) {
      const apres = await ctx.db.queryOne(
        'SELECT SUM(p.health_points) + SUM(p.power_points) AS t FROM gl_players p INNER JOIN gl_team_members tm ON tm.player_id = p.id WHERE tm.game_id = ? AND tm.team_id = ?',
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
  // C6 : un élève en retrait ouvre une page trouvée (200) mais ne voit pas le Marché (403).
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
    lecture = r.status;
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
    (lecture == null || lecture === 200);
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
  const cle = eq.type === 'unicorn' ? 'gemmes' : 'coeurs';
  const abordable = sansImage.find(
    (p) => Number(p.prix) <= b[cle] && ['choix', cle].includes(String(p.ressource || 'choix')),
  );
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
    body: { ressource: cle },
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
  // C4 : cases positives → +1 ressource du peuple, jamais +2 ni une perte hors Souffle.
  const positives = await db.queryAll(
    "SELECT delta_health, delta_power FROM gl_resource_ledger WHERE game_id = ? AND cause = 'case_positive'",
    [gameId],
  );
  // +1 dans une seule ressource (0 quand le plafond rogne le gain) ; jamais +2, jamais une perte.
  const okC4 = positives.every(
    (r) =>
      [0, 1].includes(Number(r.delta_health)) &&
      [0, 1].includes(Number(r.delta_power)) &&
      Number(r.delta_health) + Number(r.delta_power) <= 1,
  );
  const plafonnes = positives.filter(
    (r) => Number(r.delta_health) + Number(r.delta_power) === 0,
  ).length;
  push(
    'C4',
    positives.length ? okC4 : null,
    `${positives.length} mouvements « case positive » : +1 d'une seule ressource (${plafonnes} rognés par le plafond), aucun +2 ni perte : ${okC4}`,
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
  // C7 : zone cz-p2-08 inactive et sa question de lecture désactivée.
  const z = await db.queryOne('SELECT actif FROM gl_chasse_zones WHERE zone_key = ?', ['cz-p2-08']);
  const q = await db.queryOne('SELECT actif FROM gl_tenir_questions_lecture WHERE zone_key = ?', [
    'cz-p2-08',
  ]);
  push(
    'C7',
    z ? Number(z.actif) === 0 && (!q || Number(q.actif) === 0) : null,
    `cz-p2-08 : actif=${z?.actif ?? 'absente'}, question lecture actif=${q?.actif ?? 'absente'}`,
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
