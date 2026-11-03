'use strict';

/**
 * Confirmation par code MCP — usage unique, expiration, essais, empreinte, SMTP.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fx = require('./helpers/mcpFixtures');
const { initSchema, queryOne, execute } = require('../database');
const {
  ensureConfirmed,
  requestConfirmation,
  consumeConfirmation,
  hashArgs,
  MAX_ATTEMPTS,
} = require('../lib/mcp/confirm');
const { McpToolError } = require('../lib/mcp/registry');

fx.enableMcpEnv({ MCP_CONFIRM_REQUIRED: 'true' });

let admin;
let other;
const captured = [];

test.before(async () => {
  await initSchema();
  admin = await fx.createAccount('admin');
  other = await fx.createAccount('admin');
  requestConfirmation._sendEmail = async (payload) => {
    captured.push(payload);
    return true;
  };
});

test.after(async () => {
  delete requestConfirmation._sendEmail;
  await fx.cleanupAccounts();
});

test.beforeEach(() => {
  captured.length = 0;
  fx.enableMcpEnv({ MCP_CONFIRM_REQUIRED: 'true' });
});

test('demande de confirmation envoie un code et refuse sans e-mail', async () => {
  const user = { userId: admin.id, userType: 'teacher' };
  const args = { sql: 'DELETE FROM plants WHERE id = 999999' };
  const res = await ensureConfirmed({
    tool: 'foretmap_sql_execute',
    args,
    user,
    summary: 'test delete',
    needsConfirm: true,
  });
  assert.equal(res.proceed, false);
  assert.equal(res.response.confirmation_required, true);
  assert.ok(res.response.confirmation_id);
  assert.equal(captured.length, 1);
  assert.match(captured[0].code, /^\d{6}$/);
  assert.equal(captured[0].to.includes('@'), true);

  // Compte sans e-mail
  const noMailId = crypto.randomUUID();
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'teacher', NULL, ?, 'x', 'local', 1, NOW(), NOW())`,
    [noMailId, `nomail_${Date.now()}`],
  );
  await assert.rejects(
    () =>
      ensureConfirmed({
        tool: 'foretmap_sql_execute',
        args: { sql: 'x' },
        user: { userId: noMailId, userType: 'teacher' },
        summary: 's',
        needsConfirm: true,
      }),
    (err) => err instanceof McpToolError && err.code === 'MCP_CONFIRM_NO_EMAIL',
  );
  await execute('DELETE FROM users WHERE id = ?', [noMailId]);
});

test('succès puis réutilisation refusée', async () => {
  const user = { userId: admin.id, userType: 'teacher' };
  const args = { sql: 'UPDATE plants SET name = name WHERE id = 1', note: 'a' };
  const first = await ensureConfirmed({
    tool: 'foretmap_sql_execute',
    args,
    user,
    summary: 'upd',
    needsConfirm: true,
  });
  const code = captured[captured.length - 1].code;
  const id = first.response.confirmation_id;

  const ok = await ensureConfirmed({
    tool: 'foretmap_sql_execute',
    args: { ...args, confirmation_id: id, confirmation_code: code },
    user,
    summary: 'upd',
    needsConfirm: true,
  });
  assert.equal(ok.proceed, true);
  assert.equal(ok.confirmationId, id);

  await assert.rejects(
    () =>
      ensureConfirmed({
        tool: 'foretmap_sql_execute',
        args: { ...args, confirmation_id: id, confirmation_code: code },
        user,
        summary: 'upd',
        needsConfirm: true,
      }),
    (err) => err.code === 'MCP_CONFIRM_CONSUMED' || err.code === 'MCP_CONFIRM_STATE',
  );
});

test('mauvais code puis verrouillage après 3 essais', async () => {
  const user = { userId: admin.id, userType: 'teacher' };
  const args = { sql: 'TRUNCATE TABLE plants_does_not_matter' };
  const first = await ensureConfirmed({
    tool: 't',
    args,
    user,
    summary: 'bad',
    needsConfirm: true,
  });
  const id = first.response.confirmation_id;
  for (let i = 1; i <= MAX_ATTEMPTS; i += 1) {
    await assert.rejects(
      () =>
        consumeConfirmation({
          confirmationId: id,
          code: '000000',
          tool: 't',
          user,
          argsHash: hashArgs(args),
        }),
      (err) =>
        i < MAX_ATTEMPTS ? err.code === 'MCP_CONFIRM_BAD_CODE' : err.code === 'MCP_CONFIRM_LOCKED',
    );
  }
  const row = await queryOne('SELECT status FROM mcp_confirmations WHERE id = ?', [id]);
  assert.equal(row.status, 'locked');
});

test('autre utilisateur / autre outil / arguments modifiés', async () => {
  const user = { userId: admin.id, userType: 'teacher' };
  const args = { sql: 'DROP TABLE x' };
  const first = await ensureConfirmed({
    tool: 'tool_a',
    args,
    user,
    summary: 'x',
    needsConfirm: true,
  });
  const id = first.response.confirmation_id;
  const code = captured[captured.length - 1].code;

  await assert.rejects(
    () =>
      consumeConfirmation({
        confirmationId: id,
        code,
        tool: 'tool_a',
        user: { userId: other.id, userType: 'teacher' },
        argsHash: hashArgs(args),
      }),
    (err) => err.code === 'MCP_FORBIDDEN',
  );
  await assert.rejects(
    () =>
      consumeConfirmation({
        confirmationId: id,
        code,
        tool: 'tool_b',
        user,
        argsHash: hashArgs(args),
      }),
    (err) => err.code === 'MCP_CONFIRM_MISMATCH',
  );
  await assert.rejects(
    () =>
      consumeConfirmation({
        confirmationId: id,
        code,
        tool: 'tool_a',
        user,
        argsHash: hashArgs({ sql: 'autre' }),
      }),
    (err) => err.code === 'MCP_CONFIRM_MISMATCH',
  );
});

test('expiration', async () => {
  const user = { userId: admin.id, userType: 'teacher' };
  const args = { sql: 'ALTER TABLE plants ADD COLUMN IF NOT EXISTS z INT' };
  const first = await ensureConfirmed({
    tool: 'foretmap_sql_execute',
    args,
    user,
    summary: 'exp',
    needsConfirm: true,
  });
  const id = first.response.confirmation_id;
  const code = captured[captured.length - 1].code;
  await execute(
    'UPDATE mcp_confirmations SET expires_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE id = ?',
    [id],
  );
  await assert.rejects(
    () =>
      consumeConfirmation({
        confirmationId: id,
        code,
        tool: 'foretmap_sql_execute',
        user,
        argsHash: hashArgs(args),
      }),
    (err) => err.code === 'MCP_CONFIRM_EXPIRED',
  );
});

test('MCP_CONFIRM_REQUIRED=false saute la confirmation (audit skipped)', async () => {
  process.env.MCP_CONFIRM_REQUIRED = 'false';
  const user = { userId: admin.id, userType: 'teacher' };
  const res = await ensureConfirmed({
    tool: 'foretmap_sql_execute',
    args: { sql: 'DELETE FROM plants WHERE id = 1' },
    user,
    summary: 'skip',
    needsConfirm: true,
  });
  assert.equal(res.proceed, true);
  assert.equal(res.skipped, true);
  const audit = await queryOne(
    `SELECT action FROM audit_log WHERE action = 'mcp.confirm.skipped' AND actor_user_id = ?
     ORDER BY id DESC LIMIT 1`,
    [admin.id],
  );
  assert.ok(audit);
});

test('SMTP absent → refus', async () => {
  const prev = requestConfirmation._sendEmail;
  requestConfirmation._sendEmail = async () => false;
  await assert.rejects(
    () =>
      ensureConfirmed({
        tool: 't',
        args: { a: 1 },
        user: { userId: admin.id, userType: 'teacher' },
        summary: 'smtp',
        needsConfirm: true,
      }),
    (err) => err.code === 'MCP_CONFIRM_NO_SMTP',
  );
  requestConfirmation._sendEmail = prev;
});
