import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GLMondeView } from '../../src/gl/components/GLMondeView.jsx';
import { GL_MODULE_DEFAULTS } from '../../src/gl/constants/modules.js';

const allModules = Object.fromEntries(Object.keys(GL_MODULE_DEFAULTS).map((k) => [k, true]));

describe('GLMondeView', () => {
  test('affiche les sous-onglets et bascule vers les règles', async () => {
    const user = userEvent.setup();
    const onSubTabChange = vi.fn();

    render(
      <GLMondeView
        activeSubTab="world"
        onSubTabChange={onSubTabChange}
        modules={allModules}
        auth={{ displayName: 'Joueur' }}
        onNavigateTab={() => {}}
        onOpenGlossaryTerm={() => {}}
        onOpenLoreGlossaryPopover={() => {}}
        onLoreGlossaryFocusHandled={() => {}}
      />,
    );

    expect(screen.getByRole('tablist', { name: 'Le monde G&L' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Introduction/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await user.click(screen.getByRole('tab', { name: /Règles du jeu/ }));
    expect(onSubTabChange).toHaveBeenCalledWith('rules');
  });

  test('masque lexique lore et tutoriels si modules désactivés', () => {
    const modules = {
      ...allModules,
      loreGlossaryEnabled: false,
      tutorialsEnabled: false,
    };

    render(
      <GLMondeView
        activeSubTab="world"
        onSubTabChange={() => {}}
        modules={modules}
        auth={{ displayName: 'Joueur' }}
        onNavigateTab={() => {}}
        onOpenGlossaryTerm={() => {}}
        onOpenLoreGlossaryPopover={() => {}}
        onLoreGlossaryFocusHandled={() => {}}
      />,
    );

    expect(screen.queryByRole('tab', { name: /Lexique lore/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Tutoriels/ })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Introduction/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Règles du jeu/ })).toBeInTheDocument();
  });
});
