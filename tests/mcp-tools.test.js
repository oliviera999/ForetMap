'use strict';

/**
 * Connecteur MCP — outils (lib/mcp/tools, lib/mcp/audits) sur la base de test semée :
 * liste filtrée par profil, appel de chaque outil, garde anti-données personnelles (aucun
 * e-mail, hachage bcrypt ni jeton dans aucune réponse), écriture active par défaut pour un
 * admin et refusée pour un prof ou quand le drapeau est coupé, plan → apply (conflit,
 * journal d'audit), SQL désactivé par défaut puis rejets, bout en bout avec le client SDK.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('./helpers/mcpFixtures');

fx.enableMcpEnv();

const { app } = require('../server');
const { initSchema, queryOne, execute } = require('../database');
const { PII_LEAK_PATTERNS } = require('../lib/mcp/sqlGuard');
const { CHECK_NAMES } = require('../lib/mcp/audits/checks');

let admin;
let prof;
let adminToken;
let profToken;
let seededEmail;

const READ_TOOLS = [
  'foretmap_health',
  'foretmap_search',
  'foretmap_get_species',
  'foretmap_list_maps',
  'foretmap_get_map',
  'foretmap_get_id_key',
  'foretmap_get_food_web',
  'foretmap_list_qcm',
  'foretmap_get_qcm',
  'foretmap_get_glossary_term',
  'gl_get_board',
  'gl_get_lore',
  'foretmap_audit',
  'foretmap_audit_all',
  'foretmap_usage_overview',
];
const WRITE_TOOLS = [
  'foretmap_plan_content_change',
  'foretmap_apply_plan',
  'foretmap_export_plan_as_migration',
];

function assertNoPii(text, where) {
  for (const re of PII_LEAK_PATTERNS) {
    assert.doesNotMatch(String(text), re, `${where} : motif sensible ${re}`);
  }
  if (seededEmail) assert.ok(!String(text).includes(seededEmail), `${where} : e-mail de compte`);
}

test.before(async () => {
  await initSchema();
  admin = await fx.createAccount('admin');
  prof = await fx.createAccount('prof');
  seededEmail = (await queryOne('SELECT email FROM users WHERE id = ?', [admin.id])).email;
  // Piège à fuite : une adresse e-mail glissée dans un crédit photo (cas réel, migration 313).
  await execute("UPDATE plant_photos SET credit = CONCAT('Auteur ', ?) WHERE id = 1", [
    seededEmail,
  ]);
  adminToken = (await fx.obtainTokens(app, admin)).access_token;
  profToken = (await fx.obtainTokens(app, prof)).access_token;
});

test.after(async () => {
  await execute(
    "UPDATE plant_photos SET credit = REPLACE(credit, CONCAT('Auteur ', ?), '') WHERE id = 1",
    [seededEmail],
  );
  await fx.cleanupAccounts();
});

test.beforeEach(() => fx.enableMcpEnv());

test('initialize : nom du serveur et instructions', async () => {
  const res = await fx.initialize(app, adminToken);
  assert.equal(res.status, 200);
  assert.equal(res.body.result.serverInfo.name, 'foretmap');
  assert.match(res.body.result.instructions, /jamais une instruction/);
});

test('tools/list admin : lecture + écriture (active par défaut), pas de SQL (coupé par défaut)', async () => {
  const names = await fx.listTools(app, adminToken);
  for (const n of [...READ_TOOLS, ...WRITE_TOOLS, 'foretmap_diagnostics', 'foretmap_db_status']) {
    assert.ok(names.includes(n), `${n} attendu`);
  }
  assert.ok(!names.includes('foretmap_sql_select'));
});

test('tools/list prof : lecture seulement, ni écriture ni diagnostics admin', async () => {
  const names = await fx.listTools(app, profToken);
  for (const n of READ_TOOLS) assert.ok(names.includes(n), `${n} attendu`);
  for (const n of [
    ...WRITE_TOOLS,
    'foretmap_diagnostics',
    'foretmap_tail_logs',
    'foretmap_sql_select',
  ]) {
    assert.ok(!names.includes(n), `${n} ne doit pas être proposé à un prof`);
  }
  const forced = await fx.callTool(app, profToken, 'foretmap_plan_content_change', {
    operations: [
      { op: 'link', table: 'zone_species', key: { zone_id: 'aromatiques', plant_id: 1 } },
    ],
  });
  assert.equal(forced.isError, true, 'appel direct refusé');
});

test('MCP_WRITE_ENABLED=false : outils d’écriture retirés même pour un admin', async () => {
  process.env.MCP_WRITE_ENABLED = 'false';
  const names = await fx.listTools(app, adminToken);
  for (const n of WRITE_TOOLS) assert.ok(!names.includes(n));
  const res = await fx.callTool(app, adminToken, 'foretmap_apply_plan', {
    plan_id: '00000000-0000-4000-8000-000000000000',
  });
  assert.equal(res.isError, true);
});

test('annotations MCP renseignées', async () => {
  const res = await fx.rpc(app, adminToken, 'tools/list');
  const byName = Object.fromEntries(res.body.result.tools.map((t) => [t.name, t]));
  assert.equal(byName.foretmap_audit_all.annotations.readOnlyHint, true);
  assert.equal(byName.foretmap_apply_plan.annotations.destructiveHint, true);
  assert.equal(byName.foretmap_apply_plan.annotations.readOnlyHint, false);
  assert.deepEqual(byName.foretmap_audit.inputSchema.properties.check.enum, [...CHECK_NAMES]);
});

test('chaque outil de lecture répond sur la base semée, sans donnée personnelle', async () => {
  const plant = await queryOne('SELECT id FROM plants ORDER BY id LIMIT 1');
  const gl = await queryOne('SELECT species_code FROM gl_species ORDER BY id LIMIT 1');
  const qcm = await queryOne(
    'SELECT question_code FROM gl_qcm_questions ORDER BY question_code LIMIT 1',
  );
  const term = await queryOne('SELECT terme FROM gl_glossary_terms ORDER BY glossary_code LIMIT 1');
  const calls = [
    ['foretmap_health', {}],
    ['foretmap_diagnostics', {}],
    ['foretmap_tail_logs', { lines: 50 }],
    ['foretmap_db_status', {}],
    ['foretmap_search', { q: 'au' }],
    ['foretmap_get_species', { id: plant.id }],
    ['foretmap_get_species', { dataset: 'gl', code: gl.species_code }],
    ['foretmap_list_maps', {}],
    ['foretmap_get_map', { map_id: 'foret' }],
    ['foretmap_get_food_web', { map_id: 'foret', limit: 20 }],
    ['foretmap_get_food_web', { dataset: 'gl' }],
    ['foretmap_list_qcm', { dataset: 'gl', limit: 5 }],
    ['foretmap_list_qcm', { limit: 5 }],
    ['foretmap_get_qcm', { dataset: 'gl', code: qcm.question_code }],
    ['foretmap_get_glossary_term', { term: term.terme }],
    ['gl_get_board', {}],
    ['gl_get_lore', { limit: 5 }],
    ['foretmap_usage_overview', {}],
    ['foretmap_audit_all', {}],
    ...CHECK_NAMES.map((check) => ['foretmap_audit', { check }]),
  ];
  for (const [name, args] of calls) {
    const res = await fx.callTool(app, adminToken, name, args);
    assert.equal(res.isError, false, `${name} : ${res.text}`);
    assertNoPii(res.text, name);
  }
});

test('foretmap_get_species : photos avec crédit, e-mail du crédit masqué', async () => {
  const res = await fx.callTool(app, adminToken, 'foretmap_get_species', { id: 1 });
  const photo = res.data.photos.find((p) => p.id === 1);
  assert.ok(photo, 'photo 1 attendue');
  assert.match(photo.credit, /\[e-mail masqué\]/);
});

test('foretmap_audit_all : tableau de bord compact de tous les contrôles', async () => {
  const res = await fx.callTool(app, adminToken, 'foretmap_audit_all', {});
  assert.deepEqual(
    res.data.checks.map((c) => c.check),
    [...CHECK_NAMES],
  );
  for (const c of res.data.checks) assert.ok(c.sample_ids.length <= 5);
  const one = await fx.callTool(app, adminToken, 'foretmap_audit', {
    check: 'photos_missing_credit',
  });
  assert.equal(one.data.check, 'photos_missing_credit');
  assert.ok(one.data.count >= 1, 'la base semée a des photos sans crédit');
  assert.ok(one.data.sample_ids.length <= 50);
  assert.ok(one.data.hint);
  const bad = await fx.rpc(app, adminToken, 'tools/call', {
    name: 'foretmap_audit',
    arguments: { check: 'inexistant' },
  });
  assert.ok(bad.body.error || bad.body.result?.isError, 'énumération fermée');
});

test('arguments stricts : clé inconnue et limit > 200 refusés', async () => {
  const extra = await fx.callTool(app, adminToken, 'foretmap_list_maps', { pirate: 1 });
  assert.equal(extra.isError, true);
  const big = await fx.callTool(app, adminToken, 'foretmap_list_qcm', { limit: 1000 });
  assert.equal(big.isError, true);
});

test('écriture : plan → apply par un admin, migration générée, audit_log, rejeu refusé', async () => {
  const before = await queryOne('SELECT licence FROM plant_photos WHERE id = 2');
  const plan = await fx.callTool(app, adminToken, 'foretmap_plan_content_change', {
    operations: [
      { op: 'set_field', table: 'plant_photos', key: { id: 2 }, column: 'licence', value: 'CC0' },
      { op: 'link', table: 'zone_species', key: { zone_id: 'aromatiques', plant_id: 2 } },
    ],
    note: 'test de plan',
  });
  assert.equal(plan.isError, false, plan.text);
  assert.equal(plan.data.diff[0].before, before.licence);
  assert.equal(plan.data.diff[0].after, 'CC0');
  assert.match(plan.data.migration_sql, /UPDATE plant_photos SET licence = 'CC0'/);
  assert.match(plan.data.migration_sql, /INSERT IGNORE INTO zone_species/);
  assert.match(plan.data.rollback_sql, /DELETE FROM zone_species/);
  // Le plan n'écrit rien.
  assert.equal(
    (await queryOne('SELECT licence FROM plant_photos WHERE id = 2')).licence,
    before.licence,
  );

  const applied = await fx.callTool(app, adminToken, 'foretmap_apply_plan', {
    plan_id: plan.data.plan_id,
  });
  assert.equal(applied.isError, false, applied.text);
  assert.equal(applied.data.applied, true);
  assert.equal((await queryOne('SELECT licence FROM plant_photos WHERE id = 2')).licence, 'CC0');
  const audit = await queryOne(
    "SELECT action, actor_user_id FROM audit_log WHERE action = 'mcp.content.apply' AND target_id = ?",
    [plan.data.plan_id],
  );
  assert.ok(audit, 'écriture journalisée');
  const again = await fx.callTool(app, adminToken, 'foretmap_apply_plan', {
    plan_id: plan.data.plan_id,
  });
  assert.equal(again.isError, true);

  const exported = await fx.callTool(app, adminToken, 'foretmap_export_plan_as_migration', {
    plan_id: plan.data.plan_id,
  });
  assert.match(exported.data.suggested_filename, /^migrations\/NNN_contenu_mcp_/);

  // Rollback réel : la migration inverse générée remet l'état d'origine.
  const { splitSqlStatements } = require('../database');
  for (const stmt of splitSqlStatements(plan.data.rollback_sql)) await execute(stmt);
  assert.equal(
    (await queryOne('SELECT licence FROM plant_photos WHERE id = 2')).licence,
    before.licence,
  );
  assert.equal(
    await queryOne(
      "SELECT 1 AS x FROM zone_species WHERE zone_id = 'aromatiques' AND plant_id = 2",
    ),
    undefined,
  );
});

test('écriture : état modifié entre plan et apply → conflit, rien n’est écrit', async () => {
  const plan = await fx.callTool(app, adminToken, 'foretmap_plan_content_change', {
    operations: [
      { op: 'set_field', table: 'plant_photos', key: { id: 3 }, column: 'credit', value: 'X' },
    ],
  });
  await execute("UPDATE plant_photos SET credit = CONCAT(COALESCE(credit, ''), '·') WHERE id = 3");
  const res = await fx.callTool(app, adminToken, 'foretmap_apply_plan', {
    plan_id: plan.data.plan_id,
  });
  assert.equal(res.isError, true);
  assert.equal(res.data.code, 'MCP_PLAN_CONFLICT');
  assert.notEqual((await queryOne('SELECT credit FROM plant_photos WHERE id = 3')).credit, 'X');
  await execute("UPDATE plant_photos SET credit = TRIM(TRAILING '·' FROM credit) WHERE id = 3");
});

test('écriture : tables et colonnes hors liste blanche refusées (PII interdites)', async () => {
  const users = await fx.rpc(app, adminToken, 'tools/call', {
    name: 'foretmap_plan_content_change',
    arguments: {
      operations: [
        { op: 'set_field', table: 'users', key: { id: 'x' }, column: 'email', value: 'a' },
      ],
    },
  });
  assert.ok(users.body.error || users.body.result?.isError);
  const col = await fx.callTool(app, adminToken, 'foretmap_plan_content_change', {
    operations: [
      {
        op: 'set_field',
        table: 'plants',
        key: { id: 1 },
        column: 'hazard_reviewed_by',
        value: 'a',
      },
    ],
  });
  assert.equal(col.isError, true);
  assert.equal(col.data.code, 'MCP_WRITE_REJECTED');
});

test('SQL : coupé par défaut, exige DB_MCP_USER, refus prouvés sur MariaDB réel (B1)', async () => {
  const off = await fx.callTool(app, adminToken, 'foretmap_sql_select', {
    sql: 'SELECT 1 FROM plants',
  });
  assert.equal(off.isError, true);

  // Drapeau seul : toujours indisponible sans compte MySQL dédié.
  process.env.MCP_SQL_ENABLED = 'true';
  delete process.env.DB_MCP_USER;
  assert.ok(!(await fx.listTools(app, adminToken)).includes('foretmap_sql_select'));
  const noPool = await fx.callTool(app, adminToken, 'foretmap_sql_select', {
    sql: 'SELECT 1 FROM plants',
  });
  assert.equal(noPool.isError, true);

  // Compte réel restreint par le script de droits : un GRANT SELECT par table de contenu.
  const { pool, splitSqlStatements } = require('../database');
  const { buildGrants } = require('../scripts/mcp-print-grants');
  const { endReadPool } = require('../lib/mcp/readDb');
  const roUser = `fmcp_t${Date.now().toString(36)}`.slice(0, 16);
  const roPass = `Ro-${require('node:crypto').randomBytes(8).toString('hex')}`;
  const conn = await pool.getConnection();
  const dbName = process.env.DB_NAME;
  const [existing] = await conn.query(
    'SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()',
  );
  // CI et base locale de test : compte avec droits d'administration (root / dev). Un échec
  // ici fait échouer le test — jamais de repli silencieux.
  try {
    for (const host of ['localhost', '127.0.0.1', '%']) {
      await conn.query(`CREATE USER IF NOT EXISTS ?@? IDENTIFIED BY ?`, [roUser, host, roPass]);
      const grants = buildGrants({
        db: dbName,
        user: roUser,
        host,
        existingTables: new Set(existing.map((r) => r.t)),
      });
      for (const stmt of splitSqlStatements(grants)) await conn.query(stmt);
    }
  } finally {
    conn.release();
  }
  const grantsApplied = true;
  try {
    if (grantsApplied) {
      process.env.DB_MCP_USER = roUser;
      process.env.DB_MCP_PASS = roPass;
      await endReadPool();
      // Droits conformes (un GRANT SELECT par table de contenu) : l'outil est proposé.
      assert.ok((await fx.listTools(app, adminToken)).includes('foretmap_sql_select'));
      const ok = await fx.callTool(app, adminToken, 'foretmap_sql_select', {
        sql: 'SELECT id, name FROM plants ORDER BY id',
        limit: 3,
      });
      assert.equal(ok.isError, false, ok.text);
      assert.equal(ok.data.rows.length, 3);
      const cte = await fx.callTool(app, adminToken, 'foretmap_sql_select', {
        sql: 'WITH x AS (SELECT id FROM plants) SELECT COUNT(*) AS n FROM x',
      });
      assert.equal(cte.isError, false, cte.text);

      for (const sql of [
        'SELECT * FROM (users)',
        'SELECT * FROM ((users))',
        'SELECT id FROM plants WHERE id IN (SELECT id FROM (users))',
        'WITH x AS (SELECT * FROM users) SELECT * FROM x',
        'SELECT id FROM plants UNION SELECT id FROM users',
        'SELECT * FROM (forum_posts)',
        'SELECT * FROM (species_observations)',
        'SELECT * FROM/**/users',
        `SELECT * FROM \`${dbName}\`.users`,
      ]) {
        const res = await fx.callTool(app, adminToken, 'foretmap_sql_select', { sql });
        assert.equal(res.isError, true, `doit être refusé : ${sql}`);
        assertNoPii(res.text, sql);
      }
      // Seconde barrière, indépendante du code : le compte MySQL lui-même ne lit pas `users`.
      const mysql = require('mysql2/promise');
      const direct = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 3306,
        user: roUser,
        password: roPass,
        database: dbName,
      });
      try {
        await assert.rejects(direct.query('SELECT * FROM (users) LIMIT 1'), /denied/i);
        await assert.rejects(direct.query('UPDATE plants SET name = name WHERE id = 0'), /denied/i);
        const [rows] = await direct.query('SELECT COUNT(*) AS n FROM plants');
        assert.ok(Number(rows[0].n) > 0);
      } finally {
        await direct.end();
      }

      // Contre-vérification B1 : un droit au niveau de la base (`SELECT ON db.*`) rend l'outil
      // indisponible — absent de tools/list et refusé à l'appel —, même si l'analyse
      // syntaxique laisserait passer la requête.
      const { resetGrantsCacheForTests } = require('../lib/mcp/readOnlyGrants');
      const c1 = await pool.getConnection();
      try {
        for (const host of ['localhost', '127.0.0.1', '%']) {
          await c1.query(`GRANT SELECT ON \`${dbName}\`.* TO ?@?`, [roUser, host]);
        }
      } finally {
        c1.release();
      }
      resetGrantsCacheForTests();
      assert.ok(!(await fx.listTools(app, adminToken)).includes('foretmap_sql_select'));
      const wideCall = await fx.callTool(app, adminToken, 'foretmap_sql_select', {
        sql: 'SELECT id FROM plants',
      });
      assert.equal(wideCall.isError, true);
      assert.ok(!wideCall.text.includes('"rows"'), wideCall.text);
      // Retour aux droits par table, puis droit accordé à PUBLIC (invisible dans SHOW GRANTS
      // FOR CURRENT_USER() sous MariaDB 10.11+) : l'outil doit tomber aussi.
      const c3 = await pool.getConnection();
      try {
        for (const host of ['localhost', '127.0.0.1', '%']) {
          await c3.query(`REVOKE SELECT ON \`${dbName}\`.* FROM ?@?`, [roUser, host]);
        }
      } finally {
        c3.release();
      }
      resetGrantsCacheForTests();
      assert.ok((await fx.listTools(app, adminToken)).includes('foretmap_sql_select'));
      let publicGranted = false;
      const c4 = await pool.getConnection();
      try {
        const [ver] = await c4.query('SELECT VERSION() AS v');
        const v = String(ver[0].v);
        const m = /^(\d+)\.(\d+)/.exec(v);
        // `TO PUBLIC` : MariaDB ≥ 10.11 seulement (CI : 11.4, local : 10.11).
        if (/mariadb/i.test(v) && m && (Number(m[1]) > 10 || Number(m[2]) >= 11)) {
          await c4.query(`GRANT SELECT ON \`${dbName}\`.\`users\` TO PUBLIC`);
          publicGranted = true;
        }
      } finally {
        c4.release();
      }
      try {
        if (publicGranted) {
          resetGrantsCacheForTests();
          assert.ok(!(await fx.listTools(app, adminToken)).includes('foretmap_sql_select'));
          const pubCall = await fx.callTool(app, adminToken, 'foretmap_sql_select', {
            sql: 'SELECT id FROM plants',
          });
          assert.equal(pubCall.isError, true);
          assert.ok(!pubCall.text.includes('"rows"'), pubCall.text);
          const { lastGrantsCheck } = require('../lib/mcp/readOnlyGrants');
          assert.deepEqual(lastGrantsCheck(), { ok: false, reason: 'droit accordé à PUBLIC' });
          // Le serveur SQL, lui, ouvre bien `users` à ce compte : c'est le contrôle qui ferme.
          const viaPublic = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            port: Number(process.env.DB_PORT) || 3306,
            user: roUser,
            password: roPass,
            database: dbName,
          });
          try {
            const [n] = await viaPublic.query('SELECT COUNT(*) AS n FROM users');
            assert.ok(Number(n[0].n) >= 0);
          } finally {
            await viaPublic.end();
          }
        }
      } finally {
        if (publicGranted) {
          const c5 = await pool.getConnection();
          try {
            await c5.query(`REVOKE SELECT ON \`${dbName}\`.\`users\` FROM PUBLIC`);
          } finally {
            c5.release();
          }
        }
      }
    }
    // Un prof ne voit pas l'outil, même activé.
    assert.ok(!(await fx.listTools(app, profToken)).includes('foretmap_sql_select'));
  } finally {
    delete process.env.DB_MCP_USER;
    delete process.env.DB_MCP_PASS;
    await endReadPool();
    if (grantsApplied) {
      const c2 = await pool.getConnection();
      try {
        for (const host of ['localhost', '127.0.0.1', '%']) {
          await c2.query('DROP USER IF EXISTS ?@?', [roUser, host]);
        }
      } finally {
        c2.release();
      }
    }
  }
});

