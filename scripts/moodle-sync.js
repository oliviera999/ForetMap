#!/usr/bin/env node
'use strict';

/**
 * Synchronisation Moodle en ligne de commande (sections 12 et 17) :
 *
 *   npm run moodle:sync -- --dry-run [--cohort 26#603 --cohort 26#n3] [--teams] [--json]
 *   npm run moodle:sync -- --apply   [--cohort …] [--force --reason "rentrée"] [--json]
 *
 * `--cohort` accepte un `idnumber` (`26#603`) ou un identifiant numérique Moodle. Sans `--cohort`,
 * toutes les cohortes de l'année appariées à une politique sont prises.
 *
 * Codes de sortie : 0 exécution réussie sans désactivation ni conflit ; 3 réussie mais avec
 * désactivations, conflits ou rapprochements en attente (à relire) ; 4 interrompue par un seuil ;
 * 1 erreur ; 2 intégration non configurée. Ces codes servent au cron (`docs/CRONTAB.md`).
 */

require('dotenv').config();

const { readMoodleEnv } = require('../lib/moodle/config');
const { createMoodleClientFromEnv } = require('../lib/moodle/client');
const { loadMoodleSettings } = require('../lib/moodle/settings');
const { isCohortOfYear } = require('../lib/moodle/policies');

function parseArgs(argv) {
  const out = { mode: null, cohorts: [], teams: false, force: false, reason: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--dry-run':
        out.mode = 'dry_run';
        break;
      case '--apply':
        out.mode = 'apply';
        break;
      case '--teams':
        out.teams = true;
        break;
      case '--force':
        out.force = true;
        break;
      case '--json':
        out.json = true;
        break;
      case '--cohort':
        out.cohorts.push(String(argv[i + 1] || '').trim());
        i += 1;
        break;
      case '--reason':
        out.reason = String(argv[i + 1] || '').trim();
        i += 1;
        break;
      default:
        if (arg.startsWith('--cohort=')) out.cohorts.push(arg.slice('--cohort='.length).trim());
        else if (arg.startsWith('--reason=')) out.reason = arg.slice('--reason='.length).trim();
        else throw new Error(`Argument inconnu : ${arg}`);
    }
  }
  if (!out.mode) throw new Error('Préciser --dry-run ou --apply');
  return out;
}

function line(text = '') {
  process.stdout.write(`${text}\n`);
}

/** Traduit les `--cohort` (idnumber ou id) en identifiants Moodle, en interrogeant le site. */
async function resolveCohortIds({ client, settings, requested }) {
  const found = await client.searchCohorts('');
  const all = Array.isArray(found?.cohorts) ? found.cohorts : [];
  const ofYear = all.filter((c) => isCohortOfYear(String(c.idnumber || ''), settings.yearPrefix));
  if (!requested.length) return ofYear.map((c) => Number(c.id));
  const ids = [];
  for (const wanted of requested) {
    const match = all.find((c) => String(c.idnumber || '') === wanted || String(c.id) === wanted);
    if (!match) throw new Error(`Cohorte introuvable côté Moodle : ${wanted}`);
    ids.push(Number(match.id));
  }
  return ids;
}

