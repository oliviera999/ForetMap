import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TasksValidatedHiddenNotice } from '../../src/components/tasks/TasksValidatedHiddenNotice.jsx';

describe('TasksValidatedHiddenNotice', () => {
  test('aucun élément masqué → rien n’est rendu', () => {
    const { container } = render(
      <TasksValidatedHiddenNotice tasksCount={0} projectsCount={0} onShowValidated={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('singulier : accords au singulier pour une tâche seule', () => {
    render(<TasksValidatedHiddenNotice tasksCount={1} onShowValidated={() => {}} />);
    expect(screen.getByText(/1 tâche validée masquée\./)).toBeInTheDocument();
  });

  test('pluriel et cumul tâches + projets', () => {
    render(
      <TasksValidatedHiddenNotice tasksCount={3} projectsCount={2} onShowValidated={() => {}} />,
    );
    expect(
      screen.getByText(/3 tâches validées masquées et 2 projets validés masqués\./),
    ).toBeInTheDocument();
  });

  test('le bouton demande l’affichage des validés', async () => {
    const onShowValidated = vi.fn();
    render(<TasksValidatedHiddenNotice projectsCount={1} onShowValidated={onShowValidated} />);
    await userEvent.click(screen.getByRole('button', { name: /Afficher les validés/ }));
    expect(onShowValidated).toHaveBeenCalledTimes(1);
  });
});
