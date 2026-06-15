import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProfilesAdminHeader } from '../../../src/components/profiles/ProfilesAdminHeader.jsx';

const HELP_PROFILES = {
  title: 'Aide profils',
  items: [{ text: 'Première astuce' }],
};

function renderHeader(overrides = {}) {
  const props = {
    isHelpEnabled: true,
    helpProfiles: HELP_PROFILES,
    hasSeenSection: () => true,
    onMarkSeen: vi.fn(),
    onOpen: vi.fn(),
    onDismiss: vi.fn(),
    ...overrides,
  };
  return render(<ProfilesAdminHeader {...props} />);
}

describe('ProfilesAdminHeader', () => {
  test('affiche toujours le titre de section', () => {
    const { container } = renderHeader();
    const title = container.querySelector('h2.section-title');
    expect(title).toBeInTheDocument();
    expect(title).toHaveTextContent('🛡️ Profils & utilisateurs');
  });

  test('isHelpEnabled vrai (avec entrées) → rend le bouton d aide', () => {
    renderHeader();
    expect(
      screen.getByRole('button', { name: /Ouvrir l aide: Aide profils/ })
    ).toBeInTheDocument();
  });

  test('isHelpEnabled faux → aucun panneau d aide', () => {
    renderHeader({ isHelpEnabled: false });
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('🛡️ Profils & utilisateurs')).toBeInTheDocument();
  });
});
