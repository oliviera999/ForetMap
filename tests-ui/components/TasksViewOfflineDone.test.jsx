import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

/**
 * « Tâche faite » gardée sans réseau (piste D) : à l'ouverture de la vue Tâches — et au retour
 * du réseau — la file du compte connecté est rejouée, la liste rafraîchie, l'élève prévenu.
 * Test de montage de `TasksView` (contextes et API bouchonnés).
 */

const dataState = {
  tasks: [],
  taskProjects: [],
  archivedTasks: [],
  archivedTaskProjects: [],
  zones: [],
  markers: [],
  tutorials: [],
  plants: [],
  activeMapId: 'foret',
};

vi.mock('../../src/services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(async () => ({})),
  getAuthUserId: vi.fn(() => 's1'),
}));
vi.mock('../../src/contexts/PublicSettingsContext.jsx', () => ({
  usePublicSettings: () => ({ modules: {} }),
}));
vi.mock('../../src/contexts/SessionContext.jsx', () => ({
  useSession: () => ({ isN3Affiliated: false, canParticipateContextComments: false }),
}));
vi.mock('../../src/contexts/DataContext.jsx', () => ({
  useData: () => dataState,
}));

const { api, NETWORK_FAILURE_CODE } = await import('../../src/services/api');
const { TasksView } = await import('../../src/components/tasks-views.jsx');
const { TASK_DONE_QUEUE_STORAGE_KEY, enqueueTaskDone, loadTaskDoneQueue } =
  await import('../../src/utils/taskDoneQueue.js');

const STUDENT = { id: 's1', first_name: 'Léa', last_name: 'Martin' };
const TASK = {
  id: 'task-9',
  title: 'Ramasser les feuilles',
  status: 'in_progress',
  map_id: 'foret',
  required_students: 1,
  assignments: [
    { id: 'a1', student_id: 's1', student_first_name: 'Léa', student_last_name: 'Martin' },
  ],
};

function renderView(onRefresh = vi.fn()) {
  render(
    <TasksView
      maps={[{ id: 'foret', label: 'Forêt' }]}
      isTeacher={false}
      student={STUDENT}
      canSelfAssignTasks
      onRefresh={onRefresh}
      onForceLogout={vi.fn()}
    />,
  );
  return onRefresh;
}

beforeEach(() => {
  api.mockReset();
  api.mockResolvedValue({});
  localStorage.removeItem(TASK_DONE_QUEUE_STORAGE_KEY);
  dataState.tasks = [TASK];
});

const queueTask = (overrides = {}) =>
  enqueueTaskDone({
    user_id: 's1',
    task_id: 'task-9',
    task_title: 'Ramasser les feuilles',
    client_uuid: 'done-test-0001',
    comment: 'Trois sacs',
    student_id: 's1',
    first_name: 'Léa',
    last_name: 'Martin',
    ...overrides,
  });

describe('TasksView — file « tâche faite » hors ligne', () => {
  test('à l’ouverture, le « fait » gardé part avec sa clé, la liste est rafraîchie', async () => {
    queueTask();
    const onRefresh = renderView();
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
    expect(api).toHaveBeenCalledWith('/api/tasks/task-9/done', 'POST', {
      comment: 'Trois sacs',
      client_uuid: 'done-test-0001',
      studentId: 's1',
      firstName: 'Léa',
      lastName: 'Martin',
    });
    expect(await screen.findByText(/Ta tâche notée sans réseau est bien partie/)).toBeTruthy();
    expect(loadTaskDoneQueue()).toHaveLength(0);
  });

  test('toujours pas de réseau : la carte montre l’attente, la file est intacte', async () => {
    queueTask();
    api.mockImplementation(async (path) => {
      if (String(path).endsWith('/done')) {
        throw Object.assign(new Error('Pas de réseau'), { code: NETWORK_FAILURE_CODE });
      }
      return {};
    });
    renderView();
    expect(await screen.findByText(/partira au retour du réseau/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Marquer termin/ })).toBeNull();
    expect(loadTaskDoneQueue()).toHaveLength(1);

    // Retour du réseau : l'événement `online` relance le rejeu.
    api.mockResolvedValue({});
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(loadTaskDoneQueue()).toHaveLength(0));
  });

  test('refus définitif : l’élève est prévenu, la tâche redevient marquable', async () => {
    queueTask();
    api.mockImplementation(async (path) => {
      if (String(path).endsWith('/done')) {
        throw Object.assign(new Error('Tâche archivée : action indisponible'), { status: 400 });
      }
      return {};
    });
    renderView();
    expect(
      await screen.findByText(
        /« Ramasser les feuilles » n’a pas pu être marquée faite : Tâche archivée/,
      ),
    ).toBeTruthy();
    expect(loadTaskDoneQueue()).toHaveLength(0);
    expect(screen.getByRole('button', { name: /Marquer termin/ })).toBeTruthy();
  });

  test('le « fait » d’un autre compte n’est jamais rejoué ici (tablette partagée)', async () => {
    queueTask({ user_id: 's2', student_id: 's2', client_uuid: 'done-other-001' });
    renderView();
    await act(async () => {});
    expect(api).not.toHaveBeenCalledWith(
      expect.stringContaining('/done'),
      expect.anything(),
      expect.anything(),
    );
    expect(loadTaskDoneQueue()).toHaveLength(1);
  });

  test('inscription sans réseau : pas de file, et l’élève sait pourquoi', async () => {
    dataState.tasks = [
      {
        id: 'task-10',
        title: 'Pailler les fraisiers',
        status: 'available',
        map_id: 'foret',
        required_students: 2,
        assignments: [],
      },
    ];
    api.mockImplementation(async (path) => {
      if (String(path).endsWith('/assign')) {
        throw Object.assign(new Error('Pas de réseau'), { code: NETWORK_FAILURE_CODE });
      }
      return {};
    });
    renderView();
    await act(async () => {
      screen.getByRole('button', { name: /Je m.en occupe/ }).click();
    });
    expect(
      await screen.findByText(
        'Pas de réseau : pour t’inscrire, il faut le réseau (les places sont comptées). Réessaie dans un moment.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/^Oups/)).toBeNull();
  });
});
