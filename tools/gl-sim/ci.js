'use strict';

/**
 * `npm run test:sim` — fumée du banc en intégration continue : `hybride-reference` et
 * `tablette-reference`, 1 exécution, 3 séances, graine fixe, semaine de veillée réduite à
 * 2 jours, sur la base de test (`TEST_DB_NAME` finissant par `_test`, défaut `foretmap_test` ; en local,
 * une base `_sim` est acceptée : `TEST_DB_NAME=foretmap_sim npm run test:sim`).
 * La base est préparée comme par `gl:sim:db` (schéma, instantané de contenu, catalogues).
 * Échoue sur toute violation d'invariant, toute 5xx, tout mot interdit du moteur.
 * Les bourses d'une autre équipe servies à un élève sont comptées (bogue connu du moteur,
 * mode `avertir`) et affichées ; `GL_SIM_CI_FUITES=echouer` pour en faire un échec.
 */

const path = require('node:path');
const os = require('node:os');
const { preparerEnvironnement } = require('./env');

const SCENARIOS_CI = ['hybride-reference', 'tablette-reference'];
const SEED = 20261107;

async function main() {
  const dbName = process.env.TEST_DB_NAME || 'foretmap_test';
  if (!dbName.endsWith('_test') && !dbName.endsWith('_sim')) {
    console.error(
      `test:sim : TEST_DB_NAME doit finir par _test (ou _sim en local) — reçu « ${dbName} »`,
    );
    process.exit(2);
  }
  preparerEnvironnement({ dbName, seed: SEED });
  const db = require('../../database');
  const { preparerBaseSim } = require('./db');
  const t0 = Date.now();
  console.log(`[test:sim] base ${dbName} : préparation…`);
  const prep = await preparerBaseSim({ log: (m) => console.log(`[test:sim] ${m}`) });
  if (!prep.verification.ok) {
    console.error('[test:sim] contenu insuffisant :', prep.verification.erreurs.join(' ; '));
    process.exit(1);
  }
  const { app } = require('../../server');
  await db.initDatabase();
  const { executerRun } = require('./run');
  const { trouverScenario } = require('./scenarios');
  const { ecrireRapport } = require('./rapport');
  const options = {
    runs: 1,
    seed: SEED,
    seances: 3,
    joursVeillee: 2,
    motsInterdits: 'souple',
    fuitesBourses: process.env.GL_SIM_CI_FUITES === 'echouer' ? 'echouer' : 'avertir',
    grille: null,
    plateaux: null,
  };
  const sortie = process.env.GL_SIM_CI_SORTIE || path.join(os.tmpdir(), 'gl-sim-ci');
  let echecs = 0;
  for (const id of SCENARIOS_CI) {
    const scenario = trouverScenario(id);
    const res = await executerRun({ app, db, scenario, runIndex: 1, seedBase: SEED, options });
    const ch = res.chapitres[0];
    console.log(
      `[test:sim] ${id} : ${res.ok ? 'ok' : `ÉCHEC ${res.echec.code}`} · ${res.appels} appels · ${res.erreurs5xx} 5xx · ${Math.round(res.dureeMs / 1000)} s` +
        (ch
          ? ` · ${ch.mesures.seances} séances, ${ch.mesures.pages.tenues}/${ch.mesures.zonesActives} tenues, ${ch.mesures.compteurs.invariantsVerifies} contrôles d'invariants`
          : ''),
    );
    if (res.fuitesBourses)
      console.log(
        `[test:sim] ⚠ ${id} : ${res.fuitesBourses} bourse(s) d'une autre équipe servie(s) à un élève (bogue connu, non bloquant)`,
      );
    if (res.motsCorpus)
      console.log(
        `[test:sim] ⚠ ${id} : ${res.motsCorpus} mot(s) interdit(s) dans le corpus servi (contenu, non bloquant)`,
      );
    if (!res.ok) {
      echecs += 1;
      console.error(`[test:sim] ${res.echec.message}`);
      console.error(`[test:sim] contexte : ${JSON.stringify(res.echec.contexte).slice(0, 800)}`);
    }
    ecrireRapport({ racine: sortie, scenario, runs: [res], options, dureeMs: res.dureeMs });
  }
  await db.endPool();
  console.log(
    `[test:sim] ${echecs ? `${echecs} échec(s)` : 'tout est vert'} en ${Math.round((Date.now() - t0) / 1000)} s · rapports : ${sortie}`,
  );
  process.exit(echecs ? 1 : 0);
}

main().catch((err) => {
  console.error('[test:sim] erreur :', err.stack || err.message || err);
  process.exit(1);
});
