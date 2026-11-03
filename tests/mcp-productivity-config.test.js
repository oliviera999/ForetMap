'use strict';

/**
 * Mode productivité MCP — drapeaux d'environnement (défauts protégés) et garde-fou ACK.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getMcpConfig,
  isMcpSqlWriteEnabled,
  isMcpSqlDdlEnabled,
  isMcpWriteRequirePlan,
  isMcpConfirmRequired,
  isMcpPrivacyBypassActive,
  parsePrivacyBypassAck,
  privacyBypassStatus,
  logPrivacyBypassStartupStatus,
  resetPrivacyBypassStartupLogForTests,
} = require('../lib/mcp/config');

function clearProductivityEnv() {
  for (const k of [
    'MCP_SQL_WRITE_ENABLED',
    'MCP_SQL_DDL_ENABLED',
    'MCP_SQL_MAX_AFFECTED_ROWS',
    'MCP_WRITE_REQUIRE_PLAN',
    'MCP_PRIVACY_BYPASS',
    'MCP_PRIVACY_BYPASS_ACK',
    'MCP_CONFIRM_REQUIRED',
  ]) {
    delete process.env[k];
  }
  resetPrivacyBypassStartupLogForTests();
}

test.beforeEach(() => clearProductivityEnv());

test('défauts protégés', () => {
  const cfg = getMcpConfig();
  assert.equal(isMcpSqlWriteEnabled(), false);
  assert.equal(isMcpSqlDdlEnabled(), false);
  assert.equal(isMcpWriteRequirePlan(), true);
  assert.equal(isMcpConfirmRequired(), true);
  assert.equal(isMcpPrivacyBypassActive(), false);
  assert.equal(cfg.sqlWriteEnabled, false);
  assert.equal(cfg.sqlDdlEnabled, false);
  assert.equal(cfg.directWriteEnabled, false); // write on + require plan
  assert.equal(cfg.sqlMaxAffectedRows, 100);
  assert.equal(cfg.privacyBypassActive, false);
  assert.equal(cfg.confirmRequired, true);
});

test('chaque drapeau dans les deux positions', () => {
  process.env.MCP_SQL_WRITE_ENABLED = 'true';
  assert.equal(getMcpConfig().sqlWriteEnabled, true);
  process.env.MCP_SQL_WRITE_ENABLED = 'false';
  assert.equal(getMcpConfig().sqlWriteEnabled, false);

  process.env.MCP_SQL_DDL_ENABLED = 'true';
  assert.equal(getMcpConfig().sqlDdlEnabled, true);

  process.env.MCP_WRITE_REQUIRE_PLAN = 'false';
  assert.equal(getMcpConfig().writeRequirePlan, false);
  assert.equal(getMcpConfig().directWriteEnabled, true); // write défaut true

  process.env.MCP_WRITE_ENABLED = 'false';
  assert.equal(getMcpConfig().directWriteEnabled, false);
  delete process.env.MCP_WRITE_ENABLED;

  process.env.MCP_CONFIRM_REQUIRED = 'false';
  assert.equal(getMcpConfig().confirmRequired, false);

  process.env.MCP_SQL_MAX_AFFECTED_ROWS = '50';
  assert.equal(getMcpConfig().sqlMaxAffectedRows, 50);
  process.env.MCP_SQL_MAX_AFFECTED_ROWS = '999999';
  assert.equal(getMcpConfig().sqlMaxAffectedRows, 100); // hors bornes → défaut
});

test('parsePrivacyBypassAck : formats', () => {
  assert.equal(parsePrivacyBypassAck('').ok, false);
  assert.equal(parsePrivacyBypassAck('2026-13-01').ok, false);
  assert.equal(parsePrivacyBypassAck('2026-02-30').ok, false);
  assert.equal(parsePrivacyBypassAck('pas-une-date').ok, false);
  const future = new Date();
  future.setUTCDate(future.getUTCDate() + 5);
  const fut = future.toISOString().slice(0, 10);
  assert.equal(parsePrivacyBypassAck(fut).ok, false);
  assert.equal(parsePrivacyBypassAck(fut).reason, 'date_future');
  assert.deepEqual(parsePrivacyBypassAck('2026-01-15'), { ok: true, date: '2026-01-15' });
});

test('bypass inactif sans ACK même si MCP_PRIVACY_BYPASS=true', () => {
  process.env.MCP_PRIVACY_BYPASS = 'true';
  delete process.env.MCP_PRIVACY_BYPASS_ACK;
  const s = privacyBypassStatus();
  assert.equal(s.requested, true);
  assert.equal(s.active, false);
  assert.equal(s.reason, 'absent');
  assert.equal(isMcpPrivacyBypassActive(), false);
});

test('bypass actif avec ACK valide', () => {
  process.env.MCP_PRIVACY_BYPASS = 'true';
  process.env.MCP_PRIVACY_BYPASS_ACK = '2026-01-15';
  assert.equal(isMcpPrivacyBypassActive(), true);
  assert.equal(getMcpConfig().privacyBypassActive, true);
});

test('journal de démarrage si bypass sans ACK', () => {
  process.env.MCP_PRIVACY_BYPASS = 'true';
  delete process.env.MCP_PRIVACY_BYPASS_ACK;
  resetPrivacyBypassStartupLogForTests();
  const status = logPrivacyBypassStartupStatus();
  assert.equal(status.active, false);
  assert.equal(status.reason, 'absent');
  // Second appel : pas de re-log (idempotent).
  const again = logPrivacyBypassStartupStatus();
  assert.equal(again.active, false);
});
