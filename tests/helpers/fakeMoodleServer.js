'use strict';

/**
 * Faux serveur Moodle (Web Services REST) pour les tests : un vrai serveur HTTP local qui
 * reproduit les traits du vrai — réponses d'erreur en **HTTP 200** avec `exception` /
 * `errorcode`, paramètres `cohortids[0]=…`, fonctions autorisées listées par `site_info`.
 *
 * État en mémoire modifiable par les tests (`state.cohorts`, `state.users`, `state.members`…) ;
 * les écritures (`core_cohort_add_cohort_members`, `core_group_*`) modifient cet état et sont
 * consignées dans `calls` pour vérification.
 */

const http = require('node:http');
const { REQUIRED_FUNCTIONS } = require('../../lib/moodle/check');

function parseNested(form) {
  // `a[0][b]=1` → { a: [{ b: '1' }] } ; `cohortids[0]=12` → { cohortids: ['12'] }
  const out = {};
  for (const [rawKey, value] of form.entries()) {
    const path = [];
    const m = rawKey.match(/^([^[]+)((?:\[[^\]]*\])*)$/);
    if (!m) continue;
    path.push(m[1]);
    for (const seg of m[2].matchAll(/\[([^\]]*)\]/g)) path.push(seg[1]);
    let node = out;
    for (let i = 0; i < path.length; i += 1) {
      const key = path[i];
      const last = i === path.length - 1;
      if (last) {
        node[key] = value;
      } else {
        const nextIsIndex = /^\d+$/.test(path[i + 1]);
        if (node[key] == null) node[key] = nextIsIndex ? [] : {};
        node = node[key];
      }
    }
  }
  return out;
}

function moodleError(errorcode, message = errorcode) {
  return { exception: 'moodle_exception', errorcode, message };
}

