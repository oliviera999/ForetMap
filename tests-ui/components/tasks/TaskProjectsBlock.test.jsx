import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../../src/components/tasks/TaskTileCard.jsx', () => ({
  TaskTileCard: ({ t }) => <div data-testid={`task-tile-${t.id}`}>{t.title}</div>,
}));

vi.mock('../../../src/components/context-comments', () => ({
  ContextComments: () => null,
}));

vi.mock('../../../src/components/MarkdownContent.jsx', () => ({
  MarkdownContent: ({ children }) => <div>{children}</div>,
}));

vi.mock('../../../src/components/TutorialPreviewModal', () => ({
  tutorialPreviewCanEmbed: () => false,
}));

import { TaskProjectsBlock } from '../../../src/components/tasks/TaskProjectsBlock.jsx';

const PROJECTS = [
  { id: 'p1', title: 'Semis de printemps', status: 'active', map_id: 'foret', map_label: 'Forêt' },
  { id: 'p2', title: 'Chantier compost', status: 'active', map_id: 'foret', map_label: 'Forêt' },
];

function buildProjectTasksById() {
  return new Map([
    [
      'p1',
      [
        { id: 't1', title: 'Préparer les godets' },
        { id: 't2', title: 'Semer les radis' },
      ],
    ],
    ['p2', [{ id: 't3', title: 'Tourner le compost' }]],
  ]);
}

function renderBlock(overrides = {}) {
  return render(
    <TaskProjectsBlock
      visibleProjects={PROJECTS}
      projectTasksById={buildProjectTasksById()}
      sectionListClass="tasks-list"
      isTeacher={false}
      maps={[]}
      contextCommentsEnabled={false}
      canParticipateContextComments={false}
      setEditProject={() => {}}
      setShowProjectForm={() => {}}
      setNewTaskDefaultProjectId={() => {}}
      setEditTask={() => {}}
      setDuplicateTask={() => {}}
      setShowForm={() => {}}
      setShowProposalForm={() => {}}
      setProjectStatus={() => {}}
      validateProject={() => {}}
      duplicateProject={() => {}}
      deleteProject={() => {}}
      archiveProject={() => {}}
      loading={{}}
      taskTileProps={{}}
      openTasksTutorialPreview={() => {}}
      {...overrides}
    />,
  );
}

describe('TaskProjectsBlock', () => {
  test('projets repliés par défaut : les tâches sont masquées', () => {
    renderBlock();
    expect(screen.getByText('Semis de printemps')).toBeInTheDocument();
    expect(screen.getByText('Chantier compost')).toBeInTheDocument();
    expect(screen.queryByTestId('task-tile-t1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('task-tile-t2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('task-tile-t3')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Semis de printemps/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  test('un clic sur le titre déploie les tâches du projet', async () => {
    const user = userEvent.setup();
    renderBlock();
    await user.click(screen.getByRole('button', { name: /Semis de printemps/i }));
    expect(screen.getByRole('button', { name: /Semis de printemps/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByTestId('task-tile-t1')).toHaveTextContent('Préparer les godets');
    expect(screen.getByTestId('task-tile-t2')).toHaveTextContent('Semer les radis');
    expect(screen.queryByTestId('task-tile-t3')).not.toBeInTheDocument();
  });

  test('un second clic replie le projet', async () => {
    const user = userEvent.setup();
    renderBlock();
    const toggle = screen.getByRole('button', { name: /Semis de printemps/i });
    await user.click(toggle);
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('task-tile-t1')).not.toBeInTheDocument();
  });
});
