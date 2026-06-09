import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DeleteUserConfirmModal } from '../../../src/components/profiles/DeleteUserConfirmModal.jsx';

const ROLE_TERMS = { studentSingular: 'n3beur' };

function renderModal(overrides = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const props = {
    confirmStudent: { id: 3, first_name: 'Léa', last_name: 'Martin' },
    roleTerms: ROLE_TERMS,
    onConfirm,
    onCancel,
    ...overrides,
  };
  render(<DeleteUserConfirmModal {...props} />);
  return { onConfirm, onCancel };
}

describe('DeleteUserConfirmModal', () => {
  test('ne rend rien quand confirmStudent est nul', () => {
    renderModal({ confirmStudent: null });
    expect(screen.queryByRole('button', { name: 'Supprimer' })).toBeNull();
  });

  test('affiche le titre avec le terme de rôle et le nom complet', () => {
    renderModal();
    expect(screen.getByText('Supprimer le/la n3beur ?')).toBeTruthy();
    expect(screen.getByText('Léa Martin')).toBeTruthy();
  });

  test('le bouton Supprimer appelle onConfirm', () => {
    const { onConfirm } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test('le bouton Annuler appelle onCancel', () => {
    const { onCancel } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
