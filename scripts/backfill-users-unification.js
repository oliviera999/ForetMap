#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { queryAll, queryOne, execute } = require('../database');

async function backfillUsers(report) {
  const hasStudentsTable = await queryOne(
    "SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'students'"
  );
  const hasTeachersTable = await queryOne(
    "SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'teachers'"
  );
  if (Number(hasStudentsTable?.c || 0) > 0) {
    await execute(
      `INSERT INTO users (
         id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name,
         description, avatar_path, affiliation, password_hash, auth_provider, is_active, last_seen
       )
       SELECT
         s.id, 'student', NULL, s.email, s.pseudo, s.first_name, s.last_name,
         TRIM(CONCAT(COALESCE(s.first_name, ''), ' ', COALESCE(s.last_name, ''))),
         s.description, s.avatar_path, COALESCE(s.affiliation, 'both'), s.password, 'local', 1, s.last_seen
       FROM students s
       WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = s.id)`
    );
    const countStudents = await queryOne("SELECT COUNT(*) AS c FROM users WHERE user_type = 'student'");
    report.users.students = Number(countStudents?.c || 0);
  }
  if (Number(hasTeachersTable?.c || 0) > 0) {
    await execute(
      `INSERT INTO users (
         id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name,
         description, avatar_path, affiliation, password_hash, auth_provider, is_active, last_seen
       )
       SELECT
         t.id, 'teacher', NULL, t.email, LOWER(SUBSTRING_INDEX(t.email, '@', 1)), NULL, NULL,
         COALESCE(NULLIF(t.display_name, ''), t.email),
         NULL, NULL, 'both', t.password_hash, 'local', COALESCE(t.is_active, 1), t.last_seen
       FROM teachers t
       WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = t.id)`
    );
    const countTeachers = await queryOne("SELECT COUNT(*) AS c FROM users WHERE user_type = 'teacher'");
    report.users.teachers = Number(countTeachers?.c || 0);
  }
}

async function backfillTaskAssignments(report) {
  const rows = await queryAll(
    `SELECT ta.id, ta.student_first_name, ta.student_last_name, s.id AS student_id
       FROM task_assignments ta
  LEFT JOIN users s
         ON s.user_type = 'student'
        AND LOWER(s.first_name) = LOWER(ta.student_first_name)
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
  LEFT JOIN users s
         ON s.user_type = 'student'
        AND LOWER(s.first_name) = LOWER(tl.student_first_name)
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
