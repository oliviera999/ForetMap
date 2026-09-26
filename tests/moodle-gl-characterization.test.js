'use strict';

// =====================================================================
// Caractérisation des écritures Gnomes & Licornes de la synchronisation Moodle (audit du
// 25/09/2026, § 3.4 ; décision Q18 : adaptateur côté Moodle).
//
// Écrit AVANT l'extraction de `lib/moodle/gameAdapter.js`, il fige les chemins GL que les
// suites existantes (`moodle-sync-apply`, `moodle-teams-mirror`) ne couvraient pas :
//   - déplacement d'un joueur déjà lié vers la classe de sa cohorte, puis son annulation ;
//   - joueur engagé dans une partie en cours : déplacement différé, alerte au second passage ;
//   - annulation d'une classe encore peuplée (désactivée, pas supprimée), puis réactivation
//     par l'exécution suivante et annulation de cette réactivation.
// Il fige aussi le journal (`sync_actions`) des actions GL, avant/après compris.
// =====================================================================

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const { initSchema, queryOne, queryAll, execute } = require('../database');
const { runSync, resetProcessLockForTests } = require('../lib/moodle/syncRun');
const { undoRun } = require('../lib/moodle/undo');
const fx = require('./helpers/moodleFixtures');
const { restoreDefaultProgressionThresholds } = require('./helpers/progressionThresholds');
const {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
  createGlChapterWithMarker,
  createGlGameWithTeams,
  assignPlayerToGameTeam,
} = require('./helpers/glFixtures');

let fake;
let client;
let admin;
let chapter;
const stamp = Date.now();
const createdGlClassIds = [];
const createdGlPlayerIds = [];

async function apply(cohortIds) {
  return runSync({
    mode: 'apply',
    cohortIds,
    force: true,
    forceReason: 'test',
    deps: { client, settings: fx.buildSettings() },
  });
}

/** Actions journalisées d'une exécution, JSON décodé. */
async function journal(runId) {
  const rows = await queryAll(
    `SELECT kind, target_type, target_id, before_json, after_json, undone_at
       FROM sync_actions WHERE run_id = ? ORDER BY seq`,
    [runId],
  );
  return rows.map((r) => ({
    kind: r.kind,
    targetType: r.target_type,
    targetId: r.target_id,
    before: r.before_json ? JSON.parse(r.before_json) : null,
    after: r.after_json ? JSON.parse(r.after_json) : null,
    undone: r.undone_at != null,
  }));
}

const glActions = (actions) => actions.filter((a) => a.kind.startsWith('gl_'));

async function linkedPlayer({ classId, userId, pseudo }) {
  const player = await createGlPlayer({ classId, pseudo, firstName: 'Lie', lastName: 'Compte' });
  createdGlPlayerIds.push(Number(player.id));
  await execute('UPDATE gl_players SET linked_foretmap_user_id = ? WHERE id = ?', [
    userId,
    player.id,
  ]);
  return player;
}

async function newGlClass(name) {
  const klass = await createGlClass({ name, adminId: admin.id });
  createdGlClassIds.push(Number(klass.id));
  return klass;
}

test.before(async () => {
  await initSchema();
  await restoreDefaultProgressionThresholds();
  await fx.purgeSyncArtifacts();
  ({ fake, client } = await fx.startFakeMoodle());
  admin = await createGlAdmin({ email: `mglc.${stamp}@ecole.local` });
  ({ chapter } = await createGlChapterWithMarker({ slug: `mglc-chap-${stamp}` }));
});

test.after(async () => {
  await fake.stop();
  await fx.purgeSyncArtifacts();
  for (const id of createdGlPlayerIds) {
    await execute('DELETE FROM gl_team_members WHERE player_id = ?', [id]).catch(() => {});
    await execute('DELETE FROM gl_players WHERE id = ?', [id]).catch(() => {});
  }
});

test.beforeEach(() => resetProcessLockForTests());

