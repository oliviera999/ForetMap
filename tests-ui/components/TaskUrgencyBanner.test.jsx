import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TaskUrgencyBanner, urgencyDueLabel } from '../../src/components/tasks/TaskUrgencyBanner.jsx';

// Isolation : on remplace les helpers de calcul (échéances + sélection) par des sondes
// déterministes — la logique pure réelle reste couverte par les tests de taskSectioning/badges.
vi.mock('../../src/utils/badges', () => ({
  daysUntil: (d) => d, // dans les tests, due_date EST déjà le nombre de jours.
}));
vi.mock('../../src/utils/taskSectioning.js', () => ({
  studentUrgentDueTasks: (tasks) => tasks, // pas de filtrage : on passe la liste telle quelle.
}));

const TASKS = [
  { id: 't1', title: 'Pailler les fraisiers', due_date: 0, zone_name: 'Verger' },
  { id: 't2', title: 'Tailler la haie', due_date: -3 },
  { id: 't3', title: 'Arroser', due_date: 2, zones_linked: [{ name: 'Serre' }] },
];

describe('urgencyDueLabel', () => {
  test('libellés courts selon le nombre de jours', () => {
    expect(urgencyDueLabel(-2)).toBe('Retard 2j');
    expect(urgencyDueLabel(0)).toBe("Aujourd'hui");
    expect(urgencyDueLabel(1)).toBe('Demain');
    expect(urgencyDueLabel(4)).toBe('4 jours');
  });
});

describe('TaskUrgencyBanner', () => {
  test('côté n3boss (isTeacher) → rien n’est rendu', () => {
    const { container } = render(<TaskUrgencyBanner isTeacher tasks={TASKS} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('aucune tâche urgente → rien n’est rendu', () => {
    const { container } = render(<TaskUrgencyBanner tasks={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('rend le bandeau, un item par tâche et les libellés d’échéance', () => {
    render(<TaskUrgencyBanner tasks={TASKS} />);
    expect(screen.getByText('🔥 Échéances proches')).toBeInTheDocument();
    expect(screen.getByText('Pailler les fraisiers')).toBeInTheDocument();
    expect(screen.getByText('Tailler la haie')).toBeInTheDocument();
    expect(screen.getByText("Aujourd'hui")).toBeInTheDocument();
    expect(screen.getByText('Retard 3j')).toBeInTheDocument();
    expect(screen.getByText('2 jours')).toBeInTheDocument();
  });

  test('affiche le nom de zone (zone_name ou zones_linked)', () => {
    render(<TaskUrgencyBanner tasks={TASKS} />);
    expect(screen.getByText('Verger')).toBeInTheDocument();
    expect(screen.getByText('Serre')).toBeInTheDocument();
  });

  test('limite le nombre d’items affichés via maxItems', () => {
    const { container } = render(<TaskUrgencyBanner tasks={TASKS} maxItems={1} />);
    expect(container.querySelectorAll('.urgency-item')).toHaveLength(1);
  });
});
