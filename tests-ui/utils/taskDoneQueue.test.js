import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  TASK_DONE_COMMENT_MAX,
  TASK_DONE_QUEUE_STORAGE_KEY,
  dismissTaskDone,
  enqueueTaskDone,
  flushTaskDoneQueue,
  loadTaskDoneQueue,
  newTaskDoneClientUuid,
  queuedTaskDoneIds,
  refusedTaskDoneItems,
  taskDoneAlreadyClosedMessage,
  taskDoneRequestBody,
} from '../../src/utils/taskDoneQueue.js';

const item = (overrides = {}) => ({
  user_id: 'u1',
  task_id: 'task-1',
  task_title: 'Arroser la mare',
  client_uuid: newTaskDoneClientUuid(),
  comment: 'Fait avec Léa',
  student_id: 'u1',
  first_name: 'Nour',
  last_name: 'B.',
  ...overrides,
});

beforeEach(() => {
  localStorage.removeItem(TASK_DONE_QUEUE_STORAGE_KEY);
});

describe('file « tâche faite » sans réseau', () => {
  test('garde le marquage et son commentaire, par compte', () => {
    expect(enqueueTaskDone(item())).toBe(true);
    expect(enqueueTaskDone(item({ user_id: 'u2', task_id: 'task-2', student_id: 'u2' }))).toBe(
      true,
    );
    expect([...queuedTaskDoneIds('u1')]).toEqual(['task-1']);
    expect([...queuedTaskDoneIds('u2')]).toEqual(['task-2']);
    expect(queuedTaskDoneIds('').size).toBe(0);
    expect(loadTaskDoneQueue()[0]).toMatchObject({ comment: 'Fait avec Léa' });
  });

  test('refuse une entrée incomplète ou un commentaire démesuré', () => {
    expect(enqueueTaskDone(item({ task_id: '' }))).toBe(false);
    expect(enqueueTaskDone(item({ comment: 'x'.repeat(TASK_DONE_COMMENT_MAX + 1) }))).toBe(false);
    expect(loadTaskDoneQueue()).toHaveLength(0);
  });

  test('corps de requête : clé d’idempotence et identité du n3beur', () => {
    const it = item();
    expect(taskDoneRequestBody(it)).toEqual({
      comment: 'Fait avec Léa',
      client_uuid: it.client_uuid,
      studentId: 'u1',
      firstName: 'Nour',
      lastName: 'B.',
    });
  });

  test('rejeu : un refus sans commentaire sort de la file et remonte à l’appelant', async () => {
    enqueueTaskDone(item({ task_id: 'task-ok' }));
    enqueueTaskDone(item({ task_id: 'task-archivee', task_title: 'Tâche archivée', comment: '' }));
    const send = vi.fn(async (it) => {
      if (it.task_id === 'task-archivee') {
        throw Object.assign(new Error('Tâche archivée : action indisponible'), { status: 400 });
      }
      return { status: 'done' };
    });
    const out = await flushTaskDoneQueue(send, 'u1');
    expect(out).toMatchObject({ synced: 1, dropped: 1, remaining: 0 });
    expect(out.refused[0]).toMatchObject({
      message: 'Tâche archivée : action indisponible',
      kept: false,
    });
    expect(out.sent.map((s) => s.response)).toEqual([{ status: 'done' }]);
    expect(loadTaskDoneQueue()).toHaveLength(0);
  });

  test('rejeu : un refus avec commentaire le garde, hors des envois et des marquages', async () => {
    const it = item({ comment: 'Trois sacs de feuilles' });
    enqueueTaskDone(it);
    const send = vi.fn(async () => {
      throw Object.assign(new Error('Tâche introuvable'), { status: 404 });
    });
    const out = await flushTaskDoneQueue(send, 'u1');
    expect(out).toMatchObject({ synced: 0, dropped: 0, remaining: 1 });
    expect(out.refused[0].kept).toBe(true);
    expect(refusedTaskDoneItems('u1')).toEqual([
      expect.objectContaining({
        client_uuid: it.client_uuid,
        comment: 'Trois sacs de feuilles',
        refused: true,
        error: 'Tâche introuvable',
      }),
    ]);
    // La tâche redevient marquable, et le commentaire n'est plus jamais renvoyé tout seul.
    expect(queuedTaskDoneIds('u1').size).toBe(0);
    await flushTaskDoneQueue(send, 'u1');
    expect(send).toHaveBeenCalledTimes(1);

    dismissTaskDone(it.client_uuid);
    expect(refusedTaskDoneItems('u1')).toEqual([]);
  });

  test('message « déjà validée / en pause » selon le statut renvoyé', () => {
    expect(taskDoneAlreadyClosedMessage('Arroser', 'validated')).toMatch(
      /« Arroser » avait déjà été validée/,
    );
    expect(taskDoneAlreadyClosedMessage('Arroser', 'on_hold')).toMatch(/mise en pause/);
    expect(taskDoneAlreadyClosedMessage('Arroser', null)).toBeNull();
    expect(taskDoneAlreadyClosedMessage('Arroser', 'done')).toBeNull();
  });
});
