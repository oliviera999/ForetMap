import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskConfirmDialog } from '../../src/components/tasks/TaskConfirmDialog.jsx';

function confirmTask(overrides = {}) {
  return {
    task: { id: 't1', title: 'Pailler les fraisiers' },
    label: 'Supprimer "Pailler les fraisiers" ?',
    action: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('TaskConfirmDialog', () => {
  test('sans confirmTask : rien n’est rendu (composant monté en permanence)', () => {
    render(<TaskConfirmDialog confirmTask={null} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('affiche le libellé de confirmation dans un dialog accessible', () => {
    render(<TaskConfirmDialog confirmTask={confirmTask()} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: "Confirmation d'action" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Supprimer "Pailler les fraisiers" ?')).toBeInTheDocument();
  });

  test('« Confirmer » ferme d’abord le dialogue puis exécute l’action', async () => {
    const calls = [];
    const onClose = vi.fn(() => calls.push('close'));
    const action = vi.fn(async () => calls.push('action'));
    render(<TaskConfirmDialog confirmTask={confirmTask({ action })} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['close', 'action']);
  });

  test('« Annuler » ferme sans exécuter l’action', () => {
    const onClose = vi.fn();
    const action = vi.fn();
    render(<TaskConfirmDialog confirmTask={confirmTask({ action })} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(action).not.toHaveBeenCalled();
  });
});
