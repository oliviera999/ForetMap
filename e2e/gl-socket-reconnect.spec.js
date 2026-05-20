const { test, expect } = require('@playwright/test');
const { io: clientIo } = require('socket.io-client');
const { seedGlScenario } = require('./fixtures/gl.fixture');

test.describe('GL Socket reconnect', () => {
  test('le joueur reconnecté reçoit les nouveaux events', async ({ request }) => {
    const seeded = await seedGlScenario('socket-reconnect');
    const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';

    let received = [];
    const socket = clientIo(baseURL, {
      transports: ['polling'],
      auth: { token: seeded.playerToken },
      query: { gameId: String(seeded.gameId) },
      forceNew: true,
    });

    await new Promise((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
      setTimeout(() => reject(new Error('socket connect timeout')), 5000);
    });
    socket.emit('subscribe:gl-game', { gameId: String(seeded.gameId) });

    socket.on('gl:game:event', (payload) => {
      received.push(payload);
    });

    socket.disconnect();

    const socket2 = clientIo(baseURL, {
      transports: ['polling'],
      auth: { token: seeded.playerToken },
      query: { gameId: String(seeded.gameId) },
      forceNew: true,
    });
    await new Promise((resolve, reject) => {
      socket2.once('connect', resolve);
      socket2.once('connect_error', reject);
      setTimeout(() => reject(new Error('socket reconnect timeout')), 5000);
    });
    socket2.emit('subscribe:gl-game', { gameId: String(seeded.gameId) });
    socket2.on('gl:game:event', (payload) => {
      received.push(payload);
    });

    const eventRes = await request.post(`/api/gl/games/${seeded.gameId}/events`, {
      headers: { Authorization: `Bearer ${seeded.adminToken}` },
      data: { teamId: seeded.teamId, eventType: 'move', payload: { markerId: 1 } },
    });
    expect(eventRes.status()).toBe(201);

    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(received.length).toBeGreaterThan(0);
    socket2.disconnect();
  });
});
