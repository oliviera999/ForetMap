import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GLSpellCastRosterSection } from '../../src/gl/components/spell-cast/GLSpellCastRosterSection.jsx';

const roster = [
  {
    playerId: 1,
    teamId: 5,
    teamName: 'Gnomes A',
    teamType: 'gnome',
    pseudo: 'joueur-a',
    healthPoints: 4,
    powerPoints: 2,
  },
  {
    playerId: 2,
    teamId: 5,
    teamName: 'Gnomes A',
    teamType: 'gnome',
    pseudo: 'joueur-b',
    healthPoints: 4,
    powerPoints: 2,
  },
  {
    playerId: 3,
    teamId: 5,
    teamName: 'Gnomes A',
    teamType: 'gnome',
    pseudo: 'joueur-c',
    healthPoints: 4,
    powerPoints: 2,
  },
];
const required = { gems: 0, hearts: 2 };

function monter(props = {}) {
  const draft = {
    id: 9,
    roster,
    presents: [1, 2],
    exclus: [],
    casterKind: 'any',
    ...props.draft,
  };
  const localContribs = props.localContribs || [
    { playerId: 1, gems: 0, hearts: 1 },
    { playerId: 2, gems: 0, hearts: 1 },
  ];
  const onExclure = vi.fn();
  render(
    <GLSpellCastRosterSection
      draft={draft}
      required={required}
      totals={{ gems: 0, hearts: 2 }}
      localContribs={localContribs}
      contributionMode={props.contributionMode || 'self_only'}
      playerId={props.playerId ?? null}
      isStaff={false}
      busy={false}
      onUpdateContrib={vi.fn()}
      onContribBlur={vi.fn()}
      tablette={props.tablette ?? true}
      onExclure={onExclure}
    />,
  );
  return { onExclure };
}

describe('pot de sort « Tenir à deux » — partage automatique et « pas moi »', () => {
  test('tablette : les présents seulement, leur part, aucune saisie, aucun « pas moi » (bourses au propriétaire)', () => {
    const { onExclure } = monter();
    expect(screen.getByTestId('gl-pot-ligne-1')).toBeTruthy();
    expect(screen.getByTestId('gl-pot-ligne-2')).toBeTruthy();
    // L'absent (joueur-c) n'apparaît jamais dans le pot.
    expect(screen.queryByTestId('gl-pot-ligne-3')).toBeNull();
    expect(screen.queryByText('joueur-c')).toBeNull();
    expect(document.querySelectorAll('input').length).toBe(0);
    expect(screen.getByTestId('gl-pot-ligne-1').textContent).toMatch(/❤️ 1/);
    // M13 : la tablette de l'équipe ne retire personne du pot ; l'écran dit où le faire.
    expect(screen.queryByRole('button', { name: 'pas moi' })).toBeNull();
    expect(screen.getByTestId('gl-pot-comptes').textContent).toMatch(
      /« Pas moi » se dit depuis son propre compte, ou au prof\./,
    );
    expect(onExclure).not.toHaveBeenCalled();
  });

  test('ligne exclue : grisée, « remettre » depuis son propre compte', () => {
    const { onExclure } = monter({
      tablette: false,
      playerId: 2,
      draft: { exclus: [2] },
      localContribs: [
        { playerId: 1, gems: 0, hearts: 2 },
        { playerId: 2, gems: 0, hearts: 0 },
      ],
    });
    const ligne = screen.getByTestId('gl-pot-ligne-2');
    expect(ligne.className).toMatch(/is-exclu/);
    expect(ligne.textContent).toMatch(/ne verse pas cette fois/);
    fireEvent.click(screen.getByRole('button', { name: 'remettre' }));
    expect(onExclure).toHaveBeenCalledWith(2, false);
  });

  test('compte élève en mode coordinateur : la saisie reste, « pas moi » sur sa seule ligne', () => {
    monter({ tablette: false, playerId: 1, contributionMode: 'coordinator' });
    expect(document.querySelectorAll('input').length).toBe(2);
    expect(screen.getAllByRole('button', { name: 'pas moi' }).length).toBe(1);
    expect(screen.getByTestId('gl-pot-ligne-1').querySelector('button')?.textContent).toBe(
      'pas moi',
    );
  });
});
