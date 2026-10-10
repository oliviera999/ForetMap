'use strict';

/**
 * Purge planifiée — catégorie `eleves` : comptes élèves conservés jusqu'à la fin de la
 * scolarité + 1 an.
 *   - départ constaté (désactivé depuis plus de 12 mois) ou présumé (aucune activité pendant
 *     toute une année scolaire) → supprimé par le chemin d'effacement de l'application ;
 *   - jamais un compte actif depuis moins de 12 mois (connexion, jeu, ouverture d'application),
 *     jamais un compte au profil administrateur ;
 *   - simulation : rien ne change ; sortie : aucune donnée nominative ; seuil : rien supprimé.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { initSchema, queryAll, queryOne, execute } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { dbFingerprint } = require('./helpers/dbFingerprint');
const {
  createDatedAccount,
  grantRole,
  userExists,
  captureLog,
  leakedPersonalData,
} = require('./helpers/retentionFixtures');
const {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
  createGlChapterWithMarker,
  createGlGameWithTeams,
  assignPlayerToGameTeam,
} = require('./helpers/glFixtures');

const ROOT = path.resolve(__dirname, '..');
const APPLY_ENV = { RETENTION_PURGE_APPLY: '1' };
const DAY = 86400000;

test.before(async () => {
  await initSchema();
  await ensureAdminTeacherAuthToken();
});

test('fin de scolarité présumée : 31 août de la dernière année active, + 1 an', () => {
  const { presumedDepartureCutoff, schoolYearStart } = require('../lib/retention/policy');
  const iso = (d) => d.toISOString().slice(0, 10);
  assert.equal(iso(schoolYearStart(new Date('2026-03-01T12:00:00Z'))), '2025-09-01');
  assert.equal(iso(schoolYearStart(new Date('2026-09-01T00:00:00Z'))), '2026-09-01');
  // Au 10/10/2026 : supprimés, les élèves sans activité depuis le 01/09/2025 (année 2025-2026
  // entière sans activité ; dernière année active close le 31/08/2025, + 1 an).
  assert.equal(presumedDepartureCutoff(new Date('2026-10-10T08:00:00Z')), '2025-09-01');
  // Au 15/08/2026, l'année 2025-2026 n'est pas finie : la limite reste au 01/09/2024.
  assert.equal(presumedDepartureCutoff(new Date('2026-08-15T08:00:00Z')), '2024-09-01');
  // La limite précède toujours d'au moins 12 mois.
  for (const day of ['2026-01-01', '2026-08-31', '2026-09-01', '2026-12-31']) {
    const now = new Date(`${day}T10:00:00Z`);
    const cutoff = new Date(`${presumedDepartureCutoff(now)}T00:00:00Z`);
    assert.ok(now.getTime() - cutoff.getTime() >= 365 * DAY, day);
  }
});

/** Dates absolues d'un compte (Date JS). */
async function setDates(id, { lastSeen, created }) {
  await execute('UPDATE users SET last_seen = ?, created_at = ? WHERE id = ?', [
    lastSeen,
    created || lastSeen,
    id,
  ]);
}

/** Classe et chapitre du jeu, pour y rattacher des joueurs de test. */
async function createGlContext() {
  const admin = await createGlAdmin({ email: `mj.retention.${Date.now()}@ecole.local` });
  const glClass = await createGlClass({
    adminId: admin.id,
    name: `Classe retention ${Date.now()}`,
  });
  const { chapter } = await createGlChapterWithMarker();
  return { admin, glClass, chapter };
}

/** Élève lié à un joueur G&L engagé dans une partie en cours. */
async function linkToLiveGame(gl, studentId) {
  const player = await createGlPlayer({
    classId: gl.glClass.id,
    pseudo: `ret-partie-${Date.now()}`,
    linkedForetmapUserId: studentId,
  });
  const { game, teams } = await createGlGameWithTeams({
    classId: gl.glClass.id,
    chapterId: gl.chapter.id,
    createdBy: gl.admin.id,
    status: 'live',
    teams: [{ name: 'Equipe retention' }],
  });
  await assignPlayerToGameTeam({ gameId: game.id, teamId: teams[0].id, playerId: player.id });
  return player;
}

async function countCandidates() {
  const { runRetentionPurge } = require('../lib/retention/retentionPurge');
  const r = await runRetentionPurge({ argv: ['--only=eleves'], env: {}, log: () => {} });
  return r.counts.eleves;
}

