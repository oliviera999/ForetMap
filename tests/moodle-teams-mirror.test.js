'use strict';

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { initSchema, execute, queryOne } = require('../database');
const { app } = require('../server');
const { setSetting } = require('../lib/settings');
const {
  teamIdnumber,
  slugTeamName,
  subgroupIdnumber,
  isFmIdnumber,
  mirrorGameTeams,
  mirrorForetmapGroup,
} = require('../lib/moodle/teamsMirror');
const { runSync, resetProcessLockForTests } = require('../lib/moodle/syncRun');
const fx = require('./helpers/moodleFixtures');
const {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
  createGlChapterWithMarker,
  createGlGameWithTeams,
  assignPlayerToGameTeam,
  signTokens,
} = require('./helpers/glFixtures');

const stamp = Date.now();
const COURSE_ID = 564;
const COHORT = `26#6${String(stamp).slice(-2)}`;

let fake;
let client;
let issuer;
let admin;
let glClass;
let chapter;
let settings;
const savedEnv = {};

function pointEnv() {
  for (const key of ['MOODLE_BASE_URL', 'MOODLE_WS_TOKEN', 'MOODLE_SYNC_ENABLED']) {
    savedEnv[key] = process.env[key];
  }
  process.env.MOODLE_BASE_URL = fake.baseUrl;
  process.env.MOODLE_WS_TOKEN = fake.state.token;
  delete process.env.MOODLE_SYNC_ENABLED;
}

function restoreEnv() {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
}

async function linkClassToCohort(group, classId, idnumber) {
  await execute('UPDATE gl_classes SET foretmap_group_id = ? WHERE id = ?', [group.id, classId]);
  await execute(
    `INSERT INTO external_groups
       (provider, issuer, kind, external_id, external_idnumber, external_name, master, group_id, gl_class_id)
     VALUES ('moodle', ?, 'cohort', ?, ?, ?, 'moodle', ?, ?)`,
    [issuer, String(9000 + classId), idnumber, `Cohorte ${idnumber}`, group.id, classId],
  );
}

async function linkUserToMoodle(userId, moodleId) {
  await execute(
    `INSERT INTO external_identities
       (provider, issuer, external_id, user_id, origin, linked_at, last_seen_at)
     VALUES ('moodle', ?, ?, ?, 'linked', NOW(), NOW())`,
    [issuer, String(moodleId), userId],
  );
}

test.before(async () => {
  await initSchema();
  await fx.purgeSyncArtifacts();
  ({ fake, client } = await fx.startFakeMoodle());
  issuer = client.baseUrl;
  fake.addCourse({ id: COURSE_ID, fullname: 'Chapitre 1', shortname: 'C1' });
  admin = await createGlAdmin({ email: `mirror-${stamp}@ecole.local` });
  glClass = await createGlClass({ name: `Classe miroir ${stamp}`, adminId: admin.id });
  ({ chapter } = await createGlChapterWithMarker({
    slug: `mirror-ch-${stamp}`,
    title: `Chapitre miroir ${stamp}`,
  }));
  settings = fx.buildSettings({ chapterCourses: { [chapter.id]: COURSE_ID } });
});

test.after(async () => {
  restoreEnv();
  await fake.stop();
});

test.beforeEach(() => {
  resetProcessLockForTests();
  fake.state.groups = [];
  fake.state.groupMembers = new Map();
  fake.state.enrolled = new Map();
  fake.resetCalls();
});

test('slug et idnumber FM# collent à la spec 10.4', () => {
  assert.equal(slugTeamName('Gnomes sylvestres'), 'gnomes-sylvestres');
  assert.equal(
    teamIdnumber('26#601-602', 564, 'gnomes sylvestres'),
    'FM#26#601-602#C564#gnomes-sylvestres',
  );
  assert.equal(subgroupIdnumber('26#603', 'atelier A'), 'FM#26#603#G#atelier-a');
  assert.equal(isFmIdnumber('FM#26#603#C564#x'), true);
  assert.equal(isFmIdnumber('Cohorte 26#603'), false);
});

