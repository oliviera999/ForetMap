import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GLJoueursView } from '../../src/gl/components/GLJoueursView.jsx';
import { GL_MODULE_DEFAULTS } from '../../src/gl/constants/modules.js';

const allModules = Object.fromEntries(Object.keys(GL_MODULE_DEFAULTS).map((k) => [k, true]));

describe('GLJoueursView', () => {
  test('affiche les sous-onglets et bascule vers le marché', async () => {
    const user = userEvent.setup();
    const onSubTabChange = vi.fn();

    render(
      <GLJoueursView
        activeSubTab="forum"
        onSubTabChange={onSubTabChange}
        modules={allModules}
        vitalityEnabled
        includeMarket
        showStaffAdminUi={false}
        canModerateForum={false}
        auth={{ userId: 1 }}
        classes={[]}
        token="tok"
        classId={1}
        playerId={1}
        onTradeCompleted={() => {}}
      />,
    );

    expect(screen.getByRole('tablist', { name: 'Les joueurs' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Forum/ })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('tab', { name: /Marché/ }));
    expect(onSubTabChange).toHaveBeenCalledWith('market');
  });

  test('masque forum et marché si modules désactivés', () => {
    const modules = {
      ...allModules,
      forumEnabled: false,
      marketEnabled: false,
    };

    render(
      <GLJoueursView
        activeSubTab="stats"
        onSubTabChange={() => {}}
        modules={modules}
        vitalityEnabled={false}
        includeMarket
        showStaffAdminUi
        canModerateForum
        auth={{ userType: 'gl_admin' }}
        classes={[]}
        token="tok"
        onTradeCompleted={() => {}}
      />,
    );

    expect(screen.queryByRole('tab', { name: /Forum/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Marché/ })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Statistiques/ })).toBeInTheDocument();
  });
});
