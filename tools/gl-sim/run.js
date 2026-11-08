'use strict';

/**
 * Banc de simulation en série « Tenir à deux » :
 *
 *   npm run gl:sim -- --scenario <id|all> [--runs N] [--seed S] [--seances N] [--grille <fichier>]
 *                     [--db foretmap_sim] [--jours-veillee 7] [--mots-interdits souple|strict]
 *                     [--sortie reports/gl-sim] [--arret-premier-echec] [--liste]
 *
 * Une exécution = classe créée par l'API prof (MJ + élèves `sim-<scenario>-<n>`), partie `live`
 * en profil du scénario, séances (ouverture → jeu → souffle → clos), semaine de veillée entre
 * deux séances (horloge `X-GL-Sim-Clock`), clôture par le prof au Seuil ou à la 6e séance.
 * `GL_RANDOM_SEED` fixe l'aléa serveur ; la graine du banc dérive de `--seed`, du scénario et du
 * rang de l'exécution. Invariants, 5xx et mots interdits du moteur font échouer l'exécution avec
 * son contexte (scénario, graine, séance, geste, équipe).
 *
 * Tout tourne **en mémoire** (supertest sur `app`), jamais contre la base de prod (garde-fou).
 */

const path = require('node:path');
const { preparerEnvironnement, RACINE } = require('./env');

function parseArgs(argv) {
  const out = {
    scenario: null,
    runs: 1,
    seed: 7,
    seances: null,
    grille: null,
    db: null,
    joursVeillee: 7,
    motsInterdits: 'souple',
    fuitesBourses: 'echouer',
    sortie: path.join(RACINE, 'reports', 'gl-sim'),
    arretPremierEchec: false,
    liste: false,
    plateaux: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const val = () => argv[++i];
    if (a === '--scenario') out.scenario = val();
    else if (a.startsWith('--scenario=')) out.scenario = a.slice(11);
    else if (a === '--runs') out.runs = Number(val());
    else if (a.startsWith('--runs=')) out.runs = Number(a.slice(7));
    else if (a === '--seed') out.seed = Number(val());
    else if (a.startsWith('--seed=')) out.seed = Number(a.slice(7));
    else if (a === '--seances') out.seances = Number(val());
    else if (a.startsWith('--seances=')) out.seances = Number(a.slice(10));
    else if (a === '--grille') out.grille = val();
    else if (a.startsWith('--grille=')) out.grille = a.slice(9);
    else if (a === '--db') out.db = val();
    else if (a.startsWith('--db=')) out.db = a.slice(5);
    else if (a === '--jours-veillee') out.joursVeillee = Number(val());
    else if (a.startsWith('--jours-veillee=')) out.joursVeillee = Number(a.slice(16));
    else if (a === '--mots-interdits') out.motsInterdits = val();
    else if (a.startsWith('--mots-interdits=')) out.motsInterdits = a.slice(17);
    else if (a === '--fuites-bourses') out.fuitesBourses = val();
    else if (a.startsWith('--fuites-bourses=')) out.fuitesBourses = a.slice(17);
    else if (a === '--sortie') out.sortie = path.resolve(val());
    else if (a.startsWith('--sortie=')) out.sortie = path.resolve(a.slice(9));
    else if (a === '--plateaux') out.plateaux = val().split(',').map(Number);
    else if (a.startsWith('--plateaux=')) out.plateaux = a.slice(11).split(',').map(Number);
    else if (a === '--arret-premier-echec') out.arretPremierEchec = true;
    else if (a === '--liste') out.liste = true;
  }
  if (!Number.isInteger(out.runs) || out.runs < 1) out.runs = 1;
  if (!Number.isFinite(out.seed)) out.seed = 7;
  return out;
}

/**
 * Une exécution complète d'un scénario (tous ses plateaux). Ne lève jamais : renvoie `ok: false`
 * avec `echec` sur une `SimEchec`, et relance toute autre erreur (bogue du banc).
 */