test('miroir : crée, renomme, supprime uniquement les groupes FM# ; groupe classe intact', async () => {
  const group = await fx.createGroup({ name: `Cohorte ${COHORT}` });
  await linkClassToCohort(group, glClass.id, COHORT);
  const { game, teams } = await createGlGameWithTeams({
    classId: glClass.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    status: 'draft',
    name: `Partie miroir ${stamp}`,
    teams: [
      { name: 'gnomes sylvestres', type: 'gnome' },
      { name: 'licornes aquatiques', type: 'unicorn' },
    ],
  });
  const linked = await createGlPlayer({
    classId: glClass.id,
    pseudo: `lie-${stamp}`,
    firstName: 'Lia',
    lastName: `Miroir${stamp}`,
  });
  const orphan = await createGlPlayer({
    classId: glClass.id,
    pseudo: `orphelin-${stamp}`,
    firstName: 'Orph',
    lastName: `Local${stamp}`,
  });
  await assignPlayerToGameTeam({ gameId: game.id, teamId: teams[0].id, playerId: linked.id });
  await assignPlayerToGameTeam({ gameId: game.id, teamId: teams[1].id, playerId: orphan.id });
  await linkUserToMoodle(linked.linked_foretmap_user_id, 4401);
  fake.addUser({
    id: 4401,
    username: 'lia.miroir',
    firstname: 'Lia',
    lastname: 'Miroir',
    email: `lia${stamp}@lyautey.test`,
  });
  fake.enrolInCourse(COURSE_ID, 4401);
  fake.addGroup({
    courseid: COURSE_ID,
    name: `Cohorte ${COHORT}`,
    idnumber: `COH#${COHORT}`,
  });
  fake.addGroup({
    courseid: COURSE_ID,
    name: 'ancienne équipe',
    idnumber: teamIdnumber(COHORT, COURSE_ID, 'ancienne equipe'),
  });
  fake.addGroup({
    courseid: COURSE_ID,
    name: 'mauvais nom',
    idnumber: teamIdnumber(COHORT, COURSE_ID, 'gnomes sylvestres'),
  });

  const dry = await mirrorGameTeams({ gameId: game.id, dryRun: true, client, settings });
  assert.equal(dry.error, null);
  assert.ok(dry.created.some((c) => c.name === 'licornes aquatiques'));
  assert.ok(dry.renamed.some((r) => r.to === 'gnomes sylvestres'));
  assert.ok(dry.deleted.some((d) => /ancienne/.test(d.idnumber)));
  assert.ok(dry.missingIdentities.some((m) => m.playerId === orphan.id));
  assert.equal(
    fake.state.groups.filter((g) => g.name === `Cohorte ${COHORT}`).length,
    1,
    'dry-run n’écrit pas',
  );

  const applied = await mirrorGameTeams({ gameId: game.id, dryRun: false, client, settings });
  assert.equal(applied.error, null);
  const names = fake.state.groups.map((g) => g.name).sort();
  assert.ok(names.includes('gnomes sylvestres'));
  assert.ok(names.includes('licornes aquatiques'));
  assert.ok(names.includes(`Cohorte ${COHORT}`));
  assert.ok(!names.includes('ancienne équipe'));
  assert.ok(!names.includes('mauvais nom'));
  const fm = fake.state.groups.filter((g) => isFmIdnumber(g.idnumber));
  assert.equal(fm.length, 2);
  assert.ok(fm.every((g) => g.name === 'gnomes sylvestres' || g.name === 'licornes aquatiques'));
  const gnome = fm.find((g) => g.name === 'gnomes sylvestres');
  const members = [...(fake.state.groupMembers.get(gnome.id) || [])];
  assert.ok(members.map(Number).includes(4401));
  assert.ok(applied.missingIdentities.some((m) => m.playerId === orphan.id));
  assert.equal(applied.missingIdentities.length, 1);
});

test('collision de nom avec un groupe non-miroir : arrêt, aucune écriture', async () => {
  const group = await fx.createGroup({ name: `Cohorte clash ${stamp}` });
  const klass = await createGlClass({ name: `Classe clash ${stamp}`, adminId: admin.id });
  await linkClassToCohort(group, klass.id, `${COHORT}-x`);
  const { game } = await createGlGameWithTeams({
    classId: klass.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    status: 'draft',
    name: `Partie clash ${stamp}`,
    teams: [{ name: 'gnomes montagnards', type: 'gnome' }],
  });
  fake.addGroup({ courseid: COURSE_ID, name: 'gnomes montagnards', idnumber: 'MANUAL' });
  const before = fake.state.groups.length;
  const report = await mirrorGameTeams({ gameId: game.id, dryRun: false, client, settings });
  assert.match(report.error, /n’est pas le miroir/);
  assert.equal(fake.state.groups.length, before);
  assert.equal(fake.callsFor('core_group_create_groups').length, 0);
});

