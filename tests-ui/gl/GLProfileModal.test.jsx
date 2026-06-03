/** @vitest-environment jsdom */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GLProfileModal } from '../../src/gl/components/GLProfileModal.jsx';

vi.mock('../../src/gl/components/GLProfileEditor.jsx', () => ({
  GLProfileEditor: () => <div data-testid="profile-editor">éditeur</div>,
}));

describe('GLProfileModal', () => {
  it('affiche la modale profil quand open=true', () => {
    render(
      <GLProfileModal
        open
        onClose={vi.fn()}
        auth={{ userType: 'gl_player' }}
        profile={{ pseudo: 'Testeur' }}
        config={{}}
        onSessionUpdated={vi.fn()}
        onReloadProfile={vi.fn()}
      />
    );

    expect(screen.getByRole('dialog', { name: 'Mon profil GL' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Mon profil' })).toBeTruthy();
  });

  it('appelle onClose au clic Fermer', () => {
    const onClose = vi.fn();
    render(
      <GLProfileModal
        open
        onClose={onClose}
        auth={{ userType: 'gl_player' }}
        profile={{}}
        config={{}}
        onSessionUpdated={vi.fn()}
        onReloadProfile={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ne rend rien quand open=false', () => {
    render(
      <GLProfileModal
        open={false}
        onClose={vi.fn()}
        auth={{}}
        profile={{}}
        config={{}}
        onSessionUpdated={vi.fn()}
        onReloadProfile={vi.fn()}
      />
    );

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
