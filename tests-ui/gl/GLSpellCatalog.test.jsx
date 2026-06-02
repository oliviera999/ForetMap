import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GLSpellCatalog } from '../../src/gl/components/GLSpellCatalog.jsx';

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: vi.fn(),
}));

import { apiGL } from '../../src/gl/services/apiGL.js';

describe('GLSpellCatalog', () => {
  beforeEach(() => {
    vi.mocked(apiGL).mockReset();
  });

  test('affiche un hint si aucun sort lié au chapitre', () => {
    render(<GLSpellCatalog chapterSpells={[]} />);
    expect(screen.getByText(/Aucun sort n’est lié/i)).toBeInTheDocument();
  });

  test('affiche les sorts et appelle onOpenSpell au clic', async () => {
    const onOpenSpell = vi.fn();
    vi.mocked(apiGL).mockResolvedValue({
      items: [
        {
          spell_code: 'SL002',
          category_slug: 'mouvement',
          nom: 'Progression',
          emoji: '👣',
          cout_total_eq: '1 gemme',
          effet_court: 'Avance ou recule',
        },
      ],
    });
    render(
      <GLSpellCatalog
        chapterSpells={[
          { spell_code: 'SL002', category_slug: 'mouvement', nom: 'Progression' },
        ]}
        onOpenSpell={onOpenSpell}
      />
    );
    await waitFor(() => {
      expect(screen.getByText('Progression')).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('button', { name: /Ouvrir le sort Progression/i }));
    expect(onOpenSpell).toHaveBeenCalledWith('SL002');
  });
});
