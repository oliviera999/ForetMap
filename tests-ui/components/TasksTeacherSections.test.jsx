import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../src/components/tasks/TaskTileSection.jsx', () => ({
  TaskTileSection: ({ title, tasks }) => (
    <div data-testid="tile-section" data-count={Array.isArray(tasks) ? tasks.length : 0}>
      {title}
    </div>
  ),
}));

vi.mock('../../src/components/tasks/TaskProjectsBlock.jsx', () => ({
  TaskProjectsBlock: ({ visibleProjects }) => (
    <div
      data-testid="projects-block"
      data-count={Array.isArray(visibleProjects) ? visibleProjects.length : 0}
    >
      projects
    </div>
  ),
}));

import { TasksTeacherSections } from '../../src/components/TasksTeacherSections.jsx';

function renderSections(overrides = {}) {
  const props = {
    inProgress: [{ id: 1 }],
    available: [{ id: 2 }, { id: 3 }],
    proposed: [{ id: 4 }],
    done: [{ id: 5 }, { id: 6 }, { id: 7 }],
    onHold: [{ id: 8 }],
    validated: [{ id: 9 }],
    activeProjects: [{ id: 'p1' }, { id: 'p2' }],
    roleTerms: { studentPlural: 'n3beurs' },
    sectionListClass: 'tasks-grid',
    taskTileProps: {},
    taskProjectsBlockProps: {},
    ...overrides,
  };
  return render(<TasksTeacherSections {...props} />);
}

describe('TasksTeacherSections', () => {
  test('rend les sections n3boss avec leurs titres', () => {
    renderSections();
    expect(screen.getByText('En cours')).toBeInTheDocument();
    expect(screen.getByText('À faire')).toBeInTheDocument();
    expect(screen.getByText('Propositions n3beurs (1)')).toBeInTheDocument();
    expect(screen.getByText('En attente de validation (3)')).toBeInTheDocument();
    expect(screen.getByText('En attente (1)')).toBeInTheDocument();
    expect(screen.getByText('Validées')).toBeInTheDocument();
  });

  test('insère le bloc des projets actifs', () => {
    renderSections();
    const block = screen.getByTestId('projects-block');
    expect(block).toBeInTheDocument();
    expect(block).toHaveAttribute('data-count', '2');
  });

  test('transmet les bonnes listes de tâches aux sections', () => {
    renderSections();
    const counts = screen.getAllByTestId('tile-section').map((el) => el.getAttribute('data-count'));
    // Propositions, À faire, En cours, En attente de validation, En attente, Validées
    expect(counts).toEqual(['1', '2', '1', '3', '1', '1']);
  });

  test('les propositions des élèves sont la première section', () => {
    renderSections();
    expect(screen.getAllByTestId('tile-section')[0]).toHaveTextContent('Propositions n3beurs (1)');
  });

  test('« À faire » précède « En cours »', () => {
    renderSections();
    const todo = screen.getByText('À faire');
    const progress = screen.getByText('En cours');
    expect(Boolean(todo.compareDocumentPosition(progress) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(
      true,
    );
  });

  test('validationFirst : « En attente de validation » juste après les propositions', () => {
    renderSections({ validationFirst: true });
    const sections = screen.getAllByTestId('tile-section');
    expect(sections[0]).toHaveTextContent('Propositions n3beurs (1)');
    expect(sections[1]).toHaveTextContent('En attente de validation (3)');
    // Puis À faire (2), En cours (1), …
    expect(sections.map((el) => el.getAttribute('data-count'))).toEqual([
      '1',
      '3',
      '2',
      '1',
      '1',
      '1',
    ]);
  });
});
