// « Tâche faite » sans réseau (piste D, audit du 25/09/2026, § 1.4.6 et § 2.4).
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../../../src/services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
  getAuthUserId: vi.fn(() => 'u1'),
}));
vi.mock('../../../src/shared/platform/image', async (importOriginal) => ({
  ...(await importOriginal()),
  compressImageWithPreset: vi.fn(async () => 'data:image/jpeg;base64,AAAA'),
  isLikelyImageFile: () => true,
}));

const { api, getAuthUserId, NETWORK_FAILURE_CODE } = await import('../../../src/services/api');
const { LogModal, TASK_DONE_OFFLINE_PHOTO_MESSAGE } =
  await import('../../../src/components/tasks/TaskLogModals.jsx');
const { TASK_DONE_QUEUE_STORAGE_KEY, loadTaskDoneQueue } =
  await import('../../../src/utils/taskDoneQueue.js');
const { taskLogCommentDraftKey } = await import('../../../src/utils/taskLogDraft.js');

const TASK = { id: 'task-7', title: 'Désherber le potager' };
const STUDENT = { id: 'u1', first_name: 'Nour', last_name: 'B.' };
const networkError = () =>
  Object.assign(new Error('Pas de réseau pour l’instant.'), { code: NETWORK_FAILURE_CODE });

function renderModal(props = {}) {
  const handlers = { onClose: vi.fn(), onDone: vi.fn(), onQueued: vi.fn() };
  render(<LogModal task={TASK} student={STUDENT} offlineAllowed {...handlers} {...props} />);
  return handlers;
}

const submit = () =>
  fireEvent.click(screen.getByRole('button', { name: /Marquer comme terminée/ }));

beforeEach(() => {
  api.mockReset();
  getAuthUserId.mockReturnValue('u1');
  localStorage.removeItem(TASK_DONE_QUEUE_STORAGE_KEY);
  sessionStorage.setItem(taskLogCommentDraftKey(TASK.id), 'Rangs 1 à 3 faits');
});
afterEach(() => {
  sessionStorage.clear();
});

describe('LogModal sans réseau', () => {
  test('en ligne : la clé d’idempotence part avec le rapport', async () => {
    api.mockResolvedValue({ status: 'done' });
    const { onDone, onClose } = renderModal();
    submit();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [, , body] = api.mock.calls[0];
    expect(body.client_uuid).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    expect(body.comment).toBe('Rangs 1 à 3 faits');
    expect(onDone).toHaveBeenCalled();
  });

  test('pas de réseau : le marquage et le commentaire sont gardés, la modale se ferme', async () => {
    api.mockRejectedValue(networkError());
    const { onQueued, onClose, onDone } = renderModal();
    submit();
    await waitFor(() => expect(onQueued).toHaveBeenCalledWith(TASK));
    expect(onClose).toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    const [queued] = loadTaskDoneQueue();
    expect(queued).toMatchObject({
      user_id: 'u1',
      task_id: 'task-7',
      comment: 'Rangs 1 à 3 faits',
      student_id: 'u1',
    });
    // La clé gardée est celle qui était partie : le serveur reconnaîtra le renvoi.
    expect(queued.client_uuid).toBe(api.mock.calls[0][2].client_uuid);
    expect(sessionStorage.getItem(taskLogCommentDraftKey(TASK.id))).toBeNull();
  });

  test('un second essai en ligne réutilise la même clé (réponse perdue)', async () => {
    api.mockRejectedValueOnce(new Error('Erreur serveur')).mockResolvedValueOnce({});
    const { onClose } = renderModal({ offlineAllowed: false });
    submit();
    await screen.findByRole('alert');
    submit();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(api.mock.calls[1][2].client_uuid).toBe(api.mock.calls[0][2].client_uuid);
  });

  test('photo jointe : rien n’est gardé, l’élève est prévenu et garde sa saisie', async () => {
    api.mockRejectedValue(networkError());
    const { onQueued, onClose } = renderModal();
    const input = document.querySelector('input[type="file"]');
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'p.jpg', { type: 'image/jpeg' })] },
    });
    await screen.findByAltText('preview');
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(TASK_DONE_OFFLINE_PHOTO_MESSAGE);
    expect(onQueued).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(loadTaskDoneQueue()).toHaveLength(0);
    expect(screen.getByRole('button', { name: /Marquer comme terminée/ })).not.toBeDisabled();
  });

  test('tutoriel lié non lu (offlineAllowed faux) : pas de file, message réseau', async () => {
    api.mockRejectedValue(networkError());
    const { onQueued, onClose } = renderModal({ offlineAllowed: false });
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Pas de réseau');
    expect(onQueued).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(loadTaskDoneQueue()).toHaveLength(0);
  });

  test('sans compte identifié : pas de file (tablette partagée)', async () => {
    getAuthUserId.mockReturnValue('');
    api.mockRejectedValue(networkError());
    const { onQueued } = renderModal();
    submit();
    await screen.findByRole('alert');
    expect(onQueued).not.toHaveBeenCalled();
    expect(loadTaskDoneQueue()).toHaveLength(0);
  });
});