test('bout en bout : client MCP du SDK contre l’app sur un port éphémère', async () => {
  const http = require('node:http');
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  process.env.MCP_PUBLIC_BASE_URL = base;
  try {
    const { runSmoke } = await import('../scripts/mcp-smoke.mjs');
    const out = await runSmoke({
      baseUrl: base,
      identifier: admin.pseudo,
      password: admin.password,
      log: () => {},
    });
    assert.ok(out.tools.includes('foretmap_audit_all'));
    assert.ok(out.tools.includes('foretmap_apply_plan'));
    assert.ok(Array.isArray(out.audit.checks));
    assert.ok(['green', 'orange', 'red'].includes(out.health?.status), 'rapport de santé');
    assert.equal(out.scope, 'foretmap.read foretmap.write');
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('apply : audit_log écrit dans la transaction ; échec du journal → rien n’est écrit (M7)', async () => {
  const before = await queryOne('SELECT licence FROM plant_photos WHERE id = 4');
  const plan = await fx.callTool(app, adminToken, 'foretmap_plan_content_change', {
    operations: [
      { op: 'set_field', table: 'plant_photos', key: { id: 4 }, column: 'licence', value: 'CC-M7' },
    ],
  });
  // Journal rendu impossible le temps de l'apply : `audit_log` renommée.
  await execute('RENAME TABLE audit_log TO audit_log_m7');
  let res;
  try {
    res = await fx.callTool(app, adminToken, 'foretmap_apply_plan', { plan_id: plan.data.plan_id });
  } finally {
    await execute('RENAME TABLE audit_log_m7 TO audit_log');
  }
  assert.equal(res.isError, true);
  assert.equal(
    (await queryOne('SELECT licence FROM plant_photos WHERE id = 4')).licence,
    before.licence,
  );
  const status = await queryOne('SELECT status FROM mcp_content_plans WHERE id = ?', [
    plan.data.plan_id,
  ]);
  assert.equal(status.status, 'planned', 'plan non marqué appliqué (rollback)');
});

test('apply : opérations revalidées contre la liste blanche (M7)', async () => {
  const plan = await fx.callTool(app, adminToken, 'foretmap_plan_content_change', {
    operations: [
      { op: 'set_field', table: 'plant_photos', key: { id: 4 }, column: 'licence', value: 'X' },
    ],
  });
  // Plan altéré en base : colonne hors liste blanche.
  await execute(
    'UPDATE mcp_content_plans SET operations_json = REPLACE(operations_json, \'"licence"\', \'"url"\') WHERE id = ?',
    [plan.data.plan_id],
  );
  const res = await fx.callTool(app, adminToken, 'foretmap_apply_plan', {
    plan_id: plan.data.plan_id,
  });
  assert.equal(res.isError, true);
  assert.equal(res.data.code, 'MCP_WRITE_REJECTED');
});

test('foretmap_usage_overview : fenêtre libre refusée (M6) ; journaux en liste blanche (I2)', async () => {
  const bad = await fx.callTool(app, adminToken, 'foretmap_usage_overview', { days: 8 });
  assert.equal(bad.isError, true);
  const ok = await fx.callTool(app, adminToken, 'foretmap_usage_overview', { days: 30 });
  assert.equal(ok.isError, false);
  assert.equal(ok.data.window_days, 30);

  const logger = require('../lib/logger');
  // Lettres seulement : un nombre de 3 chiffres ou plus serait remplacé par « [n] ».
  const marker = `diagi${Date.now().toString(36).replace(/\d/g, 'x')}`;
  logger.warn(
    {
      studentId: admin.id,
      newId: admin.id.replace(/-/g, ''),
      ctx: { student: { id: admin.id, pseudo: 'renard-roux' } },
      studentIds: [admin.id],
      teamId: 4217,
      ip: '10.9.8.7',
      path: '/api/gl/players/4217/journal',
    },
    `${marker} compte ${admin.id}`,
  );
  const logs = await fx.callTool(app, adminToken, 'foretmap_tail_logs', { lines: 200 });
  assert.equal(logs.isError, false);
  for (const leak of [admin.id, admin.id.replace(/-/g, ''), '10.9.8.7', '4217', 'renard-roux']) {
    assert.ok(!logs.text.includes(leak), `${leak} masqué`);
  }
  const line = logs.data.entries.find((l) => String(l.msg || '').startsWith(marker));
  assert.ok(line, 'ligne de diagnostic présente');
  assert.match(line.msg, /id#[0-9a-f]{6}/);
  assert.equal(line.route, 'autre', 'chemin sans gabarit Express : jamais transmis');
  assert.equal(line.studentId, undefined);

  const diag = await fx.callTool(app, adminToken, 'foretmap_diagnostics', {});
  assert.equal(diag.isError, false, diag.text);
  assert.equal(typeof diag.data.uptimeSeconds, 'number');
  assert.equal(typeof diag.data.database.ok, 'boolean');
});
