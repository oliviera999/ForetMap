#!/usr/bin/env node
'use strict';

/**
 * fetch-dist-artifact.js — récupère le build frontend depuis la branche d'artefacts
 * publiée par la CI, au lieu de le lire dans `dist/` versionné.
 *
 * ## Le problème que ça règle
 *
 * `dist/` a longtemps été commité dans le dépôt : le serveur n'installe que les dépendances
 * de production (`npm ci --omit=dev`, cf. scripts/auto-deploy-cron.sh), Vite n'y est donc pas
 * disponible et le déploiement par `git pull` supposait un build déjà présent dans l'arbre.
 * Cette contrainte a deux coûts mesurés :
 *
 *   - **conflits systématiques** : les noms de chunks portent un hash de contenu, donc chaque
 *     build renomme tous les fichiers. Deux branches qui touchent le frontend produisent un
 *     conflit rename/delete sur `dist/`, que git ne peut structurellement pas résoudre (les
 *     pilotes de merge de `.gitattributes` ne traitent que les conflits de contenu) ;
 *   - **poids du dépôt** : ~30 Mo de blobs neufs à chaque build commité, sur un pack de 126 Mo.
 *
 * ## Principe
 *
 * La CI construit le front à chaque avancée de `main` et publie le résultat sur une branche
 * d'artefacts dédiée (un seul commit, force-push), accompagné d'un `BUILD_INFO.json` qui note
 * le **commit source** dont il est issu. Le serveur récupère cet artefact et n'accepte de le
 * poser que si `sourceCommit` correspond au commit qu'il déploie : l'invariant « le `dist/`
 * servi correspond aux sources déployées », jusqu'ici garanti par le fait d'être dans le même
 * commit, est ainsi conservé explicitement.
 *
 * ## Modes
 *
 *   - `check`            : décide seulement, sans rien extraire. Appelé **avant** le `git pull`
 *                          du cron : si l'artefact n'est pas prêt, on ne touche pas aux sources.
 *   - `apply`            : extrait et pose `dist/` (l'ancien part dans `dist.prev/`).
 *   - `repair`           : comme `apply`, mais ne fait rien si `dist/` est déjà complet. Appelé
 *                          par le cron même sans nouveau commit : sans `dist/` versionné, un
 *                          dossier effacé ou un clone serveur neuf ne serait jamais rattrapé.
 *   - `verify`           : extrait dans `dist.candidate/` sans rien remplacer (contrôle à blanc
 *                          avant bascule, cf. docs/DEPLOY_DIST_ARTIFACT.md).
 *   - `restore-previous` : remet `dist.prev/` en place (utilisé par le rollback du cron).
 *
 * ## Décisions (`decideAction`)
 *
 *   - `apply` : l'artefact correspond au commit attendu.
 *   - `defer` : l'artefact est issu d'un ancêtre → build CI encore en cours. Sortie 75, le cron
 *               repassera au prochain tick. Ce n'est PAS une erreur.
 *   - `stale` : l'artefact est étranger à l'historique déployé → refus explicite.
 *
 * Codes de sortie : 0 succès · 75 report (EX_TEMPFAIL) · 1 échec.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { listHtmlEntryBasenames } = require('../lib/products');

const TAG = '[fetch-dist]';

/** Branche d'artefacts par défaut (publiée par .github/workflows/dist-publish.yml). */
const DEFAULT_BRANCH = 'dist-artifact/main';
/** Code de sortie « rien à faire pour l'instant, repasse plus tard » (sysexits EX_TEMPFAIL). */
const EXIT_DEFER = 75;
/** Modes acceptés par `--mode`. */
const MODES = ['check', 'apply', 'repair', 'verify', 'restore-previous'];

function log(...parts) {
  console.log(TAG, ...parts);
}

/**
 * Lit et valide le `BUILD_INFO.json` d'un artefact.
 *
 * Volontairement stricte : un artefact dont on ne sait pas de quel commit il sort ne doit
 * jamais être posé — on préfère bloquer le déploiement que servir un `dist/` désaccordé des
 * sources (assets en 404, chunks manquants, SPA qui ne démarre pas).
 *
 * @param {string} raw Contenu brut du fichier.
 * @returns {{sourceCommit:string,builtAt:string,version:string|null,branch:string|null}}
 * @throws {Error} Si le JSON est invalide ou `sourceCommit` absent/malformé.
 */
