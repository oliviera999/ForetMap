import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('../../src/services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(async () => ({})),
  getAuthUserId: vi.fn(() => 'u1'),
  getAuthToken: vi.fn(() => 'jeton'),
}));

const { api } = await import('../../src/services/api');
const { useOfflineOutbox } = await import('../../src/hooks/useOfflineOutbox.js');
const { enqueueTaskDone, listQueuedTaskDone } = await import('../../src/utils/taskDoneQueue.js');
const { notifyOutboxChanged } = await import('../../src/services/offlineOutbox.js');

const queueDone = (overrides = {}) =>
  enqueueTaskDone({
    user_id: 'u1',
    task_id: 't1',
    task_title: 'Arroser',
    client_uuid: 'done-0001',
    comment: '',
    student_id: 'u1',
    ...overrides,
  });

beforeEach(() => {
  api.mockReset();
  api.mockResolvedValue({});
});

describe('useOfflineOutbox', () => {
  test('au montage : rejoue, annonce le succès une fois et demande le rechargement', async () => {
    queueDone();
    const onToast = vi.fn();
    const onSynced = vi.fn();
    const { result } = renderHook(() => useOfflineOutbox({ userId: 'u1', onToast, onSynced }));
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Ta tâche notée sans réseau est bien partie ✓'),
    );
    expect(onToast).toHaveBeenCalledTimes(1);
    expect(onSynced).toHaveBeenCalledTimes(1);
    expect(listQueuedTaskDone('u1')).toHaveLength(0);
    await waitFor(() => expect(result.current.pendingCount).toBe(0));
  });

  test('compte les écritures en attente et refusées, suit les changements', async () => {
    api.mockRejectedValue(Object.assign(new Error('Pas de réseau'), { code: 'NETWORK_FAILURE' }));
    queueDone();
    const { result } = renderHook(() => useOfflineOutbox({ userId: 'u1' }));
    expect(result.current.pendingCount).toBe(1);
    act(() => {
      queueDone({ client_uuid: 'done-0002', task_id: 't2' });
      notifyOutboxChanged({ reason: 'queued', kind: 'task_done' });
    });
    expect(result.current.pendingCount).toBe(2);
    expect(result.current.refusedCount).toBe(0);
  });

  test('désactivé (prof, invité) : ni liste ni rejeu', async () => {
    queueDone();
    const { result } = renderHook(() => useOfflineOutbox({ userId: 'u1', enabled: false }));
    await act(async () => {});
    expect(result.current.entries).toEqual([]);
    expect(api).not.toHaveBeenCalled();
  });

  test('retour du réseau : nouvel essai', async () => {
    api.mockRejectedValue(Object.assign(new Error('Pas de réseau'), { code: 'NETWORK_FAILURE' }));
    queueDone();
    const onToast = vi.fn();
    renderHook(() => useOfflineOutbox({ userId: 'u1', onToast }));
    await waitFor(() => expect(api).toHaveBeenCalled());
    api.mockResolvedValue({});
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(listQueuedTaskDone('u1')).toHaveLength(0));
    await waitFor(() => expect(onToast).toHaveBeenCalled());
  });
});
