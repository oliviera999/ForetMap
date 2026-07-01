import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { GLLoreGlossaryPopover } from '../../src/gl/components/GLLoreGlossaryPopover.jsx';

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: vi.fn(),
}));

import { apiGL } from '../../src/gl/services/apiGL.js';

const LORE_DETAIL = {
  term: {
    lore_code: 'LR001',
    terme: 'Sylvebrume',
    categorie: 'lieu',
    categorie_label: 'Lieu',
    definition_courte: 'Forêt embrumée du royaume.',
    definition_complete: 'Une vaste forêt où le brouillard ne se lève jamais.',
  },
  relatedTerms: [{ lore_code: 'LR002', terme: 'Gnome' }],
};

describe('GLLoreGlossaryPopover', () => {
  beforeEach(() => {
    vi.mocked(apiGL).mockReset();
    vi.mocked(apiGL).mockResolvedValue(LORE_DETAIL);
  });

  test('expose un rôle dialog avec libellé accessible', async () => {
    render(<GLLoreGlossaryPopover open loreCode="LR001" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Sylvebrume/i })).toBeInTheDocument();
    });
    const dialog = screen.getByRole('dialog', { name: /Sylvebrume/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  test('Échap ferme le popover (onClose appelé)', async () => {
    const onClose = vi.fn();
    render(<GLLoreGlossaryPopover open loreCode="LR001" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Sylvebrume/i })).toBeInTheDocument();
    });

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("n'est pas rendu quand fermé", () => {
    render(<GLLoreGlossaryPopover open={false} loreCode="LR001" onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
