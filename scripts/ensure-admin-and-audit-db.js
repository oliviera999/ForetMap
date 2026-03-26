#!/usr/bin/env node
require('dotenv').config();

const { queryAll, queryOne, execute, ping, pool } = require('../database');
const { ensureRbacBootstrap, setPrimaryRole } = require('../lib/rbac');

function parseArgs(argv) {
  const out = {
    login: process.env.ADMIN_CANONICAL_LOGIN || 'oliviera9',
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = String(argv[i] || '').trim();
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--login' && argv[i + 1]) {
      out.login = String(argv[i + 1]).trim();
      i += 1;
    } else if (a.startsWith('--login=')) {
      out.login = a.slice('--login='.length).trim();
    }
  }
  return out;
}

function printSection(title) {
  process.stdout.write(`\n=== ${title} ===\n`);
}

function printCheck(state, label, details = '') {
  const icon = state === 'ok' ? 'OK' : state === 'warn' ? 'WARN' : 'FAIL';
  const suffix = details ? ` — ${details}` : '';
  process.stdout.write(`${icon} ${label}${suffix}\n`);
}

async function ensureAdminForLogin(login, dryRun) {
  const normalizedLogin = String(login || '').trim().toLowerCase();
  if (!normalizedLogin) throw new Error('Login admin vide');

  await ensureRbacBootstrap();

  const user = await queryOne(
    `SELECT id, user_type, pseudo, email, is_active
       FROM users
      WHERE LOWER(pseudo) = ? OR LOWER(email) = ?
      LIMIT 1`,
    [normalizedLogin, normalizedLogin]
  );

  if (!user) {
    return { ok: false, message: `Utilisateur introuvable pour "${login}"` };
  }

  const adminRole = await queryOne(
    'SELECT id, slug, display_name FROM roles WHERE slug = ? LIMIT 1',
    ['admin']
  );
  if (!adminRole) {
    return { ok: false, message: 'Rôle admin introuvable (RBAC non bootstrapé)' };
  }

  let applied = false;
  if (String(user.user_type) !== 'teacher') {
    if (!dryRun) {
      await execute('UPDATE users SET user_type = ?, updated_at = NOW() WHERE id = ?', ['teacher', user.id]);
    }
    applied = true;
  }

  if (!Number(user.is_active || 0)) {
    if (!dryRun) {
      await execute('UPDATE users SET is_active = 1, updated_at = NOW() WHERE id = ?', [user.id]);
    }
    applied = true;
  }

  const currentPrimary = await queryOne(
    `SELECT r.slug
       FROM user_roles ur
       INNER JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_type = ? AND ur.user_id = ? AND ur.is_primary = 1
      LIMIT 1`,
    ['teacher', user.id]
  );

  if (currentPrimary?.slug !== 'admin') {
    if (!dryRun) {
      await setPrimaryRole('teacher', user.id, adminRole.id);
    }
    applied = true;
  }

  const afterRole = dryRun
    ? (currentPrimary?.slug || '(inchangé - dry-run)')
    : (await queryOne(
      `SELECT r.slug
         FROM user_roles ur
         INNER JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_type = ? AND ur.user_id = ? AND ur.is_primary = 1
        LIMIT 1`,
      ['teacher', user.id]
    ))?.slug;

  return {
    ok: true,
    userId: user.id,
    userLabel: user.pseudo || user.email || user.id,
    applied,
    role: afterRole || 'admin',
    message: applied
      ? (dryRun ? 'Corrections détectées (dry-run)' : 'Corrections appliquées')
      : 'Déjà conforme',
  };
}

