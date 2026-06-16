import React from 'react';
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

import { TasksStudentSections } from '../../src/components/TasksStudentSections.jsx';

function renderSections(overrides = {}) {
  const props = {
    inProgressNotMine: [{ id: 1 }],
    availableNotMine: [{ id: 2 }, { id: 3 }],
    myProposals: [{ id: 4 }],
    doneNotMine: [{ id: 5 }, { id: 6 }, { id: 7 }],
    onHoldNotMine: [{ id: 8 }],
    recentlyValidatedForStudent: [{ id: 9 }],
    activeProjects: [{ id: 'p1' }, { id: 'p2' }],
    sectionListClass: 'tasks-grid',
    taskTileProps: {},
    taskProjectsBlockProps: {},
    ...overrides,
  };
  return render(<TasksStudentSections {...props} />);
}

describe('TasksStudentSections', () => {
  test('rend les sections élève avec leurs titres', () => {
    renderSections();
    expect(screen.getByText('⚙️ En cours (déjà prises)')).toBeInTheDocument();
    expect(screen.getByText('🔥 Tâches à faire')).toBeInTheDocument();
    expect(screen.getByText('💡 Mes propositions (1)')).toBeInTheDocument();
    expect(screen.getByText('⏳ En attente de validation')).toBeInTheDocument();
    expect(screen.getByText('⏸️ En attente')).toBeInTheDocument();
    expect(screen.getByText('✅ Récemment validées')).toBeInTheDocument();
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
    // En cours, Tâches à faire, Mes propositions, En attente de validation, En attente, Récemment validées
    expect(counts).toEqual(['1', '2', '1', '3', '1', '1']);
  });
});
