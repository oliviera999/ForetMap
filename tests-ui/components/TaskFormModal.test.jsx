import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TaskFormModal } from '../../src/components/tasks/TaskFormModal.jsx';

/**
 * La modale de tâche n'était couverte par aucun test de montage, et une constante
 * référencée dans un tableau de dépendances avant sa déclaration la faisait planter à
 * chaque ouverture (`ReferenceError`, zone morte temporelle) : les enseignants ne
 * pouvaient plus créer ni modifier de tâche. Ces deux montages ferment la porte.
 */

const ZONES = [{ id: 'z1', name: 'Potager', map_id: 'foret' }];
const MAPS = [{ id: 'foret', label: 'Forêt comestible' }];
const TUTORIALS = [{ id: 1, title: 'Arrosage' }];

function renderModal(props = {}) {
  const onClose = vi.fn();
  const onSave = vi.fn().mockResolvedValue({});
  render(
    <TaskFormModal
      zones={ZONES}
      maps={MAPS}
      tutorials={TUTORIALS}
      activeMapId="foret"
      onClose={onClose}
      onSave={onSave}
      {...props}
    />,
  );
  return { onClose, onSave };
}

describe('TaskFormModal — montage', () => {
  test('création : la modale s’ouvre sans planter', () => {
    renderModal();
    expect(screen.getByLabelText(/titre/i, { selector: 'input, textarea' })).toBeTruthy();
  });

  test('édition : la modale s’ouvre sur une tâche existante', () => {
    renderModal({
      editTask: {
        id: 't-1',
        title: 'Arroser les tomates',
        description: '',
        map_id: 'foret',
        zone_id: 'z1',
        required_students: 1,
        status: 'available',
        tutorial_ids: [1],
      },
    });
    expect(screen.getByDisplayValue('Arroser les tomates')).toBeTruthy();
  });
});
