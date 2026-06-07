import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GLTopBar } from '../../src/gl/components/GLTopBar.jsx';

describe('GLTopBar', () => {
  test('affiche une icone et un libelle pour chaque onglet', () => {
    const onTabChange = vi.fn();
    render(
      <GLTopBar
        tabs={[
          { id: 'maps', label: 'Cartes', icon: '🗺️' },
          { id: 'forum', label: 'Forum', icon: '💬' },
        ]}
        activeTab="maps"
        onTabChange={onTabChange}
        auth={{ displayName: 'MJ Test' }}
        onLogout={() => {}}
      />
    );

    expect(screen.getByRole('tab', { name: 'Cartes' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Forum' })).toBeInTheDocument();
    expect(screen.getByText('🗺️')).toHaveClass('gl-tab-icon');
    expect(screen.getByText('💬')).toHaveClass('gl-tab-icon');
  });

  test('affiche la pastille version pour le staff admin', () => {
    render(
      <GLTopBar
        tabs={[{ id: 'maps', label: 'Cartes', icon: '🗺️' }]}
        activeTab="maps"
        onTabChange={() => {}}
        auth={{ displayName: 'MJ Test', userType: 'gl_admin' }}
        onLogout={() => {}}
        showVersion
        appVersion="1.57.23"
      />
    );

    expect(screen.getByLabelText('Version 1.57.23')).toBeInTheDocument();
    expect(screen.getByText('v1.57.23')).toBeInTheDocument();
  });

  test('masque la pastille version pour les joueurs', () => {
    render(
      <GLTopBar
        tabs={[{ id: 'maps', label: 'Cartes', icon: '🗺️' }]}
        activeTab="maps"
        onTabChange={() => {}}
        auth={{ displayName: 'Joueur', userType: 'gl_player' }}
        onLogout={() => {}}
        showVersion={false}
        appVersion="1.57.23"
      />
    );

    expect(screen.queryByLabelText(/Version/)).not.toBeInTheDocument();
  });
});