test('partie hors préparation : les affectations G&L ne sont pas recomposées', async () => {
  const group = await fx.createGroup({ name: `Cohorte live ${stamp}` });
  const klass = await createGlClass({ name: `Classe live ${stamp}`, adminId: admin.id });
  await linkClassToCohort(group, klass.id, `${COHORT}-live`);
  const { game, teams } = await createGlGameWithTeams({
    classId: klass.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    status: 'live',
    name: `Partie live ${stamp}`,
    teams: [{ name: 'licornes aériennes', type: 'unicorn' }],
  });
  const player = await createGlPlayer({
    classId: klass.id,
    pseudo: `live-${stamp}`,
    firstName: 'Live',
    lastName: `P${stamp}`,
  });
  await assignPlayerToGameTeam({ gameId: game.id, teamId: teams[0].id, playerId: player.id });
  const before = await queryOne(
    'SELECT team_id FROM gl_team_members WHERE game_id = ? AND player_id = ?',
    [game.id, player.id],
  );
  const report = await mirrorGameTeams({ gameId: game.id, dryRun: false, client, settings });
  assert.equal(report.error, null);
  assert.ok(report.notices.some((n) => /n’ont pas été recomposées/.test(n)));
  const after = await queryOne(
    'SELECT team_id FROM gl_team_members WHERE game_id = ? AND player_id = ?',
    [game.id, player.id],
  );
  assert.equal(Number(after.team_id), Number(before.team_id));
  assert.ok(fake.state.groups.some((g) => g.name === 'licornes aériennes'));
});

test('sous-groupe ForetMap : idnumber FM#…#G#…, collision refusée', async () => {
  const parent = await fx.createGroup({ name: `Classe parent ${stamp}` });
  await execute(
    `INSERT INTO external_groups
       (provider, issuer, kind, external_id, external_idnumber, external_name, master, group_id)
     VALUES ('moodle', ?, 'cohort', ?, ?, ?, 'moodle', ?)`,
    [issuer, `sg-${stamp}`, `${COHORT}-sg`, `Cohorte ${COHORT}-sg`, parent.id],
  );
  const child = await fx.createGroup({ name: 'atelier lecture', slug: `atelier-lecture-${stamp}` });
  await execute('UPDATE `groups` SET parent_group_id = ? WHERE id = ?', [parent.id, child.id]);
  const dry = await mirrorForetmapGroup({
    groupId: child.id,
    courseId: COURSE_ID,
    dryRun: true,
    client,
  });
  assert.equal(dry.error, null);
  assert.equal(dry.created, true);
  assert.equal(dry.idnumber, subgroupIdnumber(`${COHORT}-sg`, child.slug));
  const applied = await mirrorForetmapGroup({
    groupId: child.id,
    courseId: COURSE_ID,
    dryRun: false,
    client,
  });
  assert.equal(applied.created, true);
  assert.ok(
    fake.state.groups.some((g) => g.idnumber === dry.idnumber && g.name === 'atelier lecture'),
  );
  const other = await fx.createGroup({ name: 'club local', slug: `club-local-${stamp}` });
  await execute('UPDATE `groups` SET parent_group_id = ? WHERE id = ?', [parent.id, other.id]);
  fake.addGroup({ courseid: COURSE_ID, name: 'club local', idnumber: 'MANUAL-CLUB' });
  const blocked = await mirrorForetmapGroup({
    groupId: other.id,
    courseId: COURSE_ID,
    dryRun: false,
    client,
  });
  assert.match(blocked.error, /n’est pas ce miroir/);
});

test('POST /runs avec teams : le rapport porte teamMirrors', async () => {
  fx.seedCohort(fake, {
    id: 699,
    idnumber: '26#699',
    name: `6e 99 ${stamp}`,
    members: [fx.member(7001, 'Ada', `Run${stamp}`)],
  });
  const result = await runSync({
    mode: 'dry_run',
    cohortIds: [699],
    teams: true,
    deps: { client, settings },
  });
  assert.equal(result.status, 'succeeded');
  assert.ok(Array.isArray(result.report.teamMirrors));
});

test('POST /api/gl/games/:id/teams/mirror : 503 sans config, puis pousse avec env', async () => {
  delete process.env.MOODLE_BASE_URL;
  delete process.env.MOODLE_WS_TOKEN;
  const { adminToken } = await signTokens({
    adminId: admin.id,
    adminPermissions: ['gl.read', 'gl.team.manage', 'gl.players.manage'],
  });
  const group = await fx.createGroup({ name: `Cohorte http ${stamp}` });
  const klass = await createGlClass({ name: `Classe http ${stamp}`, adminId: admin.id });
  await linkClassToCohort(group, klass.id, `${COHORT}-http`);
  const { game } = await createGlGameWithTeams({
    classId: klass.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    status: 'draft',
    name: `Partie http ${stamp}`,
    teams: [{ name: 'gnomes des forêts', type: 'gnome' }],
  });
  await request(app)
    .post(`/api/gl/games/${game.id}/teams/mirror`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ dryRun: true })
    .expect(503);

  pointEnv();
  await setSetting('integration.moodle.chapter_courses', { [String(chapter.id)]: COURSE_ID });
  const ok = await request(app)
    .post(`/api/gl/games/${game.id}/teams/mirror`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ dryRun: false })
    .expect(200);
  assert.ok(!ok.body.error);
  assert.ok(fake.state.groups.some((g) => g.name === 'gnomes des forêts'));
});
