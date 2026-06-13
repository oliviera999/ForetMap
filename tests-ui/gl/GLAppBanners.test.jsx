import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GLAppBanners } from '../../src/gl/components/GLAppBanners.jsx';

describe('GLAppBanners', () => {
  test('sans props actives : ne rend aucune bannière', () => {
    const { container } = render(<GLAppBanners />);
    expect(container.querySelector('.gl-error-banner')).toBeNull();
    expect(container.querySelector('.role-preview-banner')).toBeNull();
    expect(container.querySelector('.gl-narration-banner')).toBeNull();
    expect(container.querySelector('.gl-turn-toast')).toBeNull();
  });

  test('affiche la bannière d’erreur globale', () => {
    render(<GLAppBanners error="Chargement partie impossible" />);
    expect(screen.getByText('Chargement partie impossible')).toHaveClass('gl-error-banner');
  });

  test('aperçu vue joueur du staff', () => {
    render(<GLAppBanners isStaffPlayerPreview />);
    expect(screen.getByText('Vue joueur (aperçu)')).toBeInTheDocument();
    expect(screen.getByText(/droits MJ\/admin restent actifs/)).toBeInTheDocument();
  });

  test('bannière de prise de contrôle : copy, identité et bouton stop', () => {
    const onStopImpersonation = vi.fn();
    render(
      <GLAppBanners
        impersonationBanner={{ title: 'Prise de contrôle (MJ GL)', stopLabel: 'Revenir à mon compte MJ' }}
        impersonatedDisplayName="Luna"
        onStopImpersonation={onStopImpersonation}
      />,
    );
    expect(screen.getByText('Prise de contrôle (MJ GL)')).toBeInTheDocument();
    expect(screen.getByText('Luna')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Revenir à mon compte MJ' }));
    expect(onStopImpersonation).toHaveBeenCalledTimes(1);
  });

  test('identité absente → repli sur « joueur »', () => {
    render(<GLAppBanners impersonationBanner={{ title: 'Prise de contrôle (admin GL)', stopLabel: 'Stop' }} />);
    expect(screen.getByText('joueur')).toBeInTheDocument();
  });

  test('bannière de narration MJ', () => {
    render(<GLAppBanners narrationText="La forêt s’éveille." />);
    expect(screen.getByText('Narration du MJ :')).toBeInTheDocument();
    expect(screen.getByText(/La forêt s’éveille\./)).toBeInTheDocument();
  });

  test('toast de tour avec le libellé d’équipe fourni', () => {
    render(<GLAppBanners turnTeamLabel="Les Gnomes" />);
    expect(screen.getByText('Les Gnomes')).toBeInTheDocument();
    expect(screen.getByText(/C’est au tour de/)).toBeInTheDocument();
  });
});
