import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Masquage par défaut des tâches et projets VALIDÉS dans la vue Tâches, sur le modèle
 * des archives : ils n'apparaissent que si le filtre de statut les demande. Test de
 * montage de `TasksView` (contextes et API bouchonnés) — la logique pure est couverte
 * par `tests-ui/utils/taskSectioning.test.js`.
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
vi.mock('../../src/components/tasks/TaskImportPanel.jsx', () => ({
  TaskImportPanel: () => null,
}));

const { TasksView } = await import('../../src/components/tasks-views.jsx');

const TASKS = [
  { id: 't-todo', title: 'Arroser les fraisiers', status: 'available', map_id: 'foret' },
  { id: 't-ok', title: 'Tailler la haie', status: 'validated', map_id: 'foret' },
];
const PROJECTS = [
  { id: 'p-run', title: 'Verger en cours', status: 'active', map_id: 'foret' },
  { id: 'p-ok', title: 'Mare terminée', status: 'validated', map_id: 'foret' },
];

/**
 * Texte des SECTIONS rendues uniquement : le sélecteur « projet » de la barre de filtres
 * liste tous les projets (y compris validés) en `<option>`, ce qui piégerait une recherche
 * de texte sur tout le document.
 */
function sectionsText(container) {
  return [...container.querySelectorAll('.tasks-section')].map((el) => el.textContent).join(' | ');
}

function renderTasksView() {
  return render(
    <TasksView
      maps={[{ id: 'foret', label: 'Forêt' }]}
      isTeacher
      student={null}
      onRefresh={vi.fn()}
      onForceLogout={vi.fn()}
      hasPermissionInRole={() => true}
    />,
  );
}

beforeEach(() => {
  dataState.tasks = TASKS;
  dataState.taskProjects = PROJECTS;
});

describe('TasksView — validés masqués par défaut', () => {
  test('à l’ouverture : ni la tâche validée ni le projet validé ne sont rendus', () => {
    const { container } = renderTasksView();
    const sections = sectionsText(container);
    expect(sections).toContain('Arroser les fraisiers');
    expect(sections).toContain('Verger en cours');
    expect(sections).not.toContain('Tailler la haie');
    expect(sections).not.toContain('Mare terminée');
    expect(sections).not.toContain('Projets validés');
  });

  test('une invite annonce ce qui est masqué et le nombre est exact', () => {
    renderTasksView();
    expect(
      screen.getByText(/1 tâche validée masquée et 1 projet validé masqué\./),
    ).toBeInTheDocument();
  });

  test('« Afficher les validés » ramène la tâche et le projet validés', async () => {
    const { container } = renderTasksView();
    await userEvent.click(screen.getByRole('button', { name: /Afficher les validés/ }));
    const sections = sectionsText(container);
    expect(sections).toContain('Tailler la haie');
    expect(sections).toContain('Projets validés (1)');
    expect(sections).toContain('Mare terminée');
    // Le filtre de statut « Validée » ne garde QUE les validés : l'invite disparaît.
    expect(screen.queryByText(/masquée/)).toBeNull();
    expect(sections).not.toContain('Arroser les fraisiers');
  });

  test('rien à masquer → aucune invite', () => {
    dataState.tasks = [TASKS[0]];
    dataState.taskProjects = [PROJECTS[0]];
    renderTasksView();
    expect(screen.queryByText(/masquée|masqué/)).toBeNull();
  });
});
