import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TaskTileSection } from '../../src/components/tasks/TaskTileSection.jsx';

// Isolation : on remplace TaskTileCard (lourde, mémoïsée) par une sonde qui expose
// les props clefs — la mémoïsation réelle reste couverte par TaskTileCard.test.jsx.
vi.mock('../../src/components/tasks/TaskTileCard.jsx', () => ({
  TaskTileCard: ({ t, index, probe }) => (
    <div data-testid="tile" data-index={index} data-probe={probe || ''}>{t.title}</div>
  ),
}));

const TASKS = [
  { id: 't1', title: 'Pailler les fraisiers' },
  { id: 't2', title: 'Tailler la haie' },
];

describe('TaskTileSection', () => {
  test('rend le titre et une tuile par tâche (index transmis)', () => {
    render(
      <TaskTileSection
        title="🔥 À faire"
        tasks={TASKS}
        sectionListClass="tasks-grid"
        taskTileProps={{ probe: 'shared' }}
      />,
    );
    expect(screen.getByText('🔥 À faire')).toBeInTheDocument();
    const tiles = screen.getAllByTestId('tile');
    expect(tiles).toHaveLength(2);
    expect(tiles[0]).toHaveTextContent('Pailler les fraisiers');
    expect(tiles[1].getAttribute('data-index')).toBe('1');
    // taskTileProps est bien étalé sur chaque tuile.
    expect(tiles[0].getAttribute('data-probe')).toBe('shared');
  });

  test('applique la classe de liste du mode d’affichage', () => {
    const { container } = render(
      <TaskTileSection title="Section" tasks={TASKS} sectionListClass="tasks-condensed" taskTileProps={{}} />,
    );
    expect(container.querySelector('.tasks-section .tasks-condensed')).not.toBeNull();
  });

  test('liste vide → rien n’est rendu (ni titre ni section)', () => {
    const { container } = render(
      <TaskTileSection title="Section vide" tasks={[]} sectionListClass="tasks-grid" taskTileProps={{}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('liste vide + showWhenEmpty → la section et son compteur restent visibles', () => {
    render(
      <TaskTileSection
        title="🔎 Résultats filtrés (0)"
        tasks={[]}
        sectionListClass="tasks-grid"
        taskTileProps={{}}
        showWhenEmpty
      />,
    );
    expect(screen.getByText('🔎 Résultats filtrés (0)')).toBeInTheDocument();
    expect(screen.queryAllByTestId('tile')).toHaveLength(0);
  });
});