test('joueur déjà lié : déplacé vers la classe de la cohorte, puis replacé par l’annulation', async () => {
  const classA = await newGlClass(`Ancienne ${stamp}`);
  const student = await fx.createStudent({
    firstName: 'Move',
    lastName: `Gl${stamp}`,
    email: `move.gl${stamp}@lyautey.test`,
  });
  const player = await linkedPlayer({
    classId: classA.id,
    userId: student.id,
    pseudo: `mglc-move-${stamp}`,
  });
  fx.seedCohort(fake, {
    id: 650,
    idnumber: '26#650',
    name: `6e 50 ${stamp}`,
    members: [fx.member(9001, 'Move', `Gl${stamp}`, { email: student.email })],
  });

  const result = await apply([650]);
  assert.strictEqual(result.status, 'succeeded', JSON.stringify(result.report.applied));
  const eg = await queryOne("SELECT * FROM external_groups WHERE external_id = '650'");
  assert.ok(eg.group_id && eg.gl_class_id);
  const newClassId = Number(eg.gl_class_id);
  createdGlClassIds.push(newClassId);

  const actions = await journal(result.runId);
  assert.deepStrictEqual(
    actions.map((a) => a.kind),
    ['group.ensure', 'gl_class.ensure', 'user.link', 'group.member.add', 'gl_player.move'],
  );
  assert.deepStrictEqual(glActions(actions), [
    {
      kind: 'gl_class.ensure',
      targetType: 'gl_class',
      targetId: String(newClassId),
      before: null,
      after: {
        glClassId: newClassId,
        name: `6e 50 ${stamp}`,
        groupId: eg.group_id,
        cohort: '26#650',
      },
      undone: false,
    },
    {
      kind: 'gl_player.move',
      targetType: 'gl_player',
      targetId: String(player.id),
      before: { classId: Number(classA.id), teamId: null },
      after: { classId: newClassId, teamId: null, userId: student.id, cohort: '26#650' },
      undone: false,
    },
  ]);
  const glClass = await queryOne(
    'SELECT name, school, created_by, is_active, foretmap_group_id FROM gl_classes WHERE id = ?',
    [newClassId],
  );
  assert.deepStrictEqual(
    { ...glClass, is_active: Number(glClass.is_active) },
    {
      name: `6e 50 ${stamp}`,
      school: null,
      created_by: null,
      is_active: 1,
      foretmap_group_id: eg.group_id,
    },
  );
  const moved = await queryOne('SELECT class_id, team_id FROM gl_players WHERE id = ?', [
    player.id,
  ]);
  assert.deepStrictEqual(
    { classId: Number(moved.class_id), teamId: moved.team_id },
    { classId: newClassId, teamId: null },
  );

  const undone = await undoRun(result.runId, { client });
  assert.strictEqual(undone.undone, 5);
  const back = await queryOne('SELECT class_id, team_id FROM gl_players WHERE id = ?', [player.id]);
  assert.deepStrictEqual(
    { classId: Number(back.class_id), teamId: back.team_id },
    { classId: Number(classA.id), teamId: null },
  );
  // Vidée par le retour du joueur, la classe créée est supprimée, et le lien avec elle.
  assert.strictEqual(
    await queryOne('SELECT 1 AS x FROM gl_classes WHERE id = ?', [newClassId]),
    undefined,
  );
  assert.strictEqual(
    await queryOne('SELECT 1 AS x FROM external_groups WHERE id = ?', [eg.id]),
    undefined,
  );
});

test('joueur en partie en cours : jamais déplacé ; alerte seulement quand la classe existe', async () => {
  const classB = await newGlClass(`Partie ${stamp}`);
  const student = await fx.createStudent({
    firstName: 'Live',
    lastName: `Gl${stamp}`,
    email: `live.gl${stamp}@lyautey.test`,
  });
  const player = await linkedPlayer({
    classId: classB.id,
    userId: student.id,
    pseudo: `mglc-live-${stamp}`,
  });
  const { game, teams } = await createGlGameWithTeams({
    classId: classB.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    status: 'live',
    name: `Partie live ${stamp}`,
    teams: [{ name: `Equipe live ${stamp}` }],
  });
  await assignPlayerToGameTeam({ gameId: game.id, teamId: teams[0].id, playerId: player.id });
  fx.seedCohort(fake, {
    id: 651,
    idnumber: '26#651',
    name: `6e 51 ${stamp}`,
    members: [
      fx.member(9101, 'Live', `Gl${stamp}`, { email: student.email }),
      fx.member(9102, 'Autre', `Gl${stamp}`),
    ],
  });

  const alertsOf = (report) =>
    (report.lists?.alerts || [])
      .filter((a) => a.code === 'player_in_live_game')
      .map(({ code, cohort, userId }) => ({ code, cohort, userId }));

  // 1er passage : la classe n'existe pas encore — le joueur n'est pas déplacé, sans alerte.
  const first = await apply([651]);
  assert.strictEqual(first.status, 'succeeded', JSON.stringify(first.report.applied));
  const eg = await queryOne("SELECT * FROM external_groups WHERE external_id = '651'");
  createdGlClassIds.push(Number(eg.gl_class_id));
  const firstActions = await journal(first.runId);
  assert.deepStrictEqual(
    glActions(firstActions).map((a) => a.kind),
    ['gl_class.ensure', 'gl_player.ensure'],
  );
  const created = glActions(firstActions).find((a) => a.kind === 'gl_player.ensure');
  const createdPlayer = await queryOne(
    `SELECT class_id, team_id, first_name, is_active, linked_foretmap_user_id
       FROM gl_players WHERE id = ?`,
    [Number(created.targetId)],
  );
  assert.strictEqual(Number(createdPlayer.class_id), Number(eg.gl_class_id));
  assert.strictEqual(createdPlayer.team_id, null);
  assert.strictEqual(createdPlayer.first_name, 'Autre');
  assert.strictEqual(Number(createdPlayer.is_active), 1);
  assert.strictEqual(created.after.userId, createdPlayer.linked_foretmap_user_id);
  assert.strictEqual(created.after.classId, Number(eg.gl_class_id));
  assert.match(created.after.pseudo, /^autre\.gl\d+$/);
  assert.deepStrictEqual(alertsOf(first.report), []);
  const stay1 = await queryOne('SELECT class_id FROM gl_players WHERE id = ?', [player.id]);
  assert.strictEqual(Number(stay1.class_id), Number(classB.id));

  // 2e passage : la classe existe — le déplacement est différé ET signalé.
  const second = await apply([651]);
  assert.strictEqual(second.status, 'succeeded');
  assert.deepStrictEqual(alertsOf(second.report), [
    { code: 'player_in_live_game', cohort: '26#651', userId: student.id },
  ]);
  assert.deepStrictEqual(glActions(await journal(second.runId)), []);
  const stay2 = await queryOne('SELECT class_id FROM gl_players WHERE id = ?', [player.id]);
  assert.strictEqual(Number(stay2.class_id), Number(classB.id));
});

