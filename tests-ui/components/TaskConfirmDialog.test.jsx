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

// B1 (docs/AUDIT_UI_2026-09-16.md) : le dialogue est monté en permanence par `TasksView`, donc
// son effet d'accessibilité s'exécutait au montage — sans panneau — et ne se rejouait jamais.
describe('TaskConfirmDialog — accessibilité clavier après ouverture différée', () => {
  test('Échap ferme le dialogue ouvert après le montage', () => {
    const onClose = vi.fn();
    const { rerender } = render(<TaskConfirmDialog confirmTask={null} onClose={onClose} />);
    rerender(<TaskConfirmDialog confirmTask={confirmTask()} onClose={onClose} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('le focus entre dans le dialogue, sans rester sur le déclencheur', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();

    const { rerender } = render(<TaskConfirmDialog confirmTask={null} onClose={vi.fn()} />);
    rerender(<TaskConfirmDialog confirmTask={confirmTask()} onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Confirmer' })).toHaveFocus();
    trigger.remove();
  });
});
