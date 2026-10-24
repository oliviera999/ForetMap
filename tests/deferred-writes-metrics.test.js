'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const logMetrics = require('../lib/logMetrics');
const { parseDeferredWrite } = require('../lib/httpRequestLog');

function fakeReq(method, headers = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { method, get: (name) => lower[String(name).toLowerCase()] };
}

describe('parseDeferredWrite', () => {
  const now = 1_800_000_000_000;

  it('ignore une requête sans en-tête de file', () => {
    assert.equal(parseDeferredWrite(fakeReq('POST'), now), null);
  });

  it('ignore les lectures', () => {
    assert.equal(
      parseDeferredWrite(fakeReq('GET', { 'X-Foretmap-Queued-At': String(now - 5000) }), now),
      null,
    );
  });

  it('calcule le retard et le canal de rejeu', () => {
    assert.deepEqual(
      parseDeferredWrite(
        fakeReq('POST', {
          'X-Foretmap-Queued-At': String(now - 5000),
          'X-Foretmap-Replay': 'background-sync',
        }),
        now,
      ),
      { delayMs: 5000, via: 'background-sync' },
    );
    assert.deepEqual(
      parseDeferredWrite(
        fakeReq('POST', { 'X-Foretmap-Queued-At': String(now - 10), 'X-Foretmap-Replay': 'autre' }),
        now,
      ),
      { delayMs: 10, via: 'page' },
    );
  });

  it('refuse une valeur mal formée ou dans le futur', () => {
    assert.equal(parseDeferredWrite(fakeReq('POST', { 'X-Foretmap-Queued-At': 'abc' }), now), null);
    assert.equal(
      parseDeferredWrite(fakeReq('POST', { 'X-Foretmap-Queued-At': String(now + 60_000) }), now),
      null,
    );
  });
});

describe('logMetrics.recordDeferredWrite', () => {
  beforeEach(() => logMetrics.resetDeferredWritesForTests());

  it('agrège nombre, retards, canal, refus et gabarits de route', () => {
    logMetrics.recordDeferredWrite({
      delayMs: 1000,
      route: '/api/tasks/:id/done',
      via: 'page',
      statusCode: 200,
    });
    logMetrics.recordDeferredWrite({
      delayMs: 3000,
      route: '/api/tasks/:id/done',
      via: 'background-sync',
      statusCode: 400,
    });
    logMetrics.recordDeferredWrite({
      delayMs: 2000,
      route: '/api/observations',
      via: 'page',
      statusCode: 201,
    });
    const m = logMetrics.getMetrics().deferredWrites;
    assert.equal(m.count, 3);
    assert.equal(m.refused, 1);
    assert.equal(m.viaBackgroundSync, 1);
    assert.equal(m.avgDelayMs, 2000);
    assert.equal(m.maxDelayMs, 3000);
    assert.deepEqual(m.byRoute, { '/api/tasks/:id/done': 2, '/api/observations': 1 });
  });

  it('ignore un retard négatif ou aberrant (> 30 jours)', () => {
    logMetrics.recordDeferredWrite({ delayMs: -1, route: '/x' });
    logMetrics.recordDeferredWrite({ delayMs: 31 * 24 * 3600 * 1000, route: '/x' });
    logMetrics.recordDeferredWrite({ delayMs: Number.NaN, route: '/x' });
    assert.equal(logMetrics.getMetrics().deferredWrites.count, 0);
  });

  it('borne le nombre de routes distinctes suivies', () => {
    for (let i = 0; i < 50; i += 1) {
      logMetrics.recordDeferredWrite({ delayMs: 1, route: `/r${i}` });
    }
    const m = logMetrics.getMetrics().deferredWrites;
    assert.equal(m.count, 50);
    assert.equal(Object.keys(m.byRoute).length, 30);
  });
});
