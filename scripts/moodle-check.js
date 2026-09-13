#!/usr/bin/env node
'use strict';

/**
 * Contrôle de l'intégration Moodle depuis la ligne de commande (section 7.3) :
 *
 *   npm run moodle:check            # rapport lisible
 *   npm run moodle:check -- --json  # rapport brut (pour un cron ou un ticket)
 *
 * Lit `MOODLE_BASE_URL` / `MOODLE_WS_TOKEN` dans `.env`, vérifie le jeton, les fonctions Web
 * Services autorisées, les cohortes de l'année avec leur politique, la table chapitre → cours.
 * Code de sortie : 0 si tout est en ordre, 1 sinon, 2 si l'intégration n'est pas configurée.
 * Le jeton n'est jamais affiché. Les appels HTTP passent par `lib/nodeHttpFetch.js`
 * (pas `fetch`/undici) pour rester dans les limites d'adressage CloudLinux.
 */

require('dotenv').config();

const { readMoodleEnv } = require('../lib/moodle/config');
const { createMoodleClientFromEnv } = require('../lib/moodle/client');
const { loadMoodleSettings } = require('../lib/moodle/settings');
const { runMoodleCheck } = require('../lib/moodle/check');

const args = new Set(process.argv.slice(2));
const asJson = args.has('--json');

function line(text = '') {
  process.stdout.write(`${text}\n`);
}

