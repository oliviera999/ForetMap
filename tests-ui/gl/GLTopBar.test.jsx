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

    expect(screen.getByRole('button', { name: 'Cartes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Forum' })).toBeInTheDocument();
    expect(screen.getByText('🗺️')).toHaveClass('gl-tab-icon');
    expect(screen.getByText('💬')).toHaveClass('gl-tab-icon');
  });
});