test('élèves : simulation sans effet, seuil, puis suppression par le chemin d’effacement', async () => {
  const { presumedDepartureCutoff } = require('../lib/retention/policy');
  const { runRetentionPurge } = require('../lib/retention/retentionPurge');
  const now = Date.now();
  const cutoff = new Date(`${presumedDepartureCutoff(now)}T00:00:00Z`).getTime();
  const baseline = await countCandidates();

  // À supprimer.
  const departed = await createDatedAccount({
    label: 'Parti',
    isActive: 0,
    deactivatedDaysAgo: 400,
    lastSeenDaysAgo: 420,
  });
  const silent = await createDatedAccount({ label: 'Silencieux' });
  await setDates(silent.id, { lastSeen: new Date(cutoff - 10 * DAY) });
  // À conserver.
  const lastYear = await createDatedAccount({ label: 'AnneeEnCours' });
  await setDates(lastYear.id, {
    lastSeen: new Date(cutoff + 10 * DAY),
    created: new Date(cutoff - 400 * DAY),
  });
  const recentlyLeft = await createDatedAccount({
    label: 'PartiRecent',
    isActive: 0,
    deactivatedDaysAgo: 100,
    lastSeenDaysAgo: 110,
  });
  const recent = await createDatedAccount({ label: 'Recent', lastSeenDaysAgo: 30 });
  const lateActivity = await createDatedAccount({
    label: 'Revenu',
    isActive: 0,
    deactivatedDaysAgo: 400,
    lastSeenDaysAgo: 30,
  });
  const adminRole = await createDatedAccount({ label: 'ProfilAdmin' });
  await setDates(adminRole.id, { lastSeen: new Date(cutoff - 10 * DAY) });
  await grantRole(adminRole.id, 'student', 'admin');
  const assignedAdmin = await createDatedAccount({ label: 'AttribueAdmin' });
  await setDates(assignedAdmin.id, { lastSeen: new Date(cutoff - 10 * DAY) });
  await execute(
    "UPDATE users SET assigned_role_id = (SELECT id FROM roles WHERE slug = 'admin') WHERE id = ?",
    [assignedAdmin.id],
  );
  const visitor = await createDatedAccount({ label: 'Visiteur' });
  await setDates(visitor.id, { lastSeen: new Date(cutoff - 10 * DAY) });
  await execute(
    `INSERT INTO user_product_visits (user_id, product, first_seen_at, last_seen_at)
     VALUES (?, 'foret', NOW() - INTERVAL 5 DAY, NOW() - INTERVAL 5 DAY)`,
    [visitor.id],
  );
  const gl = await createGlContext();
  const gamer = await createDatedAccount({ label: 'Joueur' });
  await setDates(gamer.id, { lastSeen: new Date(cutoff - 10 * DAY) });
  const gamerPlayer = await createGlPlayer({
    classId: gl.glClass.id,
    pseudo: `ret-actif-${Date.now()}`,
    linkedForetmapUserId: gamer.id,
  });
  await execute('UPDATE gl_players SET last_seen = NOW() - INTERVAL 10 DAY WHERE id = ?', [
    gamerPlayer.id,
  ]);
  // Retenu par le jeu : départ constaté, mais joueur dans une partie en cours.
  const inGame = await createDatedAccount({
    label: 'EnPartie',
    isActive: 0,
    deactivatedDaysAgo: 400,
    lastSeenDaysAgo: 420,
  });
  await linkToLiveGame(gl, inGame.id);

  // Traces du compte parti : effacées avec lui.
  const threadId = `th-ret-${Date.now()}`;
  await execute(
    `INSERT INTO forum_threads (id, title, author_user_type, author_user_id) VALUES (?, 'Sujet', 'student', ?)`,
    [threadId, departed.id],
  );
  await execute(
    `INSERT INTO security_events (occurred_at, actor_user_id, actor_user_type, action, ip_address, user_agent)
     VALUES (NOW() - INTERVAL 30 DAY, ?, 'student', 'login', '198.51.100.40', 'Nav/1')`,
    [departed.id],
  );

  const all = [
    departed,
    silent,
    lastYear,
    recentlyLeft,
    recent,
    lateActivity,
    adminRole,
    assignedAdmin,
    visitor,
    gamer,
    inGame,
  ];
  const ids = all.map((a) => a.id);
  const placeholders = ids.map(() => '?').join(', ');
  const tables = {
    users: {
      sql: `SELECT id, is_active, deactivated_at, last_seen, updated_at FROM users WHERE id IN (${placeholders}) ORDER BY id`,
      params: ids,
    },
    forum: { sql: 'SELECT id FROM forum_threads WHERE id = ?', params: [threadId] },
    events: {
      sql: 'SELECT ip_address, user_agent FROM security_events WHERE actor_user_id = ?',
      params: [departed.id],
    },
    roles: {
      sql: `SELECT user_id, role_id FROM user_roles WHERE user_id IN (${placeholders}) ORDER BY user_id`,
      params: ids,
    },
  };
  const before = await dbFingerprint(tables);

  // 1. Simulation (variable d'activation posée, mais pas --apply) : rien ne change.
  const out = captureLog();
  const sim = await runRetentionPurge({ argv: ['--only=eleves'], env: APPLY_ENV, log: out.log });
  assert.equal(sim.exitCode, 0);
  assert.equal(sim.mode, 'simulation');
  assert.deepEqual(await dbFingerprint(tables), before, 'simulation : aucune modification');
  assert.equal(sim.counts.eleves.candidats, baseline.candidats + 3, 'parti, silencieux, en partie');
  assert.equal(sim.counts.eleves.depart_constate, baseline.depart_constate + 2);
  assert.equal(sim.counts.eleves.sans_activite, baseline.sans_activite + 1);
  assert.deepEqual(leakedPersonalData(out.text(), all), [], 'aucune donnée nominative en sortie');

  // 2. Seuil dépassé : bloqué, rien supprimé, code 3 (alerte).
  const blocked = await runRetentionPurge({
    argv: ['--apply', '--only=eleves', '--max-accounts=1'],
    env: APPLY_ENV,
    log: () => {},
  });
  assert.equal(blocked.exitCode, 3);
  assert.equal(blocked.outcome, 'blocked');
  assert.equal(blocked.counts.eleves.bloque, true);
  assert.deepEqual(await dbFingerprint(tables), before, 'seuil : aucune suppression');
  const blockedRow = await queryOne('SELECT outcome FROM retention_purge_runs WHERE id = ?', [
    blocked.runId,
  ]);
  assert.equal(blockedRow.outcome, 'blocked');

  // 3. Exécution réelle.
  const realOut = captureLog();
  const real = await runRetentionPurge({
    argv: ['--apply', '--only=eleves', '--max-accounts=100000', '--account-batch-size=2'],
    env: APPLY_ENV,
    log: realOut.log,
  });
  assert.equal(real.exitCode, 0, realOut.text());
  assert.equal(real.mode, 'apply');
  assert.equal(await userExists(departed.id), false, 'départ constaté : supprimé');
  assert.equal(await userExists(silent.id), false, 'année scolaire sans activité : supprimé');
  for (const kept of [
    lastYear,
    recentlyLeft,
    recent,
    lateActivity,
    adminRole,
    assignedAdmin,
    visitor,
    gamer,
    inGame,
  ]) {
    assert.equal(await userExists(kept.id), true, `${kept.firstName.slice(0, 12)} conservé`);
  }
  assert.ok(real.counts.eleves.conserves.gl_player_in_active_game >= 1, 'partie en cours');
  assert.deepEqual(leakedPersonalData(realOut.text(), all), []);

  // Effacement en cascade cohérent : forum supprimé, IP effacée, journal d'audit par id.
  assert.equal(await queryOne('SELECT id FROM forum_threads WHERE id = ?', [threadId]), undefined);
  const events = await queryAll(
    "SELECT ip_address, user_agent FROM security_events WHERE action = 'login' AND ip_address = '198.51.100.40'",
  );
  assert.deepEqual(events, [], 'IP du compte supprimé effacée');
  const audit = await queryAll(
    "SELECT target_id, details, payload_json FROM audit_log WHERE action = 'retention_purge_account' AND target_id IN (?, ?)",
    [departed.id, silent.id],
  );
  assert.equal(audit.length, 2);
  for (const row of audit) assert.equal(row.details, row.target_id, 'identifiant seulement');

  // 4. Idempotent : une nouvelle exécution ne supprime plus aucun de ces comptes.
  const again = await runRetentionPurge({
    argv: ['--apply', '--only=eleves', '--max-accounts=100000'],
    env: APPLY_ENV,
    log: () => {},
  });
  assert.equal(again.exitCode, 0);
  assert.equal(again.counts.eleves.supprimes, 0);
  assert.equal(await userExists(inGame.id), true);
});

test('élèves : sortie du script (processus réel) sans nom, e-mail ni identifiant', async () => {
  const silent = await createDatedAccount({ label: 'Sortie' });
  const { presumedDepartureCutoff } = require('../lib/retention/policy');
  const cutoff = new Date(`${presumedDepartureCutoff(Date.now())}T00:00:00Z`).getTime();
  await setDates(silent.id, { lastSeen: new Date(cutoff - 20 * DAY) });
  const run = spawnSync(process.execPath, ['scripts/retention-purge.js', '--only=eleves'], {
    cwd: ROOT,
    env: { ...process.env, RETENTION_PURGE_APPLY: '', LOG_LEVEL: 'debug' },
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /comptes élèves/);
  const text = run.stdout + run.stderr;
  assert.deepEqual(leakedPersonalData(text, [silent]), []);
  assert.doesNotMatch(text, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  assert.equal(await userExists(silent.id), true, 'simulation : compte intact');
});
