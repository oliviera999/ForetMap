'use strict';

/**
 * Jeu fictif des élèves référents automatiques, de même forme que l'état de la production au
 * 21/11/2026 (aucune donnée réelle) :
 *
 *  - un groupe de l'année (slug `rf-<stamp>`) et trois élèves membres : A (9 séries au seuil),
 *    B (2 séries) et C (1 série, dont une réalisation est une inscription ancienne **sans
 *    identifiant de compte**, reconnue par le prénom et le nom) ;
 *  - un élève E hors du groupe, au seuil sur une série (jamais éligible) ;
 *  - un enseignant T, référent des séries S1 à S7, S10 et S11 : trois séries (S8, S9, S12) n'ont
 *    aucun référent ;
 *  - douze séries actives S1 à S12 (validations passées + une occurrence active chacune) et une
 *    série S13 sans occurrence active (A y est au seuil) ;
 *  - A a trois réalisations de S3 (et deux ailleurs), B une seule de S1 (sous le seuil).
 *
 * Attendu au seuil 2, sans plafond : 12 liens (A : S1–S9, B : S10–S11, C : S12).
 */

const crypto = require('node:crypto');
const { execute, queryAll } = require('../../database');

const SERIES = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'S11', 'S12', 'S13'];
const NO_REFERENT = new Set(['S8', 'S9', 'S12']);
const NO_ACTIVE = new Set(['S13']);

/** Réalisations validées : série → [[élève, jour d'octobre 2026], …]. */
const REALISATIONS = {
  S1: [
    ['A', 1],
    ['A', 8],
    ['B', 9],
  ],
  S2: [
    ['A', 2],
    ['A', 9],
  ],
  S3: [
    ['A', 3],
    ['A', 10],
    ['A', 17],
  ],
  S4: [
    ['A', 4],
    ['A', 11],
  ],
  S5: [
    ['A', 5],
    ['A', 12],
  ],
  S6: [
    ['A', 6],
    ['A', 13],
  ],
  S7: [
    ['A', 7],
    ['A', 14],
  ],
  S8: [
    ['A', 1],
    ['A', 15],
  ],
  S9: [
    ['A', 2],
    ['A', 16],
  ],
  S10: [
    ['B', 3],
    ['B', 10],
  ],
  S11: [
    ['B', 4],
    ['B', 11],
  ],
  S12: [
    ['C', 5],
    ['C-legacy', 12],
    ['E', 5],
    ['E', 12],
  ],
  S13: [
    ['A', 6],
    ['A', 13],
  ],
};

/** Les douze liens attendus (élève:série). */
const EXPECTED_LINKS = Object.freeze([
  'A:S1',
  'A:S2',
  'A:S3',
  'A:S4',
  'A:S5',
  'A:S6',
  'A:S7',
  'A:S8',
  'A:S9',
  'B:S10',
  'B:S11',
  'C:S12',
]);

