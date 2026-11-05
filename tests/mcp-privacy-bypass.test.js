'use strict';

/**
 * Bypass RGPD MCP — outils nominatifs, secrets jamais renvoyés, refus prof, ACK.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const fx = require('./helpers/mcpFixtures');
const { initSchema, queryOne, execute } = require('../database');
const { resetToolDefsForTests } = require('../lib/mcp/server');
const { analyzeSelect } = require('../lib/mcp/sqlAst');
const { evaluateGrants } = require('../lib/mcp/readOnlyGrants');
const { scrubSecretsOnly, isSecretTable } = require('../lib/mcp/secretGuard');
const { recomputeUserRole } = require('../lib/effectiveRole');

/** Hachage bcrypt factice construit à l'exécution (interdit en clair dans le dépôt). */
let TRAP_HASH = null;
const TRAP_ENV = 'super-secret-env-value-for-mcp-test-987654';

fx.enableMcpEnv();

const { app } = require('../server');

let admin;
let prof;
let adminToken;
let profToken;
let studentId;

function enableBypass() {
  fx.enableMcpEnv({
    MCP_PRIVACY_BYPASS: 'true',
    MCP_PRIVACY_BYPASS_ACK: '2026-01-15',
    MCP_SQL_ENABLED: 'false',
  });
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-mcp-privacy';
  process.env.FAKE_TRAP_SECRET = TRAP_ENV;
  resetToolDefsForTests();
}

test.before(async () => {
  await initSchema();
  TRAP_HASH = await bcrypt.hash(`mcp-trap-${crypto.randomBytes(8).toString('hex')}`, 4);
  admin = await fx.createAccount('admin');
  prof = await fx.createAccount('prof');
  adminToken = (await fx.obtainTokens(app, admin)).access_token;
  profToken = (await fx.obtainTokens(app, prof)).access_token;

  studentId = crypto.randomUUID();
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, first_name, last_name, display_name,
                        password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'student', ?, ?, 'Léa', 'Martin', 'Léa Martin', ?, 'local', 1, NOW(), NOW())`,
    [
      studentId,
      `lea_${Date.now()}@example.test`,
      `lea_${Date.now()}`,
      await bcrypt.hash('StudentPass1!', 4),
    ],
  );
  // Pièges secrets
  await execute(
    `INSERT INTO user_totp (user_id, secret_enc, enabled_at, created_at, updated_at)
     VALUES (?, 'ENCRYPTED_TOTP_SECRET_TRAP', NOW(), NOW(), NOW())
     ON DUPLICATE KEY UPDATE secret_enc = VALUES(secret_enc)`,
    [studentId],
  );
  await execute(
    `INSERT INTO user_totp_backup_codes (user_id, code_hash, created_at)
     VALUES (?, ?, NOW())`,
    [studentId, TRAP_HASH],
  );
  await execute(
    `INSERT INTO password_reset_tokens (id, user_type, user_id, token_hash, expires_at, created_at)
     VALUES (?, 'student', ?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR), NOW())`,
    [
      crypto.randomUUID(),
      studentId,
      crypto.createHash('sha256').update('reset-trap').digest('hex'),
    ],
  );
});

test.after(async () => {
  await execute('DELETE FROM password_reset_tokens WHERE user_id = ?', [studentId]);
  await execute('DELETE FROM user_totp_backup_codes WHERE user_id = ?', [studentId]);
  await execute('DELETE FROM user_totp WHERE user_id = ?', [studentId]);
  await execute('DELETE FROM users WHERE id = ?', [studentId]);
  delete process.env.FAKE_TRAP_SECRET;
  await fx.cleanupAccounts();
});

test.beforeEach(() => {
  fx.enableMcpEnv();
  resetToolDefsForTests();
});

test('outils présents par défaut, même sans ACK ; absents si verrouillés à false', async () => {
  // Défaut ouvert (05/11/2026) : l'accusé n'est plus un prérequis.
  delete process.env.MCP_PRIVACY_BYPASS;
  delete process.env.MCP_PRIVACY_BYPASS_ACK;
  resetToolDefsForTests();
  let tools = await fx.listTools(app, adminToken);
  assert.ok(tools.includes('foretmap_get_student'));
  assert.ok(tools.includes('foretmap_list_students'));

  process.env.MCP_PRIVACY_BYPASS = 'false';
  resetToolDefsForTests();
  tools = await fx.listTools(app, adminToken);
  assert.ok(!tools.includes('foretmap_get_student'));
  assert.ok(!tools.includes('foretmap_list_students'));
  delete process.env.MCP_PRIVACY_BYPASS;
});

test('outils présents pour admin avec ACK ; absents pour prof', async () => {
  enableBypass();
  const adminTools = await fx.listTools(app, adminToken);
  assert.ok(adminTools.includes('foretmap_get_student'));
  assert.ok(adminTools.includes('foretmap_list_students'));
  const profTools = await fx.listTools(app, profToken);
  assert.ok(!profTools.includes('foretmap_get_student'));
  assert.ok(!profTools.includes('foretmap_list_students'));
  assert.ok(!profTools.includes('foretmap_sql_execute'));
  assert.ok(!profTools.includes('foretmap_content_change'));
});

test('list + get renvoient des données nominatives et auditent sans valeurs', async () => {
  enableBypass();
  const student = await queryOne('SELECT pseudo, first_name FROM users WHERE id = ?', [studentId]);
  const list = await fx.callTool(app, adminToken, 'foretmap_list_students', {
    q: student.pseudo,
  });
  assert.equal(list.isError, false, list.text);
  assert.equal(list.data.privacy_bypass, true);
  assert.ok(Array.isArray(list.data.items), JSON.stringify(list.data));
  assert.ok(
    list.data.items.some((s) => s.id === studentId),
    JSON.stringify(list.data.items?.slice(0, 3)),
  );
  assert.ok(list.data.items.some((s) => s.first_name === student.first_name));

  const get = await fx.callTool(app, adminToken, 'foretmap_get_student', {
    student_id: studentId,
  });
  assert.equal(get.isError, false, get.text);
  assert.equal(get.data.privacy_bypass, true);
  assert.equal(get.data.student.first_name, 'Léa');
  assert.ok(get.data.student.email);

  // Secrets absents
  const blob = JSON.stringify(get.data) + JSON.stringify(list.data);
  assert.ok(!blob.includes('ENCRYPTED_TOTP_SECRET_TRAP'));
  assert.ok(!blob.includes(TRAP_HASH));
  assert.ok(!blob.includes('password_hash'));
  assert.ok(!blob.includes(TRAP_ENV));

  const audit = await queryOne(
    `SELECT payload_json FROM audit_log
      WHERE action = 'mcp.privacy_bypass.read' AND actor_user_id = ?
      ORDER BY id DESC LIMIT 1`,
    [admin.id],
  );
  assert.ok(audit);
  const payload =
    typeof audit.payload_json === 'string' ? JSON.parse(audit.payload_json) : audit.payload_json;
  assert.ok(payload.student_ids.includes(studentId));
  assert.ok(!JSON.stringify(payload).includes('@example.test'));
});

test('scrubSecretsOnly masque .env et retire colonnes secrètes', () => {
  process.env.FAKE_TRAP_SECRET = TRAP_ENV;
  const cleaned = scrubSecretsOnly({
    email: 'a@b.c',
    password_hash: TRAP_HASH,
    note: `leak ${TRAP_ENV}`,
  });
  assert.equal(cleaned.email, 'a@b.c');
  assert.equal(cleaned.password_hash, undefined);
  assert.ok(!String(cleaned.note).includes(TRAP_ENV));
});

test('sqlAst bypass refuse tables secrètes', () => {
  assert.throws(() => analyzeSelect('SELECT * FROM user_totp', { privacyBypass: true }));
  assert.throws(() => analyzeSelect('SELECT password_hash FROM users', { privacyBypass: true }));
  // users sans colonne secrète : admis en bypass (si la table n'est pas secrète)
  assert.ok(!isSecretTable('users'));
  const ok = analyzeSelect('SELECT id, email FROM users', { privacyBypass: true });
  assert.deepEqual(ok.tables, ['users']);
});

test('evaluateGrants mode bypass', () => {
  const db = 'foretmap';
  const contentOnly = evaluateGrants(
    [`GRANT SELECT ON \`${db}\`.\`plants\` TO 'u'@'localhost'`],
    db,
    { privacyBypass: false },
  );
  assert.equal(contentOnly.ok, true);

  const usersStar = evaluateGrants([`GRANT SELECT ON \`${db}\`.\`users\` TO 'u'@'localhost'`], db, {
    privacyBypass: true,
  });
  assert.equal(usersStar.ok, false);

  const usersCols = evaluateGrants(
    [`GRANT SELECT (\`id\`, \`email\`, \`first_name\`) ON \`${db}\`.\`users\` TO 'u'@'localhost'`],
    db,
    { privacyBypass: true },
  );
  assert.equal(usersCols.ok, true);

  const secretTable = evaluateGrants(
    [`GRANT SELECT ON \`${db}\`.\`user_totp\` TO 'u'@'localhost'`],
    db,
    { privacyBypass: true },
  );
  assert.equal(secretTable.ok, false);
});

