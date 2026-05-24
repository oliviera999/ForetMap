import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { AppGL } from '../../src/gl/AppGL.jsx';

const apiGlMock = vi.fn();
let gameEventHandler = null;

vi.mock('../../src/gl/services/apiGL.js', async () => {
  const actual = await vi.importActual('../../src/gl/services/apiGL.js');
  return {
    ...actual,
    apiGL: (...args) => apiGlMock(...args),
  };
});

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: (event, handler) => {
      if (event === 'gl:game:event') gameEventHandler = handler;
    },
    emit: vi.fn(),
    close: vi.fn(),
  })),
}));

describe('AppGL', () => {
  beforeEach(() => {
    localStorage.clear();
    gameEventHandler = null;
    apiGlMock.mockReset();
    apiGlMock.mockImplementation((path) => {
      if (path === '/api/gl/chapters') return Promise.resolve([]);
      if (path === '/api/gl/auth/config') {
        return Promise.resolve({
          modules: {
            mascotPacksEnabled: false,
            contextCommentsEnabled: false,
            forumEnabled: false,
            notificationsEnabled: true,
            tutorialsEnabled: false,
            helpEnabled: false,
            journalEnabled: false,
            kingdomMapEnabled: false,
          },
        });
      }
      if (path === '/api/gl/auth/me') {
        return Promise.resolve({
          auth: {
            product: 'gl',
            userType: 'gl_player',
            userId: '7',
            roleSlug: 'gl_player',
            displayName: 'Equipe test',
            classId: 1,
            teamId: 3,
            gameId: 42,
            permissions: ['gl.read', 'gl.action.request'],
          },
          profile: { id: 7, pseudo: 'Equipe test', activeGameId: 42 },
        });
      }
      if (path === '/api/gl/gameplay-settings') return Promise.resolve({ settings: {} });
      if (path === '/api/gl/games/42') {
        return Promise.resolve({
          game: { id: 42, name: 'Partie test', chapter_id: null },
          teams: [],
          markers: [],
          scores: {},
          pendingActions: [],
          events: [],
        });
      }
      return Promise.resolve(null);
    });
    localStorage.setItem('gl_session', JSON.stringify({
      token: 'token-test',
      auth: {
        product: 'gl',
        userType: 'gl_player',
        userId: '7',
        roleSlug: 'gl_player',
        displayName: 'Equipe test',
        classId: 1,
        teamId: 3,
        gameId: 42,
        permissions: ['gl.read', 'gl.action.request'],
      },
    }));
  });

  test('enregistre une seule notification par narration reçue', async () => {
    render(<AppGL />);

    await waitFor(() => expect(gameEventHandler).toBeTypeOf('function'));

    act(() => {
      gameEventHandler({
        gameId: 42,
        eventType: 'narration',
        payload: { text: 'Le pont grince.' },
      });
    });

    await waitFor(() => {
      const notifications = JSON.parse(localStorage.getItem('gl_notifications') || '[]');
      expect(notifications).toHaveLength(1);
      expect(notifications[0].id).toMatch(/^narration-/);
      expect(notifications[0].body).toBe('Le pont grince.');
    });
  });
});