async function createStudentReferentsFixture({ links = null } = {}) {
  const stamp = crypto.randomUUID().slice(0, 8);
  const last = `Ref${stamp}`;
  const users = {
    A: `rf-a-${stamp}`,
    B: `rf-b-${stamp}`,
    C: `rf-c-${stamp}`,
    E: `rf-e-${stamp}`,
    T: `rf-t-${stamp}`,
  };
  const firstNames = { A: 'Alpha', B: 'Bravo', C: 'Charlie', E: 'Echo', T: 'Tango' };
  for (const [k, id] of Object.entries(users)) {
    await execute(
      'INSERT INTO users (id, user_type, first_name, last_name, is_active) VALUES (?, ?, ?, ?, 1)',
      [id, k === 'T' ? 'teacher' : 'student', firstNames[k], last],
    );
  }
  const groupId = `rf-g-${stamp}`;
  const groupSlug = `rf-${stamp}`;
  await execute(
    "INSERT INTO `groups` (id, slug, name, kind, is_active) VALUES (?, ?, ?, 'class', 1)",
    [groupId, groupSlug, `Groupe référents ${stamp}`],
  );
  for (const k of ['A', 'B', 'C']) {
    await execute(
      "INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, 'student')",
      [groupId, users[k]],
    );
  }

  const series = {};
  const taskIds = [];
  let n = 0;
  for (const s of SERIES) {
    const seriesId = `rf-${stamp}-${s}`;
    series[s] = { id: seriesId, active: null, validated: [] };
    for (const [who, day] of REALISATIONS[s] || []) {
      const tid = `${seriesId}-v${(n += 1)}`;
      const at = `2026-10-${String(day).padStart(2, '0')} 10:00:00`;
      await execute(
        `INSERT INTO tasks (id, title, status, recurrence, recurrence_series_id, validated_at, created_at)
         VALUES (?, ?, 'validated', 'weekly', ?, ?, ?)`,
        [tid, `Série ${s} ${stamp}`, seriesId, at, at],
      );
      taskIds.push(tid);
      series[s].validated.push(tid);
      const legacy = who === 'C-legacy';
      const key = legacy ? 'C' : who;
      await execute(
        `INSERT INTO task_assignments (task_id, student_id, student_first_name, student_last_name, assigned_at)
         VALUES (?, ?, ?, ?, ?)`,
        [tid, legacy ? null : users[key], firstNames[key], last, at],
      );
    }
    if (!NO_ACTIVE.has(s)) {
      const tid = `${seriesId}-active`;
      await execute(
        `INSERT INTO tasks (id, title, status, recurrence, recurrence_series_id, created_at)
         VALUES (?, ?, 'available', 'weekly', ?, '2026-11-20 08:00:00')`,
        [tid, `Série ${s} ${stamp}`, seriesId],
      );
      taskIds.push(tid);
      series[s].active = tid;
      if (!NO_REFERENT.has(s)) {
        await execute(
          "INSERT INTO task_referents (task_id, user_id, source) VALUES (?, ?, 'manual')",
          [tid, users.T],
        );
      }
    }
  }

  const fx = {
    stamp,
    users,
    groupId,
    groupSlug,
    series,
    taskIds,
    /** Libellé « A:S1 » d'un couple (élève, série) du jeu, ou `null` s'il est étranger. */
    label(entry) {
      const who = Object.keys(users).find((k) => users[k] === entry.userId);
      const s = SERIES.find((x) => series[x].id === entry.seriesId);
      return who && s ? `${who}:${s}` : null;
    },
    labels(list) {
      return list
        .map((e) => fx.label(e))
        .filter(Boolean)
        .sort(compareLabels);
    },
    async linkLabels(source = null) {
      const rows = await queryAll(
        `SELECT tr.task_id, tr.user_id, tr.source FROM task_referents tr
          WHERE tr.task_id IN (${taskIds.map(() => '?').join(',')})`,
        taskIds,
      );
      const out = [];
      for (const r of rows) {
        if (source && r.source !== source) continue;
        const s = SERIES.find((x) => series[x].active === r.task_id);
        const who = Object.keys(users).find((k) => users[k] === r.user_id);
        if (s && who && who !== 'T') out.push(`${who}:${s}`);
      }
      return out.sort(compareLabels);
    },
    async setLinks(pairs, source) {
      for (const p of pairs) {
        const [who, s] = p.split(':');
        await execute(
          'INSERT INTO task_referents (task_id, user_id, source, added_at) VALUES (?, ?, ?, NOW())',
          [series[s].active, users[who], source],
        );
      }
    },
    config(overrides = {}) {
      return { enabled: true, group_id: groupSlug, ...overrides };
    },
    async cleanup() {
      for (const tid of taskIds) await execute('DELETE FROM tasks WHERE id = ?', [tid]);
      await execute('DELETE FROM task_series_referent_vetoes WHERE series_id LIKE ?', [
        `rf-${stamp}-%`,
      ]);
      await execute('DELETE FROM `groups` WHERE id = ?', [groupId]);
      for (const id of Object.values(users)) {
        await execute('DELETE FROM notifications WHERE user_id = ?', [id]);
        await execute('DELETE FROM users WHERE id = ?', [id]);
      }
    },
  };
  if (links) await fx.setLinks(EXPECTED_LINKS, links);
  return fx;
}

function compareLabels(a, b) {
  const [wa, sa] = a.split(':');
  const [wb, sb] = b.split(':');
  return wa.localeCompare(wb) || Number(sa.slice(1)) - Number(sb.slice(1));
}

module.exports = { createStudentReferentsFixture, EXPECTED_LINKS, compareLabels };
