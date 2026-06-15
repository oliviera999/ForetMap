import React from 'react';
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProfilesAdminFeedback } from '../../../src/components/profiles/ProfilesAdminFeedback.jsx';

function renderFeedback(overrides = {}) {
  const props = {
    err: '',
    msg: '',
    editModalOpen: false,
    editUserLoadState: 'idle',
    ...overrides,
  };
  return render(<ProfilesAdminFeedback {...props} />);
}

describe('ProfilesAdminFeedback', () => {
  test('affiche le bandeau d erreur', () => {
    const { container } = renderFeedback({ err: 'Boom' });
    const banner = container.querySelector('.auth-error');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent('⚠️ Boom');
  });

  test('affiche le bandeau de succès', () => {
    const { container } = renderFeedback({ msg: 'Enregistré' });
    const banner = container.querySelector('.auth-success');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent('Enregistré');
  });

  test('masque l erreur quand la modale utilisateur est ouverte et prête', () => {
    const { container } = renderFeedback({
      err: 'Boom',
      editModalOpen: true,
      editUserLoadState: 'ready',
    });
    expect(container.querySelector('.auth-error')).toBeNull();
  });

  test('affiche l erreur si la modale est ouverte mais pas encore prête', () => {
    const { container } = renderFeedback({
      err: 'Boom',
      editModalOpen: true,
      editUserLoadState: 'loading',
    });
    expect(container.querySelector('.auth-error')).toBeInTheDocument();
  });

  test('sans message ni erreur → rien à afficher', () => {
    renderFeedback();
    expect(screen.queryByText(/⚠️/)).toBeNull();
  });
});
