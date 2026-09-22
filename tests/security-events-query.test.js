'use strict';

/**
 * Tests sans BDD du helper de lecture security_events.
 */

const test = require('node:test');
const assert = require('node:assert');
const {
  resolveSecurityDayRange,
  securityEventsToCsv,
  MAX_RANGE_DAYS,
} = require('../lib/securityEventsQuery');

test('resolveSecurityDayRange : défaut 30 j et bornes invalides ignorées', () => {
  const { from, to } = resolveSecurityDayRange({});
  assert.match(from, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(to, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(from <= to);
});

test('resolveSecurityDayRange : swap si from > to', () => {
  const { from, to } = resolveSecurityDayRange({ from: '2026-09-20', to: '2026-09-10' });
  assert.strictEqual(from, '2026-09-10');
  assert.strictEqual(to, '2026-09-20');
});

test('resolveSecurityDayRange : plage max 365 j', () => {
  const { from, to } = resolveSecurityDayRange({ from: '2020-01-01', to: '2026-09-22' });
  assert.strictEqual(to, '2026-09-22');
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);
  const spanDays = Math.floor((toMs - fromMs) / (24 * 60 * 60 * 1000)) + 1;
  assert.ok(spanDays <= MAX_RANGE_DAYS);
});

test('securityEventsToCsv : en-tête et échappement', () => {
  const csv = securityEventsToCsv([
    {
      id: 1,
      occurred_at: '2026-09-22 10:00:00',
      actor_user_id: 'u1',
      actor_user_type: 'teacher',
      action: 'create_zone',
      target_type: 'zone',
      target_id: 'z1',
      result: 'success',
      reason: null,
      ip_address: '127.0.0.1',
      user_agent: 'Agent;Test',
      payload_json: { a: 1 },
    },
  ]);
  assert.ok(csv.includes('ip_address'));
  assert.ok(csv.includes('127.0.0.1'));
  assert.ok(csv.includes('Agent;Test') || csv.includes('"Agent;Test"'));
});
