import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GLPlayerResetPasswordModal } from '../../src/gl/components/admin/GLPlayerResetPasswordModal.jsx';

function renderModal(props = {}) {
  return render(
    <GLPlayerResetPasswordModal
      player={{ id: 5, pseudo: 'Drago' }}
      passwordValue=""
      onPasswordChange={vi.fn()}
      onClose={vi.fn()}
      onSubmit={vi.fn()}
      {...props}
    />,
  );
}

describe('GLPlayerResetPasswordModal', () => {
  test('ne rend rien quand aucun joueur n’est ciblé', () => {
    renderModal({ player: null });
    expect(screen.queryByText(/Réinitialiser/)).not.toBeInTheDocument();
  });

  test('affiche le pseudo du joueur ciblé', () => {
    renderModal();
    expect(screen.getByText('Réinitialiser Drago')).toBeInTheDocument();
  });

  test('remonte la saisie via onPasswordChange', () => {
    const onPasswordChange = vi.fn();
    renderModal({ onPasswordChange });
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), {
      target: { value: 'secret42' },
    });
    expect(onPasswordChange).toHaveBeenCalledWith('secret42');
  });

  test('appelle onSubmit avec le joueur au clic sur Valider', () => {
    const onSubmit = vi.fn();
    const player = { id: 5, pseudo: 'Drago' };
    renderModal({ player, onSubmit });
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
    expect(onSubmit).toHaveBeenCalledWith(player);
  });

  test('appelle onClose au clic sur Annuler', () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
