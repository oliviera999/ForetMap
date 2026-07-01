import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// Motion réduit : la fermeture appelle onClose immédiatement (pas de timer d'animation).
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

import { GLSpellPopover } from '../../src/gl/components/GLSpellPopover.jsx';
import { fetchSpellDetail, clearSpellDetailCache } from '../../src/gl/utils/glSpellDetailCache.js';

const SPELL_DETAIL = {
  spell: {
    spell_code: 'SCT01',
    nom: 'Bouclier magique',
    emoji: '🛡️',
    category_slug: 'vie',
    statut: 'actif',
    effet_court: 'Protège une équipe.',
    effet_detaille: 'Durée : un tour complet.',
  },
};

describe('GLSpellPopover', () => {
  beforeEach(() => {
    clearSpellDetailCache();
    vi.mocked(fetchSpellDetail).mockReset();
    vi.mocked(fetchSpellDetail).mockResolvedValue(SPELL_DETAIL);
  });

  test('expose un rôle dialog avec libellé accessible', async () => {
    render(<GLSpellPopover open spellCode="SCT01" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Bouclier magique/i })).toBeInTheDocument();
    });
    const dialog = screen.getByRole('dialog', { name: /Bouclier magique/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  test('Échap ferme le popover (onClose appelé)', async () => {
    const onClose = vi.fn();
    render(<GLSpellPopover open spellCode="SCT01" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Bouclier magique/i })).toBeInTheDocument();
    });

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("n'est pas rendu quand fermé", () => {
    render(<GLSpellPopover open={false} spellCode="SCT01" onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
