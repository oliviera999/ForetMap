#!/usr/bin/env node
'use strict';

/**
 * Reprise et contrôle des élèves référents automatiques (lib/tasks/studentReferents.js).
 *
 * Usage :
 *   node scripts/student-referents-sync.js                       # simulation (défaut)
 *   node scripts/student-referents-sync.js --adopt-existing      # simulation de la reprise
 *   node scripts/student-referents-sync.js --apply               # écrit le plan
 *   node scripts/student-referents-sync.js --adopt-existing --apply
 *
 * - **Simulation** (défaut) : rien n'est écrit ; affiche les liens à poser, à retirer, gardés,
 *   adoptables et écartés, par série puis par élève. Les surcharges de simulation
 *   (`--group=`, `--min=`, `--max-series=`, `--max-students=`, `--inactivity-days=`) permettent
 *   de tester un réglage avant de le changer ; elles sont **refusées** avec `--apply`.
 * - **--adopt-existing** : convertit en `auto` les liens élève `manual` qui satisfont la règle
 *   (reprise des liens posés à la main avant la mise en service), sans rien d'autre.
 * - **--apply** : exige `tasks.student_referent_enabled` vrai (la fonction reste inerte tant
 *   qu'elle n'est pas activée). Notifications et journal d'audit comme le moteur.
 * - `--json` : plan brut. Les élèves sont désignés par un identifiant court, jamais par leur nom.
 */

require('dotenv').config({ quiet: true });

const OVERRIDES = Object.freeze({
  group: 'group_id',
  min: 'min_validations',
  'max-series': 'max_series_per_student',
  'max-students': 'max_students_per_series',
  'inactivity-days': 'inactivity_days',
});

function parseArgs(argv) {
  const out = { apply: false, adopt: false, json: false, overrides: {}, errors: [] };
  for (const arg of argv) {
    if (arg === '--apply') out.apply = true;
    else if (arg === '--adopt-existing') out.adopt = true;
    else if (arg === '--json') out.json = true;
    else {
      const m = /^--([a-z-]+)=(.*)$/.exec(arg);
      if (m && OVERRIDES[m[1]]) {
        out.overrides[OVERRIDES[m[1]]] = m[1] === 'group' ? m[2] : Number(m[2]);
      } else out.errors.push(`Option inconnue : ${arg}`);
    }
  }
  return out;
}

const shortId = (id) => String(id || '').slice(0, 8);

/** Lignes lisibles du plan (séries par titre, élèves par identifiant court). */
function formatPlan(plan, { adopt = false } = {}) {
  const lines = [];
  const title = (sid) => plan.series?.[sid]?.title || sid;
  const c = plan.config || {};
  lines.push(
    `Groupe : ${plan.group ? plan.group.slug : '—'} ; seuil ${c.minValidations} ; plafonds ` +
      `${c.maxSeriesPerStudent || '∞'} série(s)/élève, ${c.maxStudentsPerSeries || '∞'} élève(s)/série ; ` +
      `inactivité ${c.inactivityDays ? `${c.inactivityDays} j` : 'désactivée'} ; ` +
      `fonction ${c.enabled ? 'activée' : 'désactivée'}.`,
  );
  if (plan.inactiveReason) {
    lines.push(`Moteur inactif : ${plan.inactiveReason} (aucun lien posé ni retiré).`);
    return lines;
  }
  const added = plan.toAdd.filter((a) => !a.repair);
  const repairs = plan.toAdd.filter((a) => a.repair);
  lines.push(
    `Bilan : ${added.length} ajout(s), ${plan.toRemove.length} retrait(s), ` +
      `${plan.kept.length} lien(s) élève gardé(s), ${plan.adoptable.length} adoptable(s)` +
      `${adopt ? ' (convertis en auto)' : ''}, ${plan.skipped.length} écarté(s)` +
      `${repairs.length ? `, ${repairs.length} réparation(s)` : ''}.`,
  );
  const section = (label, list, fmt) => {
    if (!list.length) return;
    lines.push(`${label} :`);
    for (const e of list) lines.push(`  - ${fmt(e)}`);
  };
  const who = (e) => `élève ${shortId(e.userId)} (${e.count} réalisation(s))`;
  section('À poser', added, (e) => `${title(e.seriesId)} ← ${who(e)}`);
  section('À réparer', repairs, (e) => `${title(e.seriesId)} ← ${who(e)}`);
  section('À retirer', plan.toRemove, (e) => `${title(e.seriesId)} ✕ ${who(e)} — ${e.reason}`);
  if (adopt) {
    section('À convertir en auto', plan.adoptable, (e) => `${title(e.seriesId)} ← ${who(e)}`);
  }
  section('Écartés', plan.skipped, (e) => `${title(e.seriesId)} — ${who(e)} — ${e.reason}`);
  const perStudent = new Map();
  for (const e of [...plan.kept, ...added]) {
    perStudent.set(e.userId, (perStudent.get(e.userId) || 0) + 1);
  }
  if (perStudent.size) {
    lines.push('Par élève (gardés + à poser) :');
    for (const [uid, n] of [...perStudent.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`  - élève ${shortId(uid)} : ${n} série(s)`);
    }
  }
  return lines;
}

async function main(argv = process.argv.slice(2), { log = console.log } = {}) {
  const db = require('../database');
  const {
    loadStudentReferentConfig,
    computeStudentReferentPlan,
    applyStudentReferentPlan,
  } = require('../lib/tasks/studentReferents');
  try {
    const args = parseArgs(argv);
    if (args.errors.length) throw new Error(args.errors.join(' ; '));
    if (args.apply && Object.keys(args.overrides).length) {
      throw new Error(
        'Les surcharges de simulation sont refusées avec --apply : changer les réglages.',
      );
    }
    const config = await loadStudentReferentConfig(args.overrides);
    const plan = await computeStudentReferentPlan({ config });
    if (args.json) log(JSON.stringify(plan, null, 2));
    else for (const line of formatPlan(plan, { adopt: args.adopt })) log(line);
    if (!args.apply) {
      log('Simulation : rien n’a été écrit (--apply pour appliquer).');
      return { plan, applied: null };
    }
    if (!config.enabled) {
      throw new Error(
        'tasks.student_referent_enabled est faux : activer la fonction avant --apply.',
      );
    }
    const applied = await applyStudentReferentPlan(plan, {
      adoptExisting: args.adopt,
      actor: 'system',
    });
    log(
      `Appliqué : ${applied.added} ajout(s), ${applied.removed} retrait(s), ` +
        `${applied.adopted} conversion(s), ${applied.links} lien(s) écrit(s).`,
    );
    return { plan, applied };
  } finally {
    if (require.main === module) await db.pool.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

module.exports = { main, parseArgs, formatPlan };
