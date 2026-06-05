import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GLSpellCastResultPopover } from '../../src/gl/components/GLSpellCastResultPopover.jsx';
import { clearSpellDetailCache } from '../../src/gl/utils/glSpellDetailCache.js';

vi.mock('../../src/shared/hooks/usePrefersReducedMotion.js', () => ({
  usePrefersReducedMotion: () => true,
}));

vi.mock('../../src/gl/utils/glSpellDetailCache.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    fetchSpellDetail: vi.fn(),
  };
});

import { fetchSpellDetail } from '../../src/gl/utils/glSpellDetailCache.js';

const mockResult = {
  eventId: 99,
  spellCode: 'SCT01',
  spellName: 'Bouclier magique',
  spellEmoji: '🛡️',
  costLabel: '2 💎',
  casters: [
    { playerId: 1, displayName: 'Alice', gems: 1, hearts: 0, contributionLabel: '1 💎' },
    { playerId: 2, displayName: 'Bob', gems: 1, hearts: 0, contributionLabel: '1 💎' },
  ],
};

describe('GLSpellCastResultPopover', () => {
  beforeEach(() => {
    clearSpellDetailCache();
    vi.mocked(fetchSpellDetail).mockReset();
    vi.mocked(fetchSpellDetail).mockResolvedValue({
      spell: {
        spell_code: 'SCT01',
        nom: 'Bouclier magique',
        emoji: '🛡️',
        category_slug: 'vie',
        effet_court: 'Protège une équipe.',
        effet_detaille: 'Durée : un tour complet.',
      },
    });
  });

  test('n’affiche rien si fermé', () => {
    const { container } = render(
      <GLSpellCastResultPopover open={false} result={mockResult} onClose={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('affiche casters, coût et description du sort', async () => {
    const onClose = vi.fn();
    render(
      <GLSpellCastResultPopover open result={mockResult} onClose={onClose} />,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Bouclier magique')).toBeInTheDocument();
    expect(screen.getByText(/Sortilège lancé/i)).toBeInTheDocument();
    expect(screen.getByText(/Coût : 2 💎/)).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Protège une équipe.')).toBeInTheDocument();
    });
    expect(screen.getByText(/Durée : un tour complet/)).toBeInTheDocument();
  });

  test('ferme via le bouton Compris', async () => {
    const onClose = vi.fn();
    render(
      <GLSpellCastResultPopover open result={mockResult} onClose={onClose} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Compris/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
