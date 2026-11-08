'use strict';

/**
 * La semaine entre deux séances : l'horloge avance jour par jour (`X-GL-Sim-Clock`) et chaque
 * élève, avec la probabilité `veillee` de sa persona, fait une action de veillée un soir :
 * lecture / tenue d'une page (limite `pages_veillee_par_semaine`), étude d'une espèce du biome
 * (piste : la zone liée se révèle), ou Marché (don, annonce). Le tour est clos : l'API sert
 * `via: 'veillee'`. Les gestes sont ceux d'un élève connecté (crible du client).
 */

const { ouvrirEtTenir, lireCarnet, marche, api } = require('./equipe');

async function especesDuChapitre(ctx) {
  if (ctx.cache.especes) return ctx.cache.especes;
  const rows = await ctx.db.queryAll(
    `SELECT s.species_code FROM gl_species s
      WHERE s.statut = 'actif' AND s.biome_slug IN (SELECT biome_slug FROM gl_chapter_biomes WHERE chapter_id = ?)`,
    [ctx.partie.chapitre.id],
  );
  ctx.cache.especes = rows.map((r) => String(r.species_code));
  return ctx.cache.especes;
}

async function etudierEspece(ctx, equipe, joueur) {
  const especes = await especesDuChapitre(ctx);
  const code = ctx.rng.pick(especes);
  if (!code) return;
  const res = await ctx.client.appel({
    token: joueur.token,
    method: 'post',
    path: `/api/gl/learning/species/${encodeURIComponent(code)}`,
    body: { confirm: true, gameId: ctx.partie.gameId },
    acteur: 'eleve',
    membres: equipe.membres,
    geste: 'etude-espece',
  });
  if (res.status === 200) {
    ctx.compteurs.etudes += 1;
    if (res.body?.piste?.zoneKey && !res.body.piste.limite && !res.body.piste.deja)
      ctx.compteurs.pistes += 1;
  }
}

async function lectureDeVeillee(ctx, equipe, joueur) {
  const carnet = await lireCarnet(ctx, equipe, joueur);
  if (!carnet) return;
  const autrePeuple = (p) =>
    p.trouveePar && String(p.trouveePar.type).toLowerCase() !== equipe.type;
  const candidates = (carnet.pages || []).filter(
    (p) => ['trouvee', 'reparee'].includes(p.etat) && autrePeuple(p),
  );
  const page = ctx.rng.pick(candidates);
  if (page) {
    const r = await ouvrirEtTenir(ctx, equipe, joueur, page.zoneKey, { tentatives: 2 });
    if (r === 'tenue') ctx.compteurs.pagesTenuesVeillee += 1;
    return;
  }
  const lisibles = (carnet.pages || []).filter((p) =>
    ['trouvee', 'reparee', 'tenue'].includes(p.etat),
  );
  const lue = ctx.rng.pick(lisibles);
  if (lue) await ouvrirEtTenir(ctx, equipe, joueur, lue.zoneKey, { tentatives: 0 });
}

/**
 * Sept jours de veillée. `jours` (défaut 7) permet des semaines courtes en CI.
 */
async function jouerVeillee(ctx, { jours = 7 } = {}) {
  ctx.client.setContexte({ phase: 'veillee', equipe: null });
  const planning = new Map(); // jour → [{ joueur, equipe, action }]
  for (const eq of ctx.partie.equipes) {
    for (const id of eq.membres) {
      const j = ctx.joueurs.get(id);
      if (!j || ctx.retraits.has(id)) continue;
      if (!ctx.rng.chance(j.persona.veillee)) continue;
      const jour = ctx.rng.int(1, jours);
      const u = ctx.rng.next();
      const action = u < 0.5 ? 'lecture' : u < 0.8 ? 'espece' : 'marche';
      if (!planning.has(jour)) planning.set(jour, []);
      planning.get(jour).push({ joueur: j, equipe: eq, action });
    }
  }
  for (let jour = 1; jour <= jours; jour += 1) {
    ctx.horloge.avancerJours(1);
    ctx.horloge.appliquerAuServeur();
    for (const { joueur, equipe, action } of planning.get(jour) || []) {
      ctx.client.setContexte({ equipe: equipe.name, equipeId: equipe.id, jour });
      ctx.compteurs.actionsVeillee += 1;
      if (action === 'lecture') await lectureDeVeillee(ctx, equipe, joueur);
      else if (action === 'espece') await etudierEspece(ctx, equipe, joueur);
      else {
        equipe.presents = equipe.membres.map((id) => ctx.joueurs.get(id)).filter(Boolean);
        await marche(ctx, equipe, { veillee: true });
      }
      await ctx.verifierInvariants(`veillée ${action}`, equipe);
    }
  }
  // La séance suivante tombe le même jour de la semaine : l'horloge a avancé de `jours` jours.
  ctx.client.setContexte({ jour: null });
  return { actions: [...planning.values()].reduce((a, l) => a + l.length, 0) };
}

module.exports = { especesDuChapitre, etudierEspece, lectureDeVeillee, jouerVeillee, api };
