import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GLAdventureView } from '../../src/gl/components/GLAdventureView.jsx';
import { GL_MODULE_DEFAULTS } from '../../src/gl/constants/modules.js';

const allModules = Object.fromEntries(Object.keys(GL_MODULE_DEFAULTS).map((k) => [k, true]));

const gameState = {
  game: {
    id: 1,
    chapter_spells: [],
  },
};

describe('GLAdventureView', () => {
  test('affiche les sous-onglets et bascule vers les sortilèges', async () => {
    const user = userEvent.setup();
    const onSubTabChange = vi.fn();

    render(
      <GLAdventureView
        activeSubTab="history"
        onSubTabChange={onSubTabChange}
        modules={allModules}
        gameState={gameState}
        onOpenGlossaryTerm={() => {}}
        onOpenLoreTerm={() => {}}
        onOpenSpell={() => {}}
        canSpellCast={false}
        onLaunchSpell={() => {}}
        isMj={false}
      />,
    );

    expect(screen.getByRole('tablist', { name: "L'aventure" })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Histoire/ })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('tab', { name: /Sortilèges/ }));
    expect(onSubTabChange).toHaveBeenCalledWith('spells');
  });

  test('masque histoire et carnet Sélène si modules désactivés', () => {
    const modules = {
      ...allModules,
      journalEnabled: false,
      loreCarnetEnabled: false,
    };

    render(
      <GLAdventureView
        activeSubTab="spells"
        onSubTabChange={() => {}}
        modules={modules}
        gameState={gameState}
        onOpenGlossaryTerm={() => {}}
        onOpenLoreTerm={() => {}}
        onOpenSpell={() => {}}
        canSpellCast={false}
        onLaunchSpell={() => {}}
        isMj={false}
      />,
    );

    expect(screen.queryByRole('tab', { name: /Histoire/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Carnet Sélène/ })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Sortilèges/ })).toBeInTheDocument();
  });
});
