// @vitest-environment jsdom
//
// Garde-fou A3 : la modale ne doit pas planter à l'ouverture
// (ReferenceError TDZ sur `normalizedTutorialIds` si déclaré après l'autosave).

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TaskFormModal } from '../../src/components/tasks/TaskFormModal.jsx';

vi.mock('../../src/utils/overlayHistory', () => ({
  armNativeFilePickerGuard: vi.fn(),
  disarmNativeFilePickerGuard: vi.fn(),
}));

vi.mock('../../src/shared/hooks/useDebouncedAutoSave.js', () => ({
  useDebouncedAutoSave: () => ({ status: 'idle', error: null }),
}));

describe('TaskFormModal', () => {
  it('s’ouvre en création sans ReferenceError', () => {
    render(
      <TaskFormModal
        zones={[]}
        markers={[]}
        maps={[{ id: 'foret', name: 'Forêt' }]}
        taskProjects={[]}
        tutorials={[]}
        plants={[]}
        referentCandidates={[]}
        students={[]}
        activeMapId="foret"
        onClose={() => {}}
        onSave={async () => {}}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Nouvelle tâche' })).toBeTruthy();
    expect(document.getElementById('task-form-title')).toBeTruthy();
  });

  it('s’ouvre en édition sans ReferenceError (autosave câblé)', () => {
    render(
      <TaskFormModal
        zones={[]}
        markers={[]}
        maps={[{ id: 'foret', name: 'Forêt' }]}
        taskProjects={[]}
        tutorials={[]}
        plants={[]}
        referentCandidates={[]}
        students={[]}
        activeMapId="foret"
        onClose={() => {}}
        onSave={async () => {}}
        editTask={{
          id: 7,
          title: 'Arroser',
          map_id: 'foret',
          tutorial_ids: [1, 2],
        }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Modifier la tâche' })).toBeTruthy();
    expect(screen.getByDisplayValue('Arroser')).toBeTruthy();
  });
});