function parseBuildInfo(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('BUILD_INFO.json illisible (JSON invalide).');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('BUILD_INFO.json inattendu (objet requis).');
  }
  const sourceCommit = String(parsed.sourceCommit || '').toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sourceCommit)) {
    throw new Error(
      'BUILD_INFO.json : `sourceCommit` absent ou non conforme (sha1 complet attendu).',
    );
  }
  return {
    sourceCommit,
    builtAt: typeof parsed.builtAt === 'string' ? parsed.builtAt : '',
    version: typeof parsed.version === 'string' ? parsed.version : null,
    branch: typeof parsed.branch === 'string' ? parsed.branch : null,
  };
}

/**
 * Décide quoi faire d'un artefact au vu du commit que le serveur veut déployer.
 *
 * `ancestors` liste les commits de l'historique déployé (le plus récent d'abord) : un artefact
 * issu d'un ancêtre est simplement **en retard** (la CI n'a pas fini de publier), tandis qu'un
 * artefact étranger à cet historique est suspect et doit bloquer le déploiement.
 *
 * @param {object} params
 * @param {{sourceCommit:string}} params.buildInfo Métadonnées de l'artefact.
 * @param {string|null} params.expectedSource Commit déployé (null = aucun contrôle).
 * @param {string[]} [params.ancestors] Ancêtres connus du commit déployé.
 * @returns {{action:'apply'|'defer'|'stale',reason:string}}
 */
function decideAction({ buildInfo, expectedSource, ancestors = [] }) {
  if (!expectedSource) {
    return { action: 'apply', reason: 'aucun commit attendu fourni : artefact accepté tel quel.' };
  }
  const expected = String(expectedSource).toLowerCase();
  const short = (sha) => sha.slice(0, 7);
  if (buildInfo.sourceCommit === expected) {
    return { action: 'apply', reason: `artefact aligné sur ${short(expected)}.` };
  }
  const known = new Set(ancestors.map((sha) => String(sha).toLowerCase()));
  if (known.has(buildInfo.sourceCommit)) {
    return {
      action: 'defer',
      reason: `artefact issu de ${short(buildInfo.sourceCommit)}, antérieur à ${short(expected)} : publication CI en cours.`,
    };
  }
  return {
    action: 'stale',
    reason: `artefact issu de ${short(buildInfo.sourceCommit)}, étranger à l'historique déployé (${short(expected)}).`,
  };
}

/**
 * Vérifie qu'un dossier `dist/` extrait est complet.
 *
 * L'absence d'une entrée produit ne casse rien de *visible* : le repli SPA servirait ForetMap
 * en silence sur `gl.*` et `planlyautey.*` (cf. lib/spaFallback.js). C'est précisément le genre
 * de panne qu'on ne veut pas découvrir en production.
 *
 * @param {string} distDir Dossier à contrôler.
 * @param {string[]} [htmlEntries] Entrées HTML attendues (défaut : registre produits).
 * @returns {string[]} Liste des manques (vide si complet).
 */
function findDistGaps(distDir, htmlEntries = listHtmlEntryBasenames()) {
  const gaps = [];
  if (!fs.existsSync(path.join(distDir, 'assets'))) {
    gaps.push('assets/');
  }
  for (const entry of htmlEntries) {
    if (!fs.existsSync(path.join(distDir, entry))) {
      gaps.push(entry);
    }
  }
  return gaps;
}

/**
 * Exécute une commande et renvoie son stdout, ou lève une erreur parlante.
 * @returns {string}
 */
function run(cmd, args, { cwd, allowFail = false } = {}) {
  const res = spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (res.error) {
    if (allowFail) return '';
    throw new Error(`${cmd} ${args.join(' ')} : ${res.error.message}`);
  }
  if (res.status !== 0) {
    if (allowFail) return '';
    const stderr = String(res.stderr || '').trim();
    throw new Error(
      `${cmd} ${args.join(' ')} a échoué (code ${res.status})${stderr ? ` : ${stderr}` : ''}`,
    );
  }
  return String(res.stdout || '');
}

/** Supprime un dossier s'il existe (idempotent). */
function removeDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Extrait `dist/` de la réf d'artefact dans `targetDir` (créé/écrasé).
 *
 * Passe par une archive intermédiaire plutôt que par un pipe `git archive | tar` : sans
 * `pipefail`, un `git archive` en échec suivi d'un `tar` satisfait d'une entrée vide
 * renverrait 0, et on poserait un `dist/` tronqué.
 */
