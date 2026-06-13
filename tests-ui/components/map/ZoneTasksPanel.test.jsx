import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ZoneTasksStudentPanel,
  ZoneTasksTeacherPanel,
} from '../../../src/components/map/ZoneTasksPanel.jsx';

describe('ZoneTasksTeacherPanel', () => {
  const baseProps = {
    linkedTasks: [],
    assignableTasks: [{ id: 5, title: 'Arroser' }],
    linkTaskId: '',
    onChangeLinkTaskId: () => {},
    onUnlinkTask: () => {},
    onLinkTask: () => {},
  };

  test('état vide → message « Aucune tâche liée »', () => {
    render(<ZoneTasksTeacherPanel {...baseProps} />);
    expect(screen.getByText('Aucune tâche liée à cette zone.')).toBeTruthy();
  });

  test('liste les tâches liées et « Délier » appelle onUnlinkTask', () => {
    const onUnlink = vi.fn();
    render(
      <ZoneTasksTeacherPanel
        {...baseProps}
        linkedTasks={[{ id: 1, title: 'Tâche A' }]}
        onUnlinkTask={onUnlink}
      />,
    );
    expect(screen.getByText('Tâche A')).toBeTruthy();
    fireEvent.click(screen.getByText('Délier'));
    expect(onUnlink).toHaveBeenCalledWith({ id: 1, title: 'Tâche A' });
  });

  test('« Lier la tâche » désactivé sans sélection, actif sinon', () => {
    const onLink = vi.fn();
    const { rerender } = render(<ZoneTasksTeacherPanel {...baseProps} onLinkTask={onLink} />);
    expect(screen.getByText('🔗 Lier la tâche').disabled).toBe(true);
    rerender(<ZoneTasksTeacherPanel {...baseProps} linkTaskId="5" onLinkTask={onLink} />);
    fireEvent.click(screen.getByText('🔗 Lier la tâche'));
    expect(onLink).toHaveBeenCalledWith('5');
  });
});

describe('ZoneTasksStudentPanel', () => {
  const TASK = { id: 1, title: 'Tâche élève', status: 'open' };
  const baseProps = {
    linkedTasks: [TASK],
    student: { id: 9 },
    canSelfAssignTasks: true,
    canEnroll: true,
    selectedTaskIds: [],
    assigning: false,
    onToggleTask: () => {},
    onAssign: () => {},
  };

  test('aucune tâche liée → message', () => {
    render(<ZoneTasksStudentPanel {...baseProps} linkedTasks={[]} />);
    expect(screen.getByText('Aucune tâche liée à cette zone.')).toBeTruthy();
  });

  test('consigne de sélection en self-assign, lecture seule pour visiteur', () => {
    const { rerender } = render(<ZoneTasksStudentPanel {...baseProps} />);
    expect(screen.getByText(/inscris-toi directement/)).toBeTruthy();
    rerender(<ZoneTasksStudentPanel {...baseProps} canSelfAssignTasks={false} />);
    expect(screen.getByText(/lecture seule/)).toBeTruthy();
  });

  test('coche une tâche → onToggleTask avec son id', () => {
    const onToggle = vi.fn();
    const { container } = render(<ZoneTasksStudentPanel {...baseProps} onToggleTask={onToggle} />);
    fireEvent.click(container.querySelector('input[type="checkbox"]'));
    expect(onToggle).toHaveBeenCalledWith(1);
  });

  test('bouton inscription désactivé sans sélection, actif avec sélection', () => {
    const onAssign = vi.fn();
    const { rerender } = render(<ZoneTasksStudentPanel {...baseProps} onAssign={onAssign} />);
    expect(screen.getByText(/M'inscrire/).disabled).toBe(true);
    rerender(<ZoneTasksStudentPanel {...baseProps} selectedTaskIds={[1]} onAssign={onAssign} />);
    const btn = screen.getByText(/M'inscrire à 1 tâche/);
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onAssign).toHaveBeenCalled();
  });
});
