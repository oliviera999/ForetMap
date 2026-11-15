import { describe, test, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('../../src/shared/components/AppDialogsProvider.jsx', () => ({
  useAppDialogs: () => ({ confirm: vi.fn().mockResolvedValue(true), alert: vi.fn() }),
}));

import { GLSpellCastWizard } from '../../src/gl/components/GLSpellCastWizard.jsx';

const roster = [
  { playerId: 1, teamId: 5, teamName: 'Gnomes A', teamType: 'gnome', pseudo: 'joueur-a' },
  { playerId: 2, teamId: 5, teamName: 'Gnomes A', teamType: 'gnome', pseudo: 'joueur-b' },
];
const pot = {
  id: 9,
  spellCode: 'SL099',
  teamId: 5,
  required: { gems: 0, hearts: 2 },
  roster,
  presents: [1, 2],
  exclus: [],
  contributions: [
    { playerId: 1, gems: 0, hearts: 1 },
    { playerId: 2, gems: 0, hearts: 1 },
  ],
  casterKind: 'any',
};
const equipes = () => [
  { id: 5, name: 'Gnomes A', type: 'gnome' },
  { id: 6, name: 'Licornes A', type: 'unicorn' },
];

/** Monte l'assistant comme sur la tablette de l'équipe 5, avec un hook de sort simulé. */
function Banc({ teams, startDraft }) {
  const [draft, setDraft] = useState(null);
  const spellCast = {
    draft,
    busy: false,
    error: '',
    startDraft: async (payload) => {
      startDraft(payload);
      setDraft(pot);
    },
    saveContributions: vi.fn(),
    launch: vi.fn(),
    exclure: vi.fn(),
    reset: vi.fn(),
  };
  return (
    <GLSpellCastWizard
      open
      onClose={() => {}}
      spellCode="SL099"
      teams={teams}
      gameId={7}
      playerId={null}
      playerTeamId={5}
      currentTeamId={5}
      spellCast={spellCast}
      roster={roster}
      chapterSpells={[{ spell_code: 'SL099', nom: 'Sort du test', cout_coeurs: 2 }]}
      tablette
    />
  );
}

describe('GLSpellCastWizard — tablette d’équipe', () => {
  test('va droit au pot de SON équipe, et y reste quand la partie se recharge', async () => {
    const startDraft = vi.fn();
    const { rerender } = render(<Banc teams={equipes()} startDraft={startDraft} />);
    // Pas d'étape « Quelle équipe lance ce sortilège ? » : la tablette ne lance que pour elle.
    await waitFor(() => expect(startDraft).toHaveBeenCalledWith({ spellCode: 'SL099', teamId: 5 }));
    await waitFor(() => screen.getByTestId('gl-pot-ligne-1'));
    expect(screen.queryByText(/Quelle équipe lance/)).toBeNull();
    expect(screen.getAllByRole('button', { name: 'pas moi' })).toHaveLength(2);

    // En jeu parallèle, l'état de partie se recharge sans cesse (tableau `teams` neuf, mêmes
    // équipes) : l'assistant ne revient pas à sa première étape au milieu du pot.
    rerender(<Banc teams={equipes()} startDraft={startDraft} />);
    rerender(<Banc teams={equipes()} startDraft={startDraft} />);
    expect(screen.getByTestId('gl-pot-ligne-1')).toBeTruthy();
    expect(screen.getByTestId('gl-pot-ligne-2')).toBeTruthy();
    expect(screen.queryByText(/Quelle équipe lance/)).toBeNull();
    expect(startDraft).toHaveBeenCalledTimes(1);
  });
});
