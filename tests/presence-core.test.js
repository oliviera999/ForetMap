'use strict';

require('./helpers/setup');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolvePresenceStatus,
  PRESENCE_STATUS,
  attachPresenceStatus,
  canSubscribePresence,
  presenceTrackedUserId,
  presenceStaffRoom,
  presenceKey,
  buildPresencePayload,
  RECENT_WINDOW_MS,
} = require('../lib/shared/presenceCore');

describe('presenceCore', () => {
  it('resolvePresenceStatus : online si socket, recent si last_seen récent, sinon offline', () => {
    const now = Date.parse('2026-09-13T12:00:00.000Z');
    assert.equal(
      resolvePresenceStatus({ socketConnected: true, lastSeen: null, nowMs: now }),
      PRESENCE_STATUS.ONLINE,
    );
    assert.equal(
      resolvePresenceStatus({
        socketConnected: false,
        lastSeen: new Date(now - 5 * 60 * 1000).toISOString(),
        nowMs: now,
      }),
      PRESENCE_STATUS.RECENT,
    );
    assert.equal(
      resolvePresenceStatus({
        socketConnected: false,
        lastSeen: new Date(now - RECENT_WINDOW_MS - 1000).toISOString(),
        nowMs: now,
      }),
      PRESENCE_STATUS.OFFLINE,
    );
  });

  it('attachPresenceStatus enrichit les lignes', () => {
    const now = Date.parse('2026-09-13T12:00:00.000Z');
    const rows = attachPresenceStatus(
      [
        { id: 'a', last_seen: new Date(now - 60_000).toISOString() },
        { id: 'b', last_seen: null },
      ],
      { onlineIds: new Set(['a']), nowMs: now },
    );
    assert.equal(rows[0].presence_status, PRESENCE_STATUS.ONLINE);
    assert.equal(rows[1].presence_status, PRESENCE_STATUS.OFFLINE);
    assert.ok(rows[0].presence_label);
  });

  it('canSubscribePresence / presenceTrackedUserId isolent staff et produits', () => {
    assert.equal(
      canSubscribePresence({ permissions: ['stats.read.all'], userType: 'teacher' }, 'foret'),
      true,
    );
    assert.equal(canSubscribePresence({ permissions: [], userType: 'student' }, 'foret'), false);
    assert.equal(
      canSubscribePresence({ permissions: ['gl.players.manage'], userType: 'gl_player' }, 'gl'),
      true,
    );
    assert.equal(presenceTrackedUserId({ userType: 'student', userId: 's1' }, 'foret'), 's1');
    assert.equal(presenceTrackedUserId({ userType: 'gl_guest', userId: 'g1' }, 'gl'), null);
  });

  it('rooms et payload', () => {
    assert.equal(presenceStaffRoom('foret'), 'presence:foret-staff');
    assert.equal(presenceStaffRoom('gl'), 'presence:gl-staff');
    assert.equal(presenceKey('gl', '42'), 'gl:42');
    const p = buildPresencePayload({
      product: 'foret',
      userId: 'u1',
      status: PRESENCE_STATUS.ONLINE,
    });
    assert.equal(p.userId, 'u1');
    assert.equal(p.status, 'online');
  });
});
