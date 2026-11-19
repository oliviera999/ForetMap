'use strict';

/**
 * Audit ForetMap du 19/11/2026 — lot 2 (connecteur MCP) : constats S2, S3, S5, S9, S11.
 * Chaque test rejoue le scénario de l'audit (`docs/AUDIT_BUGS_FORETMAP_2026-11-19.md`, § 7).
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const fx = require('./helpers/mcpFixtures');
const { initSchema, execute, queryOne, pool } = require('../database');

delete process.env.DB_MCP_USER;
fx.enableMcpEnv();

const { app } = require('../server');
const { analyzeSelect } = require('../lib/mcp/sqlAst');
const {
  computeCallerPrivacyBypass,
  createMcpEndpointRouter,
  resetToolDefsForTests,
} = require('../lib/mcp/server');
const { hashArgs } = require('../lib/mcp/confirm');
const { withShortLockWait } = require('../lib/mcp/sqlWrite/execute');

const SQL_ONLY_ROLE = `audit_lot2_sql_${Date.now().toString(36)}`;
let sqlOnlyRoleId = null;
let admin;
let adminToken;
let sqlOnly;
let sqlOnlyToken;

function enableBypass() {
  fx.enableMcpEnv({ MCP_PRIVACY_BYPASS: 'true', MCP_PRIVACY_BYPASS_ACK: '2026-01-15' });
  resetToolDefsForTests();
}

test.before(async () => {
  await initSchema();
  admin = await fx.createAccount('admin');
  adminToken = (await fx.obtainTokens(app, admin)).access_token;
  // Profil sur mesure : connecteur + SQL, **sans** `mcp.privacy_bypass` (scénario S5).
  await execute(
    'INSERT INTO roles (slug, display_name, `rank`, is_system, display_order) VALUES (?, ?, 300, 0, 900)',
    [SQL_ONLY_ROLE, SQL_ONLY_ROLE],
  );
  sqlOnlyRoleId = (await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [SQL_ONLY_ROLE]))
    .id;
  for (const key of ['mcp.use', 'mcp.sql']) {
    await execute('INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)', [
      sqlOnlyRoleId,
      key,
    ]);
  }
  sqlOnly = await fx.createAccount(SQL_ONLY_ROLE);
  sqlOnlyToken = (await fx.obtainTokens(app, sqlOnly)).access_token;
});

test.after(async () => {
  await execute("DELETE FROM app_settings WHERE `key` LIKE 'mcp.%'");
  await fx.cleanupAccounts();
  if (sqlOnlyRoleId) {
    await execute('DELETE FROM role_permissions WHERE role_id = ?', [sqlOnlyRoleId]);
    await execute('DELETE FROM user_roles WHERE role_id = ?', [sqlOnlyRoleId]);
    await execute('DELETE FROM roles WHERE id = ?', [sqlOnlyRoleId]);
  }
});

test.beforeEach(() => {
  fx.enableMcpEnv();
  resetToolDefsForTests();
});

// ---------------------------------------------------------------------------------------------
// S2 — un nom de CTE déclaré dans une sous-requête masquait la vraie table
// ---------------------------------------------------------------------------------------------

const S2_SCENARIO =
  'SELECT u.id, u.description FROM users u WHERE EXISTS (WITH users AS (SELECT 1 AS x) SELECT x FROM users)';

test('S2 : le scénario de l’audit est refusé (mode contenu et bypass)', () => {
  assert.throws(() => analyzeSelect(S2_SCENARIO), /masque une table|users/);
  assert.throws(() => analyzeSelect(S2_SCENARIO, { privacyBypass: true }), /masque une table/);
  // Même attaque avec `u.*`.
  assert.throws(
    () =>
      analyzeSelect(
        'SELECT u.* FROM users u WHERE EXISTS (WITH users AS (SELECT 1 AS x) SELECT x FROM users)',
      ),
    /masque une table|users/,
  );
});

test('S2 : un nom de CTE n’est visible que dans sa portée', () => {
  // CTE `c` déclarée dans un EXISTS : la vraie table `c` lue ailleurs n'est pas masquée.
  assert.throws(
    () =>
      analyzeSelect(
        'SELECT p.id FROM plants p WHERE EXISTS (WITH c AS (SELECT 1 AS x) SELECT x FROM c) AND EXISTS (SELECT 1 FROM c)',
      ),
    /« c »/,
  );
  // En bypass, une vraie table lue hors de la portée de la CTE reste comptée et contrôlée.
  const r = analyzeSelect(
    'SELECT u.id FROM users u WHERE EXISTS (WITH c AS (SELECT 1 AS x) SELECT x FROM c)',
    { privacyBypass: true },
  );
  assert.deepEqual(r.tables, ['users']);
  // Portée ambiguë (WITH entre parenthèses suivi d'un UNION) : refusée.
  assert.throws(
    () => analyzeSelect('(WITH c AS (SELECT 1 AS x) SELECT x FROM c) UNION SELECT name FROM c'),
    /WITH entre parenthèses/,
  );
  // Un nom de CTE qui masque une table secrète est refusé, même en bypass.
  assert.throws(
    () =>
      analyzeSelect(
        'WITH password_reset_tokens AS (SELECT 1 AS x) SELECT x FROM password_reset_tokens',
        {
          privacyBypass: true,
        },
      ),
    /masque une table/,
  );
});

test('S2 : les CTE légitimes passent toujours', () => {
  const cases = [
    'WITH c AS (SELECT id FROM plants) SELECT id FROM c',
    'WITH c AS (SELECT id FROM plants) SELECT id FROM c UNION SELECT id FROM c',
    'WITH c AS (SELECT id FROM plants), d AS (SELECT id FROM c) SELECT id FROM d',
    'WITH c AS (SELECT id FROM plants) SELECT id FROM plants WHERE id IN (SELECT id FROM c)',
    'SELECT p.id FROM plants p WHERE EXISTS (WITH c AS (SELECT 1 AS x) SELECT x FROM c)',
    'SELECT * FROM (WITH c AS (SELECT id FROM plants) SELECT id FROM c) AS d',
  ];
  for (const sql of cases) {
    assert.deepEqual(analyzeSelect(sql).tables, ['plants'], sql);
  }
});

test('S2 : foretmap_sql_select refuse le scénario de bout en bout', async () => {
  const r = await fx.callTool(app, adminToken, 'foretmap_sql_select', { sql: S2_SCENARIO });
  assert.equal(r.isError, true, r.text);
  assert.ok(!/"description"/.test(r.text), r.text);
});

// ---------------------------------------------------------------------------------------------
// S3 — `POST /MCP` échappait à la garde d'hôte et à MCP_ENABLED=false
// ---------------------------------------------------------------------------------------------

test('S3 : casse différente → 404 quand le connecteur est coupé', async () => {
  process.env.MCP_ENABLED = 'false';
  for (const path of ['/MCP', '/Mcp', '/mcp/']) {
    const res = await request(app)
      .post(path)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    assert.equal(res.status, 404, `${path} : ${res.status} ${res.text}`);
  }
  assert.equal((await request(app).post('/OAuth/register').send({})).status, 404);
  assert.equal((await request(app).get('/.Well-Known/oauth-authorization-server')).status, 404);
});

test('S3 : casse différente → 404 sur l’hôte G&L', async () => {
  const res = await request(app)
    .post('/MCP')
    .set('X-Foretmap-Product', 'gl')
    .set('Authorization', `Bearer ${adminToken}`)
    .set('Accept', 'application/json, text/event-stream')
    .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.equal(res.status, 404, res.text);
  const oauth = await request(app)
    .get('/.WELL-KNOWN/oauth-authorization-server')
    .set('X-Foretmap-Product', 'gl');
  assert.equal(oauth.status, 404);
});

test('S3 : le point d’entrée revérifie lui-même activation et produit', async () => {
  let product = 'foret';
  const bare = express();
  bare.use(express.json());
  bare.use('/mcp', createMcpEndpointRouter({ resolveProductId: () => product }));
  process.env.MCP_ENABLED = 'false';
  assert.equal((await request(bare).post('/mcp').send({})).status, 404);
  fx.enableMcpEnv();
  product = 'gl';
  assert.equal((await request(bare).post('/mcp').send({})).status, 404);
  product = 'foret';
  // Connecteur actif, bon produit : on atteint l'authentification (401 sans jeton).
  assert.equal((await request(bare).post('/mcp').send({})).status, 401);
});

// ---------------------------------------------------------------------------------------------
// S5 — le bypass RGPD suivait le réglage global, pas la permission de l'appelant
// ---------------------------------------------------------------------------------------------

test('S5 : bypass effectif = réglage actif ET permission mcp.privacy_bypass', () => {
  assert.equal(computeCallerPrivacyBypass({ privacyBypassActive: true }, ['mcp.sql']), false);
  assert.equal(
    computeCallerPrivacyBypass({ privacyBypassActive: true }, ['mcp.privacy_bypass']),
    true,
  );
  assert.equal(
    computeCallerPrivacyBypass({ privacyBypassActive: false }, ['mcp.privacy_bypass']),
    false,
  );
  assert.equal(computeCallerPrivacyBypass({ privacyBypassActive: true }, undefined), false);
});

test('S5 : profil mcp.sql sans mcp.privacy_bypass — pas de lecture nominative', async () => {
  enableBypass();
  const sql = 'SELECT id FROM users ORDER BY id';
  const denied = await fx.callTool(app, sqlOnlyToken, 'foretmap_sql_select', { sql, limit: 1 });
  assert.equal(denied.isError, true, denied.text);
  assert.match(denied.text, /users/);
  // L'admin (qui porte la permission) garde le bypass.
  const allowed = await fx.callTool(app, adminToken, 'foretmap_sql_select', { sql, limit: 1 });
  assert.equal(allowed.isError, false, allowed.text);
});

// ---------------------------------------------------------------------------------------------
// S9 — l'empreinte de confirmation ignorait les objets imbriqués
// ---------------------------------------------------------------------------------------------

test('S9 : l’empreinte couvre le contenu des objets imbriqués', () => {
  const a = hashArgs({ action: 'update', data: { name: 'Chêne', meta: { rank: 1 } } });
  const b = hashArgs({ action: 'update', data: { name: 'Hêtre', meta: { rank: 1 } } });
  const c = hashArgs({ action: 'update', data: { name: 'Chêne', meta: { rank: 2 } } });
  assert.notEqual(a, b);
  assert.notEqual(a, c);
  // Stable : ordre des clés indifférent à tous les niveaux, champs de confirmation exclus.
  assert.equal(
    a,
    hashArgs({
      data: { meta: { rank: 1 }, name: 'Chêne' },
      action: 'update',
      confirmation_id: 'x',
      confirmation_code: '123456',
    }),
  );
  // Tableaux : l'ordre compte, le contenu des éléments aussi.
  assert.notEqual(
    hashArgs({ ids: [{ id: 1 }, { id: 2 }] }),
    hashArgs({ ids: [{ id: 1 }, { id: 3 }] }),
  );
});

// ---------------------------------------------------------------------------------------------
// S11 — `innodb_lock_wait_timeout = 5` laissé sur une connexion rendue au pool
// ---------------------------------------------------------------------------------------------

async function withDedicatedConnection(fn) {
  const conn = await pool.getConnection();
  try {
    const tx = {
      queryOne: async (sql, params = []) => (await conn.execute(sql, params))[0][0],
      execute: async (sql, params = []) => (await conn.execute(sql, params))[0],
    };
    const read = async () =>
      Number((await tx.queryOne('SELECT @@SESSION.innodb_lock_wait_timeout AS v')).v);
    return await fn(tx, read, conn);
  } finally {
    try {
      await conn.query('SET SESSION innodb_lock_wait_timeout = DEFAULT');
    } finally {
      conn.release();
    }
  }
}

test('S11 : la valeur de session est rétablie après le DML, même en cas d’erreur', async () => {
  await withDedicatedConnection(async (tx, read, conn) => {
    await conn.query('SET SESSION innodb_lock_wait_timeout = 37');
    let inside = null;
    await withShortLockWait(tx, async () => {
      inside = await read();
    });
    assert.equal(inside, 5);
    assert.equal(await read(), 37);
    await assert.rejects(
      withShortLockWait(tx, async () => {
        throw new Error('échec simulé');
      }),
      /échec simulé/,
    );
    assert.equal(await read(), 37);
  });
});

test('S11 : foretmap_sql_execute ne laisse pas la borne de 5 s sur le pool', async () => {
  fx.enableMcpEnv({
    MCP_SQL_WRITE_ENABLED: 'true',
    MCP_SQL_DDL_ENABLED: 'false',
    MCP_CONFIRM_REQUIRED: 'false',
  });
  resetToolDefsForTests();
  const r = await fx.callTool(app, adminToken, 'foretmap_sql_execute', {
    sql: 'UPDATE plants SET name = name WHERE id = -1',
    dry_run: true,
  });
  assert.equal(r.isError, false, r.text);
  const globalRow = await queryOne('SELECT @@GLOBAL.innodb_lock_wait_timeout AS v');
  const expected = Number(globalRow.v);
  // Toutes les connexions inactives du pool : aucune ne garde la valeur du connecteur.
  const limit = Math.max(1, Number(pool.pool?.config?.connectionLimit) || 10);
  const conns = [];
  try {
    for (let i = 0; i < limit; i += 1) conns.push(await pool.getConnection());
    for (const conn of conns) {
      const [rows] = await conn.query('SELECT @@SESSION.innodb_lock_wait_timeout AS v');
      if (expected !== 5) assert.notEqual(Number(rows[0].v), 5);
    }
  } finally {
    for (const conn of conns) conn.release();
  }
});