function createFakeMoodleServer(options = {}) {
  const state = {
    token: options.token || 'test-token',
    sitename: 'Moodle de test',
    release: '4.5 (Build: 20250101)',
    functions: (options.functions || REQUIRED_FUNCTIONS.map((f) => f.name)).slice(),
    cohorts: [], // { id, name, idnumber, visible }
    users: new Map(), // id → { id, username, firstname, lastname, email, suspended, idnumber }
    members: new Map(), // cohortId → Set(userId)
    courses: [], // { id, fullname, shortname }
    groups: [], // { id, courseid, name, idnumber }
    groupMembers: new Map(), // groupId → Set(userId)
    enrolled: new Map(), // courseId → [userId]
    failNext: null, // { errorcode } | { status } : la prochaine requête échoue
    nextGroupId: 1000,
  };
  const calls = [];

  const handlers = {
    core_webservice_get_site_info: () => ({
      sitename: state.sitename,
      siteurl: `http://127.0.0.1`,
      release: state.release,
      username: 'ws_foretmap',
      userid: 2,
      functions: state.functions.map((name) => ({ name, version: '2024' })),
    }),
    core_cohort_search_cohorts: () => ({ cohorts: state.cohorts.map((c) => ({ ...c })) }),
    core_cohort_get_cohorts: (p) => {
      const ids = (p.cohortids || []).map(Number);
      return state.cohorts.filter((c) => !ids.length || ids.includes(c.id));
    },
    core_cohort_get_cohort_members: (p) =>
      (p.cohortids || []).map((id) => ({
        cohortid: Number(id),
        userids: [...(state.members.get(Number(id)) || [])].map(Number),
      })),
    core_user_get_users_by_field: (p) => {
      if (p.field !== 'id') return moodleError('invalidparameter', `field ${p.field}`);
      return (p.values || [])
        .map((id) => state.users.get(String(id)))
        .filter(Boolean)
        .map((u) => ({ ...u, suspended: u.suspended ? 1 : 0 }));
    },
    core_course_get_courses_by_field: (p) => {
      if (p.field === 'id') {
        return { courses: state.courses.filter((c) => Number(c.id) === Number(p.value)) };
      }
      if (p.field === 'ids') {
        const ids = String(p.value || '')
          .split(',')
          .map(Number);
        return { courses: state.courses.filter((c) => ids.includes(Number(c.id))) };
      }
      return { courses: state.courses.slice() };
    },
    core_group_get_course_groups: (p) =>
      state.groups.filter((g) => Number(g.courseid) === Number(p.courseid)),
    core_group_get_group_members: (p) =>
      (p.groupids || []).map((id) => ({
        groupid: Number(id),
        userids: [...(state.groupMembers.get(Number(id)) || [])].map(Number),
      })),
    core_enrol_get_enrolled_users: (p) =>
      (state.enrolled.get(Number(p.courseid)) || [])
        .map((id) => state.users.get(String(id)))
        .filter(Boolean),
    core_group_create_groups: (p) =>
      (p.groups || []).map((g) => {
        const created = {
          id: state.nextGroupId++,
          courseid: Number(g.courseid),
          name: g.name,
          idnumber: g.idnumber || '',
          description: g.description || '',
        };
        state.groups.push(created);
        state.groupMembers.set(created.id, new Set());
        return created;
      }),
    core_group_update_groups: (p) => {
      for (const g of p.groups || []) {
        const target = state.groups.find((x) => Number(x.id) === Number(g.id));
        if (target)
          Object.assign(target, {
            name: g.name ?? target.name,
            idnumber: g.idnumber ?? target.idnumber,
          });
      }
      return null;
    },
    core_group_delete_groups: (p) => {
      const ids = (p.groupids || []).map(Number);
      state.groups = state.groups.filter((g) => !ids.includes(Number(g.id)));
      for (const id of ids) state.groupMembers.delete(id);
      return null;
    },
    core_group_add_group_members: (p) => {
      for (const m of p.members || []) {
        const set = state.groupMembers.get(Number(m.groupid)) || new Set();
        set.add(String(m.userid));
        state.groupMembers.set(Number(m.groupid), set);
      }
      return null;
    },
    core_group_delete_group_members: (p) => {
      for (const m of p.members || [])
        state.groupMembers.get(Number(m.groupid))?.delete(String(m.userid));
      return null;
    },
    core_cohort_add_cohort_members: (p) => {
      const warnings = [];
      for (const m of p.members || []) {
        const cohortId = Number(m.cohorttype?.value);
        const userId = String(m.usertype?.value);
        if (!state.cohorts.some((c) => c.id === cohortId)) {
          warnings.push({ warningcode: 'cohortnotfound', message: String(cohortId) });
          continue;
        }
        const set = state.members.get(cohortId) || new Set();
        set.add(userId);
        state.members.set(cohortId, set);
      }
      return { warnings };
    },
    core_cohort_delete_cohort_members: (p) => {
      for (const m of p.members || [])
        state.members.get(Number(m.cohortid))?.delete(String(m.userid));
      return null;
    },
  };

  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      const send = (status, body) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(body === null ? 'null' : JSON.stringify(body));
      };
      if (!req.url.startsWith('/webservice/rest/server.php'))
        return send(404, { error: 'not found' });
      const form = new URLSearchParams(raw);
      const wsfunction = form.get('wsfunction');
      const params = parseNested(form);
      delete params.wstoken;
      delete params.wsfunction;
      delete params.moodlewsrestformat;
      calls.push({ wsfunction, params });

      if (state.failNext) {
        const f = state.failNext;
        state.failNext = null;
        if (f.status) return send(f.status, { error: 'boom' });
        return send(
          200,
          moodleError(f.errorcode || 'generalexceptionmessage', f.message || 'panne simulée'),
        );
      }
      if (form.get('wstoken') !== state.token)
        return send(200, moodleError('invalidtoken', 'Jeton invalide'));
      if (!state.functions.includes(wsfunction))
        return send(200, moodleError('accessexception', `Accès refusé : ${wsfunction}`));
      const handler = handlers[wsfunction];
      if (!handler)
        return send(200, moodleError('invalidrecord', `Fonction inconnue ${wsfunction}`));
      return send(200, handler(params));
    });
  });

  return {
    state,
    calls,
    server,
    get baseUrl() {
      const addr = server.address();
      return addr ? `http://127.0.0.1:${addr.port}` : null;
    },
    async start() {
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      return this.baseUrl;
    },
    async stop() {
      await new Promise((resolve) => server.close(() => resolve()));
    },
    // --- Aides de scénario -----------------------------------------------------------------
    addCohort({ id, name, idnumber, visible = 1 }) {
      state.cohorts.push({ id: Number(id), name, idnumber, visible });
      if (!state.members.has(Number(id))) state.members.set(Number(id), new Set());
    },
    addUser({ id, username, firstname, lastname, email, suspended = false, idnumber = '' }) {
      state.users.set(String(id), {
        id: Number(id),
        username,
        firstname,
        lastname,
        email,
        suspended,
        idnumber,
      });
    },
    enrolInCohort(cohortId, userId) {
      const set = state.members.get(Number(cohortId)) || new Set();
      set.add(String(userId));
      state.members.set(Number(cohortId), set);
    },
    removeFromCohort(cohortId, userId) {
      state.members.get(Number(cohortId))?.delete(String(userId));
    },
    cohortMembers(cohortId) {
      return [...(state.members.get(Number(cohortId)) || [])].sort();
    },
    addCourse({ id, fullname, shortname }) {
      state.courses.push({ id: Number(id), fullname, shortname: shortname || fullname });
    },
    addGroup({ id, courseid, name, idnumber = '' }) {
      const group = {
        id: id == null ? state.nextGroupId++ : Number(id),
        courseid: Number(courseid),
        name,
        idnumber,
      };
      if (group.id >= state.nextGroupId) state.nextGroupId = group.id + 1;
      state.groups.push(group);
      if (!state.groupMembers.has(group.id)) state.groupMembers.set(group.id, new Set());
      return group;
    },
    enrolInCourse(courseId, userId) {
      const list = state.enrolled.get(Number(courseId)) || [];
      list.push(Number(userId));
      state.enrolled.set(Number(courseId), list);
    },
    callsFor(wsfunction) {
      return calls.filter((c) => c.wsfunction === wsfunction);
    },
    resetCalls() {
      calls.length = 0;
    },
  };
}

module.exports = { createFakeMoodleServer, parseNested };
