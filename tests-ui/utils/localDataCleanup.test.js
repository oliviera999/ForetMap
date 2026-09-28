import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  clearLocalDataForAccount,
  countPendingLocalActions,
  pendingLossConfirmationMessage,
  purgeCachedUserMedia,
} from '../../src/utils/localDataCleanup.js';
import {
  TASK_DONE_QUEUE_STORAGE_KEY,
  enqueueTaskDone,
  loadTaskDoneQueue,
  newTaskDoneClientUuid,
} from '../../src/utils/taskDoneQueue.js';
import { JOURNAL_DRAFT_QUEUE_STORAGE_KEY } from '../../src/utils/journalDraftQueue.js';
import { VISIT_SEEN_QUEUE_STORAGE_KEY } from '../../src/utils/visitProgressClient.js';
import { PEDAGO_SESSION_STORAGE_KEY } from '../../src/utils/pedagoSessionScope.js';

const done = (userId) => ({
  user_id: userId,
  task_id: `task-${userId}`,
  task_title: 'Arroser la mare',
  client_uuid: newTaskDoneClientUuid(),
  comment: 'Fait avec Léa',
  student_id: userId,
  first_name: 'Nour',
  last_name: 'B.',
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('nettoyage local à la déconnexion (audit RGPD S-8)', () => {
  test('compte les actions en attente du compte, pas celles des autres', () => {
    enqueueTaskDone(done('u1'));
    enqueueTaskDone(done('u2'));
    localStorage.setItem(
      JOURNAL_DRAFT_QUEUE_STORAGE_KEY,
      JSON.stringify([{ user_id: 'u1', client_uuid: 'draft-0001', title: 'Brouillon' }]),
    );
    localStorage.setItem(
      VISIT_SEEN_QUEUE_STORAGE_KEY,
      JSON.stringify([{ target_type: 'zone', target_id: 'z1', seen: true, updated_at: 1 }]),
    );
    expect(countPendingLocalActions('u1')).toBe(3);
    expect(countPendingLocalActions('u2')).toBe(2);
    expect(countPendingLocalActions('')).toBe(1);
  });

  test('efface les données du compte et laisse celles des autres comptes', () => {
    enqueueTaskDone(done('u1'));
    enqueueTaskDone(done('u2'));
    localStorage.setItem(
      JOURNAL_DRAFT_QUEUE_STORAGE_KEY,
      JSON.stringify([{ user_id: 'u1', client_uuid: 'draft-0001', title: 'Brouillon' }]),
    );
    localStorage.setItem(VISIT_SEEN_QUEUE_STORAGE_KEY, JSON.stringify([{ target_type: 'zone' }]));
    sessionStorage.setItem(PEDAGO_SESSION_STORAGE_KEY, JSON.stringify({ id: 's1' }));
    localStorage.setItem('foretmap_active_tab', 'map');

    clearLocalDataForAccount('u1');

    expect(loadTaskDoneQueue().map((q) => q.user_id)).toEqual(['u2']);
    expect(localStorage.getItem(JOURNAL_DRAFT_QUEUE_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(VISIT_SEEN_QUEUE_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem(PEDAGO_SESSION_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem('foretmap_active_tab')).toBe('map');
    expect(countPendingLocalActions('u1')).toBe(0);
  });

  test('une file vidée disparaît du stockage', () => {
    enqueueTaskDone(done('u1'));
    clearLocalDataForAccount('u1');
    expect(localStorage.getItem(TASK_DONE_QUEUE_STORAGE_KEY)).toBeNull();
  });

  test('message de confirmation seulement s’il reste des actions', () => {
    expect(pendingLossConfirmationMessage(0)).toBeNull();
    expect(pendingLossConfirmationMessage(1)).toMatch(/^1 action .* elle sera effacée/);
    expect(pendingLossConfirmationMessage(3)).toMatch(/^3 actions .* elles seront effacées/);
  });
});

describe('purgeCachedUserMedia', () => {
  let originalCaches;
  beforeEach(() => {
    originalCaches = globalThis.caches;
  });
  afterEach(() => {
    globalThis.caches = originalCaches;
  });

  test('retire les photos déposées (/uploads/) et garde bundles et icônes', async () => {
    const entries = [
      new Request('https://app.example/uploads/avatars/u1.jpg'),
      new Request('https://app.example/uploads/tasks/r.webp'),
      new Request('https://app.example/assets/index-abc.js'),
      new Request('https://app.example/icon.svg'),
    ];
    const deleted = [];
    const cache = {
      keys: vi.fn(async () => entries),
      delete: vi.fn(async (req) => {
        deleted.push(new URL(req.url).pathname);
        return true;
      }),
    };
    globalThis.caches = { keys: async () => ['foretmap-v1'], open: async () => cache };

    expect(await purgeCachedUserMedia()).toBe(2);
    expect(deleted).toEqual(['/uploads/avatars/u1.jpg', '/uploads/tasks/r.webp']);
  });

  test('ne rejette jamais sans Cache Storage', async () => {
    globalThis.caches = undefined;
    expect(await purgeCachedUserMedia()).toBe(0);
  });
});
