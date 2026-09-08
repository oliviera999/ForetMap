'use strict';

/**
 * Miroirs Moodle des équipes G&L (section 10.4–10.5) et des sous-groupes ForetMap (10.6).
 * Seuls les groupes dont l'`idnumber` commence par `FM#` sont créés, renommés ou supprimés (I-7).
 */

const { queryOne, queryAll } = require('../../database');
const { loadMoodleSettings } = require('./settings');
const { createMoodleClientFromEnv } = require('./client');

const FM_PREFIX = 'FM#';

function httpError(status, message, extra = {}) {
  const err = new Error(message);
  err.status = status;
  Object.assign(err, extra);
  return err;
}

function slugTeamName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function teamIdnumber(cohortIdnumber, courseId, teamName) {
  return `${FM_PREFIX}${cohortIdnumber}#C${Number(courseId)}#${slugTeamName(teamName)}`;
}

function subgroupIdnumber(cohortIdnumber, slug) {
  return `${FM_PREFIX}${cohortIdnumber}#G#${slugTeamName(slug)}`;
}

function isFmIdnumber(idnumber) {
  return String(idnumber || '').startsWith(FM_PREFIX);
}

async function cohortIdnumberForClass(classId) {
  const row = await queryOne(
    `SELECT eg.external_idnumber
       FROM gl_classes gc
       INNER JOIN external_groups eg
         ON eg.group_id = gc.foretmap_group_id AND eg.provider = 'moodle'
      WHERE gc.id = ? LIMIT 1`,
    [classId],
  );
  return row?.external_idnumber ? String(row.external_idnumber) : null;
}

async function moodleIdForUser(userId) {
  const row = await queryOne(
    `SELECT external_id FROM external_identities
      WHERE provider = 'moodle' AND user_id = ? LIMIT 1`,
    [userId],
  );
  if (!row) return null;
  const n = Number(row.external_id);
  return Number.isFinite(n) ? n : null;
}

function nameCollision({ teamName, existing, ownIdnumber }) {
  const clash = (existing || []).find(
    (g) =>
      String(g.name) === String(teamName) &&
      String(g.idnumber || '') !== String(ownIdnumber) &&
      !isFmIdnumber(g.idnumber),
  );
  return clash || null;
}

/**
 * Plan + éventuellement application du miroir d'équipes d'une partie.
 * Ne recompose jamais les affectations (I-10) : on pousse l'état actuel de `gl_teams`.
 */
