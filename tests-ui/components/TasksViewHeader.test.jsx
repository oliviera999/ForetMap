import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TasksViewHeader } from '../../src/components/tasks/TasksViewHeader.jsx';

function renderHeader(overrides = {}) {
  const handlers = {
    setEditProject: vi.fn(),
    setShowProjectForm: vi.fn(),
    setNewTaskDefaultProjectId: vi.fn(),
    setEditTask: vi.fn(),
    setDuplicateTask: vi.fn(),
    setShowForm: vi.fn(),
    setShowProposalForm: vi.fn(),
  };
  render(<TasksViewHeader {...handlers} {...overrides} />);
  return handlers;
}

describe('TasksViewHeader', () => {
  test('n3boss : « + Nouvelle tâche » réinitialise le formulaire puis l’ouvre', () => {
    const h = renderHeader({ isTeacher: true });
    fireEvent.click(screen.getByRole('button', { name: '+ Nouvelle tâche' }));
    expect(h.setNewTaskDefaultProjectId).toHaveBeenCalledWith(null);
    expect(h.setEditTask).toHaveBeenCalledWith(null);
    expect(h.setDuplicateTask).toHaveBeenCalledWith(null);
    expect(h.setShowForm).toHaveBeenCalledWith(true);
  });

  test('n3boss : « + Projet » ouvre le formulaire projet vierge', () => {
    const h = renderHeader({ isTeacher: true });
    fireEvent.click(screen.getByRole('button', { name: '+ Projet' }));
    expect(h.setEditProject).toHaveBeenCalledWith(null);
    expect(h.setShowProjectForm).toHaveBeenCalledWith(true);
    expect(
      screen.getByText('Piloter les missions, valider les retours et traiter les idées du terrain'),
    ).toBeTruthy();
  });

  test('élève auto-inscriptible : bouton « + Proposer » ouvre la proposition', () => {
    const h = renderHeader({ isTeacher: false, canSelfAssignTasks: true });
    fireEvent.click(screen.getByRole('button', { name: '+ Proposer' }));
    expect(h.setNewTaskDefaultProjectId).toHaveBeenCalledWith(null);
    expect(h.setShowProposalForm).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('button', { name: '+ Nouvelle tâche' })).toBeNull();
  });

  test('élève en lecture seule : pas de bouton, sous-titre adapté', () => {
    renderHeader({ isTeacher: false, canSelfAssignTasks: false });
    expect(screen.queryByRole('button', { name: '+ Proposer' })).toBeNull();
    expect(screen.getByText('Tu consultes la liste en lecture seule')).toBeTruthy();
  });

  test('astuce rapide affichée seulement si aide active + indices contextuels', () => {
    renderHeader({
      isHelpEnabled: true,
      showContextHints: true,
      helpHintPrefix: 'Astuce :',
      tasksQuickTip: 'Filtre par carte.',
    });
    expect(screen.getByText('Astuce :')).toBeTruthy();
    expect(screen.getByText(/Filtre par carte\./)).toBeTruthy();
  });

  test('astuce masquée sans showContextHints', () => {
    renderHeader({
      isHelpEnabled: true,
      showContextHints: false,
      helpHintPrefix: 'Astuce :',
      tasksQuickTip: 'Filtre par carte.',
    });
    expect(screen.queryByText('Astuce :')).toBeNull();
  });

  test('élève au quota : bandeau limite d’inscriptions', () => {
    renderHeader({
      isTeacher: false,
      student: {
        taskEnrollment: { maxActiveAssignments: 3, currentActiveAssignments: 3, atLimit: true },
      },
    });
    expect(screen.getByText(/paquet max de missions en cours \(3\/3/)).toBeTruthy();
  });

  test('élève sous le quota : bandeau de suivi des missions actives', () => {
    renderHeader({
      isTeacher: false,
      student: {
        taskEnrollment: { maxActiveAssignments: 3, currentActiveAssignments: 1, atLimit: false },
      },
    });
    expect(screen.getByText(/Missions actives pour toi : 1\/3/)).toBeTruthy();
  });

  test('pas de bandeau quota sans limite configurée', () => {
    renderHeader({ isTeacher: false, student: { taskEnrollment: { maxActiveAssignments: 0 } } });
    expect(screen.queryByText(/Missions actives pour toi/)).toBeNull();
  });
});