/** Conseil de dépannage : replié à 96 colonnes, chaque ligne préfixée, pour rester lisible. */
function lines(text, { first = '  → ', next = '    ' } = {}) {
  const width = 96;
  const out = [];
  let current = '';
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    const prefix = out.length ? next : first;
    if (current && prefix.length + current.length + 1 + word.length > width) {
      out.push(prefix + current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) out.push((out.length ? next : first) + current);
  for (const l of out) line(l);
}

function printHuman(report, env) {
  line(`Site Moodle : ${env.baseUrl}`);
  if (report.site) {
    line(
      `  ${report.site.sitename || '(sans nom)'} — ${report.site.release || '?'} — compte WS : ${report.site.username || '?'} (#${report.site.userid ?? '?'})`,
    );
  }
  line('');
  line('Fonctions Web Services :');
  if (!report.functions.length) {
    line('  (non contrôlées : le contrôle s’est arrêté — voir l’erreur ci-dessous)');
  } else if (report.functionsUnknown) {
    line(
      '  (liste indéterminée : core_webservice_get_site_info a échoué — voir l’erreur ci-dessous)',
    );
  }
  for (const fn of report.functions) {
    const mark = fn.allowed === null ? ' ? ' : fn.allowed ? 'OK ' : 'KO ';
    line(`  ${mark} ${fn.name.padEnd(38)} ${fn.lot}  ${fn.use}`);
  }
  line('');
  const ofYear = report.cohorts.filter((c) => c.ofYear);
  const cohortsFailed = report.errors.some((e) => e.step === 'site_info' || e.step === 'cohorts');
  line(
    cohortsFailed && !ofYear.length
      ? 'Cohortes de l’année : non listées (voir l’erreur ci-dessous)'
      : `Cohortes de l'année (${ofYear.length}) :`,
  );
  for (const c of ofYear) {
    line(
      `  #${c.id}  ${c.idnumber.padEnd(14)} ${c.name.padEnd(28)} → ${c.policyKey || 'AUCUNE POLITIQUE'}`,
    );
  }
  const others = report.cohorts.length - ofYear.length;
  if (others > 0) line(`  (+ ${others} cohorte(s) d'autres années, ignorées)`);
  line('');
  if (report.chapterCourses.length) {
    line('Chapitres → cours :');
    for (const row of report.chapterCourses) {
      const chapter =
        row.chapterTitle || `chapitre ${row.chapterId}${row.chapterKnown ? '' : ' (inconnu)'}`;
      const course = row.courseFound
        ? `${row.courseName} [${row.courseShortname}]`
        : `cours ${row.courseId} INTROUVABLE`;
      line(`  ${chapter}  →  ${course}`);
    }
  } else {
    line('Chapitres → cours : aucune correspondance réglée (integration.moodle.chapter_courses)');
  }
  line('');
  for (const err of report.errors) {
    line(`ERREUR [${err.step}] ${err.kind} ${err.errorcode || err.status || ''} ${err.message}`);
    if (err.debuginfo) lines(err.debuginfo, { first: '  debug Moodle : ', next: '    ' });
    if (err.hint) lines(err.hint);
  }
  if (report.tokenProbe) {
    const probe = report.tokenProbe;
    line(
      `  sonde ${probe.wsfunction} : ${probe.ok ? 'a répondu' : `échec ${probe.errorcode || '?'}`}`,
    );
  }
  line(report.ok ? 'Résultat : OK' : 'Résultat : problèmes à corriger (voir ci-dessus)');
}

function printLti(lti) {
  line('');
  line('Entrée depuis le cours (LTI 1.3) :');
  if (!lti.configured) {
    line('  secrets absents de .env (lancement désactivé)');
    return;
  }
  line(
    `  issuer ${lti.issuer} · client_id ${lti.clientIdSet ? 'posé' : 'manquant'} · deployment ${lti.deploymentIdSet ? 'posé' : 'manquant'}`,
  );
  line(
    `  JWKS plateforme : ${lti.jwksOk ? `OK (${lti.jwksKeys} clé(s))` : 'KO'} ${lti.platformJwksUrl || ''}`,
  );
  line(`  clé de l’outil : ${lti.toolJwkOk ? 'OK' : 'KO'} (kid ${lti.toolKid || '?'})`);
  for (const err of lti.errors || []) line(`  ERREUR [${err.step}] ${err.message}`);
}

async function main() {
  const env = readMoodleEnv();
  if (!env.configured) {
    const reason = env.killSwitchOff
      ? 'MOODLE_SYNC_ENABLED=0 (interrupteur coupé)'
      : 'MOODLE_BASE_URL et/ou MOODLE_WS_TOKEN absents de .env';
    if (asJson) line(JSON.stringify({ ok: false, configured: false, reason }));
    else line(`Intégration Moodle non configurée : ${reason}`);
    process.exit(2);
  }
  const client = createMoodleClientFromEnv();
  let settings;
  let chapters = [];
  try {
    settings = await loadMoodleSettings();
    const { queryAll } = require('../database');
    chapters = await queryAll(
      'SELECT id, title FROM gl_chapters ORDER BY order_index ASC, id ASC',
    ).catch(() => []);
  } catch (error) {
    // Base indisponible : on contrôle quand même le site avec les réglages par défaut.
    const {
      MOODLE_SETTINGS_REGISTRY,
      MOODLE_SETTING_KEYS,
    } = require('../lib/moodle/settingsRegistry');
    const { normalizePolicies, compilePolicies } = require('../lib/moodle/policies');
    const yearPrefix = MOODLE_SETTINGS_REGISTRY[MOODLE_SETTING_KEYS.yearPrefix].default;
    const policies = normalizePolicies(
      MOODLE_SETTINGS_REGISTRY[MOODLE_SETTING_KEYS.policies].default,
    ).policies;
    settings = {
      yearPrefix,
      policies,
      compiledPolicies: compilePolicies(policies, yearPrefix),
      chapterCourses: {},
    };
    if (!asJson) line(`(réglages par défaut : base indisponible — ${error.message})`);
  }
  const report = await runMoodleCheck({ client, settings, chapters });
  const { runLtiCheck } = require('../lib/lti/check');
  const lti = await runLtiCheck();
  report.lti = lti;
  if (asJson) line(JSON.stringify(report, null, 2));
  else {
    printHuman(report, env);
    printLti(lti);
  }
  const ltiFail = lti.configured && lti.errors.length > 0;
  process.exit(report.ok && !ltiFail ? 0 : 1);
}

main().catch((error) => {
  const message = error?.message || String(error);
  if (/WebAssembly|Cannot allocate Wasm memory/i.test(message)) {
    process.stderr.write(
      'moodle-check : Node n’a pas pu allouer la mémoire Wasm d’undici (limite CloudLinux 4 Gio).\n' +
        'Les appels Moodle/LTI doivent passer par lib/nodeHttpFetch.js — vérifier que le déploiement est à jour.\n',
    );
  } else {
    process.stderr.write(`moodle-check : ${message}\n`);
  }
  process.exit(1);
});
