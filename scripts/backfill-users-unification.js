#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { queryAll, queryOne, execute } = require('../database');
const { ensureCanonicalUserFromStudent, ensureCanonicalUserFromTeacher } = require('../lib/identity');

async function backfillUsers(report) {
  const students = await queryAll('SELECT * FROM students');
  const teachers = await queryAll('SELECT * FROM teachers');

  for (const student of students) {
    try {
      const userId = await ensureCanonicalUserFromStudent(student);
      report.users.students += 1;
      if (!userId) report.warnings.push({ type: 'student_without_user', legacy_id: student.id });
    } catch (err) {
      report.errors.push({ type: 'student_user_backfill_error', legacy_id: student.id, message: err.message });
    }
  }

  for (const teacher of teachers) {
    try {
      const userId = await ensureCanonicalUserFromTeacher(teacher);
      report.users.teachers += 1;
      if (!userId) report.warnings.push({ type: 'teacher_without_user', legacy_id: teacher.id });
    } catch (err) {
      report.errors.push({ type: 'teacher_user_backfill_error', legacy_id: teacher.id, message: err.message });
    }
  }
}

async function backfillTaskAssignments(report) {
  const rows = await queryAll(
    `SELECT ta.id, ta.student_first_name, ta.student_last_name, s.id AS student_id
       FROM task_assignments ta
  LEFT JOIN students s
         ON LOWER(s.first_name) = LOWER(ta.student_first_name)
        AND LOWER(s.last_name) = LOWER(ta.student_last_name)`
  );
  for (const row of rows) {
    if (!row.student_id) {
      report.warnings.push({
        type: 'task_assignment_orphan_name',
        assignment_id: row.id,
        first_name: row.student_first_name,
        last_name: row.student_last_name,
      });
      continue;
    }
    await execute('UPDATE task_assignments SET student_id = ? WHERE id = ? AND student_id IS NULL', [row.student_id, row.id]);
    report.backfill.task_assignments += 1;
  }
}

async function backfillTaskLogs(report) {
  const rows = await queryAll(
    `SELECT tl.id, tl.student_first_name, tl.student_last_name, s.id AS student_id
       FROM task_logs tl
  LEFT JOIN students s
         ON LOWER(s.first_name) = LOWER(tl.student_first_name)
        AND LOWER(s.last_name) = LOWER(tl.student_last_name)`
  );
  for (const row of rows) {
    if (!row.student_id) {
      report.warnings.push({
        type: 'task_log_orphan_name',
        log_id: row.id,
        first_name: row.student_first_name,
        last_name: row.student_last_name,
      });
      continue;
    }
    await execute('UPDATE task_logs SET student_id = ? WHERE id = ? AND student_id IS NULL', [row.student_id, row.id]);
    report.backfill.task_logs += 1;
  }
}

async function collectIntegrityReport(report) {
  const duplicatesByEmail = await queryAll(
    `SELECT LOWER(email) AS email_key, COUNT(*) AS c
       FROM users
      WHERE email IS NOT NULL AND email <> ''
      GROUP BY LOWER(email)
     HAVING COUNT(*) > 1`
  );
  const duplicatesByPseudo = await queryAll(
    `SELECT LOWER(pseudo) AS pseudo_key, COUNT(*) AS c
       FROM users
      WHERE pseudo IS NOT NULL AND pseudo <> ''
      GROUP BY LOWER(pseudo)
     HAVING COUNT(*) > 1`
  );
  report.integrity.duplicate_emails = duplicatesByEmail;
  report.integrity.duplicate_pseudos = duplicatesByPseudo;

  const nullAssignments = await queryOne('SELECT COUNT(*) AS c FROM task_assignments WHERE student_id IS NULL');
  const nullLogs = await queryOne('SELECT COUNT(*) AS c FROM task_logs WHERE student_id IS NULL');
  report.integrity.assignments_without_student_id = Number(nullAssignments?.c || 0);
  report.integrity.logs_without_student_id = Number(nullLogs?.c || 0);
}

async function main() {
  const report = {
    started_at: new Date().toISOString(),
    users: { students: 0, teachers: 0 },
    backfill: { task_assignments: 0, task_logs: 0 },
    integrity: {},
    warnings: [],
    errors: [],
  };
  await backfillUsers(report);
  await backfillTaskAssignments(report);
  await backfillTaskLogs(report);
  await collectIntegrityReport(report);
  report.finished_at = new Date().toISOString();

  const outPath = path.join(process.cwd(), 'tmp-users-backfill-report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`Backfill terminé. Rapport: ${outPath}`);
  console.log(`Users créés/synchronisés: élèves=${report.users.students}, profs=${report.users.teachers}`);
  console.log(`Liens backfill: task_assignments=${report.backfill.task_assignments}, task_logs=${report.backfill.task_logs}`);
  if (report.warnings.length) console.log(`Avertissements: ${report.warnings.length}`);
  if (report.errors.length) {
    console.log(`Erreurs: ${report.errors.length}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