async function mirrorGameTeams({ gameId, dryRun = true, client = null, settings = null }) {
  const game = await queryOne(
    `SELECT g.id, g.status, g.class_id, g.chapter_id, g.name
       FROM gl_games g WHERE g.id = ? LIMIT 1`,
    [gameId],
  );
  if (!game) throw httpError(404, 'Partie introuvable');
  const moodle = client || createMoodleClientFromEnv();
  if (!moodle)
    throw httpError(503, 'Intégration Moodle non configurée', { code: 'MOODLE_NOT_CONFIGURED' });
  const cfg = settings || (await loadMoodleSettings());
  const chapterId = Number(game.chapter_id);
  const courseId = Number(
    cfg.chapterCourses?.[chapterId] || cfg.chapterCourses?.[String(chapterId)],
  );
  const report = {
    gameId: Number(game.id),
    status: game.status,
    dryRun: Boolean(dryRun),
    courseId: courseId || null,
    created: [],
    renamed: [],
    deleted: [],
    membersAdded: [],
    membersRemoved: [],
    missingIdentities: [],
    notices: [],
    error: null,
  };
  if (!courseId) {
    report.notices.push('Aucun cours Moodle pour ce chapitre (table chapitre → cours)');
    return report;
  }
  const cohort = await cohortIdnumberForClass(game.class_id);
  if (!cohort) {
    report.notices.push('Classe G&L sans cohorte Moodle liée');
    return report;
  }
  const teams = await queryAll(
    'SELECT id, name, type FROM gl_teams WHERE game_id = ? ORDER BY id ASC',
    [game.id],
  );
  const members = await queryAll(
    `SELECT tm.team_id, tm.player_id, p.linked_foretmap_user_id AS user_id, p.pseudo
       FROM gl_team_members tm
       INNER JOIN gl_players p ON p.id = tm.player_id
      WHERE tm.game_id = ?`,
    [game.id],
  );
  const byTeam = new Map();
  for (const t of teams) byTeam.set(Number(t.id), { ...t, players: [] });
  for (const m of members) {
    const bucket = byTeam.get(Number(m.team_id));
    if (bucket) bucket.players.push(m);
  }

  const existing = await moodle.getCourseGroups(courseId);
  const groups = Array.isArray(existing) ? existing : [];
  const fmGroups = groups.filter((g) => isFmIdnumber(g.idnumber));
  const wanted = [];

  for (const team of teams) {
    const idnumber = teamIdnumber(cohort, courseId, team.name);
    const clash = nameCollision({ teamName: team.name, existing: groups, ownIdnumber: idnumber });
    if (clash) {
      report.error = `Le cours ${courseId} a déjà un groupe « ${team.name} » (id ${clash.id}) qui n’est pas le miroir de cette équipe. Aucune écriture.`;
      return report;
    }
    wanted.push({ team, idnumber });
  }

  const wantedNumbers = new Set(wanted.map((w) => w.idnumber));
  const toDelete = fmGroups.filter(
    (g) =>
      String(g.idnumber || '').includes(`#C${courseId}#`) && !wantedNumbers.has(String(g.idnumber)),
  );

  if (!dryRun) {
    for (const w of wanted) {
      let group = groups.find((g) => String(g.idnumber) === w.idnumber);
      if (!group) {
        const created = await moodle.createGroups([
          { courseid: courseId, name: w.team.name, idnumber: w.idnumber, description: '' },
        ]);
        group = Array.isArray(created) ? created[0] : created;
        report.created.push({ teamId: w.team.id, name: w.team.name, idnumber: w.idnumber });
        groups.push(group);
      } else if (String(group.name) !== String(w.team.name)) {
        await moodle.updateGroups([{ id: group.id, name: w.team.name, idnumber: w.idnumber }]);
        report.renamed.push({ teamId: w.team.id, from: group.name, to: w.team.name });
        group.name = w.team.name;
      }
      w.group = group;
    }
    if (toDelete.length) {
      await moodle.deleteGroups(toDelete.map((g) => g.id));
      for (const g of toDelete)
        report.deleted.push({ id: g.id, idnumber: g.idnumber, name: g.name });
    }

    const groupIds = wanted.map((w) => w.group?.id).filter(Boolean);
    const memberRows = groupIds.length ? await moodle.getGroupMembers(groupIds) : [];
    const membersByGroup = new Map(
      (Array.isArray(memberRows) ? memberRows : []).map((r) => [
        Number(r.groupid),
        new Set((r.userids || []).map(Number)),
      ]),
    );
    const enrolled = await moodle.getEnrolledUsers(courseId);
    const enrolledIds = new Set((Array.isArray(enrolled) ? enrolled : []).map((u) => Number(u.id)));

    for (const w of wanted) {
      const gid = Number(w.group?.id);
      if (!gid) continue;
      const current = membersByGroup.get(gid) || new Set();
      const desired = new Set();
      for (const p of byTeam.get(Number(w.team.id))?.players || []) {
        if (!p.user_id) {
          report.missingIdentities.push({
            playerId: p.player_id,
            pseudo: p.pseudo,
            team: w.team.name,
          });
          continue;
        }
        const mid = await moodleIdForUser(p.user_id);
        if (!mid) {
          report.missingIdentities.push({
            playerId: p.player_id,
            userId: p.user_id,
            pseudo: p.pseudo,
            team: w.team.name,
          });
          continue;
        }
        if (!enrolledIds.has(mid)) {
          report.notices.push(
            `Joueur ${p.pseudo || p.player_id} non inscrit au cours ${courseId} — Moodle refusera l’ajout`,
          );
          continue;
        }
        desired.add(mid);
      }
      const add = [...desired].filter((id) => !current.has(id));
      const remove = [...current].filter((id) => !desired.has(id));
      if (add.length) {
        await moodle.addGroupMembers(add.map((userid) => ({ groupid: gid, userid })));
        report.membersAdded.push({ team: w.team.name, count: add.length });
      }
      if (remove.length) {
        await moodle.deleteGroupMembers(remove.map((userid) => ({ groupid: gid, userid })));
        report.membersRemoved.push({ team: w.team.name, count: remove.length });
      }
    }
  } else {
    for (const w of wanted) {
      const group = groups.find((g) => String(g.idnumber) === w.idnumber);
      if (!group)
        report.created.push({ teamId: w.team.id, name: w.team.name, idnumber: w.idnumber });
      else if (String(group.name) !== String(w.team.name)) {
        report.renamed.push({ teamId: w.team.id, from: group.name, to: w.team.name });
      }
      for (const p of byTeam.get(Number(w.team.id))?.players || []) {
        if (!p.user_id) {
          report.missingIdentities.push({
            playerId: p.player_id,
            pseudo: p.pseudo,
            team: w.team.name,
          });
          continue;
        }
        const mid = await moodleIdForUser(p.user_id);
        if (!mid) {
          report.missingIdentities.push({
            playerId: p.player_id,
            userId: p.user_id,
            pseudo: p.pseudo,
            team: w.team.name,
          });
        }
      }
    }
    for (const g of toDelete) report.deleted.push({ id: g.id, idnumber: g.idnumber, name: g.name });
  }

  if (String(game.status) !== 'draft') {
    report.notices.push('Partie hors préparation : les affectations G&L n’ont pas été recomposées');
  }
  return report;
}

