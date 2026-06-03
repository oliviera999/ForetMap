/** @vitest-environment jsdom */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GLPasswordResetGate } from '../../src/gl/components/GLPasswordResetGate.jsx';

vi.mock('../../src/gl/components/GLPasswordChangeForm.jsx', () => ({
  GLPasswordChangeForm: () => <div data-testid="password-form">formulaire</div>,
}));

describe('GLPasswordResetGate', () => {
  it('affiche la gate mot de passe quand open=true', () => {
    render(<GLPasswordResetGate open onCompleted={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: /Mise a jour mot de passe obligatoire/i })).toBeTruthy();
    expect(screen.getByText(/Mise a jour du mot de passe requise/i)).toBeTruthy();
    expect(screen.getByTestId('password-form')).toBeTruthy();
  });

  it('ne rend rien quand open=false', () => {
    render(<GLPasswordResetGate open={false} onCompleted={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
