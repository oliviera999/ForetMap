import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecurringSeriesOverview } from '../../src/components/tasks/RecurringSeriesOverview.jsx';

vi.mock('../../src/services/api.js', () => ({
  api: vi.fn().mockResolvedValue({ today: { today: '2026-09-16', isOpen: true } }),
}));

const TASKS = [
  {
    id: 1,
    title: 'Arroser la serre',
    recurrence: 'weekly',
    recurrence_series_id: 'S1',
    due_date: '2026-09-16',
    status: 'todo',
  },
  {
    id: 2,
    title: 'Tailler les fruitiers',
    recurrence: 'monthly',
    recurrence_series_id: 'S2',
    due_date: '2026-09-30',
    status: 'todo',
  },
];

describe('RecurringSeriesOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('arrive replié : seul l’en-tête est visible', () => {
    render(<RecurringSeriesOverview isTeacher tasks={TASKS} onToggleRecurringFilter={() => {}} />);
    const head = screen.getByRole('button', { name: /Séries récurrentes/ });
    expect(head).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Arroser la serre')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Filtrer récurrentes' })).not.toBeInTheDocument();
  });

  test('se déplie au clic sur l’en-tête, et se replie au clic suivant', async () => {
    const user = userEvent.setup();
    render(<RecurringSeriesOverview isTeacher tasks={TASKS} onToggleRecurringFilter={() => {}} />);
    const head = screen.getByRole('button', { name: /Séries récurrentes/ });

    await user.click(head);
    expect(head).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Arroser la serre')).toBeInTheDocument();
    expect(screen.getByText('Tailler les fruitiers')).toBeInTheDocument();

    await user.click(head);
    expect(head).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Arroser la serre')).not.toBeInTheDocument();
  });

  test('le filtre récurrentes n’est jamais appliqué tout seul, et il est réversible', async () => {
    const user = userEvent.setup();
    const onToggleRecurringFilter = vi.fn();
    const { rerender } = render(
      <RecurringSeriesOverview
        isTeacher
        tasks={TASKS}
        onToggleRecurringFilter={onToggleRecurringFilter}
      />,
    );
    expect(onToggleRecurringFilter).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Séries récurrentes/ }));
    const filterBtn = screen.getByRole('button', { name: 'Filtrer récurrentes' });
    expect(filterBtn).toHaveAttribute('aria-pressed', 'false');
    await user.click(filterBtn);
    expect(onToggleRecurringFilter).toHaveBeenCalledTimes(1);

    rerender(
      <RecurringSeriesOverview
        isTeacher
        tasks={TASKS}
        isRecurringFilterActive
        onToggleRecurringFilter={onToggleRecurringFilter}
      />,
    );
    expect(screen.getByRole('button', { name: 'Retirer le filtre récurrentes' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('rien n’est rendu sans tâche récurrente', () => {
    const { container } = render(
      <RecurringSeriesOverview
        isTeacher
        tasks={[{ id: 9, title: 'Ponctuelle', recurrence: '' }]}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