/**
 * Miroir d'un sous-groupe ForetMap dans un cours Moodle (`FM#<cohorte>#G#<slug>`).
 */
async function mirrorForetmapGroup({ groupId, courseId, dryRun = true, client = null }) {
  const group = await queryOne('SELECT * FROM `groups` WHERE id = ? LIMIT 1', [groupId]);
  if (!group) throw httpError(404, 'Groupe introuvable');
  const moodle = client || createMoodleClientFromEnv();
  if (!moodle)
    throw httpError(503, 'Intégration Moodle non configurée', { code: 'MOODLE_NOT_CONFIGURED' });
  const course = Number(courseId);
  if (!Number.isInteger(course) || course <= 0)
    throw httpError(400, 'Identifiant de cours invalide');

  let cohort = null;
  if (group.parent_group_id) {
    const parentExt = await queryOne(
      `SELECT external_idnumber FROM external_groups
        WHERE provider = 'moodle' AND group_id = ? LIMIT 1`,
      [group.parent_group_id],
    );
    cohort = parentExt?.external_idnumber || null;
  }
  if (!cohort) {
    const self = await queryOne(
      `SELECT external_idnumber FROM external_groups
        WHERE provider = 'moodle' AND group_id = ? LIMIT 1`,
      [group.id],
    );
    cohort = self?.external_idnumber || null;
  }
  if (!cohort) throw httpError(409, 'Impossible de rattacher ce groupe à une cohorte Moodle');

  const idnumber = subgroupIdnumber(cohort, group.slug || group.name);
  const existing = await moodle.getCourseGroups(course);
  const groups = Array.isArray(existing) ? existing : [];
  const clash = nameCollision({ teamName: group.name, existing: groups, ownIdnumber: idnumber });
  const report = {
    groupId: group.id,
    courseId: course,
    idnumber,
    dryRun: Boolean(dryRun),
    created: false,
    renamed: false,
    error: clash
      ? `Le cours ${course} a déjà un groupe « ${group.name} » (id ${clash.id}) qui n’est pas ce miroir.`
      : null,
  };
  if (report.error) return report;
  if (dryRun) {
    const found = groups.find((g) => String(g.idnumber) === idnumber);
    report.created = !found;
    report.renamed = Boolean(found && found.name !== group.name);
    return report;
  }
  let target = groups.find((g) => String(g.idnumber) === idnumber);
  if (!target) {
    const created = await moodle.createGroups([
      { courseid: course, name: group.name, idnumber, description: '' },
    ]);
    target = Array.isArray(created) ? created[0] : created;
    report.created = true;
  } else if (target.name !== group.name) {
    await moodle.updateGroups([{ id: target.id, name: group.name, idnumber }]);
    report.renamed = true;
  }
  return report;
}

async function mirrorTeamsForCohorts({ cohortIdnumbers, dryRun, client, settings }) {
  const reports = [];
  if (!cohortIdnumbers?.length) return reports;
  const placeholders = cohortIdnumbers.map(() => '?').join(', ');
  const games = await queryAll(
    `SELECT g.id FROM gl_games g
       INNER JOIN gl_classes gc ON gc.id = g.class_id
       INNER JOIN external_groups eg
         ON eg.group_id = gc.foretmap_group_id AND eg.provider = 'moodle'
      WHERE eg.external_idnumber IN (${placeholders})
      ORDER BY g.updated_at DESC`,
    cohortIdnumbers,
  );
  const seenClasses = new Set();
  for (const row of games) {
    const game = await queryOne('SELECT id, class_id FROM gl_games WHERE id = ? LIMIT 1', [row.id]);
    if (!game || seenClasses.has(Number(game.class_id))) continue;
    seenClasses.add(Number(game.class_id));
    reports.push(await mirrorGameTeams({ gameId: game.id, dryRun, client, settings }));
  }
  return reports;
}

module.exports = {
  FM_PREFIX,
  slugTeamName,
  teamIdnumber,
  subgroupIdnumber,
  isFmIdnumber,
  mirrorGameTeams,
  mirrorForetmapGroup,
  mirrorTeamsForCohorts,
};
