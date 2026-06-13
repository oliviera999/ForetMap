import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RolePreviewBanners } from '../../../src/components/app/RolePreviewBanners.jsx';

// Tooltip enveloppe ses enfants : on ne le remplace pas, le helpText reste une simple sonde.
const baseProps = {
  authClaims: null,
  isTeacher: false,
  roleViewMode: 'native',
  helpText: () => 'aide',
  onStopImpersonation: () => {},
};

describe('RolePreviewBanners', () => {
  test('aucun bandeau en mode natif sans impersonation', () => {
    const { container } = render(<RolePreviewBanners {...baseProps} />);
    expect(container.querySelector('.role-preview-banner')).toBeNull();
  });

  test('bandeau impersonation : identité affichée et bouton de retour câblé', () => {
    const onStop = vi.fn();
    render(
      <RolePreviewBanners
        {...baseProps}
        authClaims={{ impersonating: true, roleDisplayName: 'Alice', userType: 'student' }}
        onStopImpersonation={onStop}
      />,
    );
    expect(screen.getByText('Prise de contrôle (admin)')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText(/\(n3beur\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Revenir à mon compte admin'));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  test('mention (n3boss) quand l’identité contrôlée est un n3boss', () => {
    render(
      <RolePreviewBanners
        {...baseProps}
        authClaims={{ impersonating: true, roleDisplayName: 'Bob', userType: 'teacher' }}
      />,
    );
    expect(screen.getByText(/\(n3boss\)/)).toBeInTheDocument();
  });

  test('aperçu vue n3beur visible uniquement pour un n3boss en roleViewMode student', () => {
    const { rerender } = render(
      <RolePreviewBanners {...baseProps} isTeacher roleViewMode="student" />,
    );
    expect(screen.getByText('Vue n3beur (aperçu)')).toBeInTheDocument();
    expect(screen.queryByText('Vue n3boss (aperçu)')).toBeNull();
    // Sans le drapeau n3boss : pas de bandeau d’aperçu.
    rerender(<RolePreviewBanners {...baseProps} isTeacher={false} roleViewMode="student" />);
    expect(screen.queryByText('Vue n3beur (aperçu)')).toBeNull();
  });

  test('aperçu vue n3boss visible pour un n3boss en roleViewMode teacher', () => {
    render(<RolePreviewBanners {...baseProps} isTeacher roleViewMode="teacher" />);
    expect(screen.getByText('Vue n3boss (aperçu)')).toBeInTheDocument();
    expect(screen.queryByText('Vue n3beur (aperçu)')).toBeNull();
  });
});