async function executerRun({
  app,
  db,
  scenario,
  variante = null,
  sousScenario = null,
  runIndex,
  seedBase,
  options,
}) {
  const { hashSeed, creerRng } = require('./rng');
  const { genererPersonas, resumerPersonas } = require('./personas');
  const { creerHorloge } = require('./horloge');
  const { creerClient, SimEchec } = require('./client');
  const { creerOracle } = require('./oracle');
  const { appliquerReglages, remettreReglages } = require('./reglages');
  const { creerClasse } = require('./partie');
  const { jouerChapitre } = require('./chapitre');
  const { mesurerAnnee } = require('./mesures');
  const glRandom = require('../../lib/glRandom');
  const glClock = require('../../lib/glClock');

  const sc = { ...scenario, ...(sousScenario || {}) };
  const seedRun = hashSeed(
    String(seedBase),
    sc.id,
    variante ? variante.id : '',
    sousScenario ? sousScenario.id : '',
    String(runIndex),
  );
  process.env.GL_RANDOM_SEED = String(seedRun);
  glRandom.resetForTests();
  glClock.resetSim();
  const rng = creerRng(seedRun);
  const personas = genererPersonas({
    profil: sc.classe,
    effectif: sc.effectif,
    seed: rng,
    strategieFouille: sc.personas?.strategieFouille || null,
    penchants: sc.personas?.penchants || null,
    ...(sc.veillee ? { veillee: sc.veillee } : {}),
  });
  const horloge = creerHorloge();
  horloge.appliquerAuServeur();
  const client = creerClient({
    app,
    horloge,
    motsInterdits: options.motsInterdits,
    fuitesBourses: options.fuitesBourses,
  });
  const oracle = creerOracle(db);
  const reglages = { ...(sc.reglages || {}), ...(variante ? variante.reglages : {}) };
  const precedent = await appliquerReglages(db, reglages);
  const t0 = Date.now();
  const resultat = {
    scenario: sc.id,
    variante: variante ? variante.id : null,
    sousScenario: sousScenario ? sousScenario.id : null,
    classe: sc.classe,
    surface: sc.surface,
    run: runIndex,
    seed: seedRun,
    reglages,
    personas: resumerPersonas(personas),
    chapitres: [],
    annee: null,
    assertions: null,
    ok: true,
    echec: null,
    dureeMs: 0,
    appels: 0,
    erreurs5xx: 0,
    refus: {},
    motsCorpus: 0,
  };
  const scenarioId =
    `${sc.id}${variante ? `-${variante.id}` : ''}${sousScenario ? `-${sousScenario.id}` : ''}`.replace(
      /[^a-z0-9-]/gi,
      '-',
    );
  client.setContexte({ scenario: scenarioId, seed: seedRun, run: runIndex });
  try {
    const stamp = Date.now();
    const base = await creerClasse({ client, scenarioId, personas, stamp });
    const plateaux = options.plateaux || sc.plateaux;
    const seancesMax = options.seances || sc.seances || 6;
    let dernierCtx = null;
    for (let k = 0; k < plateaux.length; k += 1) {
      const plateau = plateaux[k];
      const composition = sc.composition === 'auto' ? 'auto' : 'explicite';
      const chap = await jouerChapitre({
        base: {
          client,
          db,
          oracle,
          rng,
          horloge,
          mjToken: base.mjToken,
          classe: base.classe,
          joueurs: base.joueurs,
        },
        scenario: sc,
        plateau,
        composition,
        seancesMax,
        joursVeillee: options.joursVeillee,
        crochets: sc.crochets || {},
      });
      dernierCtx = chap.ctx;
      resultat.chapitres.push({
        plateau,
        seances: chap.seances,
        mesures: chap.mesures,
        equipes: chap.partie.equipes.map((e) => ({
          id: e.id,
          type: e.type,
          membres: e.membres.length,
        })),
      });
      if (typeof sc.assertions === 'function' && k === plateaux.length - 1) {
        resultat.assertions = await sc.assertions(chap.ctx, chap.mesures);
      }
      // Entre deux chapitres : deux semaines passent.
      horloge.avancerJours(14);
      horloge.appliquerAuServeur();
    }
    if (dernierCtx) resultat.annee = await mesurerAnnee(dernierCtx);
  } catch (err) {
    if (err instanceof SimEchec) {
      resultat.ok = false;
      resultat.echec = { code: err.code, message: err.message, contexte: err.contexte };
    } else {
      resultat.ok = false;
      resultat.echec = {
        code: 'ERREUR_BANC',
        message: err.message,
        contexte: client.getContexte(),
        stack: String(err.stack || '')
          .split('\n')
          .slice(0, 6),
      };
    }
  } finally {
    await remettreReglages(db, precedent);
    glClock.resetSim();
  }
  resultat.dureeMs = Date.now() - t0;
  resultat.appels = client.stats.appels;
  resultat.erreurs5xx = client.stats.erreurs5xx;
  resultat.refus = client.stats.refus;
  resultat.refusExemples = client.stats.refusExemples;
  resultat.motsCorpus = client.stats.motsCorpus.length;
  resultat.motsCorpusExemples = client.stats.motsCorpus.slice(0, 8);
  resultat.fuitesBourses = client.stats.fuitesBourses.reduce((a, f) => a + f.occurrences, 0);
  resultat.fuitesBoursesExemples = client.stats.fuitesBourses.slice(0, 6);
  return resultat;
}