test('usage overview sans seuil en bypass', async () => {
  enableBypass();
  const res = await fx.callTool(app, adminToken, 'foretmap_usage_overview', { days: 90 });
  assert.equal(res.isError, false, res.text);
  assert.equal(res.data.privacy_bypass, true);
  assert.match(String(res.data.threshold), /bypass/i);
});

test('prof avec permission manuelle refusé (verrou role)', async () => {
  enableBypass();
  // Accorder mcp.privacy_bypass au prof en base
  const role = await queryOne('SELECT id FROM roles WHERE slug = ?', ['prof']);
  await execute('INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)', [
    role.id,
    'mcp.privacy_bypass',
  ]);
  await recomputeUserRole(prof.id);
  // Nouveau jeton pour recharger les permissions
  const tok = (await fx.obtainTokens(app, prof)).access_token;
  const tools = await fx.listTools(app, tok);
  assert.ok(
    !tools.includes('foretmap_get_student'),
    'verrou requires.role=admin doit masquer l’outil',
  );
  const call = await fx.callTool(app, tok, 'foretmap_get_student', { student_id: studentId });
  assert.equal(call.isError, true);
  await execute('DELETE FROM role_permissions WHERE role_id = ? AND permission_key = ?', [
    role.id,
    'mcp.privacy_bypass',
  ]);
});

test('foretmap_content_change visible par défaut, masqué si REQUIRE_PLAN=true (verrouillé)', async () => {
  process.env.MCP_WRITE_REQUIRE_PLAN = 'true';
  resetToolDefsForTests();
  let tools = await fx.listTools(app, adminToken);
  assert.ok(!tools.includes('foretmap_content_change'));
  delete process.env.MCP_WRITE_REQUIRE_PLAN;
  resetToolDefsForTests();
  tools = await fx.listTools(app, adminToken);
  assert.ok(tools.includes('foretmap_content_change'));
  const profTools = await fx.listTools(app, profToken);
  assert.ok(!profTools.includes('foretmap_content_change'));
});
