import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GLNatureView } from '../../src/gl/components/GLNatureView.jsx';

const gameState = {
  game: {
    id: 1,
    chapter_biomes: [{ slug: 'sahara', nom: 'Sahara' }],
    chapter_ecosystem_sections: [],
  },
};

describe('GLNatureView', () => {
  test('affiche les sous-onglets et bascule vers la biodiversité', async () => {
    const user = userEvent.setup();
    const onSubTabChange = vi.fn();

    render(
      <GLNatureView
        activeSubTab="ecosystemes"
        onSubTabChange={onSubTabChange}
        gameState={gameState}
        onOpenGlossaryTerm={() => {}}
      />,
    );

    expect(screen.getByRole('tablist', { name: 'La nature' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Écosystèmes/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('heading', { name: 'Écosystèmes' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Biodiversité/ }));
    expect(onSubTabChange).toHaveBeenCalledWith('biodiversite');
  });
});