async function auditDatabase() {
  const checks = [];
  const push = (state, label, details = '') => checks.push({ state, label, details });

  const requiredTables = [
    'users', 'roles', 'permissions', 'role_permissions', 'user_roles',
    'tasks', 'task_assignments', 'zones', 'maps', 'task_zones', 'task_markers',
  ];
  const tableRows = await queryAll(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = ?
        AND table_name IN (${requiredTables.map(() => '?').join(',')})`,
    [process.env.DB_NAME, ...requiredTables]
  );
  const present = new Set(tableRows.map((r) => r.table_name));
  for (const tableName of requiredTables) {
    if (present.has(tableName)) push('ok', `Table ${tableName}`);
    else push('fail', `Table ${tableName}`, 'manquante');
  }

  const invalidUserTypes = await queryOne(
    "SELECT COUNT(*) AS c FROM users WHERE user_type NOT IN ('teacher', 'student')"
  );
  push(
    Number(invalidUserTypes?.c || 0) === 0 ? 'ok' : 'fail',
    'Types utilisateurs valides',
    Number(invalidUserTypes?.c || 0) === 0 ? '' : `${invalidUserTypes.c} compte(s) invalide(s)`
  );

  const teachersWithoutPrimaryRole = await queryOne(
    `SELECT COUNT(*) AS c
       FROM users u
      WHERE u.user_type = 'teacher'
        AND NOT EXISTS (
          SELECT 1
            FROM user_roles ur
           WHERE ur.user_type = 'teacher'
             AND ur.user_id = u.id
             AND ur.is_primary = 1
        )`
  );
  push(
    Number(teachersWithoutPrimaryRole?.c || 0) === 0 ? 'ok' : 'warn',
    'Professeurs avec rôle principal',
    Number(teachersWithoutPrimaryRole?.c || 0) === 0 ? '' : `${teachersWithoutPrimaryRole.c} sans rôle primaire`
  );

  const studentsWithoutPrimaryRole = await queryOne(
    `SELECT COUNT(*) AS c
       FROM users u
      WHERE u.user_type = 'student'
        AND NOT EXISTS (
          SELECT 1
            FROM user_roles ur
           WHERE ur.user_type = 'student'
             AND ur.user_id = u.id
             AND ur.is_primary = 1
        )`
  );
  push(
    Number(studentsWithoutPrimaryRole?.c || 0) === 0 ? 'ok' : 'warn',
    'Élèves avec rôle principal',
    Number(studentsWithoutPrimaryRole?.c || 0) === 0 ? '' : `${studentsWithoutPrimaryRole.c} sans rôle primaire`
  );

  const duplicatePrimaries = await queryOne(
    `SELECT COUNT(*) AS c
       FROM (
         SELECT user_type, user_id, SUM(CASE WHEN is_primary = 1 THEN 1 ELSE 0 END) AS p
           FROM user_roles
          GROUP BY user_type, user_id
         HAVING p > 1
       ) t`
  );
  push(
    Number(duplicatePrimaries?.c || 0) === 0 ? 'ok' : 'fail',
    'Un seul rôle principal par utilisateur',
    Number(duplicatePrimaries?.c || 0) === 0 ? '' : `${duplicatePrimaries.c} utilisateur(s) incohérent(s)`
  );

  const orphanAssignments = await queryOne(
    `SELECT COUNT(*) AS c
       FROM task_assignments ta
       LEFT JOIN tasks t ON t.id = ta.task_id
      WHERE t.id IS NULL`
  );
  push(
    Number(orphanAssignments?.c || 0) === 0 ? 'ok' : 'fail',
    'Assignations liées à une tâche existante',
    Number(orphanAssignments?.c || 0) === 0 ? '' : `${orphanAssignments.c} assignation(s) orpheline(s)`
  );

  const orphanStudentAssignments = await queryOne(
    `SELECT COUNT(*) AS c
       FROM task_assignments ta
       LEFT JOIN users u ON u.id = ta.student_id AND u.user_type = 'student'
      WHERE ta.student_id IS NOT NULL
        AND u.id IS NULL`
  );
  push(
    Number(orphanStudentAssignments?.c || 0) === 0 ? 'ok' : 'warn',
    'Assignations avec student_id valide',
    Number(orphanStudentAssignments?.c || 0) === 0 ? '' : `${orphanStudentAssignments.c} référence(s) élève absente(s)`
  );

  const orphanTaskZones = await queryOne(
    `SELECT COUNT(*) AS c
       FROM task_zones tz
       LEFT JOIN tasks t ON t.id = tz.task_id
       LEFT JOIN zones z ON z.id = tz.zone_id
      WHERE t.id IS NULL OR z.id IS NULL`
  );
  push(
    Number(orphanTaskZones?.c || 0) === 0 ? 'ok' : 'fail',
    'Liens task_zones cohérents',
    Number(orphanTaskZones?.c || 0) === 0 ? '' : `${orphanTaskZones.c} lien(s) orphelin(s)`
  );

  const orphanTaskMarkers = await queryOne(
    `SELECT COUNT(*) AS c
       FROM task_markers tm
       LEFT JOIN tasks t ON t.id = tm.task_id
       LEFT JOIN map_markers m ON m.id = tm.marker_id
      WHERE t.id IS NULL OR m.id IS NULL`
  );
  push(
    Number(orphanTaskMarkers?.c || 0) === 0 ? 'ok' : 'fail',
    'Liens task_markers cohérents',
    Number(orphanTaskMarkers?.c || 0) === 0 ? '' : `${orphanTaskMarkers.c} lien(s) orphelin(s)`
  );

  return checks;
}

async function main() {
  const { login, dryRun } = parseArgs(process.argv.slice(2));
  let exitCode = 0;

  printSection('Connexion BDD');
  await ping();
  printCheck('ok', 'MySQL accessible');

  printSection('Admin critique');
  const admin = await ensureAdminForLogin(login, dryRun);
  if (!admin.ok) {
    printCheck('fail', `Admin "${login}"`, admin.message);
    exitCode = 2;
  } else {
    printCheck('ok', `Compte "${admin.userLabel}"`, admin.message);
    printCheck('ok', 'Rôle principal', admin.role === 'admin' ? 'admin' : `actuel: ${admin.role}`);
  }

  printSection('Audit intégrité BDD');
  const checks = await auditDatabase();
  for (const c of checks) {
    printCheck(c.state, c.label, c.details);
    if (c.state === 'fail') exitCode = 2;
    else if (c.state === 'warn' && exitCode < 1) exitCode = 1;
  }

  printSection('Résultat');
  if (exitCode === 0) {
    printCheck('ok', 'BDD propre');
  } else if (exitCode === 1) {
    printCheck('warn', 'BDD partiellement propre', 'warnings détectés');
  } else {
    printCheck('fail', 'BDD non conforme', 'corriger les erreurs FAIL');
  }

  process.exitCode = exitCode;
}

main()
  .catch((err) => {
    process.stderr.write(`\nFAIL Script: ${err.message || err}\n`);
    process.exitCode = 2;
  })
  .finally(async () => {
    try { await pool.end(); } catch (_) {}
  });