function printHuman(result) {
  const { report } = result;
  line(`Exécution #${result.runId} — ${report.mode} — ${result.status}`);
  line(
    `Périmètre : ${report.scope.cohortIdnumbers.join(', ') || '(vide)'}${report.scope.teams ? ' + équipes' : ''}`,
  );
  if (report.basedOnDryRunId) line(`Simulation de référence : #${report.basedOnDryRunId}`);
  line('');
  const t = report.totals || {};
  line('Totaux :');
  line(
    `  membres traités ${t.membersProcessed ?? 0} · créations ${t.creations ?? 0} · rapprochements e-mail ${t.emailMatches ?? 0} · nom ${t.nameMatches ?? 0}`,
  );
  line(
    `  désactivations ${t.deactivations ?? 0} · en attente ${t.pendingMatches ?? 0} · conflits e-mail ${t.emailConflicts ?? 0} · conflits ${t.conflicts ?? 0}`,
  );
  line(
    `  ajouts groupe ${t.groupAdds ?? 0} · retraits groupe ${t.groupRemoves ?? 0} · sortants ${t.outbound ?? 0} · alertes ${t.alerts ?? 0}`,
  );
  if (report.thresholds?.breaches?.length) {
    line('');
    line('Seuils dépassés :');
    for (const b of report.thresholds.breaches) line(`  - ${b.message}`);
  }
  if (report.upstreamErrors?.length) {
    line('');
    line(`Contrôles amont bloquants (${report.upstreamErrors.length}) :`);
    for (const e of report.upstreamErrors.slice(0, 20)) line(`  - ${e.code} : ${e.message}`);
  }
  const lists = report.lists || {};
  const show = (title, items, fmt) => {
    if (!items?.length) return;
    line('');
    line(`${title} (${items.length}) :`);
    for (const item of items.slice(0, 50)) line(`  - ${fmt(item)}`);
    if (items.length > 50) line(`  … ${items.length - 50} de plus`);
  };
  const who = (m) => (m ? `${m.firstName} ${m.lastName} <${m.email || '—'}>` : '?');
  show('Comptes à créer', lists.creations, (x) => `${x.cohort} ${who(x.member)}`);
  show(
    'Rapprochés par le nom (à relire)',
    lists.nameMatches,
    (x) => `${x.cohort} ${who(x.member)} → ${x.user?.displayName || x.user?.userId}`,
  );
  show(
    'Doublons probables',
    lists.probableDuplicates,
    (x) => `${who(x.member)} ↔ ${x.duplicate?.displayName || x.duplicate?.userId}`,
  );
  show(
    'Désactivations',
    lists.deactivations,
    (x) => `${x.user?.displayName || x.user?.userId} (${x.reason})`,
  );
  show(
    'Rapprochements en attente',
    lists.pendingMatches,
    (x) => `${x.cohort} ${who(x.member)} : ${x.candidates?.length || 0} candidat(s)`,
  );
  show(
    'Conflits e-mail',
    lists.emailConflicts,
    (x) => `${x.cohort} ${who(x.member)} : ${x.reason}`,
  );
  show(
    'Conflits de comparaison',
    report.conflicts,
    (x) => `${x.cohort} ${x.kind} ${x.user?.displayName || x.userId || ''}`,
  );
  show('Alertes', lists.alerts, (x) => `${x.cohort || ''} ${x.code} — ${x.message}`);
  show(
    'Cohortes de l’année sans politique',
    lists.unmatchedCohorts,
    (x) => `${x.idnumber} ${x.name}`,
  );
  if (report.applied) {
    line('');
    line(
      `Appliqué : ${report.applied.actionsApplied} action(s), ${report.applied.createdUsers} compte(s) créé(s), sortants ${report.applied.outbound?.applied ?? 0}`,
    );
    for (const f of report.applied.failedCohorts || []) line(`  ÉCHEC ${f.cohort} : ${f.error}`);
  }
}

function exitCodeFor(result) {
  if (result.status === 'aborted') return 4;
  if (result.status === 'failed') return 1;
  const t = result.report?.totals || {};
  const attention =
    (t.deactivations || 0) + (t.conflicts || 0) + (t.pendingMatches || 0) + (t.emailConflicts || 0);
  return attention > 0 ? 3 : 0;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const env = readMoodleEnv();
  if (!env.configured) {
    const reason = env.killSwitchOff
      ? 'MOODLE_SYNC_ENABLED=0'
      : 'MOODLE_BASE_URL / MOODLE_WS_TOKEN absents';
    if (opts.json) line(JSON.stringify({ ok: false, configured: false, reason }));
    else line(`Intégration Moodle non configurée : ${reason}`);
    process.exit(2);
  }
  if (opts.mode === 'apply' && opts.force && !opts.reason) {
    throw new Error('--force exige --reason "motif"');
  }
  const client = createMoodleClientFromEnv();
  const settings = await loadMoodleSettings();
  const cohortIds = await resolveCohortIds({ client, settings, requested: opts.cohorts });
  if (!cohortIds.length) throw new Error('Aucune cohorte de l’année visible côté Moodle');

  const { runSync } = require('../lib/moodle/syncRun');
  let result;
  try {
    result = await runSync({
      mode: opts.mode,
      cohortIds,
      teams: opts.teams,
      force: opts.force,
      forceReason: opts.reason,
      actorUserId: null,
      deps: { client, settings },
    });
  } catch (error) {
    if (opts.json)
      line(
        JSON.stringify({
          ok: false,
          error: error.message,
          status: error.status || null,
          runId: error.runId || null,
        }),
      );
    else line(`Échec : ${error.message}${error.runId ? ` (exécution #${error.runId})` : ''}`);
    process.exit(error.status === 409 ? 4 : 1);
  }
  if (opts.json) line(JSON.stringify(result, null, 2));
  else printHuman(result);
  process.exit(exitCodeFor(result));
}

main().catch((error) => {
  process.stderr.write(`moodle-sync : ${error.message}\n`);
  process.exit(1);
});