test('classe encore peuplée : désactivée par l’annulation, réactivée ensuite, puis re-désactivée', async () => {
  fx.seedCohort(fake, {
    id: 652,
    idnumber: '26#652',
    name: `6e 52 ${stamp}`,
    members: [fx.member(9201, 'Peuple', `Gl${stamp}`)],
  });
  const first = await apply([652]);
  assert.strictEqual(first.status, 'succeeded');
  const eg = await queryOne("SELECT * FROM external_groups WHERE external_id = '652'");
  const classId = Number(eg.gl_class_id);
  createdGlClassIds.push(classId);
  // Un joueur posé à la main : la classe ne sera pas vide après annulation.
  const manual = await createGlPlayer({ classId, pseudo: `mglc-manual-${stamp}` });
  createdGlPlayerIds.push(Number(manual.id));

  await undoRun(first.runId, { client });
  const afterUndo = await queryOne('SELECT is_active FROM gl_classes WHERE id = ?', [classId]);
  assert.strictEqual(Number(afterUndo.is_active), 0, 'classe peuplée : désactivée, conservée');
  const egAfterUndo = await queryOne(
    'SELECT gl_class_id, group_id FROM external_groups WHERE id = ?',
    [eg.id],
  );
  assert.strictEqual(Number(egAfterUndo.gl_class_id), classId, 'lien à la classe conservé');
  const players = await queryAll('SELECT id FROM gl_players WHERE class_id = ? ORDER BY id', [
    classId,
  ]);
  assert.deepStrictEqual(
    players.map((p) => Number(p.id)),
    [Number(manual.id)],
    'le joueur créé par la synchronisation est supprimé, le joueur manuel reste',
  );

  const again = await apply([652]);
  assert.strictEqual(again.status, 'succeeded', JSON.stringify(again.report.applied));
  const againGl = glActions(await journal(again.runId));
  assert.deepStrictEqual(
    againGl.map((a) => a.kind),
    ['gl_class.ensure', 'gl_player.ensure'],
  );
  assert.deepStrictEqual(againGl[0], {
    kind: 'gl_class.ensure',
    targetType: 'gl_class',
    targetId: String(classId),
    before: { isActive: 0 },
    after: { glClassId: classId, reactivated: true, cohort: '26#652' },
    undone: false,
  });
  const reactivated = await queryOne('SELECT is_active FROM gl_classes WHERE id = ?', [classId]);
  assert.strictEqual(Number(reactivated.is_active), 1);
  const classes = await queryAll('SELECT id FROM gl_classes WHERE foretmap_group_id = ?', [
    eg.group_id,
  ]);
  assert.deepStrictEqual(
    classes.map((c) => Number(c.id)),
    [classId],
    'aucune seconde classe',
  );

  await undoRun(again.runId, { client });
  const reUndo = await queryOne('SELECT is_active FROM gl_classes WHERE id = ?', [classId]);
  assert.strictEqual(Number(reUndo.is_active), 0, 'réactivation annulée : classe désactivée');
  const playersEnd = await queryAll('SELECT id FROM gl_players WHERE class_id = ?', [classId]);
  assert.deepStrictEqual(
    playersEnd.map((p) => Number(p.id)),
    [Number(manual.id)],
  );
});