/** Toutes les exécutions d'un scénario (grille et sous-scénarios compris). */
async function executerScenario({ app, db, scenario, options, log }) {
  const runs = [];
  const variantes = scenario.grille
    ? require('./grilles').lireGrille(options.grille || undefined).variantes
    : [null];
  const sous = scenario.sousScenarios || [null];
  for (const variante of variantes) {
    for (const sousScenario of sous) {
      for (let r = 1; r <= options.runs; r += 1) {
        const libelle = [scenario.id, variante?.id, sousScenario?.id, `run ${r}/${options.runs}`]
          .filter(Boolean)
          .join(' · ');
        log(`▶ ${libelle}`);
        const res = await executerRun({
          app,
          db,
          scenario,
          variante,
          sousScenario,
          runIndex: r,
          seedBase: options.seed,
          options,
        });
        const chap = res.chapitres
          .map(
            (c) =>
              `P${c.plateau}: ${c.mesures.seances} séances, tenues ${c.mesures.pages.tenues}/${c.mesures.zonesActives}, pâlies ${c.mesures.pages.palies}, voile ${c.mesures.equipesSousVoilePct == null ? '—' : Math.round(c.mesures.equipesSousVoilePct)} %`,
          )
          .join(' | ');
        log(
          `  ${res.ok ? 'ok' : `ÉCHEC ${res.echec.code}`} · ${res.appels} appels · ${Math.round(res.dureeMs / 1000)} s · ${chap}${res.ok ? '' : `\n  ${res.echec.message}\n  contexte : ${JSON.stringify(res.echec.contexte).slice(0, 600)}`}`,
        );
        if (res.fuitesBourses)
          log(
            `  ⚠ ${res.fuitesBourses} bourse(s) d'une autre équipe servie(s) à un élève (bogue du moteur, mode avertir) : ${res.fuitesBoursesExemples
              .map((f) => `${f.path} → ${f.chemins.join(', ')}`)
              .slice(0, 2)
              .join(' ; ')}`,
          );
        runs.push(res);
        if (!res.ok && options.arretPremierEchec) return runs;
      }
    }
  }
  return runs;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { SCENARIOS, trouverScenario, listerScenarios } = require('./scenarios');
  if (options.liste || !options.scenario) {
    console.log('Scénarios disponibles :');
    for (const s of listerScenarios()) console.log(`  ${s.id.padEnd(22)} ${s.description}`);
    if (!options.scenario) {
      console.log(
        '\nUsage : npm run gl:sim -- --scenario <id|all> --runs N --seed S [--seances N] [--grille <fichier>]',
      );
      process.exit(options.liste ? 0 : 2);
    }
    process.exit(0);
  }
  preparerEnvironnement({
    dbName: options.db || process.env.GL_SIM_DB || 'foretmap_sim',
    seed: options.seed,
  });
  const db = require('../../database');
  const { app } = require('../../server');
  await db.initDatabase();
  const cibles =
    options.scenario === 'all'
      ? SCENARIOS.filter((s) => s.id !== 'equilibrage')
      : options.scenario.split(',').map((id) => {
          const s = trouverScenario(id.trim());
          if (!s) throw new Error(`Scénario inconnu : ${id} (voir --liste)`);
          return s;
        });
  const { ecrireRapport } = require('./rapport');
  const log = (m) => console.log(m);
  let echecs = 0;
  const dossiers = [];
  for (const scenario of cibles) {
    const t0 = Date.now();
    const runs = await executerScenario({ app, db, scenario, options, log });
    echecs += runs.filter((r) => !r.ok).length;
    const { dossier, resume } = ecrireRapport({
      racine: options.sortie,
      scenario,
      runs,
      options,
      dureeMs: Date.now() - t0,
    });
    dossiers.push(dossier);
    log(`Rapport : ${path.relative(RACINE, path.join(dossier, 'index.html'))}`);
    for (const ligne of resume) log(`  ${ligne}`);
  }
  await db.endPool();
  if (echecs) {
    console.error(`\n${echecs} exécution(s) en échec.`);
    process.exit(1);
  }
  process.exit(0);
}

module.exports = { parseArgs, executerRun, executerScenario };

if (require.main === module) {
  main().catch((err) => {
    console.error('[gl-sim] erreur :', err.stack || err.message || err);
    process.exit(1);
  });
}
