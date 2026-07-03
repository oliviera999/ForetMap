import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TaskTileSection } from '../../src/components/tasks/TaskTileSection.jsx';
import { useTaskTileVolatileProps } from '../../src/hooks/useTaskTileVolatileProps.js';

// Isolation : on remplace TaskTileCard (lourde, mémoïsée) par une sonde qui expose
// les props clefs — la mémoïsation réelle reste couverte par TaskTileCard.test.jsx.
// La sonde est mémoïsée (comme l'originale) et compte ses rendus par tuile pour
// vérifier le mécanisme P1 (props volatiles dérivées par tuile).
const renderCounts = new Map();
vi.mock('../../src/components/tasks/TaskTileCard.jsx', () => ({
  TaskTileCard: React.memo(function TaskTileCardProbe({ t, index, probe, loading }) {
    renderCounts.set(String(t.id), (renderCounts.get(String(t.id)) || 0) + 1);
    return (
      <div
        data-testid="tile"
        data-index={index}
        data-probe={probe || ''}
        data-busy={loading ? Object.keys(loading).join(',') : ''}
      >
        {t.title}
      </div>
    );
  }),
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
      <TaskTileSection
        title="Section"
        tasks={TASKS}
        sectionListClass="tasks-condensed"
        taskTileProps={{}}
      />,
    );
    expect(container.querySelector('.tasks-section .tasks-condensed')).not.toBeNull();
  });

  test('liste vide → rien n’est rendu (ni titre ni section)', () => {
    const { container } = render(
      <TaskTileSection
        title="Section vide"
        tasks={[]}
        sectionListClass="tasks-grid"
        taskTileProps={{}}
      />,
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

  test('getTaskTileVolatileProps : un changement de loading[42…] ne re-rend que la tuile 42', () => {
    renderCounts.clear();
    const stable = { probe: 'shared' };
    const tasks = [
      { id: 42, title: 'Tuile 42' },
      { id: 7, title: 'Tuile 7' },
    ];
    // Harness reproduisant le câblage de TasksView : props stables mémoïsées +
    // getter volatile dérivé par tuile (useTaskTileVolatileProps).
    function Harness({ loading }) {
      const getTaskTileVolatileProps = useTaskTileVolatileProps({
        loading,
        quickAssignTaskId: null,
        quickAssignStudentIds: [],
        draggingTaskId: null,
      });
      return (
        <TaskTileSection
          title="Section"
          tasks={tasks}
          sectionListClass="tasks-grid"
          taskTileProps={{ ...stable, getTaskTileVolatileProps }}
        />
      );
    }
    const { rerender } = render(<Harness loading={{}} />);
    expect(renderCounts.get('42')).toBe(1);
    expect(renderCounts.get('7')).toBe(1);
    rerender(<Harness loading={{ '42assign': true }} />);
    // La tuile 42 reçoit sa tranche de loading et se re-rend ; la tuile 7 non.
    expect(renderCounts.get('42')).toBe(2);
    expect(renderCounts.get('7')).toBe(1);
    const tiles = screen.getAllByTestId('tile');
    expect(tiles[0].getAttribute('data-busy')).toBe('42assign');
    expect(tiles[1].getAttribute('data-busy')).toBe('');
    // Le getter lui-même n'est pas étalé sur la carte (sinon React.memo casserait).
    expect(tiles[0].getAttribute('data-probe')).toBe('shared');
  });
});
