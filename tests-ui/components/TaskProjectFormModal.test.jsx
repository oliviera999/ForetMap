import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskProjectFormModal } from '../../src/components/tasks/TaskProjectFormModal.jsx';

function renderModal(overrides = {}) {
  const onSave = vi.fn(async () => {});
  const onClose = vi.fn();
  render(
    <TaskProjectFormModal
      maps={[{ id: 'foret', label: 'Forêt' }]}
      zones={[]}
      markers={[]}
      tutorials={[]}
      activeMapId="foret"
      onSave={onSave}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onSave, onClose };
}

describe('TaskProjectFormModal', () => {
  test('mode création : titre « Nouveau projet » + bouton « Créer le projet »', () => {
    renderModal();
    expect(screen.getByText('Nouveau projet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Créer le projet' })).toBeTruthy();
  });

  test('mode édition : titre + bouton adaptés', () => {
    renderModal({ editProject: { id: 5, title: 'Verger', map_id: 'foret', zone_ids: [], marker_ids: [], tutorial_ids: [] } });
    expect(screen.getByText('Modifier le projet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enregistrer le projet' })).toBeTruthy();
  });

  test('refuse la sauvegarde sans titre (message d’erreur)', () => {
    const { onSave } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Créer le projet' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Le titre est requis')).toBeTruthy();
  });

  test('sauvegarde le payload (titre + carte active)', async () => {
    const { onSave } = renderModal();
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'Mon projet' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer le projet' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0][0];
    expect(payload.title).toBe('Mon projet');
    expect(payload.map_id).toBe('foret');
  });
});