function extractDist(appDir, ref, targetDir) {
  removeDir(targetDir);
  fs.mkdirSync(targetDir, { recursive: true });
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'foretmap-dist-'));
  const tarPath = path.join(tmpDir, 'dist.tar');
  try {
    run('git', ['archive', '--format=tar', '-o', tarPath, ref, 'dist'], { cwd: appDir });
    run('tar', ['-x', '-f', tarPath, '-C', targetDir, '--strip-components=1']);
  } catch (err) {
    removeDir(targetDir);
    throw new Error(`Extraction de ${ref}:dist/ impossible : ${err.message}`);
  } finally {
    removeDir(tmpDir);
  }
}

/**
 * `dist/` est-il encore suivi par git dans ce dépôt ?
 *
 * Sert de garde-fou pendant la phase de recouvrement de la bascule (cf.
 * docs/DEPLOY_DIST_ARTIFACT.md) : activer le mode `branch` alors que `dist/` est encore
 * versionné remplacerait des fichiers suivis, ce qui salirait l'arbre de travail — et le cron
 * refuse de déployer sur un arbre sale (« arbre de travail non propre »), donc le serveur se
 * bloquerait à chaque passage. Dans ce cas on valide l'artefact sans le poser : le `git pull`
 * vient de livrer le même build, et la chaîne complète (fetch, `BUILD_INFO`, intégrité) est
 * tout de même exercée en production.
 *
 * @returns {boolean}
 */
function isDistTracked(appDir) {
  const tracked = run('git', ['ls-files', '--', 'dist'], { cwd: appDir, allowFail: true });
  return tracked.trim().length > 0;
}

/** Compte les fichiers d'une arborescence (contrôle de volume). */
function countFiles(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) total += countFiles(path.join(dir, entry.name));
    else total += 1;
  }
  return total;
}

function parseArgs(argv) {
  const opts = {
    appDir: process.cwd(),
    remote: 'origin',
    branch: process.env.DEPLOY_DIST_BRANCH || DEFAULT_BRANCH,
    expectSource: null,
    mode: 'apply',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[(i += 1)];
    if (arg === '--dir') opts.appDir = path.resolve(next());
    else if (arg === '--remote') opts.remote = next();
    else if (arg === '--branch') opts.branch = next();
    else if (arg === '--expect-source') opts.expectSource = next();
    else if (arg === '--mode') opts.mode = next();
    else throw new Error(`Argument inconnu : ${arg}`);
  }
  if (!MODES.includes(opts.mode)) {
    throw new Error(`--mode doit valoir ${MODES.join(', ')} (reçu : ${opts.mode})`);
  }
  return opts;
}

/**
 * Remet `dist.prev/` en place. Utilisé par le rollback du cron : le `git reset --hard` ramène
 * les sources précédentes, ce mode ramène le build qui allait avec, sans nouvel accès réseau.
 * @returns {number} Code de sortie.
 */
function restorePrevious(appDir) {
  const distDir = path.join(appDir, 'dist');
  const prevDir = path.join(appDir, 'dist.prev');
  if (!fs.existsSync(prevDir)) {
    console.error(`${TAG} aucun dist.prev/ à restaurer.`);
    return 1;
  }
  const gaps = findDistGaps(prevDir);
  if (gaps.length) {
    console.error(`${TAG} dist.prev/ incomplet, restauration refusée. Manque : ${gaps.join(', ')}`);
    return 1;
  }
  // `dist.prev/` est consommé : on ne garde pas deux générations en arrière, et un second
  // rollback consécutif n'aurait de toute façon rien de sain à remettre.
  const discardDir = path.join(appDir, 'dist.discarded');
  removeDir(discardDir);
  if (fs.existsSync(distDir)) {
    fs.renameSync(distDir, discardDir);
  }
  fs.renameSync(prevDir, distDir);
  removeDir(discardDir);
  log('dist/ restauré depuis dist.prev/.');
  return 0;
}

