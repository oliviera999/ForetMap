'use strict';

/**
 * Outils de domaine `foretmap_tasks` et `foretmap_task_projects` (lot D) : lectures, effets
 * métier des écritures par le pont (valider → lieux détachés et projet terminé ; archiver →
 * exclue de l'avancement ; série récurrente), refus nominatif sans bypass, domaine désactivé,
 * nouvelles routes (duplication, compte rendu de la gestion, occurrence suivante, fiche projet).
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('./helpers/mcpFixtures');
const { initSchema, queryOne, queryAll, execute } = require('../database');

fx.enableMcpEnv();

const { app } = require('../server');

let adminToken;
let mapId;
let zoneId;
const taskIds = [];
const projectIds = [];

async function call(name, args) {
  const r = await fx.callTool(app, adminToken, name, args);
  return r;
}

test.before(async () => {
  await initSchema();
  const admin = await fx.createAccount('admin');
  adminToken = (await fx.obtainTokens(app, admin)).access_token;
  const zone = await queryOne('SELECT z.id, z.map_id FROM zones z ORDER BY z.map_id, z.id LIMIT 1');
  mapId = zone.map_id;
  zoneId = zone.id;
});

test.after(async () => {
  for (const id of taskIds) {
    await execute('DELETE FROM task_logs WHERE task_id = ?', [id]);
    await execute('DELETE FROM task_assignments WHERE task_id = ?', [id]);
    await execute('DELETE FROM tasks WHERE id = ?', [id]);
  }
  for (const id of projectIds) {
    await execute('DELETE FROM tasks WHERE project_id = ?', [id]);
    await execute('DELETE FROM task_projects WHERE id = ?', [id]);
  }
  await fx.cleanupAccounts();
});

test.beforeEach(() => fx.enableMcpEnv());

test('projet + tâches : valider détache les lieux ; archiver exclut de l’avancement', async () => {
  const proj = await call('foretmap_task_projects', {
    action: 'create',
    data: { title: `Projet MCP ${Date.now()}`, map_id: mapId },
  });
  assert.equal(proj.isError, false, proj.text);
  const projectId = proj.data.id;
  projectIds.push(projectId);

  const mk = async (title) => {
    const r = await call('foretmap_tasks', {
      action: 'create',
      data: { title, map_id: mapId, project_id: projectId, zone_ids: [zoneId] },
    });
    assert.equal(r.isError, false, r.text);
    taskIds.push(r.data.id);
    return r.data.id;
  };
  const t1 = await mk('T1 à valider');
  const t2 = await mk('T2 à archiver');
  assert.ok(await queryOne('SELECT 1 AS x FROM task_zones WHERE task_id = ?', [t1]));

  const v = await call('foretmap_tasks', { action: 'validate', task_id: t1 });
  assert.equal(v.isError, false, v.text);
  assert.equal(v.data.status, 'validated');
  // Effet métier : lieux détachés (instantané conservé pour la restauration).
  assert.equal(
    (await queryAll('SELECT zone_id FROM task_zones WHERE task_id = ?', [t1])).length,
    0,
  );
  let p = await call('foretmap_task_projects', { action: 'get', project_id: projectId });
  assert.equal(p.data.progress.total, 2);
  assert.equal(p.data.progress.validated, 1);
  assert.notEqual(p.data.status, 'completed');

  // Archiver T2 : exclue de l'avancement → le projet est terminé.
  const a = await call('foretmap_tasks', { action: 'archive', task_id: t2 });
  assert.equal(a.isError, false, a.text);
  p = await call('foretmap_task_projects', { action: 'get', project_id: projectId });
  assert.equal(p.data.progress.total, 1);
  assert.equal(p.data.status, 'completed');

  // Audit des écritures : via mcp, outil de domaine.
  const audit = await queryOne(
    "SELECT payload_json FROM audit_log WHERE action = 'validate_task' AND target_id = ? ORDER BY id DESC LIMIT 1",
    [t1],
  );
  const payload =
    typeof audit.payload_json === 'string' ? JSON.parse(audit.payload_json) : audit.payload_json;
  assert.equal(payload.via, 'mcp');
  assert.equal(payload.mcp_tool, 'foretmap_tasks');

  // Lectures.
  const list = await call('foretmap_tasks', { action: 'list', project_id: projectId });
  assert.equal(list.isError, false, list.text);
  assert.equal(list.data.total, 1);
  const all = await call('foretmap_tasks', {
    action: 'list',
    project_id: projectId,
    archived: 'all',
    status: 'validated',
  });
  assert.equal(all.data.total, 1);
  const stats = await call('foretmap_tasks', { action: 'stats', project_id: projectId });
  assert.equal(stats.isError, false, stats.text);
  assert.equal(stats.data.total, 1);
  const projects = await call('foretmap_task_projects', { action: 'list', map_id: mapId });
  assert.ok(projects.data.items.some((x) => x.id === projectId));
});

test('to_validate, overdue, get, duplicate, add_log, set_status, delete', async () => {
  const r = await call('foretmap_tasks', {
    action: 'create',
    data: { title: 'En retard', map_id: mapId, start_date: '2020-01-01', due_date: '2020-01-10' },
  });
  const id = r.data.id;
  taskIds.push(id);
  const overdue = await call('foretmap_tasks', { action: 'overdue', map_id: mapId, limit: 5000 });
  assert.ok(overdue.data.items.some((t) => t.id === id));
  const get = await call('foretmap_tasks', { action: 'get', task_id: id });
  assert.equal(get.data.id, id);

  const dup = await call('foretmap_tasks', { action: 'duplicate', task_id: id });
  assert.equal(dup.isError, false, dup.text);
  taskIds.push(dup.data.id);
  assert.equal(dup.data.title, 'En retard (copie)');
  assert.equal(dup.data.status, 'available');

  const log = await call('foretmap_tasks', { action: 'add_log', task_id: id, comment: 'Arrosé' });
  assert.equal(log.isError, false, log.text);
  assert.equal(log.data.comment, 'Arrosé');

  const st = await call('foretmap_tasks', { action: 'set_status', task_id: id, status: 'done' });
  assert.equal(st.isError, false, st.text);
  const tv = await call('foretmap_tasks', { action: 'to_validate', map_id: mapId, limit: 5000 });
  assert.ok(tv.data.items.some((t) => t.id === id));

  const del = await call('foretmap_tasks', { action: 'delete', task_id: dup.data.id });
  assert.equal(del.isError, false, del.text);
  assert.equal(await queryOne('SELECT id FROM tasks WHERE id = ?', [dup.data.id]), undefined);
});

test('récurrence : occurrence suivante générée à la demande', async () => {
  const r = await call('foretmap_tasks', {
    action: 'create',
    data: {
      title: 'Arrosage hebdo',
      map_id: mapId,
      start_date: '2026-10-01',
      due_date: '2026-10-08',
      recurrence: 'weekly',
    },
  });
  assert.equal(r.isError, false, r.text);
  const id = r.data.id;
  taskIds.push(id);
  const early = await call('foretmap_tasks', { action: 'recurrence', task_id: id, mode: 'spawn' });
  assert.equal(early.isError, true, 'non validée : refus');
  await call('foretmap_tasks', { action: 'validate', task_id: id });
  const spawn = await call('foretmap_tasks', { action: 'recurrence', task_id: id, mode: 'spawn' });
  assert.equal(spawn.isError, false, spawn.text);
  assert.ok(spawn.data.created);
  taskIds.push(spawn.data.created);
  const again = await call('foretmap_tasks', { action: 'recurrence', task_id: id, mode: 'spawn' });
  assert.equal(again.isError, true, 'pas de doublon');
});

test('nominatif refusé sans bypass ; écriture refusée sans portée write', async () => {
  process.env.MCP_PRIVACY_BYPASS = 'false';
  const r = await call('foretmap_tasks', { action: 'logs', task_id: taskIds[0] });
  assert.equal(r.isError, true);
  assert.match(r.text, /bypass/);
  delete process.env.MCP_PRIVACY_BYPASS;
  const admin2 = await fx.createAccount('admin');
  const ro = (await fx.obtainTokens(app, admin2, { scope: 'foretmap.read' })).access_token;
  const w = await fx.callTool(app, ro, 'foretmap_tasks', {
    action: 'create',
    data: { title: 'x', map_id: mapId },
  });
  assert.equal(w.isError, true);
  assert.match(w.text, /foretmap\.write/);
});

test('paramètre inattendu refusé par le schéma strict de l’action', async () => {
  const r = await call('foretmap_tasks', { action: 'get', task_id: 'x', status: 'done' });
  assert.equal(r.isError, true);
});

test('domaine désactivé : outil absent et appel refusé', async () => {
  process.env.MCP_DOMAINS_DISABLED = 'tasks';
  const tools = await fx.listTools(app, adminToken);
  assert.ok(!tools.includes('foretmap_tasks'));
  assert.ok(tools.includes('foretmap_task_projects'));
  const r = await call('foretmap_tasks', { action: 'list' });
  assert.equal(r.isError, true);
});

test('écritures coupées quand le pont est désactivé ; lectures SQL conservées', async () => {
  process.env.MCP_API_BRIDGE_ENABLED = 'false';
  const w = await call('foretmap_tasks', { action: 'create', data: { title: 'x', map_id: mapId } });
  assert.equal(w.isError, true);
  const s = await call('foretmap_tasks', { action: 'stats' });
  assert.equal(s.isError, false, s.text);
});

test('taxonomie : création, filtres de liste, statistiques par métier et format, phases du projet', async () => {
  const proj = await call('foretmap_task_projects', {
    action: 'create',
    data: { title: `Projet taxo MCP ${Date.now()}`, map_id: mapId, project_type: 'construction' },
  });
  assert.equal(proj.isError, false, proj.text);
  const projectId = proj.data.id;
  projectIds.push(projectId);
  const created = await call('foretmap_tasks', {
    action: 'create',
    data: {
      title: `Tâche taxo MCP ${Date.now()}`,
      map_id: mapId,
      project_id: projectId,
      category: 'bricolage',
      format: 'seance',
      project_phase: 'realiser',
    },
  });
  assert.equal(created.isError, false, created.text);
  taskIds.push(created.data.id);
  const list = await call('foretmap_tasks', {
    action: 'list',
    project_id: projectId,
    category: 'bricolage,rangement',
  });
  assert.equal(list.isError, false, list.text);
  assert.equal(list.data.total, 1);
  assert.equal(list.data.items[0].category, 'bricolage');
  assert.equal(list.data.items[0].project_phase, 'realiser');
  const none = await call('foretmap_tasks', {
    action: 'list',
    project_id: projectId,
    format: 'flash',
  });
  assert.equal(none.data.total, 0);
  const stats = await call('foretmap_tasks', { action: 'stats', project_id: projectId });
  assert.deepEqual(
    stats.data.by_category.map((r) => [r.category, r.n]),
    [['bricolage', 1]],
  );
  assert.equal(stats.data.by_format[0].format, 'seance');
  const fiche = await call('foretmap_task_projects', { action: 'get', project_id: projectId });
  assert.equal(fiche.isError, false, fiche.text);
  assert.equal(fiche.data.project_type, 'construction');
  assert.equal(fiche.data.phase_progress.current_phase, 'realiser');
});
