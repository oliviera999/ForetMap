#!/usr/bin/env node
'use strict';

/**
 * Nettoyage données de dev : comptes créés par les e2e Playwright, optionnellement
 * clones de tâches récurrentes (parent_task_id) et comptes résiduels des tests Node (motifs étroits).
 *
 * Usage :
 *   node scripts/cleanup-dev-data.js --dry-run
 *   node scripts/cleanup-dev-data.js --apply
 *   node scripts/cleanup-dev-data.js --apply --no-recurring-spawns
 *   node scripts/cleanup-dev-data.js --apply --include-node-test-students
 */

require('dotenv').config();
const { queryAll, execute } = require('../database');
const { deleteStudentById } = require('../lib/studentDeletion');

function parseArgs(argv) {
  const out = {
    dryRun: true,
    recurringSpawns: true,
    includeNodeTestStudents: false,
  };
  for (const a of argv) {
    if (a === '--apply') out.dryRun = false;
    if (a === '--dry-run') out.dryRun = true;
    if (a === '--no-recurring-spawns') out.recurringSpawns = false;
    if (a === '--include-node-test-students') out.includeNodeTestStudents = true;
  }
  return out;
}

async function listE2eStudentIds() {
  const rows = await queryAll(
    `SELECT id, first_name, last_name, email, pseudo
     FROM users
     WHERE user_type = 'student'
       AND (
         first_name LIKE 'E2E%'
         OR LOWER(COALESCE(email, '')) LIKE 'e2e%@example.com'
         OR (pseudo IS NOT NULL AND pseudo LIKE 'e2e%')
       )
     ORDER BY created_at ASC`
  );
  return rows.map((r) => r.id);
}

async function listNodeTestStudentIds() {
  const rows = await queryAll(
    `SELECT id, first_name, last_name
     FROM users
     WHERE user_type = 'student'
       AND (
         (last_name = 'Task' AND first_name REGEXP '^St[0-9]+$')
         OR (last_name = 'Student' AND first_name REGEXP '^Del[0-9]+$')
       )
     ORDER BY created_at ASC`
  );
  return rows.map((r) => r.id);
}

async function countRecurringSpawnTasks() {
  const row = await queryAll(
    `SELECT COUNT(*) AS c FROM tasks WHERE parent_task_id IS NOT NULL`
  );
  return row[0] ? Number(row[0].c) : 0;
}

async function listRecurringSpawnSample(limit = 20) {
  const n = Math.min(500, Math.max(1, parseInt(limit, 10) || 20));
  return queryAll(
    `SELECT id, title, parent_task_id, status, created_at
     FROM tasks
     WHERE parent_task_id IS NOT NULL
     ORDER BY created_at DESC
     LIMIT ${n}`
  );
}

async function deleteAllRecurringSpawnTasks() {
  const res = await execute(`DELETE FROM tasks WHERE parent_task_id IS NOT NULL`);
  return res.affectedRows;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  console.log(
    opts.dryRun
      ? '[dry-run] Aucune suppression ne sera effectuée. Passez --apply pour exécuter.'
      : '[apply] Suppressions en cours…'
  );

  const e2eIds = await listE2eStudentIds();
  const nodeIds = opts.includeNodeTestStudents ? await listNodeTestStudentIds() : [];
  const recurringCount = await countRecurringSpawnTasks();

  console.log(`\nÉlèves e2e (E2E… / e2e%@example.com / pseudo e2e%) : ${e2eIds.length}`);
  if (e2eIds.length && e2eIds.length <= 30) {
    console.log('  IDs :', e2eIds.join(', '));
  }

  if (opts.includeNodeTestStudents) {
    console.log(`\nÉlèves tests Node (St+digits+Task, Del+digits+Student) : ${nodeIds.length}`);
    if (nodeIds.length && nodeIds.length <= 30) {
      console.log('  IDs :', nodeIds.join(', '));
    }
  }

  console.log(`\nTâches clones récurrence (parent_task_id NOT NULL) : ${recurringCount}`);
  if (recurringCount > 0) {
    const sample = await listRecurringSpawnSample(15);
    for (const t of sample) {
      console.log(`  - ${t.id} ← parent ${t.parent_task_id} | ${t.status} | ${String(t.title || '').slice(0, 60)}`);
    }
    if (recurringCount > sample.length) {
      console.log(`  … et ${recurringCount - sample.length} autre(s)`);
    }
  }

  if (opts.dryRun) {
    console.log('\nRésumé :');
    console.log(`  --apply supprimerait ${e2eIds.length} compte(s) e2e.`);
    if (opts.includeNodeTestStudents) {
      console.log(`  --apply --include-node-test-students supprimerait en plus ${nodeIds.length} compte(s) tests Node.`);
    }
    if (opts.recurringSpawns) {
      console.log(`  --apply supprimerait ${recurringCount} tâche(s) clone(s) récurrence (sauf si --no-recurring-spawns).`);
    } else {
      console.log('  Tâches récurrence : ignorées (--no-recurring-spawns).');
    }
    process.exit(0);
  }

  let deletedStudents = 0;
  let failedStudents = 0;

  for (const sid of e2eIds) {
    const r = await deleteStudentById(sid);
    if (r.ok) {
      deletedStudents += 1;
      console.log(`Supprimé élève e2e ${r.displayName} (${r.studentId})`);
    } else {
      failedStudents += 1;
      console.warn(`Échec élève ${sid} :`, r.reason);
    }
  }

  if (opts.includeNodeTestStudents) {
    for (const sid of nodeIds) {
      const r = await deleteStudentById(sid);
      if (r.ok) {
        deletedStudents += 1;
        console.log(`Supprimé élève test Node ${r.displayName} (${r.studentId})`);
      } else {
        failedStudents += 1;
        console.warn(`Échec élève ${sid} :`, r.reason);
      }
    }
  }

  let deletedTasks = 0;
  if (opts.recurringSpawns && recurringCount > 0) {
    deletedTasks = await deleteAllRecurringSpawnTasks();
    console.log(`\nSupprimé ${deletedTasks} tâche(s) clone(s) (parent_task_id NOT NULL).`);
  } else if (!opts.recurringSpawns) {
    console.log('\nTâches clones récurrence : non supprimées (--no-recurring-spawns).');
  }

  console.log(`\nTerminé : ${deletedStudents} compte(s) élève supprimé(s), ${failedStudents} échec(s).`);
  if (failedStudents > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