function main(argv) {
  const opts = parseArgs(argv);
  const { appDir, remote, branch, mode } = opts;

  if (mode === 'restore-previous') {
    return restorePrevious(appDir);
  }

  if (mode === 'repair') {
    // Auto-réparation : sans `dist/` versionné, plus rien ne le remet en place tout seul. Un
    // dossier effacé (nettoyage d'hébergeur, disque plein) ou un clone serveur tout neuf
    // laisserait le site sans front, et le cron sort tôt quand aucun commit n'est arrivé — le
    // manque ne serait jamais rattrapé. Ce mode comble ce trou sans rien faire dans le cas
    // courant, où `dist/` est complet.
    const distDir = path.join(appDir, 'dist');
    if (fs.existsSync(distDir) && findDistGaps(distDir).length === 0) {
      log('dist/ en place et complet : rien à réparer.');
      return 0;
    }
    if (isDistTracked(appDir)) {
      log('dist/ est encore versionné : sa réparation relève de git, pas de l’artefact.');
      return 0;
    }
    log('dist/ absent ou incomplet : récupération de l’artefact.');
  }

  log(`récupération de ${remote}/${branch}`);
  // `--force` : la branche d'artefacts est réécrite à chaque build (un seul commit).
  run(
    'git',
    ['fetch', '--force', '--quiet', remote, `${branch}:refs/remotes/${remote}/${branch}`],
    {
      cwd: appDir,
    },
  );
  const ref = `${remote}/${branch}`;

  const buildInfo = parseBuildInfo(run('git', ['show', `${ref}:BUILD_INFO.json`], { cwd: appDir }));
  log(
    `artefact : source ${buildInfo.sourceCommit.slice(0, 7)}` +
      (buildInfo.version ? ` · v${buildInfo.version}` : '') +
      (buildInfo.builtAt ? ` · ${buildInfo.builtAt}` : ''),
  );

  // Ancêtres du commit attendu : distingue « publication en retard » de « artefact étranger ».
  // `--max-count` borne le coût sur un historique long ; au-delà, l'artefact est de toute façon
  // trop vieux pour être posé sans rien vérifier d'autre.
  const ancestors = opts.expectSource
    ? run('git', ['rev-list', '--max-count=200', opts.expectSource], {
        cwd: appDir,
        allowFail: true,
      })
        .split('\n')
        .filter(Boolean)
    : [];

  const decision = decideAction({ buildInfo, expectedSource: opts.expectSource, ancestors });

  if (decision.action === 'defer') {
    log(`report : ${decision.reason}`);
    return EXIT_DEFER;
  }
  if (decision.action === 'stale') {
    console.error(`${TAG} refus : ${decision.reason}`);
    return 1;
  }
  log(decision.reason);

  if (mode === 'check') {
    log('artefact prêt (contrôle seul, rien n’a été extrait).');
    return 0;
  }

  const stagingDir = path.join(appDir, mode === 'verify' ? 'dist.candidate' : 'dist.new');
  extractDist(appDir, ref, stagingDir);

  const gaps = findDistGaps(stagingDir);
  if (gaps.length) {
    console.error(`${TAG} artefact incomplet, rien n'est posé. Manque : ${gaps.join(', ')}`);
    removeDir(stagingDir);
    return 1;
  }
  log(`artefact complet (${countFiles(stagingDir)} fichiers).`);

  if (mode === 'verify') {
    const current = path.join(appDir, 'dist');
    if (fs.existsSync(current)) {
      log(
        `dist/ en place : ${countFiles(current)} fichiers · artefact : ${countFiles(stagingDir)}.`,
      );
    } else {
      log('aucun dist/ en place : rien à comparer.');
    }
    log(`contrôle à blanc terminé — artefact laissé dans ${path.basename(stagingDir)}/.`);
    return 0;
  }

  if (isDistTracked(appDir)) {
    // Phase de recouvrement : `dist/` est encore versionné. Le remplacer salirait l'arbre et
    // bloquerait le cron au passage suivant. Le build livré par le `git pull` est celui de ce
    // même commit, donc il n'y a rien à corriger — l'artefact a servi de contrôle.
    removeDir(stagingDir);
    log('dist/ est encore versionné : artefact validé mais non posé (recouvrement de bascule).');
    return 0;
  }

  // Bascule : l'ancien `dist/` est conservé sous `dist.prev/` pour que le rollback du cron
  // puisse le remettre en place sans dépendre d'un nouvel accès réseau.
  const distDir = path.join(appDir, 'dist');
  const prevDir = path.join(appDir, 'dist.prev');
  removeDir(prevDir);
  if (fs.existsSync(distDir)) {
    fs.renameSync(distDir, prevDir);
  }
  fs.renameSync(stagingDir, distDir);
  log(`dist/ mis à jour depuis ${ref} (version précédente conservée dans dist.prev/).`);
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(`${TAG} ${err.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  DEFAULT_BRANCH,
  EXIT_DEFER,
  MODES,
  isDistTracked,
  parseBuildInfo,
  decideAction,
  findDistGaps,
  restorePrevious,
  main,
};
