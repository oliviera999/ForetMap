import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProfilesRoleQuickConfig } from '../../../src/components/profiles/ProfilesRoleQuickConfig.jsx';

function setup(overrides = {}) {
  const props = {
    role: {
      id: 3,
      slug: 'eleve_novice',
      display_name: 'Novice',
      emoji: '🪨',
      min_done_tasks: 0,
      display_order: 2,
    },
    roleEmoji: '🌿',
    onRoleEmojiChange: vi.fn(),
    onSaveEmoji: vi.fn(),
    loading: false,
    roleTerms: { studentSingular: 'n3beur' },
    ...overrides,
  };
  render(<ProfilesRoleQuickConfig {...props} />);
  return props;
}

describe('ProfilesRoleQuickConfig', () => {
  test('role null → rien', () => {
    const { container } = render(<ProfilesRoleQuickConfig role={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('emoji : édition et enregistrement câblés ; aperçu affiché', () => {
    const { onRoleEmojiChange, onSaveEmoji } = setup();
    const input = screen.getByLabelText('Emoji pour le profil Novice');
    expect(input).toHaveValue('🌿');
    fireEvent.change(input, { target: { value: '🍀' } });
    expect(onRoleEmojiChange).toHaveBeenCalledWith('🍀');
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer l.emoji/ }));
    expect(onSaveEmoji).toHaveBeenCalledTimes(1);
  });

  test('emoji obligatoire pour un palier n3beur (slug eleve_*)', () => {
    setup();
    expect(screen.getByText(/Obligatoire pour un profil n3beur/)).toBeInTheDocument();
  });

  test('emoji optionnel pour les autres profils', () => {
    setup({ role: { id: 1, slug: 'admin', display_name: 'Admin' } });
    expect(screen.getByText(/Optionnel pour les autres profils/)).toBeInTheDocument();
  });

  test('aucun champ PIN (élévation supprimée)', () => {
    setup();
    expect(screen.queryByPlaceholderText('Nouveau PIN')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Enregistrer PIN' })).toBeNull();
  });

  test('loading désactive les enregistrements emoji', () => {
    setup({ loading: true });
    expect(screen.getByRole('button', { name: /Enregistrer l.emoji/ })).toBeDisabled();
  });
});
