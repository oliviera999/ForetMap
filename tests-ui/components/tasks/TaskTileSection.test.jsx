import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../../src/components/tasks/TaskTileCard.jsx', () => ({
  TaskTileCard: ({ t }) => <div data-testid={`task-tile-${t.id}`}>{t.title}</div>,
}));

import { TaskTileSection } from '../../../src/components/tasks/TaskTileSection.jsx';

const TASKS = [
  { id: '1', title: 'Semer' },
  { id: '2', title: 'Arroser' },
  { id: '3', title: 'Récolter' },
];

describe('TaskTileSection — flèches d’ordre global', () => {
  test('affiche les flèches et appelle onMoveTaskInSection', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    render(
      <TaskTileSection
        title="À faire"
        tasks={TASKS}
        sectionListClass="tasks-list"
        taskTileProps={{}}
        canReorderTasks
        onMoveTaskInSection={onMove}
      />,
    );
    expect(screen.getByRole('button', { name: 'Monter « Semer »' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Descendre « Semer »' }));
    expect(onMove).toHaveBeenCalledWith('1', 'down', TASKS);
    await user.click(screen.getByRole('button', { name: 'Monter « Récolter »' }));
    expect(onMove).toHaveBeenCalledWith('3', 'up', TASKS);
  });

  test('pas de flèches sans canReorderTasks', () => {
    render(
      <TaskTileSection
        title="À faire"
        tasks={TASKS}
        sectionListClass="tasks-list"
        taskTileProps={{}}
      />,
    );
    expect(screen.queryByRole('button', { name: /^Monter/ })).toBeNull();
  });
});
